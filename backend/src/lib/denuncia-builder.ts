// denuncia-builder.ts — Construye DenunciaInput desde IDs usando el modelo
// canónico nuevo (PLAN-DATOS A1/A2/A7 + B3/B4). PLAN-DATOS Fase E3.
//
// Uso típico desde la UI Caso (/caso/:id):
//   const input = await armarDenunciaDesdeIds({
//     denunciante: { ... },
//     senalIds: ['sig-1', 'sig-2'],
//     contratoHashes: ['h-001'],
//     entidadCuits: ['30-12345678-9'],
//     destinatario: 'tribunal_cuentas',
//     hechos: '...',
//     petitorio: '...',
//     casoTitulo: 'Denuncia caso #123',
//   })
//   const pdf = await renderDenunciaPDF(input, { timestamp: ..., documentId: ... })

import { dbAll } from './db'
import { getResumenPagosContratos } from './pagos-contrato'
import { validarDNI } from './identidad-validator'
import type { DenunciaInput } from './denuncia-pdf'

export interface ArmarDenunciaArgs {
  denunciante: {
    nombre: string
    dni: string
    email: string
    telefono?: string
    domicilio: string
  }
  destinatario: string
  casoTitulo: string
  casoDescripcion?: string
  hechos: string
  petitorio: string
  // IDs a hidratar desde DB
  senalIds?: string[]
  contratoHashes?: string[]
  entidadCuits?: string[]
  // Si true, incluye la sección cadena de pago (requiere B3 datos cargados).
  incluirCadenaDePago?: boolean
}

interface SeñalCacheRowFull {
  id: string
  tipologia: string
  titulo: string
  resumen: string
  score: number
  severidad: string
  evidencia_json: string
  legal_json: string
  entidades_cuit: string | null
  estado_verificacion: string
  verificado_por: string | null
  verificado_en: string | null
}

interface ContratoRow {
  hash: string
  proveedor: string
  monto: number
  anio: number
  tipo: string
  area: string | null
  fuente_url: string | null
}

interface PJRow { cuit: string; razon_social: string; dom_fiscal_provincia: string | null }

/**
 * Hidrata el input completo de la denuncia desde IDs usando las tablas
 * canónicas. Hace queries paralelas para señales / contratos / entidades,
 * y opcionalmente cadena_de_pago. El resultado es directo input para
 * renderDenunciaPDF().
 */
export async function armarDenunciaDesdeIds(args: ArmarDenunciaArgs): Promise<DenunciaInput> {
  // Review #1 E3: validar DNI del denunciante. Sin esto un caller con typo
  // ("12345678a") generaría un PDF con DNI corrupto que un fiscal rechazaría
  // al recibir. Defensivo barato.
  if (!validarDNI(args.denunciante.dni)) {
    throw new Error(`armarDenunciaDesdeIds: denunciante.dni inválido "${args.denunciante.dni}"`)
  }

  const senalIds = args.senalIds ?? []
  const hashes = args.contratoHashes ?? []
  const cuits = args.entidadCuits ?? []

  // Review #1 E3: las 3 queries iniciales son independientes — paralelizar
  // con Promise.all reduce latencia ~3x cuando todas tienen data. Antes iban
  // secuencial (await...await...await), ~3 round-trips encadenados.
  const [senalesRaw, contratosRaw, pjRaw]: [SeñalCacheRowFull[], ContratoRow[], PJRow[]] = await Promise.all([
    senalIds.length > 0
      ? dbAll<SeñalCacheRowFull>(
          `SELECT id, tipologia, titulo, resumen, score, severidad,
                  evidencia_json, legal_json, entidades_cuit,
                  estado_verificacion, verificado_por, verificado_en
             FROM señales_cache
            WHERE id IN (${senalIds.map(() => '?').join(',')})`,
          senalIds,
        )
      : Promise.resolve([] as SeñalCacheRowFull[]),
    hashes.length > 0
      ? dbAll<ContratoRow>(
          `SELECT hash, proveedor, monto, anio, tipo, area, fuente_url
             FROM contratos
            WHERE hash IN (${hashes.map(() => '?').join(',')})`,
          hashes,
        )
      : Promise.resolve([] as ContratoRow[]),
    cuits.length > 0
      ? dbAll<PJRow>(
          `SELECT cuit, razon_social, dom_fiscal_provincia
             FROM personas_juridicas
            WHERE cuit IN (${cuits.map(() => '?').join(',')})`,
          cuits,
        )
      : Promise.resolve([] as PJRow[]),
  ])

  // Cuits no encontrados en personas_juridicas: fallback a empresas legacy.
  // Esta query DEPENDE del resultado de pjRaw (sabe cuáles faltaron), por
  // lo que no se puede paralelizar con las anteriores.
  const cuitsHallados = new Set(pjRaw.map(p => p.cuit))
  const cuitsFaltantes = cuits.filter(c => !cuitsHallados.has(c))
  const empresasRaw: Array<{ cuit: string; nombre: string }> = cuitsFaltantes.length > 0
    ? await dbAll<{ cuit: string; nombre: string }>(
        `SELECT cuit, nombre FROM empresas WHERE cuit IN (${cuitsFaltantes.map(() => '?').join(',')})`,
        cuitsFaltantes,
      )
    : []

  // Cadena de pago (opcional)
  let cadenaDePago: DenunciaInput['cadenaDePago'] = undefined
  if (args.incluirCadenaDePago && hashes.length > 0) {
    const resumenes = await getResumenPagosContratos({ soloConPagos: false })
    const porHash = new Map(resumenes.map(r => [r.contratoHash, r]))
    cadenaDePago = hashes
      .map(h => porHash.get(h))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map(r => ({
        contratoHash: r.contratoHash,
        montoAdjudicado: r.montoAdjudicado,
        totalPagado: r.totalPagado,
        cantidadPagos: r.cantidadPagos,
        // Review #1 B-modules: getResumenPagosContratos ahora expone fechas
        primerPago: r.primerPago,
        ultimoPago: r.ultimoPago,
      }))
  }

  // Build entidades para PDF
  const entidades: DenunciaInput['entidades'] = [
    ...pjRaw.map(p => ({ nombre: p.razon_social, cuit: p.cuit, municipio: p.dom_fiscal_provincia })),
    ...empresasRaw.map(e => ({ nombre: e.nombre, cuit: e.cuit, municipio: null })),
  ]

  const señales: DenunciaInput['señales'] = senalesRaw.map(s => {
    let legal: { articulos?: string[]; severidad?: string; denunciarAnte?: string[] } = {}
    try { legal = JSON.parse(s.legal_json) } catch { /* keep empty */ }
    let cuitsSeñal: string[] = []
    if (s.entidades_cuit) {
      try {
        const parsed = JSON.parse(s.entidades_cuit)
        cuitsSeñal = Array.isArray(parsed) ? parsed : []
      } catch { /* ignore */ }
    }
    const estado = (s.estado_verificacion === 'verificada' || s.estado_verificacion === 'sin_verificar' ||
                    s.estado_verificacion === 'descartada' || s.estado_verificacion === 'bloqueada')
                   ? s.estado_verificacion
                   : 'sin_verificar'
    return {
      senal_id: s.id,
      tipologia: s.tipologia,
      titulo: s.titulo,
      resumen: s.resumen,
      score: Number(s.score),
      severidad: s.severidad,
      cuits: cuitsSeñal,
      legal,
      estadoVerificacion: estado,
      verificadoPor: s.verificado_por,
      verificadoEn: s.verificado_en,
    }
  })

  return {
    destinatario: args.destinatario,
    denuncianteNombre: args.denunciante.nombre,
    denuncianteDni: args.denunciante.dni,
    denuncianteEmail: args.denunciante.email,
    denuncianteTelefono: args.denunciante.telefono,
    denuncianteDomicilio: args.denunciante.domicilio,
    hechos: args.hechos,
    petitorio: args.petitorio,
    casoTitulo: args.casoTitulo,
    casoDescripcion: args.casoDescripcion,
    entidades,
    contratos: contratosRaw.map(c => ({
      hash: c.hash,
      proveedor: c.proveedor,
      monto: Number(c.monto),
      anio: Number(c.anio),
      tipo: c.tipo,
      area: c.area,
      fuente_url: c.fuente_url,
    })),
    señales,
    cadenaDePago,
  }
}

/**
 * Helper de ergonomía: contadores de estado para la cabecera de la denuncia.
 * Permite al frontend alertar antes de generar PDF si hay señales sin verificar.
 */
export function contarEstadoSeñales(input: DenunciaInput): {
  total: number
  verificadas: number
  sinVerificar: number
  descartadas: number
  bloqueadas: number
  haySinVerificar: boolean
} {
  let v = 0, s = 0, d = 0, b = 0
  for (const sg of input.señales) {
    const e = sg.estadoVerificacion ?? 'sin_verificar'
    if (e === 'verificada') v++
    else if (e === 'sin_verificar') s++
    else if (e === 'descartada') d++
    else if (e === 'bloqueada') b++
  }
  return {
    total: input.señales.length,
    verificadas: v,
    sinVerificar: s,
    descartadas: d,
    bloqueadas: b,
    haySinVerificar: s > 0,
  }
}

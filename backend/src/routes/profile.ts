// routes/profile.ts — endpoints reales de Profile PF y PJ (PLAN-UI D2 + Fase F R6).
//
// Reemplazo del fixture-driven approach: el frontend ahora puede llamar a
// estos endpoints para obtener PF/PJ reales con todas sus relaciones
// hidratadas desde la BD canónica.
//
//   GET /api/profile/persona/:dni     → PF + cargos + empresas dirigidas + DDJJ + aportes + señales
//   GET /api/profile/empresa/:cuit    → PJ + directores + contratos + pagos + señales

import { Router, Request, Response } from 'express'
import { dbAll } from '../lib/db'

const profileRouter = Router()
export default profileRouter

profileRouter.get('/persona/:dni', async (req: Request, res: Response) => {
  const dni = String(req.params.dni).replace(/\D/g, '')
  if (dni.length < 6 || dni.length > 8) {
    return res.status(400).json({ error: 'dni inválido' })
  }
  try {
    const pfRows = await dbAll<{
      dni: string; cuit: string | null;
      apellido_nombre: string; apellido_nombre_norm: string;
      fuentes_url_json: string; fuente_dni_url: string | null;
      primer_visto: string; ultimo_visto: string;
    }>(
      `SELECT dni, cuit, apellido_nombre, apellido_nombre_norm,
              fuentes_url_json, fuente_dni_url, primer_visto, ultimo_visto
         FROM personas_fisicas WHERE dni = ?`, [dni],
    )
    if (pfRows.length === 0) return res.status(404).json({ error: 'persona no encontrada' })
    const pf = pfRows[0]

    const [cargos, empresas, ddjj, aportes, senales] = await Promise.all([
      // Cargos públicos vigentes/históricos
      dbAll<{
        jurisdiccion: string; reparticion: string | null; cargo: string;
        vigente_desde: string | null; vigente_hasta: string | null;
        fuente_url: string;
      }>(
        `SELECT jurisdiccion, reparticion, cargo, vigente_desde, vigente_hasta, fuente_url
           FROM cargos_funcionarios
          WHERE dni = ?
          ORDER BY vigente_desde DESC NULLS LAST`, [dni],
      ),
      // Empresas que dirige (via vista F6 — incluye label legible y flag estatal)
      dbAll<{
        cuit: string; empresa_nombre: string;
        tipo_cargo: string | null; tipo_cargo_codigo: string | null;
        empresa_provincia: string | null; empresa_estado: string | null;
        empresa_es_ente_estatal: boolean;
      }>(
        `SELECT cuit, empresa_nombre, tipo_cargo, tipo_cargo_codigo,
                empresa_provincia, empresa_estado, empresa_es_ente_estatal
           FROM v_persona_dirige_empresa
          WHERE dni = ?
          ORDER BY empresa_es_ente_estatal DESC, empresa_nombre
          LIMIT 50`, [dni],
      ),
      // DDJJ patrimoniales
      dbAll<{
        anio_declarado: number | null; gestion: string;
        monto_declarado: number | null; pdf_url: string | null; fuente_url: string;
      }>(
        `SELECT anio_declarado, gestion, monto_declarado, pdf_url, fuente_url
           FROM declaraciones_juradas
          WHERE dni = ?
          ORDER BY anio_declarado DESC NULLS LAST`, [dni],
      ),
      // Aportes a campañas (si tiene cuit y aportantes_campanas tiene data)
      pf.cuit ? dbAll<{
        partido: string; anio_electoral: number; monto: number | null;
        fecha_aporte: string | null; fuente_url: string;
      }>(
        `SELECT partido, anio_electoral, monto, fecha_aporte, fuente_url
           FROM aportantes_campanas
          WHERE dni = ? OR cuit = ?
          ORDER BY anio_electoral DESC`, [dni, pf.cuit],
      ) : Promise.resolve([]),
      // Señales que mencionan a esta persona (por DNI en titulo o cuit en entidades)
      dbAll<{
        id: string; tipologia: string; titulo: string; resumen: string;
        score: number; severidad: string; estado_verificacion: string;
        verificado_por: string | null; verificado_en: string | null;
        evidencia_json: string; legal_json: string;
      }>(
        `SELECT id, tipologia, titulo, resumen, score, severidad, estado_verificacion,
                verificado_por, verificado_en, evidencia_json, legal_json
           FROM señales_cache
          WHERE estado_verificacion != 'descartada'
            AND (titulo LIKE '%' || ? || '%' OR titulo LIKE '%' || ? || '%')
          ORDER BY score DESC LIMIT 20`,
        [pf.apellido_nombre, dni],
      ),
    ])

    return res.json({
      dni: pf.dni,
      cuit: pf.cuit,
      apellidoNombre: pf.apellido_nombre,
      apellidoNombreNorm: pf.apellido_nombre_norm,
      fuentesUrl: parseJsonSafe<string[]>(pf.fuentes_url_json, []),
      fuenteDniUrl: pf.fuente_dni_url,
      primerVisto: pf.primer_visto,
      ultimoVisto: pf.ultimo_visto,
      cargosPublicos: cargos.map(c => ({
        jurisdiccion: c.jurisdiccion,
        reparticion: c.reparticion,
        cargo: c.cargo,
        vigenteDesde: c.vigente_desde,
        vigenteHasta: c.vigente_hasta,
        fuenteUrl: c.fuente_url,
        // Compat con shape del fixture
        brutoMensual: null,
        fuente: 'cargos_funcionarios',
      })),
      direccionesEmpresas: empresas.map(e => ({
        cuitEmpresa: e.cuit,
        razonSocial: e.empresa_nombre,
        tipoCargo: e.tipo_cargo ?? '—',
        tipoCargoCodigo: e.tipo_cargo_codigo,
        provincia: e.empresa_provincia,
        estado: e.empresa_estado,
        esEnteEstatal: !!e.empresa_es_ente_estatal,
        vigenteDesde: null,
        vigenteHasta: null,
        fuenteUrl: 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c',
      })),
      ddjj: ddjj.map(d => ({
        anio: d.anio_declarado,
        gestion: d.gestion,
        monto: d.monto_declarado,
        pdfUrl: d.pdf_url,
        fuenteUrl: d.fuente_url,
      })),
      aportesCampana: aportes.map(a => ({
        partido: a.partido,
        anioElectoral: a.anio_electoral,
        monto: a.monto,
        fechaAporte: a.fecha_aporte,
        fuenteUrl: a.fuente_url,
      })),
      señales: senales.map(s => ({
        id: s.id,
        tipologia: s.tipologia,
        titulo: s.titulo,
        resumen: s.resumen,
        score: Number(s.score),
        severidad: s.severidad,
        estadoVerificacion: s.estado_verificacion,
        verificadoPor: s.verificado_por,
        verificadoEn: s.verificado_en,
        evidencia: parseJsonSafe<Array<{ descripcion: string; fuenteUrl: string }>>(s.evidencia_json, []),
        legal: parseJsonSafe<{ articulos?: string[]; severidad?: string; denunciarAnte?: string[] }>(s.legal_json, {}),
      })),
      jurisdiccionPrimaria: cargos[0]?.jurisdiccion ?? null,
      badges: [],
    })
  } catch (err) {
    console.error('[profile/persona]', err)
    return res.status(500).json({ error: 'error interno' })
  }
})

profileRouter.get('/empresa/:cuit', async (req: Request, res: Response) => {
  // Aceptar cuit con o sin guiones
  const digits = String(req.params.cuit).replace(/\D/g, '')
  if (digits.length !== 11) return res.status(400).json({ error: 'cuit inválido' })
  const cuitFormatted = `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`

  try {
    const pjRows = await dbAll<{
      cuit: string; razon_social: string; razon_social_norm: string;
      alias_json: string; tipo_societario: string | null;
      fecha_constitucion: string | null;
      dom_fiscal_provincia: string | null; dom_fiscal_localidad: string | null;
      dom_legal_provincia: string | null; dom_legal_localidad: string | null;
      estado: string | null; es_empleador: boolean | null;
      actividad_principal: string | null;
      fuentes_url_json: string;
      primer_visto: string; ultimo_visto: string;
      es_ente_estatal: boolean;
    }>(
      `SELECT * FROM personas_juridicas WHERE cuit = ?`, [cuitFormatted],
    )
    if (pjRows.length === 0) return res.status(404).json({ error: 'empresa no encontrada' })
    const pj = pjRows[0]

    const [directores, contratos, pagos, senales, transferencias] = await Promise.all([
      // Directores via vista F6 (path inverso: PJ → PF), tipo_cargo legible
      dbAll<{
        dni: string; persona_nombre: string;
        tipo_cargo: string | null; tipo_cargo_codigo: string | null;
      }>(
        `SELECT dni, persona_nombre, tipo_cargo, tipo_cargo_codigo
           FROM v_persona_dirige_empresa
          WHERE cuit = ?
          LIMIT 50`, [cuitFormatted],
      ),
      // Contratos como proveedor
      dbAll<{
        hash: string; municipio: string; anio: number; tipo: string;
        area: string | null; descripcion: string | null;
        monto: number; fuente_url: string;
      }>(
        `SELECT hash, municipio, anio, tipo, area, descripcion, monto, fuente_url
           FROM contratos
          WHERE proveedor_cuit = ?
          ORDER BY anio DESC, monto DESC LIMIT 100`, [cuitFormatted],
      ),
      // Pagos recibidos
      dbAll<{
        contrato_hash: string; fecha_pago: string;
        monto: number; concepto: string | null; fuente_url: string;
      }>(
        `SELECT p.contrato_hash, p.fecha_pago, p.monto, p.concepto, p.fuente_url
           FROM pagos_contrato p
           JOIN contratos c ON c.hash = p.contrato_hash
          WHERE c.proveedor_cuit = ?
          ORDER BY p.fecha_pago DESC LIMIT 100`, [cuitFormatted],
      ),
      // Señales asociadas
      dbAll<{
        id: string; tipologia: string; titulo: string; resumen: string;
        score: number; severidad: string; estado_verificacion: string;
        verificado_por: string | null; verificado_en: string | null;
        evidencia_json: string; legal_json: string;
      }>(
        `SELECT id, tipologia, titulo, resumen, score, severidad, estado_verificacion,
                verificado_por, verificado_en, evidencia_json, legal_json
           FROM señales_cache
          WHERE estado_verificacion != 'descartada'
            AND entidades_cuit LIKE '%' || ? || '%'
          ORDER BY score DESC LIMIT 20`, [cuitFormatted],
      ),
      // Transferencias / subsidios recibidos
      dbAll<{
        anio: number; tipo: string; programa: string | null;
        monto: number; fecha: string | null; fuente_url: string;
      }>(
        `SELECT anio, tipo, programa, monto, fecha, fuente_url
           FROM transferencias
          WHERE beneficiario_cuit = ?
          ORDER BY anio DESC, monto DESC LIMIT 50`, [cuitFormatted],
      ),
    ])

    return res.json({
      cuit: pj.cuit,
      razonSocial: pj.razon_social,
      razonSocialNorm: pj.razon_social_norm,
      alias: parseJsonSafe<string[]>(pj.alias_json, []),
      tipoSocietario: pj.tipo_societario,
      fechaConstitucion: pj.fecha_constitucion,
      domFiscalProvincia: pj.dom_fiscal_provincia,
      domFiscalLocalidad: pj.dom_fiscal_localidad,
      domLegalProvincia: pj.dom_legal_provincia,
      domLegalLocalidad: pj.dom_legal_localidad,
      estado: pj.estado,
      esEmpleador: pj.es_empleador,
      actividadPrincipal: pj.actividad_principal,
      fuentesUrl: parseJsonSafe<string[]>(pj.fuentes_url_json, []),
      primerVisto: pj.primer_visto,
      ultimoVisto: pj.ultimo_visto,
      esEnteEstatal: !!pj.es_ente_estatal,
      directores: directores.map(d => ({
        dni: d.dni,
        apellidoNombre: d.persona_nombre,
        tipoCargo: d.tipo_cargo ?? '—',
        tipoCargoCodigo: d.tipo_cargo_codigo,
        vigenteDesde: null,
        vigenteHasta: null,
        fuenteUrl: 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c',
      })),
      contratos: contratos.map(c => ({
        hash: c.hash,
        municipio: c.municipio,
        anio: c.anio,
        tipo: c.tipo,
        area: c.area,
        descripcion: c.descripcion,
        monto: Number(c.monto),
        fuenteUrl: c.fuente_url,
      })),
      pagos: pagos.map(p => ({
        contratoHash: p.contrato_hash,
        fecha: p.fecha_pago,
        monto: Number(p.monto),
        concepto: p.concepto,
        fuenteUrl: p.fuente_url,
      })),
      aportesHechos: [],
      transferenciasRecibidas: transferencias.map(t => ({
        anio: t.anio,
        tipo: t.tipo,
        programa: t.programa,
        monto: Number(t.monto),
        fecha: t.fecha,
        fuenteUrl: t.fuente_url,
      })),
      señales: senales.map(s => ({
        id: s.id,
        tipologia: s.tipologia,
        titulo: s.titulo,
        resumen: s.resumen,
        score: Number(s.score),
        severidad: s.severidad,
        estadoVerificacion: s.estado_verificacion,
        verificadoPor: s.verificado_por,
        verificadoEn: s.verificado_en,
        evidencia: parseJsonSafe<Array<{ descripcion: string; fuenteUrl: string }>>(s.evidencia_json, []),
        legal: parseJsonSafe<{ articulos?: string[]; severidad?: string; denunciarAnte?: string[] }>(s.legal_json, {}),
      })),
    })
  } catch (err) {
    console.error('[profile/empresa]', err)
    return res.status(500).json({ error: 'error interno' })
  }
})

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

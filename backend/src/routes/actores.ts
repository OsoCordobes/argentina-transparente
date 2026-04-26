// routes/actores.ts — Endpoints unificados de actores de la esfera pública.
//
// El "actor" es la unión semántica de:
//   • funcionarios públicos (`agentes_publicos`)
//   • directores y administradores de personas jurídicas (`igj_autoridades`)
//   • personas jurídicas (`igj_entidades`, `rns_personas_juridicas`, `empresas`)
//   • proveedores que aparecen en `contratos`
//
// Hasta esta iteración el backend solo exponía a través de `/api/entidad/`,
// que se basaba en el campo `proveedor` de contratos. Eso dejaba dormidas a
// 2.7M filas de IGJ + 178K agentes públicos + 196K personas jurídicas RNS.
// Estos endpoints son la primera puerta para que el frontend mapee el poder.

import { Router, Request, Response } from 'express'
import { dbAll } from '../lib/db'

const actoresRouter = Router()
export default actoresRouter

// ─── /api/actores/search?q=&tipo=&limit= ────────────────────────────────────
// Búsqueda global "tipo Google" sobre las cuatro tablas grandes.
// Devuelve hasta `limit` (default 20) hits con tipo + score.
//
// `tipo`: opcional — 'funcionario' | 'director' | 'empresa' | 'todos' (default).
//
// Ranking: prefix match en nombre normalizado > substring > sin coincidencia.

interface ActorSearchHit {
  tipo: 'funcionario' | 'director' | 'empresa' | 'proveedor'
  nombre: string
  identificador: string | null    // CUIT o DNI
  jurisdiccion: string | null
  detalle: string | null          // cargo / tipo societario / razón
  fuente: 'agentes_publicos' | 'igj_autoridades' | 'igj_entidades' | 'rns_personas_juridicas' | 'empresas' | 'contratos'
  href: string
  score: number
}

actoresRouter.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim()
  const tipo = String(req.query.tipo ?? 'todos')
  const limit = Math.min(parseInt(String(req.query.limit ?? '20')) || 20, 100)

  if (q.length < 2) {
    return res.json({ hits: [], total: 0 })
  }

  const qLower = q.toLowerCase()
  const qPrefix = `${qLower}%`
  const qSubstring = `%${qLower}%`
  const hits: ActorSearchHit[] = []

  // Por tipo agrupamos las queries para no exceder presupuesto de DuckDB.
  // Cada subconsulta cap a `limit` y luego mergeamos por score.

  if (tipo === 'todos' || tipo === 'funcionario') {
    const funcs = await dbAll<{
      apellido_nombre: string
      cuit: string | null
      jurisdiccion: string
      cargo: string | null
      reparticion: string | null
      n: bigint
    }>(
      `SELECT apellido_nombre, cuit, jurisdiccion, cargo, reparticion, COUNT(*)::BIGINT AS n
       FROM agentes_publicos
       WHERE LOWER(apellido_nombre) LIKE ?
       GROUP BY apellido_nombre, cuit, jurisdiccion, cargo, reparticion
       LIMIT ?`,
      [qSubstring, limit]
    )
    for (const f of funcs) {
      const score = f.apellido_nombre.toLowerCase().startsWith(qLower) ? 90 : 70
      hits.push({
        tipo: 'funcionario',
        nombre: f.apellido_nombre,
        identificador: f.cuit,
        jurisdiccion: f.jurisdiccion,
        detalle: [f.cargo, f.reparticion].filter(Boolean).join(' · ') || null,
        fuente: 'agentes_publicos',
        href: `/actores/funcionario/${encodeURIComponent(f.apellido_nombre)}`,
        score,
      })
    }
  }

  if (tipo === 'todos' || tipo === 'director') {
    const dirs = await dbAll<{
      apellido_nombre: string
      numero_documento: string | null
      tipo_administrador: string
      n: bigint
    }>(
      `SELECT apellido_nombre, numero_documento, tipo_administrador, COUNT(*)::BIGINT AS n
       FROM igj_autoridades
       WHERE LOWER(apellido_nombre) LIKE ?
         AND apellido_nombre IS NOT NULL
       GROUP BY apellido_nombre, numero_documento, tipo_administrador
       ORDER BY n DESC
       LIMIT ?`,
      [qSubstring, limit]
    )
    for (const d of dirs) {
      const score = d.apellido_nombre.toLowerCase().startsWith(qLower) ? 88 : 68
      hits.push({
        tipo: 'director',
        nombre: d.apellido_nombre,
        identificador: d.numero_documento,
        jurisdiccion: 'IGJ',
        detalle: `${d.tipo_administrador ?? 'Administrador'} en ${Number(d.n)} entidad${Number(d.n) === 1 ? '' : 'es'}`,
        fuente: 'igj_autoridades',
        href: `/actores/persona/${encodeURIComponent(d.apellido_nombre)}`,
        score,
      })
    }
  }

  if (tipo === 'todos' || tipo === 'empresa') {
    // Mergeamos igj_entidades + rns_personas_juridicas + empresas por CUIT.
    // Si una empresa aparece en >1 fuente, priorizamos rns (más detallado).
    const empresas = await dbAll<{
      cuit: string | null
      razon_social: string
      tipo_societario: string | null
      provincia: string | null
      fuente: string
    }>(
      `SELECT cuit, razon_social, tipo_societario,
              COALESCE(dom_legal_provincia, dom_fiscal_provincia) AS provincia,
              'rns' AS fuente
       FROM rns_personas_juridicas
       WHERE LOWER(razon_social) LIKE ?
       UNION ALL
       SELECT cuit, razon_social, tipo_societario, NULL AS provincia, 'igj' AS fuente
       FROM igj_entidades
       WHERE LOWER(razon_social) LIKE ?
       LIMIT ?`,
      [qSubstring, qSubstring, limit * 2]
    )
    // Dedup por CUIT (preferimos RNS sobre IGJ cuando ambas tienen datos)
    const porCuit = new Map<string, typeof empresas[0]>()
    for (const e of empresas) {
      const key = e.cuit ?? `${e.razon_social}|${e.tipo_societario ?? ''}`
      const existing = porCuit.get(key)
      if (!existing || (e.fuente === 'rns' && existing.fuente === 'igj')) {
        porCuit.set(key, e)
      }
    }
    for (const e of porCuit.values()) {
      const score = e.razon_social.toLowerCase().startsWith(qLower) ? 85 : 65
      hits.push({
        tipo: 'empresa',
        nombre: e.razon_social,
        identificador: e.cuit,
        jurisdiccion: e.provincia,
        detalle: e.tipo_societario,
        fuente: e.fuente === 'rns' ? 'rns_personas_juridicas' : 'igj_entidades',
        href: e.cuit ? `/actores/empresa/${e.cuit}` : `/entidad/${encodeURIComponent(e.razon_social)}`,
        score,
      })
    }
  }

  // Proveedores con contratos (para que aparezcan también vía Argos)
  if (tipo === 'todos' || tipo === 'empresa') {
    const provs = await dbAll<{ proveedor: string; n: bigint; total: number }>(
      `SELECT proveedor, COUNT(*)::BIGINT AS n, SUM(monto) AS total
       FROM contratos
       WHERE LOWER(proveedor) LIKE ?
       GROUP BY proveedor
       ORDER BY total DESC NULLS LAST
       LIMIT ?`,
      [qSubstring, limit]
    )
    for (const p of provs) {
      // Dedupe por nombre con empresas ya emitidas
      if (hits.some(h => h.tipo === 'empresa' && h.nombre.toUpperCase() === p.proveedor.toUpperCase())) continue
      const score = p.proveedor.toLowerCase().startsWith(qLower) ? 82 : 62
      hits.push({
        tipo: 'proveedor',
        nombre: p.proveedor,
        identificador: null,
        jurisdiccion: null,
        detalle: `${Number(p.n)} contrato${Number(p.n) === 1 ? '' : 's'} · $${(p.total ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`,
        fuente: 'contratos',
        href: `/entidad/${encodeURIComponent(p.proveedor)}`,
        score: score + 5, // boost: quien tiene contratos es más relevante
      })
    }
  }

  hits.sort((a, b) => b.score - a.score)
  res.json({ hits: hits.slice(0, limit), total: hits.length })
})

// ─── /api/actores/persona/:nombre ───────────────────────────────────────────
// Perfil unificado de una persona física. Busca en agentes_publicos +
// igj_autoridades. Si encuentra DNI o CUIT, agrega entidades dirigidas y
// contratos asociados.
actoresRouter.get('/persona/:nombre', async (req: Request, res: Response) => {
  const nombre = String(req.params.nombre ?? '').trim()
  if (!nombre) return res.status(400).json({ error: 'nombre requerido' })

  const nombreLower = nombre.toLowerCase()

  // Cargos públicos
  const cargos = await dbAll<{
    jurisdiccion: string; anio: number; mes: number | null;
    categoria: string; reparticion: string | null; cargo: string | null;
    bruto: number | null; neto: number | null; fuente_url: string;
  }>(
    `SELECT jurisdiccion, anio, mes, categoria, reparticion, cargo, bruto, neto, fuente_url
     FROM agentes_publicos
     WHERE LOWER(apellido_nombre) = ?
     ORDER BY anio DESC, mes DESC NULLS LAST
     LIMIT 200`,
    [nombreLower]
  )

  // Identificadores conocidos (DNI desde IGJ, CUIT desde agentes)
  const cuits = new Set<string>()
  const dnis = new Set<string>()
  for (const c of cargos) if (c.fuente_url) { /* podríamos extraer cuit de fuente metadata */ }

  const dniRows = await dbAll<{ numero_documento: string; n: bigint }>(
    `SELECT numero_documento, COUNT(*)::BIGINT AS n
     FROM igj_autoridades
     WHERE LOWER(apellido_nombre) = ? AND numero_documento IS NOT NULL
     GROUP BY numero_documento
     ORDER BY n DESC
     LIMIT 5`,
    [nombreLower]
  )
  for (const d of dniRows) dnis.add(d.numero_documento)

  // Entidades dirigidas (vía igj_autoridades → igj_entidades)
  const entidades = dnis.size > 0
    ? await dbAll<{
        cuit: string | null; razon_social: string;
        tipo_societario: string | null; tipo_administrador: string;
        activa: boolean | null;
      }>(
        `SELECT DISTINCT ie.cuit, ie.razon_social, ie.tipo_societario,
                a.tipo_administrador, ie.activa
         FROM igj_autoridades a
         JOIN igj_entidades ie ON ie.numero_correlativo = a.numero_correlativo
         WHERE a.numero_documento IN (${[...dnis].map(() => '?').join(',')})
         LIMIT 100`,
        [...dnis]
      )
    : []

  // Contratos como proveedor (si la persona aparece en contratos.proveedor —
  // solo común para personas físicas que facturan al Estado)
  const contratos = await dbAll<{
    hash: string; municipio: string; anio: number;
    proveedor: string; monto: number; fuente_url: string;
  }>(
    `SELECT hash, municipio, anio, proveedor, monto, fuente_url
     FROM contratos
     WHERE LOWER(proveedor) = ?
     ORDER BY anio DESC, monto DESC
     LIMIT 50`,
    [nombreLower]
  )

  res.json({
    nombre,
    identificadores: {
      dnis: [...dnis],
      cuits: [...cuits],
    },
    cargos_publicos: cargos,
    entidades_dirigidas: entidades,
    contratos_como_proveedor: contratos,
    cruces: {
      es_funcionario: cargos.length > 0,
      es_director: entidades.length > 0,
      es_proveedor: contratos.length > 0,
      conflicto_potencial: cargos.length > 0 && entidades.length > 0,
    },
  })
})

// ─── /api/actores/empresa/:cuit ─────────────────────────────────────────────
// Perfil unificado de una persona jurídica por CUIT. Combina IGJ + RNS +
// empresas + contratos + autoridades + opensanctions.
actoresRouter.get('/empresa/:cuit', async (req: Request, res: Response) => {
  const cuit = String(req.params.cuit ?? '').replace(/\D/g, '')
  if (!/^\d{11}$/.test(cuit)) return res.status(400).json({ error: 'CUIT inválido (11 dígitos)' })

  // Datos canónicos: empresas + RNS + IGJ
  const [empresa] = await dbAll<{
    cuit: string; nombre: string; es_empleador: boolean | null;
    inicio_actividades: string | null; estado: string | null;
    actividad_principal: string | null; fuente_padron: string | null;
    fuente_url: string | null;
  }>(
    `SELECT * FROM empresas WHERE cuit = ? LIMIT 1`,
    [cuit]
  )

  const [rns] = await dbAll<{
    razon_social: string; tipo_societario: string | null;
    fecha_contrato_social: string | null; numero_inscripcion: string | null;
    fecha_actualizacion: string | null;
    dom_fiscal_provincia: string | null; dom_fiscal_localidad: string | null;
    dom_legal_provincia: string | null; dom_legal_localidad: string | null;
  }>(
    `SELECT razon_social, tipo_societario, fecha_contrato_social, numero_inscripcion,
            fecha_actualizacion, dom_fiscal_provincia, dom_fiscal_localidad,
            dom_legal_provincia, dom_legal_localidad
     FROM rns_personas_juridicas
     WHERE cuit = ?
     ORDER BY fecha_actualizacion DESC NULLS LAST
     LIMIT 1`,
    [cuit]
  )

  const igjRows = await dbAll<{
    numero_correlativo: number; razon_social: string;
    tipo_societario: string | null; activa: boolean | null;
  }>(
    `SELECT numero_correlativo, razon_social, tipo_societario, activa
     FROM igj_entidades
     WHERE cuit = ?
     LIMIT 5`,
    [cuit]
  )

  // Autoridades (directores) — todas las personas asociadas a esta entidad
  const autoridades = igjRows.length > 0
    ? await dbAll<{
        apellido_nombre: string; tipo_administrador: string;
        numero_documento: string | null;
      }>(
        `SELECT DISTINCT apellido_nombre, tipo_administrador, numero_documento
         FROM igj_autoridades
         WHERE numero_correlativo IN (${igjRows.map(() => '?').join(',')})
         LIMIT 100`,
        igjRows.map(r => r.numero_correlativo)
      )
    : []

  // Contratos donde aparece como proveedor (matchea por nombre normalizado vía empresas)
  const nombreCanonico = (empresa?.nombre ?? rns?.razon_social ?? igjRows[0]?.razon_social ?? '').toUpperCase()
  const contratos = nombreCanonico ? await dbAll<{
    hash: string; municipio: string; anio: number;
    proveedor: string; monto: number; fuente_url: string;
  }>(
    `SELECT hash, municipio, anio, proveedor, monto, fuente_url
     FROM contratos
     WHERE UPPER(proveedor) = ? OR proveedor_norm = ?
     ORDER BY anio DESC, monto DESC
     LIMIT 100`,
    [nombreCanonico, nombreCanonico]
  ) : []

  // Cruce OpenSanctions / ICIJ cacheado
  const [osMatch] = await dbAll<{
    matched: boolean; riesgo: string | null;
    dataset_principal: string | null; entidad_url: string | null;
  }>(
    `SELECT matched, riesgo, dataset_principal, entidad_url
     FROM opensanctions_matches
     WHERE cuit = ?
     LIMIT 1`,
    [cuit]
  )

  res.json({
    cuit,
    canonico: {
      nombre: nombreCanonico,
      tipo_societario: rns?.tipo_societario ?? igjRows[0]?.tipo_societario ?? null,
      activa: igjRows[0]?.activa ?? null,
    },
    empresas: empresa ?? null,
    rns: rns ?? null,
    igj: igjRows,
    autoridades,
    contratos,
    cruce_externo: osMatch ?? null,
  })
})

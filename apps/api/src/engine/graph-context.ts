import type { GraphContext } from '@argos/engine'
import type { Contrato, Empresa, Persona, Cargo, Donacion } from '@argos/model'

// ─── DuckDB helper types ──────────────────────────────────────────────────────
interface DbConnection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all(sql: string, ...args: any[]): void
}

// Thin promise wrapper so the rest of the code stays clean
function dbAll<T>(conn: DbConnection, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    (conn as unknown as { all: (...a: unknown[]) => void }).all(
      sql,
      ...params,
      (err: Error | null, rows: T[]) => {
        if (err) reject(err)
        else     resolve(rows)
      },
    )
  })
}

// ─── Row shapes from legacy DuckDB schema ─────────────────────────────────────
interface ContratoRow {
  hash:           string
  municipio:      string
  anio:           number
  tipo:           string
  proveedor:      string
  proveedor_norm: string
  area:           string
  descripcion:    string | null
  monto:          number
  fuente_url:     string
  cargado_en:     string
}

interface EmpresaRow {
  cuit:                string
  nombre:              string
  es_empleador:        boolean | null
  inicio_actividades:  string | null
  estado:              string | null
  actividad_principal: string | null
  fuente_url:          string | null
}

interface DirectorRow {
  cuit_empresa:   string
  nombre_director: string
  fuente_url:     string | null
}

// ─── Row→Model mappers ────────────────────────────────────────────────────────
// These map the legacy DuckDB column names to the @argos/model types.
// When apps/api is fully migrated, these will be replaced by direct schema queries.

function rowToContrato(row: ContratoRow): Contrato {
  const mapTipo = (t: string): Contrato['tipo'] => {
    const l = t.toLowerCase()
    if (l.includes('licitación pública') || l.includes('licitacion publica')) return 'licitacion_publica'
    if (l.includes('licitación privada') || l.includes('licitacion privada')) return 'licitacion_privada'
    if (l.includes('directa'))  return 'contratacion_directa'
    if (l.includes('prórrog') || l.includes('prorrog')) return 'prorroga'
    if (l.includes('adenda'))   return 'adenda'
    if (l.includes('convenio')) return 'convenio'
    return 'otro'
  }
  return {
    id:                    row.hash,
    municipio_id:          row.municipio,
    proveedor:             row.proveedor,
    proveedor_normalizado: row.proveedor_norm,
    area:                  row.area || undefined,
    descripcion:           row.descripcion || undefined,
    monto:                 row.monto,
    moneda:                'ARS',
    fecha:                 new Date(`${row.anio}-07-01`), // approx — exact date not in legacy schema
    anio:                  row.anio,
    tipo:                  mapTipo(row.tipo),
    source_url:            row.fuente_url,
    fetched_at:            new Date(row.cargado_en),
    sha256:                row.hash,
    archive_path:          '',
  }
}

function rowToEmpresa(row: EmpresaRow): Empresa {
  return {
    id:                  row.cuit,
    nombre:              row.nombre,
    nombre_normalizado:  row.nombre.toUpperCase().replace(/\s+/g, ' ').trim(),
    cuit:                row.cuit,
    estado:              (row.estado as Empresa['estado']) ?? 'desconocido',
    source_url:          row.fuente_url ?? '',
    fetched_at:          new Date(),
    sha256:              '',
    archive_path:        '',
  }
}

// ─── GraphContext factory ─────────────────────────────────────────────────────
export function createGraphContext(
  db: DbConnection,
  municipioId: string,
  periodoDesde: number,
  periodoHasta: number,
): GraphContext {
  // Shared contract cache to avoid repeat queries
  let _contratos: Contrato[] | null = null

  async function getAllContratos(): Promise<Contrato[]> {
    if (_contratos) return _contratos
    const rows = await dbAll<ContratoRow>(
      db,
      `SELECT * FROM contratos
       WHERE municipio = ?
         AND anio BETWEEN ? AND ?`,
      [municipioId, periodoDesde, periodoHasta],
    )
    _contratos = rows.map(rowToContrato)
    return _contratos
  }

  return {
    municipio_id:  municipioId,
    periodo_desde: periodoDesde,
    periodo_hasta: periodoHasta,

    contratos: getAllContratos,

    async contratosByProveedor(nombre: string): Promise<Contrato[]> {
      const all = await getAllContratos()
      const norm = nombre.toUpperCase().replace(/\s+/g, ' ').trim()
      return all.filter(c => c.proveedor_normalizado === norm || c.proveedor.toUpperCase().includes(norm))
    },

    async contratosByArea(area: string): Promise<Contrato[]> {
      const all = await getAllContratos()
      return all.filter(c => c.area === area)
    },

    async empresa(nombre: string): Promise<Empresa | null> {
      const norm = nombre.toUpperCase().replace(/\s+/g, ' ')
                         .replace(/\b(S\.?A\.?|S\.?R\.?L\.?|SRL|SA|SAS)\s*$/, '').trim()
      const rows = await dbAll<EmpresaRow>(
        db,
        `SELECT * FROM empresas WHERE UPPER(nombre) LIKE ? LIMIT 1`,
        [`%${norm}%`],
      )
      return rows.length > 0 ? rowToEmpresa(rows[0]) : null
    },

    async empresas(): Promise<Empresa[]> {
      const rows = await dbAll<EmpresaRow>(db, `SELECT * FROM empresas`)
      return rows.map(rowToEmpresa)
    },

    async directoresByEmpresa(cuit: string): Promise<Persona[]> {
      const rows = await dbAll<DirectorRow>(
        db,
        `SELECT * FROM directores WHERE cuit_empresa = ?`,
        [cuit],
      )
      return rows.map(r => ({
        id:                 r.nombre_director,
        nombre:             r.nombre_director,
        nombre_normalizado: r.nombre_director.toUpperCase().trim(),
        roles:              ['director'] as ['director'],
        source_url:         r.fuente_url ?? '',
        fetched_at:         new Date(),
        sha256:             '',
        archive_path:       '',
      }))
    },

    // Cargos not in legacy schema — return empty, populated in Fase 3
    async cargosByPersona(_personaId: string): Promise<Cargo[]> {
      return []
    },

    // Donaciones not in legacy schema — return empty, populated in Fase 3
    async donacionesByDonante(_nombre: string): Promise<Donacion[]> {
      return []
    },

    async directoresCompartidos(umbralEmpresas = 2): Promise<{
      director: string; empresas: string[]; contratos: number; monto_total: number
    }[]> {
      // Uses legacy directores table (populated from IGJ seed)
      const rows = await dbAll<{ director: string; empresas: string; contratos: number; monto_total: number }>(
        db,
        `SELECT
           d.nombre_director AS director,
           STRING_AGG(DISTINCT d.cuit_empresa, ',') AS empresas,
           COUNT(DISTINCT c.hash) AS contratos,
           SUM(c.monto) AS monto_total
         FROM directores d
         LEFT JOIN contratos c ON c.proveedor_norm = (
           SELECT UPPER(nombre) FROM empresas WHERE cuit = d.cuit_empresa LIMIT 1
         )
         WHERE c.municipio = ? AND c.anio BETWEEN ? AND ?
         GROUP BY d.nombre_director
         HAVING COUNT(DISTINCT d.cuit_empresa) >= ?
         ORDER BY contratos DESC`,
        [municipioId, periodoDesde, periodoHasta, umbralEmpresas],
      )
      return rows.map(r => ({
        director:    r.director,
        empresas:    r.empresas.split(',').filter(Boolean),
        contratos:   r.contratos,
        monto_total: r.monto_total ?? 0,
      }))
    },

    async redDeEmpresas(cuit: string, _depth = 2): Promise<{
      nodos: { id: string; tipo: string; nombre: string }[]
      aristas: { desde: string; hasta: string; relacion: string }[]
    }> {
      // Stub — full implementation via Neo4j in Fase 2
      // For now returns 1-hop via shared directors from DuckDB
      const dirs = await dbAll<{ nombre_director: string }>(
        db,
        `SELECT nombre_director FROM directores WHERE cuit_empresa = ?`,
        [cuit],
      )
      if (dirs.length === 0) return { nodos: [], aristas: [] }

      const dirNames = dirs.map(d => d.nombre_director)
      const placeholders = dirNames.map(() => '?').join(',')
      const relatedCuits = await dbAll<{ cuit_empresa: string; nombre_director: string }>(
        db,
        `SELECT cuit_empresa, nombre_director FROM directores
         WHERE nombre_director IN (${placeholders})
           AND cuit_empresa != ?`,
        [...dirNames, cuit],
      )

      const nodos: { id: string; tipo: string; nombre: string }[] = []
      const aristas: { desde: string; hasta: string; relacion: string }[] = []

      for (const rel of relatedCuits) {
        nodos.push({ id: rel.cuit_empresa, tipo: 'Empresa', nombre: rel.cuit_empresa })
        aristas.push({ desde: cuit, hasta: rel.cuit_empresa, relacion: `DIRECTOR_COMPARTIDO:${rel.nombre_director}` })
      }

      return { nodos, aristas }
    },

    async montoTotal(): Promise<number> {
      const rows = await dbAll<{ total: number }>(
        db,
        `SELECT COALESCE(SUM(monto), 0) AS total FROM contratos
         WHERE municipio = ? AND anio BETWEEN ? AND ?`,
        [municipioId, periodoDesde, periodoHasta],
      )
      return rows[0]?.total ?? 0
    },

    async proveedores(): Promise<{ nombre: string; monto: number; contratos: number }[]> {
      const rows = await dbAll<{ nombre: string; monto: number; contratos: number }>(
        db,
        `SELECT
           proveedor AS nombre,
           SUM(monto) AS monto,
           COUNT(*) AS contratos
         FROM contratos
         WHERE municipio = ? AND anio BETWEEN ? AND ?
         GROUP BY proveedor
         ORDER BY monto DESC`,
        [municipioId, periodoDesde, periodoHasta],
      )
      return rows
    },
  }
}

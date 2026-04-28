import crypto from 'crypto'
import { MunicipioConnector, Contrato, FuenteMetadata } from '../../types'
import { fetchRawRows } from './fetcher'
import { parseRows } from './parser'
import { initDb, getContratosCount, clearContratos, insertContratoBatch } from '../../lib/db'
import { crearSnapshot, getUltimoSnapshot, marcarSupersededBy } from '../../lib/snapshots'
import type { IngestOpts, IngestReport } from '../../types/ingest'

function getAniosDisponibles(): number[] {
  const anioActual = new Date().getFullYear()
  const anios: number[] = []
  // El portal publica con ~1 año de retraso
  // Mínimo histórico: 2019
  for (let a = 2019; a <= anioActual; a++) {
    anios.push(a)
  }
  return anios
}

export const fuenteCordobaCapital: FuenteMetadata = {
  id: 'cordoba-capital-gobiernoabierto',
  jurisdiccion: 'Córdoba Capital',
  url: 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/economia-y-finanzas/compras-y-contrataciones/2',
  formato: 'XLSX',
  oficial: true,
  licencia: 'CC-BY-4.0',
  frecuenciaActualizacion: 'anual',
  nivelConfianza: 'alto',
  notas: 'Portal oficial Gobierno Abierto Córdoba. Dataset estructurado con expedientes y montos. Cobertura 2019–presente.',
}

export const cordobaCapitalConnector: MunicipioConnector = {
  id: 'cordoba-capital',
  nombre: 'Córdoba Capital',
  aniosDisponibles: getAniosDisponibles(),
  tipo: 'api_estructurada',
  fuente: fuenteCordobaCapital,

  async getContratos(anioDesde: number, anioHasta: number): Promise<Contrato[]> {
    const todos: Contrato[] = []

    for (let anio = anioDesde; anio <= anioHasta; anio++) {
      if (!this.aniosDisponibles.includes(anio)) {
        console.warn(`[cordoba-capital] Año ${anio} no disponible, saltando`)
        continue
      }

      console.log(`[cordoba-capital] Descargando contratos ${anio}...`)
      try {
        const rows = await fetchRawRows(anio)
        const contratos = parseRows(rows, anio)
        console.log(`[cordoba-capital] ${contratos.length} contratos parseados para ${anio}`)
        todos.push(...contratos)
      } catch (err) {
        console.error(`[cordoba-capital] Error para año ${anio}: ${(err as Error).message}`)
      }
    }

    return todos
  }
}

// ─── IngestReport API (W1 Task 8) ──────────────────────────────────────────
// Wrapper sobre cordobaCapitalConnector.getContratos que:
//   1. Calcula sha256 del payload combinado para skip-unchanged
//   2. Crea snapshot row en DuckDB con métricas
//   3. Marca el snapshot anterior como superseded si los datos cambiaron
//   4. Soporta dryRun + force + ventana de años
//
// Firma estable que el scheduler nocturno (W6) y otros connectors van a copiar.

const SEED_ID = 'seed:cordoba'
const FUENTE_URL_BASE = 'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/2'

export async function ingestCordobaCapital(opts: IngestOpts): Promise<IngestReport> {
  const t0 = Date.now()
  await initDb()

  const aniosDisponibles = cordobaCapitalConnector.aniosDisponibles
  const desde = opts.desde ?? aniosDisponibles[0]
  const hasta = opts.hasta ?? aniosDisponibles[aniosDisponibles.length - 1]
  const anios = aniosDisponibles.filter(a => a >= desde && a <= hasta)

  // Hash combinado de payloads descargados (proxy del archivo origen completo).
  const hasher = crypto.createHash('sha256')
  const errores: { fila: number; motivo: string }[] = []
  let filasLeidas = 0
  let filasInsertadas = 0
  const filasQuarantined = 0  // ningún quarantine en este connector aún

  if (!opts.dryRun && opts.force) {
    const existing = await getContratosCount('cordoba-capital')
    if (existing > 0) {
      console.log(`[cordoba] --force: limpiando ${existing} contratos`)
      await clearContratos('cordoba-capital')
    }
  }

  const seen = new Set<string>()
  for (const anio of anios) {
    try {
      const rows = await fetchRawRows(anio)
      filasLeidas += rows.length
      hasher.update(JSON.stringify(rows))

      const contratos = parseRows(rows, anio)
      const nuevos = contratos.filter(c => {
        const k = `${c.anio}|${c.tipo}|${c.proveedor}|${c.area}|${c.monto}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })

      if (!opts.dryRun) {
        const inserted = await insertContratoBatch('cordoba-capital', nuevos)
        filasInsertadas += inserted
      }
    } catch (err) {
      errores.push({ fila: -1, motivo: `[${anio}] ${(err as Error).message}` })
    }
  }

  const hashArchivo = hasher.digest('hex')

  // Skip-unchanged: si último snapshot tiene mismo hash y NO --force, saltar.
  const ultimo = await getUltimoSnapshot(SEED_ID, FUENTE_URL_BASE)
  if (!opts.force && ultimo && ultimo.hashArchivo === hashArchivo) {
    return {
      snapshotId: ultimo.id,
      seedId: SEED_ID,
      fuenteUrl: FUENTE_URL_BASE,
      fechaCorrida: ultimo.fechaCorrida,
      hashArchivo,
      filasLeidas,
      filasInsertadas: 0,
      filasQuarantined: 0,
      errores,
      duracionMs: Date.now() - t0,
      status: 'skipped_unchanged',
    }
  }

  const snap = await crearSnapshot({
    seedId: SEED_ID,
    fuenteUrl: FUENTE_URL_BASE,
    hashArchivo,
    filasLeidas,
    filasInsertadas,
    filasQuarantined,
    duracionMs: Date.now() - t0,
    status: errores.length === 0 ? 'success' : 'partial',
  })

  if (!opts.dryRun && ultimo && ultimo.hashArchivo !== hashArchivo) {
    await marcarSupersededBy(ultimo.id, snap.id)
  }

  return {
    snapshotId: snap.id,
    seedId: SEED_ID,
    fuenteUrl: FUENTE_URL_BASE,
    fechaCorrida: snap.fechaCorrida,
    hashArchivo,
    filasLeidas,
    filasInsertadas,
    filasQuarantined,
    errores,
    duracionMs: Date.now() - t0,
    status: snap.status,
  }
}

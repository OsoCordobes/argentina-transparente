// Cliente CKAN — Sprint 4 (Data Foundation, conector genérico)
//
// CKAN es el protocolo estándar de portales de datos abiertos en Argentina:
//   - datos.gob.ar (Nación)
//   - data.buenosaires.gob.ar (CABA)
//   - datosabiertos.santafe.gob.ar
//   - rosario.gob.ar/datosabiertos
//   - etc.
//
// Este cliente soporta los endpoints estándar del API CKAN v3:
//   - /api/3/action/package_search?q=<query>
//   - /api/3/action/package_show?id=<dataset-id>
//   - /api/3/action/group_list
//
// Pattern para nuevos conectores CKAN:
//   1. Crear backend/src/connectors/<id>/index.ts
//   2. Importar createCKANConnectorBase desde acá
//   3. Implementar parser específico para mapear los campos del dataset
//      destino a la interfaz `Contrato`
//   4. Registrar en backend/src/connectors/interface.ts

const TIMEOUT_MS = 30_000

export interface CKANResource {
  id: string
  name: string
  format: string                  // 'CSV', 'XLSX', 'JSON', 'PDF', etc.
  url: string                     // URL directa al archivo
  size?: number
  last_modified?: string
  description?: string
}

export interface CKANDataset {
  id: string
  name: string
  title: string
  notes?: string                  // descripción
  organization?: { name: string; title: string }
  groups?: { name: string; title: string }[]
  tags?: { name: string }[]
  resources: CKANResource[]
  metadata_created?: string
  metadata_modified?: string
  license_id?: string
  license_title?: string
}

interface SearchResult {
  result: {
    count: number
    results: CKANDataset[]
  }
  success: boolean
}

interface ShowResult {
  result: CKANDataset
  success: boolean
}

interface ListResult<T> {
  result: T[]
  success: boolean
}

async function fetchCKAN<T>(url: string): Promise<T | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: ctl.signal,
    })
    if (!res.ok) {
      console.warn(`[ckan] HTTP ${res.status} en ${url.slice(0, 80)}`)
      return null
    }
    const data = (await res.json()) as { success?: boolean }
    if (!data.success) {
      console.warn(`[ckan] success:false en ${url.slice(0, 80)}`)
      return null
    }
    return data as T
  } catch (err) {
    console.warn(`[ckan] Error: ${String(err).split('\n')[0]}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface CKANClientOpts {
  baseUrl: string                 // ej: 'https://datos.gob.ar'
}

export class CKANClient {
  private base: string

  constructor(opts: CKANClientOpts) {
    this.base = opts.baseUrl.replace(/\/+$/, '')
  }

  // Búsqueda full-text contra todos los datasets del portal.
  async searchDatasets(query: string, limit = 20): Promise<CKANDataset[]> {
    const url = `${this.base}/api/3/action/package_search?q=${encodeURIComponent(query)}&rows=${limit}`
    const data = await fetchCKAN<SearchResult>(url)
    return data?.result?.results ?? []
  }

  // Detalle completo de un dataset (incluye lista de resources con URLs).
  async getDataset(id: string): Promise<CKANDataset | null> {
    const url = `${this.base}/api/3/action/package_show?id=${encodeURIComponent(id)}`
    const data = await fetchCKAN<ShowResult>(url)
    return data?.result ?? null
  }

  // Lista de organizaciones (útil para descubrir qué reparticiones publican).
  async listOrganizations(): Promise<string[]> {
    const url = `${this.base}/api/3/action/organization_list`
    const data = await fetchCKAN<ListResult<string>>(url)
    return data?.result ?? []
  }

  // Lista de grupos (categorías temáticas).
  async listGroups(): Promise<string[]> {
    const url = `${this.base}/api/3/action/group_list`
    const data = await fetchCKAN<ListResult<string>>(url)
    return data?.result ?? []
  }

  // Helper: dado un dataset, devuelve el primer recurso con formato XLSX/CSV/JSON.
  static pickStructuredResource(
    ds: CKANDataset,
    preferOrder: string[] = ['XLSX', 'CSV', 'JSON']
  ): CKANResource | null {
    for (const fmt of preferOrder) {
      const r = ds.resources.find(
        (r) => (r.format ?? '').toUpperCase() === fmt.toUpperCase()
      )
      if (r) return r
    }
    return null
  }
}

// ─── Portales CKAN argentinos conocidos ──────────────────────────────────────
//
// Cada nuevo portal se agrega acá y un connector específico decide cómo
// parsear sus datasets de compras/contrataciones.

export const PORTALES_CKAN_AR = {
  nacion: {
    id: 'datos-gob-ar',
    nombre: 'Nación (datos.gob.ar)',
    baseUrl: 'https://datos.gob.ar',
  },
  caba: {
    id: 'caba-buenosaires',
    nombre: 'CABA (data.buenosaires.gob.ar)',
    baseUrl: 'https://data.buenosaires.gob.ar',
  },
  santafe: {
    id: 'santafe',
    nombre: 'Santa Fe (datosabiertos.santafe.gob.ar)',
    baseUrl: 'https://datosabiertos.santafe.gob.ar',
  },
  rosario: {
    id: 'rosario',
    nombre: 'Rosario',
    baseUrl: 'https://datos.rosario.gob.ar',
  },
} as const

export type PortalCKANId = keyof typeof PORTALES_CKAN_AR

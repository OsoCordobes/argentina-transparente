import { MunicipioConnector, Contrato, FuenteMetadata } from '../../types'
import { fetchReleasesForYear } from './fetcher'
import { parseReleases } from './parser'

// Argentina Compra (ex Compr.Ar) — sistema electrónico del Estado nacional.
// Creado por Resolución ONC 59/2016. Cobertura 2016–presente.
// API REST pública con formato OCDS (Open Contracting Data Standard).
// Documentación: https://api.contrataciones.argentina.gob.ar/
// Portal público: https://contrataciones.argentina.gob.ar/

const PRIMER_ANIO = 2016

function getAniosDisponibles(): number[] {
  const anios: number[] = []
  const ahora = new Date().getFullYear()
  for (let a = PRIMER_ANIO; a <= ahora; a++) {
    anios.push(a)
  }
  return anios
}

export const fuenteArgentinaCompra: FuenteMetadata = {
  id: 'argentina-compra-ocds',
  jurisdiccion: 'Nación Argentina',
  url: 'https://api.contrataciones.argentina.gob.ar/v1',
  formato: 'JSON (OCDS)',
  oficial: true,
  licencia: 'CC-BY-4.0',
  frecuenciaActualizacion: 'continua',
  nivelConfianza: 'alto',
  notas:
    'API REST pública de Argentina Compra (ONC - Oficina Nacional de Contrataciones). ' +
    'Formato OCDS v1.1. Cubre todo el Estado nacional desde 2016 (Resolución ONC 59/2016). ' +
    'Incluye licitaciones, compras directas, convenios marco y contrataciones directas.',
}

export const argentinaCompraConnector: MunicipioConnector = {
  id: 'argentina-compra',
  nombre: 'Nación — Argentina Compra (Estado nacional)',
  aniosDisponibles: getAniosDisponibles(),
  tipo: 'api_estructurada',
  fuente: fuenteArgentinaCompra,

  async getContratos(anioDesde: number, anioHasta: number): Promise<Contrato[]> {
    const todos: Contrato[] = []

    for (let anio = anioDesde; anio <= anioHasta; anio++) {
      if (anio < PRIMER_ANIO) {
        console.warn(`[argentina-compra] Año ${anio} anterior al inicio del sistema (${PRIMER_ANIO}), saltando`)
        continue
      }
      if (!this.aniosDisponibles.includes(anio)) {
        console.warn(`[argentina-compra] Año ${anio} fuera de rango, saltando`)
        continue
      }

      console.log(`[argentina-compra] Descargando contratos ${anio}...`)
      try {
        const releases = await fetchReleasesForYear(anio)
        const contratos = parseReleases(releases, anio)
        console.log(`[argentina-compra] ${contratos.length} contratos parseados para ${anio}`)
        todos.push(...contratos)
      } catch (err) {
        console.error(`[argentina-compra] Error para año ${anio}: ${(err as Error).message}`)
        // Continuar con el siguiente año; no abortar todo el rango
      }
    }

    return todos
  },
}

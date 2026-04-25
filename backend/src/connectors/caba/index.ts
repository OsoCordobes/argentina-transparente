import { MunicipioConnector, Contrato, FuenteMetadata } from '../../types'
import { fetchRawRows } from './fetcher'
import { parseRows } from './parser'

// CABA — Ciudad Autónoma de Buenos Aires.
// Portal: data.buenosaires.gob.ar (CKAN)
// Dataset de compras y contrataciones (CSV via discovery CKAN).
// Cobertura: 2018–presente (según datasets disponibles en el portal).

const PRIMER_ANIO = 2018

function getAniosDisponibles(): number[] {
  const anios: number[] = []
  const ahora = new Date().getFullYear()
  for (let a = PRIMER_ANIO; a <= ahora; a++) {
    anios.push(a)
  }
  return anios
}

export const fuenteCABA: FuenteMetadata = {
  id: 'caba-data-buenosaires',
  jurisdiccion: 'CABA',
  url: 'https://data.buenosaires.gob.ar',
  formato: 'CSV (CKAN)',
  oficial: true,
  licencia: 'CC-BY-4.0',
  frecuenciaActualizacion: 'anual',
  nivelConfianza: 'alto',
  notas:
    'Portal de datos abiertos de la Ciudad Autónoma de Buenos Aires. ' +
    'Los datasets de compras se descubren vía API CKAN y se descargan como CSV. ' +
    'Si el portal cambia el nombre del dataset, ejecutar: npm run ckan:explore -- caba compras',
}

export const cabaConnector: MunicipioConnector = {
  id: 'caba',
  nombre: 'CABA (Ciudad Autónoma de Buenos Aires)',
  aniosDisponibles: getAniosDisponibles(),
  tipo: 'api_estructurada',
  fuente: fuenteCABA,

  async getContratos(anioDesde: number, anioHasta: number): Promise<Contrato[]> {
    const todos: Contrato[] = []

    for (let anio = anioDesde; anio <= anioHasta; anio++) {
      if (anio < PRIMER_ANIO) {
        console.warn(`[caba] Año ${anio} fuera del rango soportado (mínimo ${PRIMER_ANIO}), saltando`)
        continue
      }

      console.log(`[caba] Descargando contratos ${anio}...`)
      try {
        const rows = await fetchRawRows(anio)
        const contratos = parseRows(rows, anio)
        console.log(`[caba] ${contratos.length} contratos parseados para ${anio}`)
        todos.push(...contratos)
      } catch (err) {
        console.error(`[caba] Error para año ${anio}: ${(err as Error).message}`)
      }
    }

    return todos
  },
}

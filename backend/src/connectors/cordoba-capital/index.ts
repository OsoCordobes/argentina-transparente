import { MunicipioConnector, Contrato, FuenteMetadata } from '../../types'
import { fetchRawRows } from './fetcher'
import { parseRows } from './parser'

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

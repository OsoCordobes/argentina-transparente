import { MunicipioConnector, Contrato } from '../../types'
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

export const cordobaCapitalConnector: MunicipioConnector = {
  id: 'cordoba-capital',
  nombre: 'Córdoba Capital',
  aniosDisponibles: getAniosDisponibles(),

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

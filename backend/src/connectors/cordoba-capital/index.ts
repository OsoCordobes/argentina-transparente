import { MunicipioConnector, Contrato } from '../../types'
import { fetchRawRows } from './fetcher'
import { parseRows } from './parser'

export const cordobaCapitalConnector: MunicipioConnector = {
  id: 'cordoba-capital',
  nombre: 'Córdoba Capital',
  aniosDisponibles: [2019, 2020, 2021, 2022, 2023],

  async getContratos(anioDesde: number, anioHasta: number): Promise<Contrato[]> {
    const todos: Contrato[] = []

    for (let anio = anioDesde; anio <= anioHasta; anio++) {
      if (!this.aniosDisponibles.includes(anio)) {
        console.warn(`[cordoba-capital] Año ${anio} no disponible, saltando`)
        continue
      }

      console.log(`[cordoba-capital] Descargando contratos ${anio}...`)
      const rows = await fetchRawRows(anio)
      const contratos = parseRows(rows, anio)
      console.log(`[cordoba-capital] ${contratos.length} contratos parseados para ${anio}`)
      todos.push(...contratos)
    }

    return todos
  }
}

import type { MunicipioConnector, Contrato } from '../../types'
import { fetchContratos } from './fetcher'
import { parseContratos } from './parser'

export const cordobaCapitalConnector: MunicipioConnector = {
  id: 'cordoba-capital',
  nombre: 'Córdoba Capital',
  aniosDisponibles: [2019, 2020, 2021, 2022, 2023],

  async getContratos(anioDesde: number, anioHasta: number): Promise<Contrato[]> {
    const raw = await fetchContratos(anioDesde, anioHasta)
    return parseContratos(raw)
  },
}

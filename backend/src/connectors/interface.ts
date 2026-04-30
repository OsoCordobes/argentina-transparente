import { MunicipioConnector } from '../types'
import { cordobaCapitalConnector } from './cordoba-capital'
import { argentinaCompraConnector } from './argentina-compra'
import { cabaConnector } from './caba'
import { santaFeConnector } from './santa-fe'

export const registry: Record<string, MunicipioConnector> = {
  'cordoba-capital':  cordobaCapitalConnector,
  'argentina-compra': argentinaCompraConnector,
  'caba':             cabaConnector,
  'santa-fe':         santaFeConnector,
}

export function getConnector(municipioId: string): MunicipioConnector {
  const connector = registry[municipioId]
  if (!connector) {
    throw new Error(`Municipio '${municipioId}' no disponible. Disponibles: ${Object.keys(registry).join(', ')}`)
  }
  return connector
}

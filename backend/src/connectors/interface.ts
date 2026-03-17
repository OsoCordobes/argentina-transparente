import { MunicipioConnector } from '../types'
import { cordobaCapitalConnector } from './cordoba-capital'

export const registry: Record<string, MunicipioConnector> = {
  'cordoba-capital': cordobaCapitalConnector,
}

export function getConnector(municipioId: string): MunicipioConnector {
  const connector = registry[municipioId]
  if (!connector) {
    throw new Error(`Municipio '${municipioId}' no disponible. Disponibles: ${Object.keys(registry).join(', ')}`)
  }
  return connector
}

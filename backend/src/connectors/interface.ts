import type { MunicipioConnector } from '../types'

export type { MunicipioConnector }

// Registry of all available connectors
export const connectors: Map<string, MunicipioConnector> = new Map()

export function registerConnector(connector: MunicipioConnector): void {
  connectors.set(connector.id, connector)
}

export function getConnector(id: string): MunicipioConnector | undefined {
  return connectors.get(id)
}

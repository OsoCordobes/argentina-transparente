import { describe, it, expect, beforeAll } from 'vitest'
import { initDb } from './db'
import { getJerarquiaV2 } from './grafo-jerarquia-v2'

describe('getJerarquiaV2', () => {
  beforeAll(async () => { await initDb() })

  it('returns depth-structured response with levels 0-3', async () => {
    const result = await getJerarquiaV2({ jurisdiccion: 'cordoba-capital' })
    expect(result).toHaveProperty('depth0')
    expect(result).toHaveProperty('depth1')
    expect(result).toHaveProperty('depth2')
    expect(result).toHaveProperty('depth3')
    expect(result.depth0.nodes.length).toBeGreaterThanOrEqual(1)
    expect(result.depth0.nodes[0].type).toBe('jurisdiccion')
  })

  it('includes meta with totals', async () => {
    const result = await getJerarquiaV2({ jurisdiccion: 'cordoba-capital' })
    expect(result.meta).toHaveProperty('totalNodos')
    expect(result.meta).toHaveProperty('totalAristas')
    expect(result.meta).toHaveProperty('jurisdiccion')
  })
})

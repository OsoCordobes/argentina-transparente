import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomeAdapter } from './HomeAdapter'

// Mock fetch globally
global.fetch = vi.fn(async (url: any) => {
  if (String(url).includes('/api/grafo/jerarquia/v2')) {
    return {
      ok: true,
      json: async () => ({
        depth0: {
          nodes: [{
            id: 'root',
            type: 'jurisdiccion',
            label: 'Provincia',
            weight: 1,
            data: { depth: 0 },
            subtitle: 'Estado',
          }],
          edges: [],
        },
        depth1: { nodes: [], edges: [] },
        depth2: { nodes: [], edges: [] },
        depth3: { nodes: [], edges: [] },
        meta: {
          jurisdiccion: 'cordoba-capital',
          totalNodos: 1,
          totalAristas: 0,
          montoTotal: 0,
        },
      }),
    } as Response
  }
  return { ok: false, status: 404 } as Response
}) as never

describe('HomeAdapter', () => {
  it('renders the engine with fetched data', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={qc}><HomeAdapter /></QueryClientProvider>
    )
    await waitFor(() => {
      expect(container.querySelector('svg')).toBeTruthy()
    }, { timeout: 3000 })
  })
})

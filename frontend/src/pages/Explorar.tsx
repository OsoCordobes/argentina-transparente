/**
 * pages/Explorar.tsx
 *
 * Home del modo Explorar. El canvas central lo aporta `<HomeGraph>` —
 * Sigma.js + Graphology + ForceAtlas2, encoding visual data-driven sobre
 * /api/grafo/jerarquia/v2 (DuckDB). Reemplaza al GraphEngine custom de
 * PR-1 (radial cluster fijo, sin vida) por un mapa que respira los datos.
 *
 * Las pantallas de profile (`/persona/:dni`, `/empresa/:cuit`) siguen
 * usando ExplorarLayout en su modo legacy con `graph` poblado y sin children.
 */

import '@/styles/argos.css'
import { ExplorarLayout } from '@/components/argos/ExplorarLayout'
import { HomeGraph } from '@/components/HomeGraph'

export default function Explorar() {
  return (
    <ExplorarLayout graph={null} isLoading={false}>
      <HomeGraph />
    </ExplorarLayout>
  )
}

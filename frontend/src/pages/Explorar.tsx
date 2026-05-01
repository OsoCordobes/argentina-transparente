/**
 * pages/Explorar.tsx
 *
 * Página del modo Explorar (chat-first neural graph).
 *
 * PR-1 grafo-premium (2026-05-01): el home delega el render del canvas en
 * `<HomeAdapter>`, que internamente usa el nuevo `<GraphEngine>` (radial
 * cluster + breathing + GraphSidebar propio). El shell (sidebar + header +
 * search bar) lo aporta `<ExplorarLayout>` vía slot de children.
 *
 * Las pantallas de profile (`/persona/:dni`, `/empresa/:cuit`) siguen
 * usando ExplorarLayout en su modo legacy con `graph` poblado y sin children.
 */

import '@/styles/argos.css'
import { ExplorarLayout } from '@/components/argos/ExplorarLayout'
import { HomeAdapter } from '@/pages/graph-adapters/HomeAdapter'

export default function Explorar() {
  return (
    <ExplorarLayout graph={null} isLoading={false}>
      <HomeAdapter />
    </ExplorarLayout>
  )
}

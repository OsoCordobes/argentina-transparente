import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

// graph-first ARGOS — TODAS las superficies usan el shell dark coherente.
// El AppShell light y ForensicHeader fueron eliminados (commit graph-first
// puro). Cualquier ruta que apunte a una superficie legacy redirige a /.
const Explorar = lazy(() => import('./pages/Explorar'))
const Persona = lazy(() => import('./pages/Persona'))
const Empresa = lazy(() => import('./pages/Empresa'))
const Dinero = lazy(() => import('./pages/Dinero'))
const Senales = lazy(() => import('./pages/Senales'))
const ActoresD6 = lazy(() => import('./pages/ActoresD6'))
const CasosD7 = lazy(() => import('./pages/CasosD7'))
const CasoD7 = lazy(() => import('./pages/CasoD7'))
const WatchlistD8 = lazy(() => import('./pages/WatchlistD8'))
const Comparar = lazy(() => import('./pages/Comparar'))
const Metodologia = lazy(() => import('./pages/Metodologia'))
const Fuentes = lazy(() => import('./pages/Fuentes'))

function PageLoader() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: 'var(--bg-0, #05070D)',
        color: 'var(--text, #F5F7FA)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#6FB8E8' }} />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Home graph-first: el grafo de Córdoba */}
        <Route
          path="/"
          element={
            <Suspense fallback={<PageLoader />}>
              <Explorar />
            </Suspense>
          }
        />
        <Route path="/explorar" element={<Navigate to="/" replace />} />

        {/* Profile graph-first: ego-graph del actor */}
        <Route
          path="/persona/:dni"
          element={
            <Suspense fallback={<PageLoader />}>
              <Persona />
            </Suspense>
          }
        />
        <Route
          path="/empresa/:cuit"
          element={
            <Suspense fallback={<PageLoader />}>
              <Empresa />
            </Suspense>
          }
        />

        {/* Phase D — TODAS reformadas a ArgosShell dark.
            Mismo sidebar / mismo theme / coherencia total con / */}
        <Route
          path="/dinero/:jurisdiccion?/:anio?"
          element={
            <Suspense fallback={<PageLoader />}>
              <Dinero />
            </Suspense>
          }
        />
        <Route
          path="/senales"
          element={
            <Suspense fallback={<PageLoader />}>
              <Senales />
            </Suspense>
          }
        />
        <Route
          path="/actores"
          element={
            <Suspense fallback={<PageLoader />}>
              <ActoresD6 />
            </Suspense>
          }
        />
        <Route
          path="/casos"
          element={
            <Suspense fallback={<PageLoader />}>
              <CasosD7 />
            </Suspense>
          }
        />
        <Route
          path="/caso/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <CasoD7 />
            </Suspense>
          }
        />
        <Route
          path="/watchlist"
          element={
            <Suspense fallback={<PageLoader />}>
              <WatchlistD8 />
            </Suspense>
          }
        />
        <Route
          path="/comparar"
          element={
            <Suspense fallback={<PageLoader />}>
              <Comparar />
            </Suspense>
          }
        />
        <Route
          path="/metodologia"
          element={
            <Suspense fallback={<PageLoader />}>
              <Metodologia />
            </Suspense>
          }
        />
        <Route
          path="/fuentes"
          element={
            <Suspense fallback={<PageLoader />}>
              <Fuentes />
            </Suspense>
          }
        />

        {/* Cualquier ruta legacy → home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'

// Dashboard se carga eager (es el home y queremos LCP rápido)
import Dashboard from './pages/Dashboard'

// El resto de páginas se code-split: cada una baja en su propio chunk
// on-demand. Cytoscape (~600KB raw) sólo se baja cuando navegás a /red.
const Entidad = lazy(() => import('./pages/Entidad'))
const Contrato = lazy(() => import('./pages/Contrato'))
const Red = lazy(() => import('./pages/Red'))
const Fuentes = lazy(() => import('./pages/Fuentes'))
const Municipios = lazy(() => import('./pages/Municipios'))
const Login = lazy(() => import('./pages/Login'))
const Casos = lazy(() => import('./pages/Casos'))
const Caso = lazy(() => import('./pages/Caso'))
const Denuncia = lazy(() => import('./pages/Denuncia'))

function PageLoader() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/entidad/:nombre"
            element={
              <Suspense fallback={<PageLoader />}>
                <Entidad />
              </Suspense>
            }
          />
          <Route
            path="/contrato/:hash"
            element={
              <Suspense fallback={<PageLoader />}>
                <Contrato />
              </Suspense>
            }
          />
          <Route
            path="/red"
            element={
              <Suspense fallback={<PageLoader />}>
                <Red />
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
          <Route
            path="/municipios"
            element={
              <Suspense fallback={<PageLoader />}>
                <Municipios />
              </Suspense>
            }
          />
          <Route
            path="/login"
            element={
              <Suspense fallback={<PageLoader />}>
                <Login />
              </Suspense>
            }
          />
          <Route
            path="/casos"
            element={
              <Suspense fallback={<PageLoader />}>
                <Casos />
              </Suspense>
            }
          />
          <Route
            path="/caso/:id"
            element={
              <Suspense fallback={<PageLoader />}>
                <Caso />
              </Suspense>
            }
          />
          <Route
            path="/caso/:id/denuncia"
            element={
              <Suspense fallback={<PageLoader />}>
                <Denuncia />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

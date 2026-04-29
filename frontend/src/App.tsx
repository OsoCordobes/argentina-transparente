import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'

// graph-first home: / es Explorar (sidebar Inicio/Mapa/Expedientes/...).
// Dashboard legacy queda en /dashboard solo por compatibilidad de bookmarks.
import Dashboard from './pages/Dashboard'

// El resto de páginas se code-split: cada una baja en su propio chunk
// on-demand. Cytoscape (~600KB raw) sólo se baja cuando navegás a /red.
const Entidad = lazy(() => import('./pages/Entidad'))
const Contrato = lazy(() => import('./pages/Contrato'))
const Red = lazy(() => import('./pages/Red'))
const Fuentes = lazy(() => import('./pages/Fuentes'))
const Municipios = lazy(() => import('./pages/Municipios'))
const Alertas = lazy(() => import('./pages/Alertas'))
const Login = lazy(() => import('./pages/Login'))
const Casos = lazy(() => import('./pages/Casos'))
const Caso = lazy(() => import('./pages/Caso'))
const Denuncia = lazy(() => import('./pages/Denuncia'))
const Explorar = lazy(() => import('./pages/Explorar'))
const Watchlist = lazy(() => import('./pages/Watchlist'))
const Actores = lazy(() => import('./pages/Actores'))
const Cobertura = lazy(() => import('./pages/Cobertura'))
const Huecos = lazy(() => import('./pages/Huecos'))
// PLAN-UI §3 — Profiles canónicos por DNI/CUIT (Stub-4 / Stub-5)
const Persona = lazy(() => import('./pages/Persona'))
const Empresa = lazy(() => import('./pages/Empresa'))
// PLAN-DATOS Fase E2 — cola de verificación humana
const ColaVerificacion = lazy(() => import('./pages/ColaVerificacion'))
// PLAN-UI D4 — Dinero / ciclo presupuestario
const Dinero = lazy(() => import('./pages/Dinero'))
// PLAN-UI D5 — Señales feed exploratorio
const Senales = lazy(() => import('./pages/Senales'))
// PLAN-UI D6 — Actores directorio
const ActoresD6 = lazy(() => import('./pages/ActoresD6'))
// PLAN-UI D7 — Casos / Caso (workspace)
const CasosD7 = lazy(() => import('./pages/CasosD7'))
const CasoD7 = lazy(() => import('./pages/CasoD7'))
// PLAN-UI D8 — Watchlist
const WatchlistD8 = lazy(() => import('./pages/WatchlistD8'))
// PLAN-UI D9 — Comparar
const Comparar = lazy(() => import('./pages/Comparar'))
// PLAN-UI D10 — Metodología
const Metodologia = lazy(() => import('./pages/Metodologia'))

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
        {/* graph-first home: / es Explorar (fullscreen, sidebar propia).
            /explorar redirige a / para preservar enlaces viejos. */}
        <Route
          path="/"
          element={
            <Suspense fallback={<PageLoader />}>
              <Explorar />
            </Suspense>
          }
        />
        <Route path="/explorar" element={<Navigate to="/" replace />} />
        {/* PLAN-UI D4: Dinero con drill-down URL-driven */}
        <Route
          path="/dinero/:jurisdiccion?/:anio?"
          element={
            <Suspense fallback={<PageLoader />}>
              <Dinero />
            </Suspense>
          }
        />
        {/* PLAN-UI D5: Señales feed exploratorio read-only */}
        <Route
          path="/senales"
          element={
            <Suspense fallback={<PageLoader />}>
              <Senales />
            </Suspense>
          }
        />
        {/* PLAN-UI D6: Actores directorio (sobreescribe el legacy /actores) */}
        <Route
          path="/actores"
          element={
            <Suspense fallback={<PageLoader />}>
              <ActoresD6 />
            </Suspense>
          }
        />
        {/* PLAN-UI D7: Casos workspace (sobreescribe legacy) */}
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
        {/* PLAN-UI D8: Watchlist (sobreescribe legacy) */}
        <Route
          path="/watchlist"
          element={
            <Suspense fallback={<PageLoader />}>
              <WatchlistD8 />
            </Suspense>
          }
        />
        {/* PLAN-UI D9: Comparar 2 empresas */}
        <Route
          path="/comparar"
          element={
            <Suspense fallback={<PageLoader />}>
              <Comparar />
            </Suspense>
          }
        />
        {/* PLAN-UI D10: Metodología */}
        <Route
          path="/metodologia"
          element={
            <Suspense fallback={<PageLoader />}>
              <Metodologia />
            </Suspense>
          }
        />
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
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
            path="/alertas"
            element={
              <Suspense fallback={<PageLoader />}>
                <Alertas />
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
          {/* /casos y /caso/:id quedaron migrados a D7 fuera del AppShell.
              La ruta de denuncia legacy se mantiene por si hay flujos viejos
              que apuntan a /caso/:id/denuncia */}
          <Route
            path="/caso/:id/denuncia"
            element={
              <Suspense fallback={<PageLoader />}>
                <Denuncia />
              </Suspense>
            }
          />
          {/* /watchlist legacy reemplazado por D8 fuera del AppShell */}
          {/* /actores legacy reemplazado por D6 fuera del AppShell.
              Mantengo la ruta por nombre pero apuntando a la legacy
              hasta que el flujo by-name se migre. */}
          <Route
            path="/actores-legacy/persona/:nombre"
            element={
              <Suspense fallback={<PageLoader />}>
                <Actores />
              </Suspense>
            }
          />
          <Route
            path="/actores/empresa/:cuit"
            element={
              <Suspense fallback={<PageLoader />}>
                <Actores />
              </Suspense>
            }
          />
          <Route
            path="/cobertura"
            element={
              <Suspense fallback={<PageLoader />}>
                <Cobertura />
              </Suspense>
            }
          />
          <Route
            path="/huecos"
            element={
              <Suspense fallback={<PageLoader />}>
                <Huecos />
              </Suspense>
            }
          />
          {/* PLAN-UI §3.1 — Profile canónico de Persona Física por DNI */}
          <Route
            path="/persona/:dni"
            element={
              <Suspense fallback={<PageLoader />}>
                <Persona />
              </Suspense>
            }
          />
          {/* PLAN-UI §3.2 — Profile canónico de Persona Jurídica por CUIT */}
          <Route
            path="/empresa/:cuit"
            element={
              <Suspense fallback={<PageLoader />}>
                <Empresa />
              </Suspense>
            }
          />
          {/* PLAN-DATOS Fase E2 — cola de verificación humana */}
          <Route
            path="/cola-verificacion"
            element={
              <Suspense fallback={<PageLoader />}>
                <ColaVerificacion />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

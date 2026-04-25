import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import Dashboard from './pages/Dashboard'
import Entidad from './pages/Entidad'
import Contrato from './pages/Contrato'
import Red from './pages/Red'
import Login from './pages/Login'
import Casos from './pages/Casos'
import Caso from './pages/Caso'
import Denuncia from './pages/Denuncia'
import Fuentes from './pages/Fuentes'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/entidad/:nombre" element={<Entidad />} />
          <Route path="/contrato/:hash" element={<Contrato />} />
          <Route path="/red" element={<Red />} />
          <Route path="/fuentes" element={<Fuentes />} />
          <Route path="/login" element={<Login />} />
          <Route path="/casos" element={<Casos />} />
          <Route path="/caso/:id" element={<Caso />} />
          <Route path="/caso/:id/denuncia" element={<Denuncia />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import Dashboard from './pages/Dashboard'
import Entidad from './pages/Entidad'
import Contrato from './pages/Contrato'
import Red from './pages/Red'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/entidad/:nombre" element={<Entidad />} />
          <Route path="/contrato/:hash" element={<Contrato />} />
          <Route path="/red" element={<Red />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

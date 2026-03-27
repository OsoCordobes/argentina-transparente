import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Report from './pages/Report'
import ProviderProfile from './pages/ProviderProfile'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/report" element={<Report />} />
        <Route path="/provider/:nombre" element={<ProviderProfile />} />
      </Routes>
    </BrowserRouter>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import BoardPage from './pages/BoardPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"         element={<BoardPage />} />
        <Route path="/board"    element={<BoardPage />} />
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

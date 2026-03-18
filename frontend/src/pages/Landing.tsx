import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMunicipios, analizarMunicipio } from '../lib/api'

export default function Landing() {
  const navigate = useNavigate()
  const [municipios, setMunicipios] = useState<{ id: string; nombre: string; aniosDisponibles: number[] }[]>([])
  const [municipioId, setMunicipioId] = useState('cordoba-capital')
  const [anioDesde, setAnioDesde] = useState(2023)
  const [anioHasta, setAnioHasta] = useState(2023)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMunicipios().then(setMunicipios).catch(console.error)
  }, [])

  const anioActual = new Date().getFullYear()
  const años = Array.from({ length: anioActual - 2005 + 1 }, (_, i) => 2005 + i).reverse()

  async function handleAnalizar() {
    setError(null)
    setLoading(true)
    try {
      const expediente = await analizarMunicipio(municipioId, anioDesde, anioHasta)
      sessionStorage.setItem('expediente', JSON.stringify(expediente))
      navigate('/report')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-xl w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">La Bestia</h1>
          <p className="text-gray-400 text-lg">
            Análisis automatizado de gasto público municipal en Córdoba, Argentina
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 space-y-6 border border-gray-800">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Municipio</label>
            <select
              value={municipioId}
              onChange={e => setMunicipioId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {municipios.map(m => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Año desde</label>
              <select
                value={anioDesde}
                onChange={e => setAnioDesde(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {años.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Año hasta</label>
              <select
                value={anioHasta}
                onChange={e => setAnioHasta(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {años.filter(a => a >= anioDesde).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleAnalizar}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg px-4 py-3 font-semibold text-white transition-colors"
          >
            {loading ? 'Analizando... (puede tardar 1-2 minutos)' : 'Analizar gasto público'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-600">
          Datos oficiales del Portal de Datos Abiertos de la Municipalidad de Córdoba
        </p>
      </div>
    </div>
  )
}

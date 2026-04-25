import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMunicipios, analizarMunicipio, getHistorial, HistorialItem } from '../lib/api'

const LOADING_STEPS = [
  'Conectando con el Portal de Datos Abiertos...',
  'Descargando contratos oficiales...',
  'Analizando patrones de gasto...',
  'Calculando señales de riesgo...',
  'Generando expediente con IA...',
  'Finalizando reporte...',
]

export default function Landing() {
  const navigate = useNavigate()
  const [municipios, setMunicipios] = useState<{ id: string; nombre: string; aniosDisponibles: number[] }[]>([])
  const [historial, setHistorial] = useState<HistorialItem[]>([])
  const [municipioId, setMunicipioId] = useState('cordoba-capital')
  const [anioDesde, setAnioDesde] = useState(2023)
  const [anioHasta, setAnioHasta] = useState(2023)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMunicipios().then(setMunicipios).catch(console.error)
    getHistorial().then(setHistorial).catch(() => {})
  }, [])

  useEffect(() => {
    if (!loading) { setLoadingStep(0); return }
    const interval = setInterval(() => {
      setLoadingStep(prev => Math.min(prev + 1, LOADING_STEPS.length - 1))
    }, 18000)
    return () => clearInterval(interval)
  }, [loading])

  const anioActual = new Date().getFullYear()
  const años = Array.from({ length: anioActual - 2005 + 1 }, (_, i) => 2005 + i).reverse()

  async function handleAnalizar() {
    setError(null)
    setLoading(true)
    try {
      const { id } = await analizarMunicipio(municipioId, anioDesde, anioHasta)
      navigate(`/report?id=${id}`)
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
          <h1 className="text-4xl font-bold tracking-tight">ARGOS</h1>
          <p className="text-gray-400 text-lg">
            Argentina Transparente — análisis automatizado de gasto público
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 space-y-6 border border-gray-800">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Municipio</label>
            <select
              value={municipioId}
              onChange={e => setMunicipioId(e.target.value)}
              disabled={loading}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
                disabled={loading}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {años.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Año hasta</label>
              <select
                value={anioHasta}
                onChange={e => setAnioHasta(Number(e.target.value))}
                disabled={loading}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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

          {loading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full shrink-0" />
                <span className="text-sm text-gray-300">{LOADING_STEPS[loadingStep]}</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-[18000ms] ease-linear"
                  style={{ width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 text-center">
                El análisis puede tardar hasta 2 minutos según el período seleccionado
              </p>
            </div>
          ) : (
            <button
              onClick={handleAnalizar}
              className="w-full bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-3 font-semibold text-white transition-colors"
            >
              Analizar gasto público →
            </button>
          )}
        </div>

        <p className="text-center text-xs text-gray-600">
          Datos oficiales del Portal de Datos Abiertos de la Municipalidad de Córdoba
        </p>

        {historial.length > 0 && (
          <div className="mt-12 space-y-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Últimos análisis</p>
            <div className="space-y-2">
              {historial.map(h => (
                <button
                  key={h.id}
                  onClick={() => navigate(`/report?id=${h.id}`)}
                  className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg p-3 space-y-1 transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-300">
                      {h.municipio} · {h.anio_desde === h.anio_hasta ? h.anio_desde : `${h.anio_desde}–${h.anio_hasta}`}
                    </span>
                    <span className="text-xs text-gray-600">
                      {new Date(h.generado_en).toLocaleDateString('es-AR')}
                    </span>
                  </div>
                  {h.resumen_ejecutivo && (
                    <p className="text-xs text-gray-500 line-clamp-2">{h.resumen_ejecutivo}</p>
                  )}
                  <div className="flex gap-3 text-xs text-gray-600">
                    <span>{h.total_contratos.toLocaleString('es-AR')} contratos</span>
                    <span>{h.total_señales} señales</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

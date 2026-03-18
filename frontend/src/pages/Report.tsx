import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Expediente, Señal } from '../lib/api'

function ScoreBadge({ score, severidad }: { score: number; severidad: string }) {
  const color = severidad === 'grave'
    ? 'bg-red-900/50 border-red-700 text-red-300'
    : severidad === 'moderada'
    ? 'bg-yellow-900/50 border-yellow-700 text-yellow-300'
    : 'bg-green-900/50 border-green-700 text-green-300'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${color}`}>
      {score}/100 · {severidad.toUpperCase()}
    </span>
  )
}

function SignalCard({ señal }: { señal: Señal }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left p-5 flex items-start justify-between gap-4 hover:bg-gray-800/50 transition-colors"
      >
        <div className="space-y-2 flex-1">
          <ScoreBadge score={señal.score} severidad={señal.legal.severidad} />
          <p className="font-semibold text-white">{señal.titulo}</p>
        </div>
        <span className="text-gray-500 mt-1">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-800 pt-4">
          <p className="text-gray-300 text-sm leading-relaxed">{señal.resumen}</p>
          {señal.evidencia.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Evidencia</p>
              {señal.evidencia.map((e, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-gray-500">→</span>
                  <span className="text-gray-300">{e.descripcion}</span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Marco legal</p>
            {señal.legal.articulos.map((a, i) => (
              <p key={i} className="text-xs text-gray-400">· {a}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Report() {
  const navigate = useNavigate()
  const [expediente, setExpediente] = useState<Expediente | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('expediente')
    if (!raw) { navigate('/'); return }
    setExpediente(JSON.parse(raw))
  }, [navigate])

  if (!expediente) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando expediente...</p>
    </div>
  )

  const ars = (n: number) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0
  }).format(n)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">

        {/* Header */}
        <div className="space-y-2">
          <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Nuevo análisis
          </button>
          <h1 className="text-3xl font-bold">Expediente Ciudadano</h1>
          <p className="text-gray-400">
            {expediente.municipio} · Período {expediente.periodo}
          </p>
          <p className="text-xs text-gray-600">
            Generado el {new Date(expediente.generadoEn).toLocaleString('es-AR')} ·{' '}
            {expediente.señales.length} señal{expediente.señales.length !== 1 ? 'es' : ''} detectada{expediente.señales.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Contratos analizados</p>
            <p className="text-2xl font-bold">{expediente.datosBase.totalContratos.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Gasto total</p>
            <p className="text-2xl font-bold">{ars(expediente.datosBase.montoTotal)}</p>
          </div>
        </div>

        {/* Resumen ejecutivo */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
          <h2 className="font-semibold text-gray-200">Resumen ejecutivo</h2>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
            {expediente.resumenEjecutivo}
          </p>
        </div>

        {/* Señales */}
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-200">
            Señales de riesgo ({expediente.señales.length})
          </h2>
          {expediente.señales.map((s, i) => (
            <SignalCard key={i} señal={s} />
          ))}
        </div>

        {/* Top proveedores */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-200">Top 5 proveedores por monto</h2>
          <div className="space-y-3">
            {expediente.datosBase.topProveedores.slice(0, 5).map((p, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-300 truncate flex-1 pr-4">{p.nombre}</span>
                  <span className="text-gray-400 shrink-0">{p.porcentaje}%</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${Math.min(p.porcentaje, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">{ars(p.monto)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Guía de denuncia */}
        {expediente.guiaDenuncia && (
          <div className="bg-red-950/30 border border-red-900 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-red-300">
              ⚠ Guía de denuncia ciudadana
            </h2>
            <div className="space-y-3">
              {expediente.guiaDenuncia.pasos.map((paso, i) => (
                <p key={i} className="text-sm text-red-200">{paso}</p>
              ))}
            </div>
            <div className="space-y-1 pt-2 border-t border-red-900">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">Organismos</p>
              {expediente.guiaDenuncia.organismos.map((o, i) => (
                <p key={i} className="text-xs text-red-300">· {o}</p>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">Marco legal</p>
              {expediente.guiaDenuncia.marcoLegal.map((l, i) => (
                <p key={i} className="text-xs text-red-300">· {l}</p>
              ))}
            </div>
          </div>
        )}

        {/* Fuentes */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Fuentes de datos</p>
          {expediente.fuentes.map((f, i) => (
            <p key={i} className="text-xs text-gray-600">
              {f.descripcion} · Accedido el {f.fechaAcceso} ·{' '}
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {f.url}
              </a>
            </p>
          ))}
        </div>

      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getReporte } from '../lib/api'
import type { Expediente, Señal } from '../lib/api'

function ExportDenunciaButton({ expediente }: { expediente: Expediente }) {
  const arsLocal = (n: number) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0
  }).format(n)
  const sep = '─'.repeat(60)

  const handleExport = () => {
    const lines: string[] = [
      'EXPEDIENTE CIUDADANO — SISTEMA ARGOS',
      'Análisis automatizado de contrataciones públicas',
      sep,
      `MUNICIPIO: ${expediente.municipio}`,
      `PERÍODO: ${expediente.periodo}`,
      `FECHA: ${new Date(expediente.generadoEn).toLocaleDateString('es-AR')}`,
      `CONTRATOS ANALIZADOS: ${expediente.datosBase.totalContratos.toLocaleString('es-AR')}`,
      `GASTO TOTAL: ${arsLocal(expediente.datosBase.montoTotal)}`,
      sep,
      'RESUMEN EJECUTIVO',
      expediente.resumenEjecutivo,
      sep,
      `SEÑALES DE RIESGO (${expediente.señales.length})`,
      ...expediente.señales.flatMap(s => [
        '',
        `[${s.tipologia.toUpperCase()} | SCORE: ${s.score}/100 | ${s.legal.severidad.toUpperCase()}]`,
        s.titulo,
        s.resumen,
        'Evidencia:',
        ...s.evidencia.map(e => `  • ${e.descripcion}`),
        'Marco legal:',
        ...s.legal.articulos.map(a => `  • ${a}`),
        'Denunciar ante:',
        ...s.legal.denunciarAnte.map(d => `  • ${d}`),
      ]),
      sep,
      'TOP PROVEEDORES',
      ...expediente.datosBase.topProveedores.slice(0, 10).map(
        p => `  • ${p.nombre}: ${arsLocal(p.monto)} (${p.porcentaje}%)`
      ),
      sep,
      'FUENTES DE DATOS',
      ...expediente.fuentes.flatMap(f => [
        `  • ${f.descripcion}`,
        `    URL: ${f.url}`,
        `    Accedido: ${f.fechaAcceso}`,
      ]),
      ...(expediente.comoVerificar ? [
        sep,
        'CÓMO VERIFICAR Y DENUNCIAR',
        ...expediente.comoVerificar.instrucciones.map((inst, i) => `${i + 1}. ${inst}`),
        '',
        'Expedientes a solicitar:',
        ...expediente.comoVerificar.expedientesSugeridos.map(e => `  • ${e}`),
        '',
        'Plazos legales:',
        ...expediente.comoVerificar.plazosLegales.map(p => `  • ${p}`),
      ] : []),
      sep,
      'Generado por ARGOS — Sistema de Análisis de Transparencia Pública',
      'Los datos provienen de fuentes oficiales. Documento de carácter informativo.',
    ]

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ARGOS-${expediente.municipio.replace(/\s+/g, '-')}-${expediente.periodo}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      className="w-full bg-blue-900/40 hover:bg-blue-800/50 border border-blue-700 rounded-lg px-4 py-3 text-sm font-medium text-blue-200 transition-colors"
    >
      Exportar expediente para denuncia formal (.txt)
    </button>
  )
}

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
  const [searchParams] = useSearchParams()
  const [expediente, setExpediente] = useState<Expediente | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      getReporte(id).then(exp => {
        if (!exp) { setLoadError(true); return }
        setExpediente(exp)
      })
    } else {
      navigate('/')
    }
  }, [searchParams, navigate])

  if (loadError) return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
      <p className="text-gray-400">Reporte no encontrado.</p>
      <button onClick={() => navigate('/')} className="text-sm text-blue-400 hover:underline">
        ← Volver al inicio
      </button>
    </div>
  )

  if (!expediente) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando expediente...</p>
    </div>
  )

  const ars = (n: number) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0
  }).format(n)

  const scoreGeneral = expediente.señales.length === 0 ? 0 : Math.round(
    expediente.señales.reduce((sum, s) => {
      const peso = s.legal.severidad === 'grave' ? 1.5 : s.legal.severidad === 'moderada' ? 1 : 0.5
      return sum + s.score * peso
    }, 0) / expediente.señales.reduce((sum, s) =>
      sum + (s.legal.severidad === 'grave' ? 1.5 : s.legal.severidad === 'moderada' ? 1 : 0.5), 0)
  )

  const nivelColor = scoreGeneral >= 80
    ? 'text-red-400 border-red-700 bg-red-950/50'
    : scoreGeneral >= 60
    ? 'text-orange-400 border-orange-700 bg-orange-950/50'
    : scoreGeneral >= 35
    ? 'text-yellow-400 border-yellow-700 bg-yellow-950/50'
    : 'text-green-400 border-green-700 bg-green-950/50'

  const nivelLabel = scoreGeneral >= 80 ? 'CRÍTICO' : scoreGeneral >= 60 ? 'ALTO' : scoreGeneral >= 35 ? 'MEDIO' : 'BAJO'

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">

        {/* Header */}
        <div className="space-y-2">
          <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Nuevo análisis
          </button>
          <div className={`inline-flex items-center gap-3 px-4 py-2 rounded-lg border ${nivelColor}`}>
            <span className="text-2xl font-bold">{scoreGeneral}</span>
            <div className="text-left">
              <p className="text-xs font-semibold tracking-wider">{nivelLabel}</p>
              <p className="text-xs opacity-70">score de riesgo</p>
            </div>
          </div>
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

        {/* Exportar */}
        <ExportDenunciaButton expediente={expediente} />

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
              <div
                key={i}
                className="space-y-1 cursor-pointer hover:bg-gray-800/40 transition-colors rounded-lg px-2 -mx-2"
                onClick={() => navigate(`/provider/${encodeURIComponent(p.nombre)}?id=${searchParams.get('id')}`)}
              >
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

        {/* Cómo verificar */}
        {expediente.comoVerificar && (
          <div className="bg-blue-950/30 border border-blue-800 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-blue-300">Cómo verificar y denunciar</h2>
            <ol className="space-y-2">
              {expediente.comoVerificar.instrucciones.map((inst, i) => (
                <li key={i} className="text-sm text-blue-200">{i + 1}. {inst}</li>
              ))}
            </ol>
            {expediente.comoVerificar.expedientesSugeridos.length > 0 && (
              <div className="pt-2 border-t border-blue-900 space-y-1">
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider">Expedientes a solicitar</p>
                {expediente.comoVerificar.expedientesSugeridos.map((e, i) => (
                  <p key={i} className="text-xs text-blue-300">• {e}</p>
                ))}
              </div>
            )}
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

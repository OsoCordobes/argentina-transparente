import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getReporte, getEntidad } from '../lib/api'
import type { Expediente, Señal, Entidad } from '../lib/api'

export default function ProviderProfile() {
  const navigate = useNavigate()
  const { nombre } = useParams<{ nombre: string }>()
  const [searchParams] = useSearchParams()
  const decodedNombre = nombre ? decodeURIComponent(nombre) : ''

  const [expediente, setExpediente] = useState<Expediente | null>(null)
  const [entidad, setEntidad] = useState<Entidad | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!decodedNombre) { navigate('/'); return }

    const id = searchParams.get('id')
    const fetches: Promise<void>[] = [
      getEntidad(decodedNombre).then(e => { if (e) setEntidad(e) }),
    ]
    if (id) {
      fetches.push(
        getReporte(id).then(exp => { if (exp) setExpediente(exp) })
      )
    }
    Promise.allSettled(fetches).finally(() => setLoading(false))
  }, [decodedNombre, searchParams, navigate])

  const ars = (n: number) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)

  const matchingSeñales: Señal[] = expediente
    ? expediente.señales.filter(s =>
        s.evidencia.some(e => e.descripcion.toUpperCase().includes(decodedNombre.toUpperCase()))
      )
    : []

  const handleExport = () => {
    const sep = '─'.repeat(60)
    const lines: string[] = ['ARGOS — PERFIL DE PROVEEDOR', sep, `Proveedor: ${decodedNombre}`]
    if (entidad) {
      lines.push(`Monto total: ${ars(entidad.montoTotal)}`)
      lines.push(`Contratos: ${entidad.totalContratos}`)
      lines.push(`Municipios: ${entidad.municipios.join(', ')}`)
      lines.push(`Período: ${entidad.anios[0]}–${entidad.anios.at(-1)}`)
      if (entidad.afip) {
        lines.push(`CUIT: ${entidad.afip.cuit}`)
        lines.push(`Empleador AFIP: ${entidad.afip.esEmpleador ? 'SÍ' : 'NO'}`)
        if (entidad.afip.estado) lines.push(`Estado AFIP: ${entidad.afip.estado}`)
      }
      lines.push('', 'EVOLUCIÓN ANUAL')
      entidad.timeline.forEach(t => lines.push(`  ${t.anio}: ${t.cantidad} contratos · ${ars(t.monto)}`))
    }
    if (matchingSeñales.length > 0) {
      lines.push('', sep, `SEÑALES (${matchingSeñales.length})`)
      matchingSeñales.forEach(s => {
        lines.push('', `[${s.score}/100 | ${s.legal.severidad.toUpperCase()} | ${s.tipologia}]`)
        lines.push(s.titulo, s.resumen)
      })
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `argos-proveedor-${decodedNombre.slice(0, 40).replace(/\s+/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando datos del proveedor...</p>
    </div>
  )

  if (!entidad && !expediente) return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
      <p className="text-gray-400">Proveedor no encontrado en la base de datos.</p>
      <button onClick={() => navigate(-1)} className="text-sm text-blue-400 hover:underline">
        ← Volver
      </button>
    </div>
  )

  const maxMonto = entidad ? Math.max(...entidad.timeline.map(t => t.monto), 1) : 1

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">

        {/* Header */}
        <div className="space-y-2">
          <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Volver
          </button>
          <h1 className="text-2xl font-bold break-words">{decodedNombre}</h1>
          {entidad && (
            <p className="text-gray-400 text-sm">
              {entidad.municipios.join(' · ')}
              {entidad.anios.length > 0 && ` · ${entidad.anios[0]}–${entidad.anios.at(-1)}`}
            </p>
          )}
        </div>

        {/* Key stats */}
        {entidad && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Monto total</p>
              <p className="text-xl font-bold text-blue-400">{ars(entidad.montoTotal)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Contratos</p>
              <p className="text-xl font-bold">{entidad.totalContratos.toLocaleString('es-AR')}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Áreas</p>
              <p className="text-xl font-bold">{entidad.areas.length}</p>
            </div>
          </div>
        )}

        {/* AFIP data */}
        {entidad?.afip && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
            <h2 className="font-semibold text-gray-200 text-sm uppercase tracking-wider">Verificación AFIP</h2>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full border border-gray-700 bg-gray-800 text-xs text-gray-300">
                CUIT {entidad.afip.cuit}
              </span>
              <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold ${
                entidad.afip.esEmpleador
                  ? 'border-green-700 bg-green-900/40 text-green-300'
                  : 'border-red-700 bg-red-900/40 text-red-300'
              }`}>
                {entidad.afip.esEmpleador ? 'Empleador registrado' : 'Sin empleados AFIP'}
              </span>
              {entidad.afip.estado && (
                <span className={`inline-flex items-center px-3 py-1 rounded-full border text-xs ${
                  entidad.afip.estado.toUpperCase().includes('ACTIV')
                    ? 'border-green-700 bg-green-900/30 text-green-300'
                    : 'border-yellow-700 bg-yellow-900/30 text-yellow-300'
                }`}>
                  {entidad.afip.estado}
                </span>
              )}
              {entidad.afip.inicioActividades && (
                <span className="inline-flex items-center px-3 py-1 rounded-full border border-gray-700 bg-gray-800 text-xs text-gray-400">
                  Inicio actividades: {entidad.afip.inicioActividades}
                </span>
              )}
            </div>
            {entidad.afip.actividadPrincipal && (
              <p className="text-xs text-gray-500">{entidad.afip.actividadPrincipal}</p>
            )}
          </div>
        )}

        {/* Timeline */}
        {entidad && entidad.timeline.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-200">Evolución anual</h2>
            <div className="space-y-2">
              {entidad.timeline.map(t => (
                <div key={t.anio} className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span className="font-mono">{t.anio}</span>
                    <span>{t.cantidad} contratos · {ars(t.monto)}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${(t.monto / maxMonto) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tipos de proceso */}
        {entidad && entidad.tipos.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
            <h2 className="font-semibold text-gray-200">Por tipo de proceso</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 text-xs text-gray-500 uppercase tracking-wider">Tipo</th>
                    <th className="text-right py-2 text-xs text-gray-500 uppercase tracking-wider">Qty</th>
                    <th className="text-right py-2 text-xs text-gray-500 uppercase tracking-wider">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {entidad.tipos.map((tp, i) => (
                    <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-2.5 text-gray-300">{tp.tipo}</td>
                      <td className="py-2.5 text-right text-gray-400">{tp.cantidad}</td>
                      <td className="py-2.5 text-right text-gray-400">{ars(tp.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Señales de riesgo */}
        {matchingSeñales.length > 0 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-200">
              Señales de riesgo donde aparece ({matchingSeñales.length})
            </h2>
            {matchingSeñales.map((s, i) => {
              const matchingEvidence = s.evidencia.filter(e =>
                e.descripcion.toUpperCase().includes(decodedNombre.toUpperCase())
              )
              const colorClass = s.legal.severidad === 'grave'
                ? 'border-red-800 bg-red-950/20'
                : s.legal.severidad === 'moderada'
                ? 'border-yellow-800 bg-yellow-950/20'
                : 'border-gray-800 bg-gray-900'
              const badgeClass = s.legal.severidad === 'grave'
                ? 'bg-red-900/50 border-red-700 text-red-300'
                : s.legal.severidad === 'moderada'
                ? 'bg-yellow-900/50 border-yellow-700 text-yellow-300'
                : 'bg-green-900/50 border-green-700 text-green-300'
              return (
                <div key={i} className={`border rounded-xl p-5 space-y-3 ${colorClass}`}>
                  <div className="flex items-start gap-3 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${badgeClass}`}>
                      {s.score}/100 · {s.legal.severidad.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500 px-2 py-1 bg-gray-800 rounded-full border border-gray-700">
                      {s.tipologia}
                    </span>
                  </div>
                  <p className="font-semibold text-white text-sm">{s.titulo}</p>
                  {matchingEvidence.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Evidencia relevante</p>
                      {matchingEvidence.map((e, j) => (
                        <div key={j} className="flex gap-2 text-sm">
                          <span className="text-gray-500">→</span>
                          <span className="text-gray-300">{e.descripcion}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.legal.articulos.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Referencias legales</p>
                      {s.legal.articulos.map((a, j) => (
                        <p key={j} className="text-xs text-gray-400">· {a}</p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Recent contracts */}
        {entidad && entidad.contratos.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-200">
              Contratos ({Math.min(entidad.contratos.length, 100)} de {entidad.totalContratos})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 text-xs text-gray-500 uppercase tracking-wider">Año</th>
                    <th className="text-left py-2 text-xs text-gray-500 uppercase tracking-wider">Área</th>
                    <th className="text-left py-2 text-xs text-gray-500 uppercase tracking-wider">Tipo</th>
                    <th className="text-right py-2 text-xs text-gray-500 uppercase tracking-wider">Monto</th>
                    <th className="text-right py-2 text-xs text-gray-500 uppercase tracking-wider">Fuente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {entidad.contratos.slice(0, 100).map((c, i) => (
                    <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-2.5 text-gray-400 font-mono text-xs">{c.anio}</td>
                      <td className="py-2.5 text-gray-300 max-w-[180px] truncate" title={c.area}>{c.area}</td>
                      <td className="py-2.5 text-gray-500 text-xs">{c.tipo}</td>
                      <td className="py-2.5 text-right text-gray-300 font-mono text-xs">{ars(c.monto)}</td>
                      <td className="py-2.5 text-right">
                        <a href={c.fuente_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:text-blue-300 hover:underline">
                          fuente
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Export */}
        <button
          onClick={handleExport}
          className="w-full bg-blue-900/40 hover:bg-blue-800/50 border border-blue-700 rounded-lg px-4 py-3 text-sm font-medium text-blue-200 transition-colors"
        >
          Exportar perfil (.txt)
        </button>

      </div>
    </div>
  )
}

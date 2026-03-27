import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Expediente, Señal } from '../lib/api'

export default function ProviderProfile() {
  const navigate = useNavigate()
  const { nombre } = useParams<{ nombre: string }>()
  const decodedNombre = nombre ? decodeURIComponent(nombre) : ''

  const [expediente, setExpediente] = useState<Expediente | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('expediente')
    if (!raw) { navigate('/'); return }
    setExpediente(JSON.parse(raw))
  }, [navigate])

  if (!expediente) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando datos del proveedor...</p>
    </div>
  )

  // Find provider data
  const providerData = expediente.datosBase.topProveedores.find(
    p => p.nombre.toUpperCase() === decodedNombre.toUpperCase()
  )

  const ars = (n: number) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)

  // AFIP data is not directly in the type, but topProveedores may have extra fields in practice
  // We cast to access any extra AFIP fields the backend might include
  const providerWithAfip = providerData as (typeof providerData & {
    cuit?: string
    esEmpleador?: boolean
    estado?: string
  }) | undefined

  // Filter señales where any evidence mentions this provider
  const matchingSeñales: Señal[] = expediente.señales.filter(s =>
    s.evidencia.some(e => e.descripcion.toUpperCase().includes(decodedNombre.toUpperCase()))
  )

  // Export handler
  const handleExport = () => {
    const sep = '─'.repeat(60)
    const lines: string[] = [
      'ARGOS — PERFIL DE PROVEEDOR',
      sep,
      `Proveedor: ${decodedNombre}`,
      `Municipio: ${expediente.municipio}`,
      `Período: ${expediente.periodo}`,
      sep,
    ]

    if (providerData) {
      lines.push('ESTADÍSTICAS')
      lines.push(`  Monto total recibido: ${ars(providerData.monto)}`)
      lines.push(`  Porcentaje del gasto total: ${providerData.porcentaje}%`)
      lines.push('')
    }

    if (matchingSeñales.length > 0) {
      lines.push(`SEÑALES DE RIESGO DONDE APARECE (${matchingSeñales.length})`)
      matchingSeñales.forEach(s => {
        lines.push('')
        lines.push(`[${s.tipologia.toUpperCase()} | SCORE: ${s.score}/100 | ${s.legal.severidad.toUpperCase()}]`)
        lines.push(s.titulo)
        lines.push(s.resumen)
        lines.push('Evidencia relevante:')
        s.evidencia
          .filter(e => e.descripcion.toUpperCase().includes(decodedNombre.toUpperCase()))
          .forEach(e => lines.push(`  • ${e.descripcion}`))
        lines.push('Marco legal:')
        s.legal.articulos.forEach(a => lines.push(`  • ${a}`))
        lines.push('Denunciar ante:')
        s.legal.denunciarAnte.forEach(d => lines.push(`  • ${d}`))
      })
    } else {
      lines.push('No se encontraron señales de riesgo que mencionen directamente a este proveedor.')
    }

    lines.push('')
    lines.push(sep)
    lines.push('Generado por ARGOS — Sistema de Análisis de Transparencia Pública')
    lines.push('Los datos provienen de fuentes oficiales. Documento de carácter informativo.')

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ARGOS-proveedor-${decodedNombre.replace(/\s+/g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">

        {/* Back button */}
        <button
          onClick={() => navigate('/report')}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Volver al expediente
        </button>

        {/* Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h1 className="text-2xl font-bold text-white break-words">{decodedNombre}</h1>

          {providerData ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Monto recibido</p>
                <p className="text-lg font-semibold text-blue-400">{ars(providerData.monto)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider">% del gasto total</p>
                <p className="text-lg font-semibold text-blue-400">{providerData.porcentaje}%</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Contratos</p>
                <p className="text-lg font-semibold text-blue-400">
                  {/* contract count not available per-provider in this data structure */}
                  N/D
                </p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              Este proveedor no figura en el top de proveedores del expediente.
            </p>
          )}

          {/* AFIP badge if available */}
          {providerWithAfip?.cuit && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-700 bg-gray-800 text-xs text-gray-300">
                CUIT: {providerWithAfip.cuit}
              </span>
              {providerWithAfip.esEmpleador !== undefined && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${
                  providerWithAfip.esEmpleador
                    ? 'border-green-700 bg-green-900/40 text-green-300'
                    : 'border-red-700 bg-red-900/40 text-red-300'
                }`}>
                  Empleador: {providerWithAfip.esEmpleador ? 'SÍ' : 'NO'}
                </span>
              )}
              {providerWithAfip.estado && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-700 bg-gray-800 text-xs text-gray-300">
                  Estado AFIP: {providerWithAfip.estado}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Yearly distribution placeholder */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
          <h2 className="font-semibold text-gray-200">Distribución temporal</h2>
          <p className="text-sm text-gray-500 italic">
            Para ver distribución anual, usar el rango de años completo en el análisis.
          </p>
        </div>

        {/* Matching señales */}
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-200">
            Señales donde aparece ({matchingSeñales.length})
          </h2>
          {matchingSeñales.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-sm text-gray-500">
                No se encontraron señales de riesgo que mencionen directamente a este proveedor en la evidencia.
              </p>
            </div>
          ) : (
            matchingSeñales.map((s, i) => {
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
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Evidencia relevante</p>
                    {matchingEvidence.map((e, j) => (
                      <div key={j} className="flex gap-2 text-sm">
                        <span className="text-gray-500">→</span>
                        <span className="text-gray-300">{e.descripcion}</span>
                      </div>
                    ))}
                  </div>
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
            })
          )}
        </div>

        {/* Distribución por tipo de proceso — general reference */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="font-semibold text-gray-200">Distribución por tipo de proceso</h2>
            <p className="text-xs text-gray-500 italic">
              Distribución total del municipio (no filtrada por proveedor)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 text-xs text-gray-500 uppercase tracking-wider font-semibold">Tipo de proceso</th>
                  <th className="text-right py-2 text-xs text-gray-500 uppercase tracking-wider font-semibold">Cantidad</th>
                  <th className="text-right py-2 text-xs text-gray-500 uppercase tracking-wider font-semibold">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {expediente.datosBase.tiposProceso.map((tp, i) => (
                  <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                    <td className="py-2.5 text-gray-300">{tp.tipo}</td>
                    <td className="py-2.5 text-right text-gray-400">{tp.cantidad.toLocaleString('es-AR')}</td>
                    <td className="py-2.5 text-right text-gray-400">{ars(tp.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Export button */}
        <button
          onClick={handleExport}
          className="w-full bg-blue-900/40 hover:bg-blue-800/50 border border-blue-700 rounded-lg px-4 py-3 text-sm font-medium text-blue-200 transition-colors"
        >
          Exportar perfil de proveedor (.txt)
        </button>

      </div>
    </div>
  )
}

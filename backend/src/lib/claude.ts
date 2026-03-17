import Anthropic from '@anthropic-ai/sdk'
import { Contrato, Señal, Expediente } from '../types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function ars(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)
}

export async function generarExpediente(
  municipio: string,
  anioDesde: number,
  anioHasta: number,
  contratos: Contrato[],
  señales: Señal[]
): Promise<Expediente> {
  const montoTotal = contratos.reduce((s, c) => s + c.monto, 0)
  const periodo = anioDesde === anioHasta ? String(anioDesde) : `${anioDesde}–${anioHasta}`

  // Top 10 proveedores
  const porProv = new Map<string, number>()
  for (const c of contratos) {
    const k = c.proveedor.trim().toUpperCase()
    porProv.set(k, (porProv.get(k) ?? 0) + c.monto)
  }
  const topProveedores = Array.from(porProv.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([nombre, monto]) => ({
      nombre,
      monto,
      porcentaje: parseFloat(((monto / montoTotal) * 100).toFixed(1)),
    }))

  // Tipos de proceso
  const porTipo = new Map<string, { cantidad: number; monto: number }>()
  for (const c of contratos) {
    const k = c.tipo.trim().toUpperCase()
    const prev = porTipo.get(k) ?? { cantidad: 0, monto: 0 }
    porTipo.set(k, { cantidad: prev.cantidad + 1, monto: prev.monto + c.monto })
  }
  const tiposProceso = Array.from(porTipo.entries())
    .map(([tipo, v]) => ({ tipo, ...v }))
    .sort((a, b) => b.monto - a.monto)

  // Prompt para Sonnet
  const señalesTexto = señales.map(s =>
    `- [${s.tipologia.toUpperCase()} | score:${s.score} | ${s.legal.severidad}] ${s.titulo}\n  ${s.resumen}`
  ).join('\n\n')

  const topProvTexto = topProveedores.slice(0, 5)
    .map(p => `  • ${p.nombre}: ${ars(p.monto)} (${p.porcentaje}%)`)
    .join('\n')

  const prompt = `Eres un analista de transparencia pública. Redactá el resumen ejecutivo de un expediente ciudadano sobre el gasto municipal de ${municipio} en el período ${periodo}.

DATOS BASE:
- Total contratos analizados: ${contratos.length}
- Monto total: ${ars(montoTotal)}
- Fuente: Portal de Datos Abiertos de la Municipalidad de Córdoba (datos oficiales)

TOP 5 PROVEEDORES:
${topProvTexto}

SEÑALES DE RIESGO DETECTADAS (${señales.length}):
${señalesTexto}

INSTRUCCIONES:
- Redactá 3 párrafos concisos en español rioplatense formal
- Párrafo 1: contexto del análisis (qué se analizó, período, fuente)
- Párrafo 2: principales hallazgos con números concretos
- Párrafo 3: recomendaciones de acción ciudadana e institucional
- NO uses lenguaje alarmista ni conclusiones definitivas sobre corrupción
- SÍ usá frases como "se detectaron patrones que merecen investigación"
- Cada número debe estar respaldado por los datos provistos
- Máximo 250 palabras en total`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const resumenEjecutivo = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()

  const expediente: Expediente = {
    municipio,
    periodo,
    generadoEn: new Date().toISOString(),
    resumenEjecutivo,
    señales,
    datosBase: {
      totalContratos: contratos.length,
      montoTotal,
      topProveedores,
      tiposProceso,
    },
    fuentes: [{
      url: contratos[0]?.fuenteUrl ?? '',
      descripcion: `Portal de Datos Abiertos — Municipalidad de Córdoba — Compras y Contrataciones ${periodo}`,
      fechaAcceso: new Date().toISOString().split('T')[0],
    }],
    guiaDenuncia: señales.some(s => s.legal.severidad === 'grave') ? {
      organismos: [
        'Tribunal de Cuentas de Córdoba — tribunaldecuentas.cba.gov.ar — mesa@tribunaldecuentas.cba.gov.ar',
        'Defensoría del Pueblo de Córdoba — defensoria.cba.gov.ar — 0800-555-3376',
        'Fiscalía de Estado de Córdoba — fiscaliaestado.cba.gov.ar',
      ],
      marcoLegal: [
        'Ley Provincial 8614 — Contrataciones de la Provincia de Córdoba',
        'Ley de Contabilidad Pública — art. 7 (contrataciones directas)',
        'Código Penal art. 265/266 — peculado y exacciones ilegales',
      ],
      pasos: [
        '1. Descargar este expediente como respaldo',
        '2. Presentar nota ante el Tribunal de Cuentas citando número de contrato y monto',
        '3. Solicitar acceso al expediente original vía Ley de Acceso a la Información (Ord. 12.750)',
        '4. Contactar a la Defensoría del Pueblo para seguimiento ciudadano',
      ],
    } : undefined,
  }

  return expediente
}

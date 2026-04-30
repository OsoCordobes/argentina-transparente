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
  const periodo = anioDesde === anioHasta
    ? String(anioDesde)
    : `${anioDesde}–${anioHasta}`

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

  const porTipo = new Map<string, { cantidad: number; monto: number }>()
  for (const c of contratos) {
    const k = c.tipo.trim().toUpperCase()
    const prev = porTipo.get(k) ?? { cantidad: 0, monto: 0 }
    porTipo.set(k, { cantidad: prev.cantidad + 1, monto: prev.monto + c.monto })
  }
  const tiposProceso = Array.from(porTipo.entries())
    .map(([tipo, v]) => ({ tipo, ...v }))
    .sort((a, b) => b.monto - a.monto)

  // Enriquecer top proveedores con datos AFIP (best-effort, no bloquea)
  let topProveedoresEnriquecidos: typeof topProveedores = topProveedores
  try {
    const { enriquecerProveedores } = await import('./afip')
    topProveedoresEnriquecidos = await enriquecerProveedores(topProveedores) as typeof topProveedores
    console.log('[afip] Enriquecimiento completado')
  } catch (err) {
    console.warn('[afip] Enriquecimiento falló, continuando sin datos AFIP:', err)
  }

  // Prompt mejorado — más periodístico y específico
  const proveedoresTexto = topProveedoresEnriquecidos.slice(0, 5).map((p: any) => {
    const afipInfo = p.afip?.encontrado
      ? `CUIT: ${p.afip.cuit} | Empleador: ${p.afip.esEmpleador ? 'SÍ' : 'NO'}`
      : 'Sin datos AFIP verificados'
    return `  • ${p.nombre}: ${ars(p.monto)} (${p.porcentaje}%) — ${afipInfo}`
  }).join('\n')

  const señalesTexto = señales.map(s =>
    `[${s.tipologia.toUpperCase()} | score:${s.score}/100 | ${s.legal.severidad.toUpperCase()}]\n` +
    `  ${s.titulo}\n` +
    `  ${s.resumen}\n` +
    `  Marco legal: ${s.legal.articulos.join('; ')}`
  ).join('\n\n')

  const prompt = `Sos un analista de transparencia pública especializado en contrataciones municipales argentinas. Tu tarea es redactar el resumen ejecutivo de un expediente ciudadano sobre el gasto municipal de ${municipio} en el período ${periodo}.

DATOS VERIFICADOS (fuente oficial: Portal de Datos Abiertos — Municipalidad de Córdoba):
- Total contratos analizados: ${contratos.length}
- Monto total del período: ${ars(montoTotal)}
- Período analizado: ${periodo}
- Fecha de análisis: ${new Date().toLocaleDateString('es-AR')}

TOP 5 PROVEEDORES POR MONTO RECIBIDO:
${proveedoresTexto}

DISTRIBUCIÓN POR TIPO DE PROCEDIMIENTO:
${tiposProceso.slice(0, 5).map(t => `  • ${t.tipo}: ${t.cantidad} contratos → ${ars(t.monto)}`).join('\n')}

SEÑALES DE RIESGO DETECTADAS AUTOMÁTICAMENTE (${señales.length} señales):
${señalesTexto}

INSTRUCCIONES DE REDACCIÓN:
Redactá exactamente 3 párrafos claros, en español rioplatense formal, con el siguiente contenido:

PÁRRAFO 1 — CONTEXTO (40-60 palabras):
Describí qué se analizó, cuándo, y la fuente oficial de los datos. Mencioná el monto total y la cantidad de contratos. No uses tecnicismos innecesarios.

PÁRRAFO 2 — HALLAZGOS PRINCIPALES (80-100 palabras):
Presentá los 2-3 hallazgos más significativos con sus números exactos. Usá frases como "se detectaron patrones que merecen investigación", "los datos muestran una concentración significativa", "se identificaron contratos que podrían requerir mayor escrutinio". NUNCA afirmes corrupción como hecho probado. Mencioná proveedores específicos con sus montos reales.

PÁRRAFO 3 — RECOMENDACIONES (60-80 palabras):
Indicá qué pasos concretos debería tomar la ciudadanía o el Concejo Deliberante. Mencioná al Tribunal de Cuentas de Córdoba y/o la Defensoría del Pueblo. Incluí una acción específica (ej: solicitar expedientes, presentar nota formal, pedir auditoría).

RESTRICCIONES ABSOLUTAS:
- Todos los números deben provenir exactamente de los datos arriba provistos
- No inventes porcentajes, montos ni nombres de proveedores
- No uses frases como "es claramente corrupto", "hay malversación" o similares
- Máximo 250 palabras en total para los 3 párrafos
- No incluyas títulos ni encabezados, solo los 3 párrafos corridos`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const resumenEjecutivo = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  const hayGrave = señales.some(s => s.legal.severidad === 'grave')

  const expediente: Expediente = {
    municipio,
    periodo,
    generadoEn: new Date().toISOString(),
    resumenEjecutivo,
    señales,
    datosBase: {
      totalContratos: contratos.length,
      montoTotal,
      topProveedores: topProveedoresEnriquecidos,
      tiposProceso,
    },
    fuentes: [{
      url: contratos[0]?.fuenteUrl ?? '',
      descripcion: `Portal de Datos Abiertos — Municipalidad de Córdoba — Compras y Contrataciones ${periodo}`,
      fechaAcceso: new Date().toISOString().split('T')[0],
    }],
    guiaDenuncia: hayGrave ? {
      organismos: [
        'Tribunal de Cuentas de Córdoba — tribunaldecuentas.cba.gov.ar — mesa@tribunaldecuentas.cba.gov.ar',
        'Defensoría del Pueblo de Córdoba — defensoria.cba.gov.ar — 0800-555-3376',
        'Fiscalía de Estado de Córdoba — fiscaliaestado.cba.gov.ar',
      ],
      marcoLegal: [
        'Ley Provincial 10.155 + Decreto Reglamentario 305/14 — Régimen de Compras y Contrataciones de la Provincia de Córdoba (bienes y servicios)',
        'Ley de Contabilidad Pública — art. 7 (contrataciones directas)',
        'Código Penal art. 265/266 — peculado y exacciones ilegales',
      ],
      pasos: [
        '1. Descargar este expediente como respaldo documental',
        '2. Presentar nota ante el Tribunal de Cuentas citando proveedor, monto y tipo de contrato',
        '3. Solicitar el expediente original vía Ley de Acceso a la Información (Ord. 12.750)',
        '4. Contactar a la Defensoría del Pueblo para seguimiento ciudadano',
      ],
    } : undefined,
  }

  const expedientesACitar = señales
    .filter(s => s.score >= 60)
    .flatMap(s => s.evidencia.map(e => `Expediente de contratación: ${e.descripcion.slice(0, 80)}`))
    .slice(0, 5)

  expediente.comoVerificar = {
    instrucciones: [
      'Presentar nota ante Mesa de Entradas Municipal (Av. Vélez Sarsfield 1198, Córdoba)',
      'Citar Ordenanza Municipal 12.750/2015 de Acceso a la Información Pública',
      'Solicitar: expediente de contratación + acto de adjudicación + informe técnico de evaluación',
      'Plazo máximo de respuesta del municipio: 30 días hábiles',
      'Sin respuesta en plazo: queja ante Defensoría del Pueblo (Av. Colón 4, 0800-555-3376)',
    ],
    expedientesSugeridos: expedientesACitar.length > 0
      ? expedientesACitar
      : señales.slice(0, 3).map(s => `Expediente relacionado: ${s.titulo.slice(0, 60)}`),
    plazosLegales: [
      'Respuesta inicial: 30 días hábiles (art. 4 Ordenanza 12.750)',
      'Prórroga: hasta 15 días adicionales con notificación previa',
      'Silencio = denegación tácita → habilita recurso jerárquico',
    ],
  }

  return expediente
}

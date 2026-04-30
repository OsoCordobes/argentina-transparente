import { Contrato } from '../../types'
import { OCDSRelease } from './fetcher'

const FUENTE_BASE = 'https://contrataciones.argentina.gob.ar/'

// Mapeo OCDS procurementMethod → terminología argentina
const METODO_A_TIPO: Record<string, string> = {
  open:       'Licitación Pública',
  selective:  'Licitación Privada',
  limited:    'Compra Directa',
  direct:     'Contratación Directa',
}

function extractYear(release: OCDSRelease): number | null {
  const candidates = [
    release.date,
    release.tender?.tenderPeriod?.startDate,
    release.awards?.[0]?.date,
    release.contracts?.[0]?.dateSigned,
  ]
  for (const d of candidates) {
    if (!d) continue
    const y = parseInt(d.slice(0, 4))
    if (!isNaN(y) && y >= 2010 && y <= 2030) return y
  }
  return null
}

function extractProveedor(release: OCDSRelease): string {
  // Preferir el primer proveedor adjudicado
  const award = release.awards?.find(a => a.status === 'active' || a.status === 'pending')
    ?? release.awards?.[0]
  if (award?.suppliers?.[0]) {
    const s = award.suppliers[0]
    return (s.identifier?.legalName ?? s.name ?? '').trim()
  }
  return ''
}

function extractMonto(release: OCDSRelease): number {
  // Prioridad: contrato firmado > adjudicación > licitación
  const montos = [
    release.contracts?.[0]?.value?.amount,
    release.awards?.[0]?.value?.amount,
    release.tender?.value?.amount,
  ]
  for (const m of montos) {
    if (typeof m === 'number' && m > 0) return m
  }
  return 0
}

function extractTipo(release: OCDSRelease): string {
  const detalles = release.tender?.procurementMethodDetails?.trim()
  if (detalles) return detalles
  const metodo = release.tender?.procurementMethod ?? ''
  return METODO_A_TIPO[metodo] ?? metodo ?? 'Desconocido'
}

function extractNumeroExpediente(release: OCDSRelease): string | undefined {
  return release.ocid ?? release.id ?? undefined
}

function extractFechaContrato(release: OCDSRelease): string | undefined {
  const fecha = release.contracts?.[0]?.dateSigned ?? release.awards?.[0]?.date
  if (!fecha) return undefined
  // Normalizar a YYYY-MM-DD
  return fecha.slice(0, 10)
}

export function parseReleases(releases: OCDSRelease[], anio: number): Contrato[] {
  const contratos: Contrato[] = []

  for (const release of releases) {
    const descripcion = release.tender?.title?.trim() ?? ''
    if (!descripcion) continue

    const proveedor = extractProveedor(release)
    if (!proveedor) continue

    const monto = extractMonto(release)
    if (monto <= 0) continue

    const anioFinal = extractYear(release) ?? anio

    contratos.push({
      tipo:              extractTipo(release),
      proveedor,
      area:              release.buyer?.name?.trim() ?? '',
      descripcion,
      monto,
      anio:              anioFinal,
      fuenteUrl:         FUENTE_BASE,
      numeroExpediente:  extractNumeroExpediente(release),
      fechaContrato:     extractFechaContrato(release),
    })
  }

  return contratos
}

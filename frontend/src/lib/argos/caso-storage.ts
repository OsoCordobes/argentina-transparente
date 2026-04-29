/**
 * caso-storage.ts — Persistencia de casos en localStorage (PLAN-UI D7).
 *
 * Decisión brainstorm: MVP en localStorage, no Supabase. Privado del
 * navegador, exportable como .json. Cada caso es un blob serializable.
 */

const KEY = 'argos_casos_v1'

export type DestinatarioCaso =
  | 'tribunal_cuentas'
  | 'fiscalia'
  | 'mpf'
  | 'oficina_anticorrupcion'
  | 'cne'
  | 'defensoria'

export interface CasoLS {
  id: string                          // uuid local
  titulo: string
  descripcion: string
  estado: 'borrador' | 'listo' | 'generado'
  // Material adjuntado
  senalIds: string[]                  // ids de señales_cache
  contratoHashes: string[]
  entidadCuits: string[]              // PJ involucradas
  personaDnis: string[]               // PF involucradas
  // Notas / narrativa
  notas: string
  // Datos del denunciante (por-caso, no se persiste globalmente)
  denunciante: {
    nombre: string
    dni: string
    email: string
    telefono?: string
    domicilio: string
  }
  destinatario: DestinatarioCaso
  hechos: string
  petitorio: string
  // Timestamps
  creadoEn: string
  modificadoEn: string
}

export function newCaso(seed: Partial<CasoLS> = {}): CasoLS {
  const now = new Date().toISOString()
  const id = `caso_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    titulo: seed.titulo ?? 'Caso sin título',
    descripcion: seed.descripcion ?? '',
    estado: 'borrador',
    senalIds: seed.senalIds ?? [],
    contratoHashes: seed.contratoHashes ?? [],
    entidadCuits: seed.entidadCuits ?? [],
    personaDnis: seed.personaDnis ?? [],
    notas: seed.notas ?? '',
    denunciante: seed.denunciante ?? { nombre: '', dni: '', email: '', domicilio: '' },
    destinatario: seed.destinatario ?? 'tribunal_cuentas',
    hechos: seed.hechos ?? '',
    petitorio: seed.petitorio ?? '',
    creadoEn: now,
    modificadoEn: now,
  }
}

export function getCasos(): CasoLS[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function getCaso(id: string): CasoLS | null {
  return getCasos().find(c => c.id === id) ?? null
}

export function saveCaso(c: CasoLS): { ok: true } | { ok: false; reason: string } {
  // Audit fix: NO mutar el argumento. Antes el caller pasaba la React state
  // y la mutación rompía las comparaciones por referencia + corrompía el
  // árbol de estado. Shallow clone con timestamp actualizado.
  const toSave: CasoLS = { ...c, modificadoEn: new Date().toISOString() }
  const all = getCasos()
  const idx = all.findIndex(x => x.id === toSave.id)
  if (idx >= 0) all[idx] = toSave; else all.push(toSave)
  // Audit fix: detectar QuotaExceededError o storage bloqueado y devolver
  // status para que el caller decida si avisar al usuario.
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch (err) {
    return { ok: false, reason: (err as Error).message || 'localStorage no disponible' }
  }
  window.dispatchEvent(new Event('argos:casos-changed'))
  return { ok: true }
}

export function deleteCaso(id: string): { ok: true } | { ok: false; reason: string } {
  const all = getCasos().filter(c => c.id !== id)
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch (err) {
    return { ok: false, reason: (err as Error).message || 'localStorage no disponible' }
  }
  window.dispatchEvent(new Event('argos:casos-changed'))
  return { ok: true }
}

export function exportCaso(c: CasoLS): string {
  return JSON.stringify(c, null, 2)
}

export function importCaso(json: string): CasoLS | null {
  try {
    const obj = JSON.parse(json) as CasoLS
    if (!obj.id || !obj.titulo) return null
    return obj
  } catch {
    return null
  }
}

export const DESTINATARIOS: Array<{ id: DestinatarioCaso; label: string }> = [
  { id: 'tribunal_cuentas', label: 'Tribunal de Cuentas' },
  { id: 'fiscalia', label: 'Fiscalía' },
  { id: 'mpf', label: 'Ministerio Público Fiscal' },
  { id: 'oficina_anticorrupcion', label: 'Oficina Anticorrupción' },
  { id: 'cne', label: 'Cámara Nacional Electoral' },
  { id: 'defensoria', label: 'Defensoría del Pueblo' },
]

// verificacion-senales.ts — Helpers para administrar el estado_verificacion
// de filas en señales_cache. PLAN-DATOS Fase A7. Alineado con el badge
// universal del PLAN-UI §8.
//
// Estados (enum):
//   - 'sin_verificar': default. El detector la generó automáticamente, falta
//     confirmación humana antes de elevar a publicable
//   - 'verificada': DNI/CUIT confirmado contra fuente externa (DDJJ, boletín,
//     padrón). Lista para denuncia / publicación
//   - 'descartada': verificada y refutada (típicamente homonimia confirmada).
//     Queda en histórico para auditoría, NO se borra
//   - 'bloqueada': verificación intentada pero la fuente está caída/redactada
//     (p.ej. boletín municipal sin acceso). Espera unblock
//
// El CHECK constraint NO se aplica a nivel DB (DuckDB no soporta ADD CHECK en
// ALTER en esta versión). La enforcement vive en `EstadoVerificacionSeñal`
// type union + el helper `actualizarEstadoSeñal` que valida explícitamente.

import { dbAll, dbRun } from './db'

export type EstadoVerificacionSeñal =
  | 'sin_verificar'
  | 'verificada'
  | 'descartada'
  | 'bloqueada'

export const ESTADOS_VERIFICACION: readonly EstadoVerificacionSeñal[] = [
  'sin_verificar',
  'verificada',
  'descartada',
  'bloqueada',
] as const

export function esEstadoVerificacionValido(s: string): s is EstadoVerificacionSeñal {
  return (ESTADOS_VERIFICACION as readonly string[]).includes(s)
}

/**
 * Cambia el estado de verificación de una señal y registra quién/cuándo.
 * Lanza Error si el estado no es uno del enum (defensa en profundidad).
 *
 * @param id      ID de la señal en señales_cache
 * @param estado  nuevo estado del enum
 * @param por     handle del humano que verificó (p.ej. "lautaro@gmail.com" o "ARGOS-bot")
 *                Para el caso 'sin_verificar' (reset), `por` puede omitirse.
 */
export async function actualizarEstadoSeñal(
  id: string,
  estado: EstadoVerificacionSeñal,
  por?: string,
): Promise<void> {
  if (!esEstadoVerificacionValido(estado)) {
    throw new Error(`actualizarEstadoSeñal: estado inválido "${estado}". Permitidos: ${ESTADOS_VERIFICACION.join(', ')}`)
  }
  // Verificada/descartada/bloqueada requieren un actor identificado para auditoría.
  // 'sin_verificar' es el reset y puede no tener por (desverificación administrativa).
  if (estado !== 'sin_verificar' && (!por || por.trim() === '')) {
    throw new Error(`actualizarEstadoSeñal: estado "${estado}" requiere argumento "por" (auditor identificable)`)
  }
  const now = new Date().toISOString()
  await dbRun(
    `UPDATE señales_cache
     SET estado_verificacion = ?,
         verificado_por      = ?,
         verificado_en       = ?
     WHERE id = ?`,
    [estado, estado === 'sin_verificar' ? null : (por ?? null), estado === 'sin_verificar' ? null : now, id]
  )
}

/** Atajo: marca una señal como verificada (DNI/CUIT confirmado por fuente externa). */
export async function marcarSeñalVerificada(id: string, por: string): Promise<void> {
  return actualizarEstadoSeñal(id, 'verificada', por)
}

/** Atajo: marca una señal como descartada (homonimia confirmada o false positive). */
export async function marcarSeñalDescartada(id: string, por: string): Promise<void> {
  return actualizarEstadoSeñal(id, 'descartada', por)
}

/** Atajo: marca una señal como bloqueada (verificación impedida por fuente caída). */
export async function marcarSeñalBloqueada(id: string, por: string): Promise<void> {
  return actualizarEstadoSeñal(id, 'bloqueada', por)
}

/** Atajo: revierte una señal al default 'sin_verificar' (uso administrativo). */
export async function reseteEstadoSeñal(id: string): Promise<void> {
  return actualizarEstadoSeñal(id, 'sin_verificar')
}

/**
 * Cuenta señales por estado de verificación. Útil para el dashboard del
 * PLAN-UI (North Star metrics: "X señales graves verificadas") y para la
 * cola de "señales para verificar humano".
 */
export async function contarSeñalesPorEstado(municipio?: string): Promise<Record<EstadoVerificacionSeñal, number>> {
  const where = municipio ? 'WHERE municipio = ?' : ''
  const params = municipio ? [municipio] : []
  const rows = await dbAll<{ estado: string; cnt: number }>(
    `SELECT estado_verificacion AS estado, COUNT(*) AS cnt
     FROM señales_cache
     ${where}
     GROUP BY estado_verificacion`,
    params,
  )
  const out: Record<EstadoVerificacionSeñal, number> = {
    sin_verificar: 0,
    verificada: 0,
    descartada: 0,
    bloqueada: 0,
  }
  for (const r of rows) {
    if (esEstadoVerificacionValido(r.estado)) {
      out[r.estado] = Number(r.cnt)
    }
  }
  return out
}

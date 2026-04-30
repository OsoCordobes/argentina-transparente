// cargos-conocidos.ts — Catálogo canónico de cargos públicos argentinos
// con metadata jurídica relevante (obligación de DDJJ, poder de adjudicación).
// Review iteración #1 C3: extracción de listas hardcoded inline en
// detector-ddjj-omitida.ts (CARGOS_OBLIGADOS_PATRONES + altoRango) y
// detector-conflicto-funcionario-proveedor.ts (CARGOS_CON_PODER).
//
// Fuente única de verdad — los detectores futuros (C3+, eventual C-extra)
// consumen sin duplicar.

/**
 * Cargos que el Anexo III Ley 25.188 + Ley Provincial 8.835 + Decreto 164/1999
 * obligan a presentar Declaración Jurada Patrimonial Integral.
 *
 * Patterns en MAYÚSCULAS sin tildes — match contra apellido_nombre / cargo
 * normalizado en agentes_publicos. Match por `LIKE '%PATRON%'` para tolerar
 * variantes ("Director de Compras", "Director Subrogante", "Directora").
 */
export const CARGOS_OBLIGADOS_DDJJ_PATRONES = [
  'PRESIDENTE', 'PRESIDENTA',
  'VICEPRESIDENTE', 'VICEPRESIDENTA',
  'MINISTRO', 'MINISTRA',
  'SECRETARIO', 'SECRETARIA',
  'SUBSECRETARIO', 'SUBSECRETARIA',
  'DIRECTOR', 'DIRECTORA',
  'JEFE DE GABINETE',
  'INTENDENTE', 'INTENDENTA',
  'CONCEJAL', 'CONCEJALA',
  'JUEZ', 'JUEZA', 'FISCAL',
  'CONTROLADOR', 'CONTROLADORA',
  'GERENTE',
  'AUDITOR', 'AUDITORA',
] as const

/**
 * Cargos con poder real de adjudicación o decisión sobre contratos públicos.
 * Subset de CARGOS_OBLIGADOS_DDJJ con jerarquía alta — alimentan bonus de
 * score en detectores C1 (conflicto_funcionario_proveedor) y C3 (ddjj_omitida).
 *
 * NO incluye Concejal/Juez/Fiscal porque su poder es legislativo o judicial,
 * no ejecutivo de adjudicación contractual. SÍ incluye Auditor/Controlador
 * porque deciden continuidad de contratos.
 */
export const CARGOS_CON_PODER_ADJUDICACION = [
  'DIRECTOR', 'DIRECTORA',
  'SECRETARIO', 'SECRETARIA',
  'SUBSECRETARIO', 'SUBSECRETARIA',
  'JEFE', 'JEFA',
  'GERENTE',
  'COORDINADOR', 'COORDINADORA',
  'INTENDENTE', 'INTENDENTA',
  'MINISTRO', 'MINISTRA',
  'PRESIDENTE', 'PRESIDENTA',
  'AUDITOR', 'AUDITORA',
  'CONTROLADOR', 'CONTROLADORA',
] as const

/**
 * Cargos de alto rango ejecutivo o electivo — para clasificar señales de
 * gravedad alta cuando el funcionario está en estos cargos. Es el conjunto
 * "más amplio" que poder_adjudicacion + cargos electivos (Concejal, Intendente)
 * + judiciales (Juez, Fiscal).
 *
 * Usado en C3 (ddjj_omitida) para bonus de severidad por rango.
 */
export const CARGOS_ALTO_RANGO = [
  'MINISTRO', 'MINISTRA',
  'DIRECTOR', 'DIRECTORA',
  'SECRETARIO', 'SECRETARIA',
  'SUBSECRETARIO', 'SUBSECRETARIA',
  'CONCEJAL', 'CONCEJALA',
  'INTENDENTE', 'INTENDENTA',
  'PRESIDENTE', 'PRESIDENTA',
  'JUEZ', 'JUEZA', 'FISCAL',
] as const

// ─── Helpers de chequeo ─────────────────────────────────────────────────────

// Word boundaries en regex. Crítico cuando los patterns incluyen variantes
// femeninas (MINISTRA) — sin \b, la palabra "ADMINISTRATIVO" matchearía
// MINISTRA como substring (bug detectado en review #1 C3).
function matchPattern(cargo: string, patterns: readonly string[]): boolean {
  const upper = cargo.toUpperCase()
  return patterns.some(p => {
    // \b funciona con [A-Z] estándar — no rompe con strings normalizados.
    const re = new RegExp(`\\b${p}\\b`)
    return re.test(upper)
  })
}

/** ¿El cargo está obligado a presentar DDJJ? (Anexo III Ley 25.188) */
export function obligadoDeclararDDJJ(cargo: string): boolean {
  return matchPattern(cargo, CARGOS_OBLIGADOS_DDJJ_PATRONES)
}

/** ¿El cargo tiene poder real de adjudicación contractual? */
export function tieneCargoConPoder(cargo: string): boolean {
  return matchPattern(cargo, CARGOS_CON_PODER_ADJUDICACION)
}

/** ¿El cargo es de alto rango (ejecutivo, electivo o judicial)? */
export function esCargoAltoRango(cargo: string): boolean {
  return matchPattern(cargo, CARGOS_ALTO_RANGO)
}

/**
 * Construye la cláusula SQL `(UPPER(cargo) LIKE '%P1%' OR UPPER(cargo) LIKE '%P2%' OR ...)`
 * para usar en WHERE de queries. Los patrones son constantes compile-time,
 * no se inyectan inputs de usuario — seguro.
 */
export function sqlCargoLike(columnExpr: string, patterns: readonly string[]): string {
  return patterns.map(p => `UPPER(${columnExpr}) LIKE '%${p}%'`).join(' OR ')
}

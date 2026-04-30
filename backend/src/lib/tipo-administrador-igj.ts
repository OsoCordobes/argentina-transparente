// tipo-administrador-igj.ts — Mapeo de códigos IGJ a labels legibles.
//
// El campo `tipo_administrador` en igj_autoridades viene como código de UNA
// letra. Sin este mapeo, el frontend muestra "tipoCargo: A" sin explicación.
//
// Fuente: dataset oficial datos.jus.gob.ar (Inspección General de Justicia).
// Verificado contra el manual de uso del dataset.

export const TIPO_ADMINISTRADOR_IGJ: Record<string, { codigo: string; label: string; rol: string }> = {
  A: {
    codigo: 'A',
    label: 'Administrador titular',
    rol: 'director',
  },
  S: {
    codigo: 'S',
    label: 'Síndico',
    rol: 'sindico',
  },
  R: {
    codigo: 'R',
    label: 'Representante',
    rol: 'representante',
  },
}

/**
 * Devuelve label legible para un código IGJ. Si el código no está en el
 * catálogo, devuelve el código tal cual con prefijo '?' para que el usuario
 * sepa que no fue resuelto.
 */
export function labelTipoAdministrador(codigo: string | null | undefined): string {
  if (!codigo) return 'Cargo no especificado'
  const entry = TIPO_ADMINISTRADOR_IGJ[codigo.trim().toUpperCase()]
  return entry ? entry.label : `Cargo (${codigo})`
}

/**
 * Para uso en SQL: una expresión CASE que resuelve el código a label.
 */
export const SQL_LABEL_TIPO_ADMINISTRADOR = `
  CASE UPPER(TRIM(tipo_administrador))
    WHEN 'A' THEN 'Administrador titular'
    WHEN 'S' THEN 'Síndico'
    WHEN 'R' THEN 'Representante'
    WHEN NULL THEN 'Cargo no especificado'
    ELSE 'Cargo (' || COALESCE(tipo_administrador, '?') || ')'
  END
`

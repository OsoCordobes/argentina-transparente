// Tests para lib/cargos-conocidos (review #1 C3).
import { describe, it, expect } from 'vitest'
import {
  CARGOS_OBLIGADOS_DDJJ_PATRONES,
  CARGOS_CON_PODER_ADJUDICACION,
  CARGOS_ALTO_RANGO,
  obligadoDeclararDDJJ,
  tieneCargoConPoder,
  esCargoAltoRango,
  sqlCargoLike,
} from './cargos-conocidos'

describe('cargos-conocidos — review #1 C3', () => {
  it('listas no están vacías y son const arrays', () => {
    expect(CARGOS_OBLIGADOS_DDJJ_PATRONES.length).toBeGreaterThan(10)
    expect(CARGOS_CON_PODER_ADJUDICACION.length).toBeGreaterThan(5)
    expect(CARGOS_ALTO_RANGO.length).toBeGreaterThan(5)
  })

  describe('obligadoDeclararDDJJ', () => {
    it('detecta cargos del Anexo III', () => {
      expect(obligadoDeclararDDJJ('Director de Compras')).toBe(true)
      expect(obligadoDeclararDDJJ('Concejala del Bloque X')).toBe(true)
      expect(obligadoDeclararDDJJ('Ministra de Educación')).toBe(true)
      expect(obligadoDeclararDDJJ('Auditor General')).toBe(true)
      expect(obligadoDeclararDDJJ('Juez de Cámara')).toBe(true)
    })
    it('descarta cargos no obligados', () => {
      expect(obligadoDeclararDDJJ('Auxiliar Administrativo')).toBe(false)
      expect(obligadoDeclararDDJJ('Maestra de jardín')).toBe(false)
      expect(obligadoDeclararDDJJ('Personal de Limpieza')).toBe(false)
    })
    it('case-insensitive', () => {
      expect(obligadoDeclararDDJJ('director de compras')).toBe(true)
      expect(obligadoDeclararDDJJ('DIRECTOR DE COMPRAS')).toBe(true)
    })
  })

  describe('tieneCargoConPoder', () => {
    it('detecta cargos ejecutivos con poder', () => {
      expect(tieneCargoConPoder('Director de Compras')).toBe(true)
      expect(tieneCargoConPoder('Secretario de Hacienda')).toBe(true)
      expect(tieneCargoConPoder('Gerente de Operaciones')).toBe(true)
      expect(tieneCargoConPoder('Auditor General')).toBe(true)
    })
    it('descarta cargos sin poder de adjudicación', () => {
      expect(tieneCargoConPoder('Concejal')).toBe(false)
      expect(tieneCargoConPoder('Juez')).toBe(false)
      expect(tieneCargoConPoder('Auxiliar')).toBe(false)
    })
    it('Concejal NO está en CARGOS_CON_PODER_ADJUDICACION (poder legislativo, no ejecutivo)', () => {
      expect(tieneCargoConPoder('Concejala')).toBe(false)
    })
  })

  describe('esCargoAltoRango', () => {
    it('incluye cargos electivos + ejecutivos + judiciales', () => {
      expect(esCargoAltoRango('Concejal')).toBe(true)
      expect(esCargoAltoRango('Director')).toBe(true)
      expect(esCargoAltoRango('Juez')).toBe(true)
      expect(esCargoAltoRango('Intendente')).toBe(true)
    })
    it('descarta cargos de bajo rango', () => {
      expect(esCargoAltoRango('Auxiliar')).toBe(false)
      expect(esCargoAltoRango('Docente')).toBe(false)
    })
  })

  describe('jerarquía: poder ⊆ alto rango ⊆ obligado', () => {
    it('Director: poder ✓, alto rango ✓, obligado ✓', () => {
      expect(tieneCargoConPoder('Director')).toBe(true)
      expect(esCargoAltoRango('Director')).toBe(true)
      expect(obligadoDeclararDDJJ('Director')).toBe(true)
    })
    it('Concejal: poder ✗, alto rango ✓, obligado ✓', () => {
      expect(tieneCargoConPoder('Concejal')).toBe(false)
      expect(esCargoAltoRango('Concejal')).toBe(true)
      expect(obligadoDeclararDDJJ('Concejal')).toBe(true)
    })
    it('Auxiliar: ninguno', () => {
      expect(tieneCargoConPoder('Auxiliar')).toBe(false)
      expect(esCargoAltoRango('Auxiliar')).toBe(false)
      expect(obligadoDeclararDDJJ('Auxiliar')).toBe(false)
    })
  })

  describe('sqlCargoLike', () => {
    it('genera cláusula OR con UPPER LIKE', () => {
      const sql = sqlCargoLike('cargo', ['DIRECTOR', 'JEFE'])
      expect(sql).toContain("UPPER(cargo) LIKE '%DIRECTOR%'")
      expect(sql).toContain("UPPER(cargo) LIKE '%JEFE%'")
      expect(sql).toContain(' OR ')
    })
    it('respeta column_expr custom', () => {
      const sql = sqlCargoLike('a.cargo', ['DIRECTOR'])
      expect(sql).toBe("UPPER(a.cargo) LIKE '%DIRECTOR%'")
    })
  })
})

// Tests para los parsers exportados de verify-conflicto.ts (review #1 E1).
import { describe, it, expect } from 'vitest'
import {
  extraerDNIDirectorEvidencia,
  extraerFuncionarioYJurisdiccion,
} from './verify-conflicto'

describe('verify-conflicto — review #1 E1', () => {
  describe('extraerFuncionarioYJurisdiccion', () => {
    it('parsea formato Conflicto potencial (M4.1 individual)', () => {
      const r = extraerFuncionarioYJurisdiccion(
        'Conflicto potencial: PEREZ JUAN (cordoba-capital) y EMPRESA SA ($1.000.000)',
        'irrelevante',
      )
      expect(r.funcionario).toBe('PEREZ JUAN')
      expect(r.jurisdiccion).toBe('cordoba-capital')
    })

    it('parsea formato Patrón sistémico (M4.1 multiproveedor)', () => {
      const r = extraerFuncionarioYJurisdiccion(
        'Patrón sistémico: GIMENEZ JUANA (cordoba-provincia) y 3 empresas ($50.000.000)',
        'irrelevante',
      )
      expect(r.funcionario).toBe('GIMENEZ JUANA')
      expect(r.jurisdiccion).toBe('cordoba-provincia')
    })

    it('cubre nombres compuestos con tildes', () => {
      const r = extraerFuncionarioYJurisdiccion(
        'Conflicto potencial: GARCÍA MARÍA INÉS (cordoba-capital) y X SA',
        '',
      )
      expect(r.funcionario).toBe('GARCÍA MARÍA INÉS')
    })

    it('fallback al resumen cuando el título no matchea', () => {
      const r = extraerFuncionarioYJurisdiccion(
        'Título raro sin patrón conocido',
        'el funcionario PEREZ JUAN comparte apellido con director de X SA',
      )
      expect(r.funcionario).toBe('PEREZ JUAN')
      expect(r.jurisdiccion).toBeNull()
    })

    it('retorna nulls cuando ningún parser matchea', () => {
      const r = extraerFuncionarioYJurisdiccion('basura', 'también basura')
      expect(r.funcionario).toBeNull()
      expect(r.jurisdiccion).toBeNull()
    })
  })

  describe('extraerDNIDirectorEvidencia', () => {
    it('extrae primer DNI de la evidencia', () => {
      const ev = JSON.stringify([
        { descripcion: 'X tiene DNI 12345678 según IGJ', fuenteUrl: '' },
      ])
      expect(extraerDNIDirectorEvidencia(ev)).toBe('12345678')
    })

    it('acepta DNI de 6-9 dígitos (cubre antiguos y de OCR)', () => {
      const ev6 = JSON.stringify([{ descripcion: 'DNI 123456 antiguo', fuenteUrl: '' }])
      expect(extraerDNIDirectorEvidencia(ev6)).toBe('123456')
      const ev9 = JSON.stringify([{ descripcion: 'DNI 123456789 raro', fuenteUrl: '' }])
      expect(extraerDNIDirectorEvidencia(ev9)).toBe('123456789')
    })

    it('toma el primer match (regla determinística)', () => {
      const ev = JSON.stringify([
        { descripcion: 'directores DNI 11111111 y DNI 22222222', fuenteUrl: '' },
      ])
      expect(extraerDNIDirectorEvidencia(ev)).toBe('11111111')
    })

    it('null si no hay match', () => {
      const ev = JSON.stringify([{ descripcion: 'sin DNI mencionado', fuenteUrl: '' }])
      expect(extraerDNIDirectorEvidencia(ev)).toBeNull()
    })

    it('null si JSON malformado', () => {
      expect(extraerDNIDirectorEvidencia('not-json')).toBeNull()
    })
  })
})

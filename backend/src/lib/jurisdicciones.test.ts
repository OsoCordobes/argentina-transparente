// Tests para módulo de jurisdicciones (review #1 C1).
import { describe, it, expect } from 'vitest'
import {
  PROVINCIAS_ARGENTINAS,
  provinciaDeJurisdiccion,
  normalizarProvincia,
  coincideProvinciaJurisdiccion,
  humanizarJurisdiccion,
} from './jurisdicciones'

describe('jurisdicciones — review #1 C1', () => {
  it('PROVINCIAS_ARGENTINAS tiene 24 elementos (23 provincias + CABA)', () => {
    expect(PROVINCIAS_ARGENTINAS.length).toBe(24)
    expect(PROVINCIAS_ARGENTINAS).toContain('CORDOBA')
    expect(PROVINCIAS_ARGENTINAS).toContain('CIUDAD AUTONOMA DE BUENOS AIRES')
    expect(PROVINCIAS_ARGENTINAS).toContain('TIERRA DEL FUEGO')
  })

  describe('provinciaDeJurisdiccion', () => {
    it('cordoba-capital y cordoba-provincia → CORDOBA', () => {
      expect(provinciaDeJurisdiccion('cordoba-capital')).toBe('CORDOBA')
      expect(provinciaDeJurisdiccion('cordoba-provincia')).toBe('CORDOBA')
    })
    it('múltiples municipios cordobeses → CORDOBA', () => {
      expect(provinciaDeJurisdiccion('cordoba-villa-carlos-paz')).toBe('CORDOBA')
      expect(provinciaDeJurisdiccion('cordoba-rio-cuarto')).toBe('CORDOBA')
      expect(provinciaDeJurisdiccion('cordoba-villa-maria')).toBe('CORDOBA')
    })
    it('caba → CIUDAD AUTONOMA DE BUENOS AIRES', () => {
      expect(provinciaDeJurisdiccion('caba')).toBe('CIUDAD AUTONOMA DE BUENOS AIRES')
    })
    it('santa-fe-rosario → SANTA FE', () => {
      expect(provinciaDeJurisdiccion('santa-fe-rosario')).toBe('SANTA FE')
    })
    it('nacion → null (no mapeo, deliberado)', () => {
      expect(provinciaDeJurisdiccion('nacion')).toBeNull()
    })
    it('jurisdicción desconocida → null', () => {
      expect(provinciaDeJurisdiccion('jurisdiccion-fake-test')).toBeNull()
    })
  })

  describe('normalizarProvincia', () => {
    it('UPPER + sin tildes', () => {
      expect(normalizarProvincia('Córdoba')).toBe('CORDOBA')
      expect(normalizarProvincia('córdoba')).toBe('CORDOBA')
      expect(normalizarProvincia('CÓRDOBA')).toBe('CORDOBA')
    })
    it('colapsa whitespace', () => {
      expect(normalizarProvincia('  CORDOBA  ')).toBe('CORDOBA')
      expect(normalizarProvincia('SANTA  FE')).toBe('SANTA FE')
    })
    it('null → null', () => {
      expect(normalizarProvincia(null)).toBeNull()
      expect(normalizarProvincia(undefined)).toBeNull()
      expect(normalizarProvincia('')).toBeNull()
    })
  })

  describe('coincideProvinciaJurisdiccion', () => {
    it('match estricto cordoba-capital + CORDOBA → si', () => {
      expect(coincideProvinciaJurisdiccion('cordoba-capital', 'CORDOBA')).toBe('si')
    })
    it('caso Renault: cordoba-capital + CIUDAD AUTONOMA → no', () => {
      expect(coincideProvinciaJurisdiccion('cordoba-capital', 'CIUDAD AUTONOMA DE BUENOS AIRES')).toBe('no')
    })
    it('domicilio null → desconocido (RNS sin data)', () => {
      expect(coincideProvinciaJurisdiccion('cordoba-capital', null)).toBe('desconocido')
    })
    it('jurisdicción nacional → desconocido (no se filtra)', () => {
      expect(coincideProvinciaJurisdiccion('nacion', 'CORDOBA')).toBe('desconocido')
      expect(coincideProvinciaJurisdiccion('nacion', 'BUENOS AIRES')).toBe('desconocido')
    })
    it('tolera tildes en provincia', () => {
      expect(coincideProvinciaJurisdiccion('cordoba-capital', 'Córdoba')).toBe('si')
      expect(coincideProvinciaJurisdiccion('cordoba-capital', 'córdoba')).toBe('si')
    })
  })

  describe('humanizarJurisdiccion', () => {
    it('mapea conocidos a nombres legibles', () => {
      expect(humanizarJurisdiccion('cordoba-capital')).toBe('Córdoba Capital')
      expect(humanizarJurisdiccion('cordoba-provincia')).toBe('Provincia de Córdoba')
      expect(humanizarJurisdiccion('santa-fe-rosario')).toBe('Rosario')
      expect(humanizarJurisdiccion('nacion')).toBe('Gobierno Nacional')
    })
    it('devuelve la jurisdicción cruda si no hay mapeo', () => {
      expect(humanizarJurisdiccion('jurisdiccion-fake')).toBe('jurisdiccion-fake')
    })
  })
})

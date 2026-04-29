// Tests para identidad-validator (PLAN-DATOS Fase A3).
// Casos validables matemáticamente con módulo-11 + un CUIT real público
// (AFIP 33-69345023-9) como sanity check externo.
import { describe, it, expect } from 'vitest'
import {
  normalizarDNI,
  normalizarCUIT,
  dvCuitEsperado,
  validarCUIT,
  validarDNI,
  esCuitPersonaFisica,
  esCuitPersonaJuridica,
  formatCUIT,
  derivarCUITsCandidatos,
  extraerDNIdeCUIT,
} from './identidad-validator'

describe('normalizarDNI', () => {
  it('quita puntos, guiones y espacios', () => {
    expect(normalizarDNI('12.345.678')).toBe('12345678')
    expect(normalizarDNI('12-345-678')).toBe('12345678')
    expect(normalizarDNI('12 345 678')).toBe('12345678')
    expect(normalizarDNI('12345678')).toBe('12345678')
  })

  it('devuelve null para input inválido', () => {
    expect(normalizarDNI('')).toBeNull()
    expect(normalizarDNI(null)).toBeNull()
    expect(normalizarDNI(undefined)).toBeNull()
    expect(normalizarDNI('abc')).toBeNull()
    expect(normalizarDNI('123')).toBeNull() // muy corto
    expect(normalizarDNI('123456789')).toBeNull() // 9 dígitos = OCR error o CUIT
  })

  it('acepta DNIs de 6-8 dígitos (incluyendo antiguos)', () => {
    expect(normalizarDNI('123456')).toBe('123456')
    expect(normalizarDNI('1234567')).toBe('1234567')
    expect(normalizarDNI('12345678')).toBe('12345678')
  })
})

describe('normalizarCUIT', () => {
  it('acepta CUIT con o sin separadores', () => {
    expect(normalizarCUIT('20-12345678-6')).toBe('20123456786')
    expect(normalizarCUIT('20.12345678.6')).toBe('20123456786')
    expect(normalizarCUIT('20 12345678 6')).toBe('20123456786')
    expect(normalizarCUIT('20123456786')).toBe('20123456786')
  })

  it('devuelve null si no son 11 dígitos', () => {
    expect(normalizarCUIT('')).toBeNull()
    expect(normalizarCUIT(null)).toBeNull()
    expect(normalizarCUIT('20-1234-6')).toBeNull() // pocos dígitos
    expect(normalizarCUIT('20-123456789-6')).toBeNull() // muchos
    expect(normalizarCUIT('CUIT-no-valido')).toBeNull()
  })
})

describe('dvCuitEsperado', () => {
  it('calcula DV correcto para CUITs conocidos', () => {
    // AFIP CUIT real público: 33-69345023-9
    expect(dvCuitEsperado('3369345023')).toBe(9)
    // Casos sintéticos verificados a mano
    expect(dvCuitEsperado('2012345678')).toBe(6)
    expect(dvCuitEsperado('2712345678')).toBe(0)
    expect(dvCuitEsperado('3012345678')).toBe(1)
    expect(dvCuitEsperado('2011111111')).toBe(2)
  })

  it('devuelve 10 cuando el DV es no-asignable', () => {
    // 20-99999999 produce DV=10 según la matemática (CUIT no se asigna)
    expect(dvCuitEsperado('2099999999')).toBe(10)
  })

  it('lanza si input no es 10 dígitos', () => {
    expect(() => dvCuitEsperado('123')).toThrow()
    expect(() => dvCuitEsperado('20a2345678')).toThrow()
  })
})

describe('validarCUIT', () => {
  it('acepta CUITs válidos (prefijo + DV correcto)', () => {
    expect(validarCUIT('33-69345023-9')).toBe(true) // AFIP real
    expect(validarCUIT('20-12345678-6')).toBe(true) // sintético PF
    expect(validarCUIT('27-12345678-0')).toBe(true) // sintético PF
    expect(validarCUIT('30-12345678-1')).toBe(true) // sintético PJ
    expect(validarCUIT('20123456786')).toBe(true) // sin separadores
  })

  it('rechaza CUITs con DV equivocado', () => {
    expect(validarCUIT('20-12345678-7')).toBe(false) // DV correcto era 6
    expect(validarCUIT('33-69345023-0')).toBe(false) // DV correcto era 9
  })

  it('rechaza prefijos no conocidos', () => {
    expect(validarCUIT('99-12345678-0')).toBe(false)
    expect(validarCUIT('40-12345678-0')).toBe(false)
    expect(validarCUIT('00-12345678-0')).toBe(false)
  })

  it('rechaza CUITs no asignables (DV = 10)', () => {
    // 20-99999999-X siempre es inválido por matemática
    expect(validarCUIT('20-99999999-0')).toBe(false)
    expect(validarCUIT('20-99999999-1')).toBe(false)
    expect(validarCUIT('20999999990')).toBe(false)
  })

  it('rechaza inputs basura', () => {
    expect(validarCUIT(null)).toBe(false)
    expect(validarCUIT(undefined)).toBe(false)
    expect(validarCUIT('')).toBe(false)
    expect(validarCUIT('abc')).toBe(false)
    expect(validarCUIT('20-12345-6')).toBe(false) // pocos dígitos
  })
})

describe('validarDNI', () => {
  it('acepta DNIs bien formados', () => {
    expect(validarDNI('12345678')).toBe(true)
    expect(validarDNI('12.345.678')).toBe(true)
    expect(validarDNI('1234567')).toBe(true)
  })

  it('rechaza inputs inválidos', () => {
    expect(validarDNI('')).toBe(false)
    expect(validarDNI(null)).toBe(false)
    expect(validarDNI('123')).toBe(false)
    expect(validarDNI('123456789')).toBe(false)
    expect(validarDNI('abc')).toBe(false)
  })
})

describe('esCuitPersonaFisica / esCuitPersonaJuridica', () => {
  it('detecta PF correctamente (prefijos 20, 23, 24, 27)', () => {
    expect(esCuitPersonaFisica('20-12345678-6')).toBe(true)
    expect(esCuitPersonaFisica('27-12345678-0')).toBe(true)
    expect(esCuitPersonaFisica('30-12345678-1')).toBe(false) // PJ
    expect(esCuitPersonaFisica('33-69345023-9')).toBe(false) // PJ
  })

  it('detecta PJ correctamente (prefijos 30, 33, 34)', () => {
    expect(esCuitPersonaJuridica('30-12345678-1')).toBe(true)
    expect(esCuitPersonaJuridica('33-69345023-9')).toBe(true)
    expect(esCuitPersonaJuridica('20-12345678-6')).toBe(false) // PF
    expect(esCuitPersonaJuridica('27-12345678-0')).toBe(false) // PF
  })

  it('PF y PJ son mutuamente excluyentes', () => {
    const cuits = ['20-12345678-6', '27-12345678-0', '30-12345678-1', '33-69345023-9']
    for (const cuit of cuits) {
      const pf = esCuitPersonaFisica(cuit)
      const pj = esCuitPersonaJuridica(cuit)
      expect(pf && pj).toBe(false) // nunca ambos true
      expect(pf || pj).toBe(true)  // siempre uno true (CUIT válido)
    }
  })

  it('devuelve false para CUITs malformados', () => {
    expect(esCuitPersonaFisica('99-12345678-0')).toBe(false)
    expect(esCuitPersonaJuridica('99-12345678-0')).toBe(false)
    expect(esCuitPersonaFisica('basura')).toBe(false)
  })
})

describe('formatCUIT', () => {
  it('formatea con guiones', () => {
    expect(formatCUIT('20123456786')).toBe('20-12345678-6')
    expect(formatCUIT('33693450239')).toBe('33-69345023-9')
  })

  it('idempotente con CUIT ya formateado', () => {
    expect(formatCUIT('20-12345678-6')).toBe('20-12345678-6')
  })

  it('devuelve null si input inválido', () => {
    expect(formatCUIT('basura')).toBeNull()
    expect(formatCUIT(null)).toBeNull()
    expect(formatCUIT('123')).toBeNull()
  })
})

describe('derivarCUITsCandidatos', () => {
  it('devuelve los 4 candidatos PF cuando todos son válidos', () => {
    const candidatos = derivarCUITsCandidatos('11111111')
    expect(candidatos).toEqual([
      '20111111112',
      '23111111111',
      '24111111118',
      '27111111117',
    ])
    // Y todos deben ser válidos según validarCUIT
    for (const c of candidatos) {
      expect(validarCUIT(c)).toBe(true)
    }
  })

  it('omite candidatos con DV no-asignable', () => {
    // DNI 99999999 con prefijo 20 produce DV=10 → omitido
    const candidatos = derivarCUITsCandidatos('99999999')
    expect(candidatos).not.toContain('20999999990')
    expect(candidatos.length).toBeLessThan(4)
    for (const c of candidatos) {
      expect(validarCUIT(c)).toBe(true)
    }
  })

  it('rellena con ceros a la izquierda DNIs cortos', () => {
    // DNI 123456 (6 dígitos) → padded a 8 → 00123456
    const candidatos = derivarCUITsCandidatos('123456')
    expect(candidatos.length).toBeGreaterThan(0)
    for (const c of candidatos) {
      expect(c.slice(2, 10)).toBe('00123456')
    }
  })

  it('devuelve [] para DNI inválido', () => {
    expect(derivarCUITsCandidatos('')).toEqual([])
    expect(derivarCUITsCandidatos('abc')).toEqual([])
    expect(derivarCUITsCandidatos('123')).toEqual([])
  })
})

describe('extraerDNIdeCUIT', () => {
  it('extrae DNI de CUITs PF válidos', () => {
    expect(extraerDNIdeCUIT('20-12345678-6')).toBe('12345678')
    expect(extraerDNIdeCUIT('27-12345678-0')).toBe('12345678')
    expect(extraerDNIdeCUIT('20111111112')).toBe('11111111')
  })

  it('quita ceros a la izquierda del DNI extraído', () => {
    expect(extraerDNIdeCUIT('20-00123456-X')).toBeNull() // CUIT inválido por DV
    // Con CUIT válido sintético — calculo:
    // 20 + 00123456 → 2000123456 → digits 2,0,0,0,1,2,3,4,5,6
    // weights 5,4,3,2,7,6,5,4,3,2
    // 10+0+0+0+7+12+15+16+15+12 = 87
    // 87 mod 11 = 10 → INVÁLIDO también
    // Probemos 20-00123457-? :
    // 2,0,0,0,1,2,3,4,5,7
    // 10+0+0+0+7+12+15+16+15+14 = 89
    // 89 mod 11 = 1; DV = 10 → inválido también
    // 20-00123458-?:
    // 10+0+0+0+7+12+15+16+15+16 = 91
    // 91 mod 11 = 3; DV = 8 ✓ CUIT válido: 20-00123458-8
    expect(extraerDNIdeCUIT('20-00123458-8')).toBe('123458')
  })

  it('devuelve null para CUITs PJ', () => {
    expect(extraerDNIdeCUIT('30-12345678-1')).toBeNull()
    expect(extraerDNIdeCUIT('33-69345023-9')).toBeNull()
  })

  it('devuelve null para CUITs inválidos', () => {
    expect(extraerDNIdeCUIT('basura')).toBeNull()
    expect(extraerDNIdeCUIT(null)).toBeNull()
    expect(extraerDNIdeCUIT('99-12345678-0')).toBeNull()
  })
})

describe('round-trip DNI ↔ CUIT', () => {
  it('derivar candidatos → extraer DNI vuelve al original', () => {
    const dnis = ['11111111', '12345678', '12345670', '8765432']
    for (const dni of dnis) {
      const candidatos = derivarCUITsCandidatos(dni)
      for (const cuit of candidatos) {
        const extraido = extraerDNIdeCUIT(cuit)
        // Quitamos ceros a la izquierda para comparar
        const dniNoLead = dni.replace(/^0+/, '')
        expect(extraido).toBe(dniNoLead)
      }
    }
  })
})

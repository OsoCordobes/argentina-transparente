import { describe, it, expect } from 'vitest'
import {
  soundexEs,
  soundexApellido,
  suenanIgual,
  normalizarParaSoundex,
  reducirFonemas,
} from './soundex-es'

describe('soundex-es: normalización', () => {
  it('quita acentos: ÁÉÍÓÚáéíóú → AEIOUAEIOU', () => {
    expect(normalizarParaSoundex('Áéíóú')).toBe('AEIOU')
  })

  it('mapea Ñ → NI', () => {
    expect(normalizarParaSoundex('MUÑOZ')).toBe('MUNIOZ')
    expect(normalizarParaSoundex('peña')).toBe('PENIA')
  })

  it('descarta no-letras', () => {
    expect(normalizarParaSoundex('PEREZ-LOPEZ, JOSE 123')).toBe('PEREZ LOPEZ JOSE')
  })

  it('handles empty + null-ish gracefully', () => {
    expect(normalizarParaSoundex('')).toBe('')
    // @ts-expect-error - test runtime null safety
    expect(normalizarParaSoundex(null)).toBe('')
  })
})

describe('soundex-es: reducirFonemas', () => {
  it('colapsa dobles letras', () => {
    expect(reducirFonemas('LLAMADA')).toBe('LAMADA')
    expect(reducirFonemas('PERRO')).toBe('PERO')
  })

  it('CH → X', () => {
    expect(reducirFonemas('CHICOS')).toBe('XIKOS')
  })

  it('Z → S (ceceo)', () => {
    expect(reducirFonemas('GONZALEZ')).toBe('GONSALES')
  })

  it('V → B', () => {
    expect(reducirFonemas('VICTORIA')).toBe('BIKTORIA')
  })

  it('CE/CI → SE/SI', () => {
    expect(reducirFonemas('CECILIA')).toBe('SESILIA')
  })

  it('CA/CO/CU → KA/KO/KU', () => {
    expect(reducirFonemas('CAMINO')).toBe('KAMINO')
  })

  it('GE/GI → JE/JI', () => {
    expect(reducirFonemas('GERARDO')).toBe('JERARDO')
  })

  it('H muda → eliminada', () => {
    expect(reducirFonemas('HERNANDEZ')).toBe('ERNANDES')
  })

  it('QU → K', () => {
    expect(reducirFonemas('QUITO')).toBe('KITO')
  })
})

describe('soundex-es: soundexEs core', () => {
  it('FERNANDEZ y FERNANDES tienen el mismo código', () => {
    expect(soundexEs('FERNANDEZ')).toBe(soundexEs('FERNANDES'))
  })

  it('GONZALEZ y GONZALES tienen el mismo código', () => {
    expect(soundexEs('GONZALEZ')).toBe(soundexEs('GONZALES'))
  })

  it('PEREZ y PERES tienen el mismo código', () => {
    expect(soundexEs('PEREZ')).toBe(soundexEs('PERES'))
  })

  it('MUÑOZ y MUNIOZ (Ñ vs NI explícito) tienen el mismo código', () => {
    expect(soundexEs('MUÑOZ')).toBe(soundexEs('MUNIOZ'))
  })

  it('GUTIERREZ y GUTIERRES tienen el mismo código', () => {
    expect(soundexEs('GUTIERREZ')).toBe(soundexEs('GUTIERRES'))
  })

  it('produce siempre formato 1-letra-4-digitos', () => {
    const code = soundexEs('FERNANDEZ')
    expect(code).toMatch(/^[A-Z]\d{4}$/)
  })

  it('apellidos distintos producen códigos distintos', () => {
    expect(soundexEs('FERNANDEZ')).not.toBe(soundexEs('GONZALEZ'))
    expect(soundexEs('LOPEZ')).not.toBe(soundexEs('PEREZ'))
  })

  it('strings vacíos retornan vacío', () => {
    expect(soundexEs('')).toBe('')
    expect(soundexEs('  ')).toBe('')
  })

  it('palabra de una sola letra → letra + 0000', () => {
    expect(soundexEs('A')).toBe('A0000')
  })
})

describe('soundex-es: soundexApellido (con prefijos hispanos)', () => {
  it('"DE LA TORRE" usa TORRE como apellido principal', () => {
    expect(soundexApellido('DE LA TORRE')).toBe(soundexEs('TORRE'))
  })

  it('"DEL VALLE" usa VALLE', () => {
    expect(soundexApellido('DEL VALLE')).toBe(soundexEs('VALLE'))
  })

  it('"FERNANDEZ DE LA RUA" usa FERNANDEZ (primer apellido = paterno)', () => {
    expect(soundexApellido('FERNANDEZ DE LA RUA')).toBe(soundexEs('FERNANDEZ'))
  })

  it('"VAN DER WAAL" ignora prefijo VAN', () => {
    expect(soundexApellido('VAN DER WAAL')).not.toBe(soundexEs('VAN'))
  })

  it('apellido + nombre: "PEREZ JUAN" usa PEREZ', () => {
    expect(soundexApellido('PEREZ JUAN')).toBe(soundexEs('PEREZ'))
  })
})

describe('soundex-es: suenanIgual (use case principal)', () => {
  it('FERNANDEZ y FERNANDES suenan igual', () => {
    expect(suenanIgual('FERNANDEZ', 'FERNANDES')).toBe(true)
  })

  it('GONZALEZ y GONZALES suenan igual (con/sin Z final)', () => {
    expect(suenanIgual('GONZALEZ', 'GONZALES')).toBe(true)
  })

  it('PEREZ JUAN y PERES JUAN suenan igual', () => {
    expect(suenanIgual('PEREZ JUAN', 'PERES JUAN')).toBe(true)
  })

  it('MUÑOZ y MUNOZ NO necesariamente suenan igual (depende del normalizado)', () => {
    // Caso útil: si Ñ se mapea bien, deben matchear
    expect(suenanIgual('MUÑOZ', 'MUNIOZ')).toBe(true)
  })

  it('apellidos distintos NO suenan igual', () => {
    expect(suenanIgual('FERNANDEZ', 'GONZALEZ')).toBe(false)
    expect(suenanIgual('LOPEZ', 'PEREZ')).toBe(false)
  })

  it('case insensitive', () => {
    expect(suenanIgual('fernandez', 'FERNANDES')).toBe(true)
  })

  it('strings vacíos NO suenan igual', () => {
    expect(suenanIgual('', '')).toBe(false)  // ambos vacíos no es match
    expect(suenanIgual('PEREZ', '')).toBe(false)
  })
})

describe('soundex-es: casos reales argentinos', () => {
  // Apellidos realmente comunes en padrón argentino con sus variantes ortográficas.
  it.each([
    ['ALVAREZ', 'ALVARES'],
    ['CHAVEZ', 'CHAVES'],
    ['GUTIERREZ', 'GUTIERRES'],
    ['HERNANDEZ', 'HERNANDES'],
    ['JIMENEZ', 'JIMENES'],
    ['MARTINEZ', 'MARTINES'],
    ['RAMIREZ', 'RAMIRES'],
    ['RODRIGUEZ', 'RODRIGUES'],
    ['SANCHEZ', 'SANCHES'],
    ['VAZQUEZ', 'VASQUEZ'],
  ])('"%s" y "%s" deberían sonar igual', (a, b) => {
    expect(suenanIgual(a, b)).toBe(true)
  })
})

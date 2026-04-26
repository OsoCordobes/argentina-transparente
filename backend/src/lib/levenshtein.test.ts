/**
 * Tests para levenshtein.ts.
 *
 * Cubre la distancia clásica + el helper similarityPct usado por el
 * resolver de identidad para clasificar matches en tiers fuzzy.
 */

import { describe, expect, it } from 'vitest'
import { levenshtein, similarityPct } from './levenshtein'

describe('levenshtein', () => {
  it('distancia 0 si los strings son idénticos', () => {
    expect(levenshtein('hola', 'hola')).toBe(0)
    expect(levenshtein('', '')).toBe(0)
  })

  it('distancia 1 si difieren en exactamente 1 carácter', () => {
    expect(levenshtein('hola', 'hala')).toBe(1)   // sustitución
    expect(levenshtein('hola', 'holaa')).toBe(1)  // inserción
    expect(levenshtein('hola', 'hol')).toBe(1)    // borrado
  })

  it('case-insensitive (ABC === abc)', () => {
    expect(levenshtein('ABC', 'abc')).toBe(0)
    expect(levenshtein('Hola', 'hola')).toBe(0)
    expect(levenshtein('PINTURAS CAVAZZON', 'pinturas cavazzon')).toBe(0)
  })

  it('string vacío vs no vacío = longitud del no vacío', () => {
    expect(levenshtein('', 'abcde')).toBe(5)
    expect(levenshtein('abcde', '')).toBe(5)
  })

  it('strings totalmente distintos: distancia ~= max(len)', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3)
  })
})

describe('similarityPct', () => {
  it('100% si los strings son idénticos', () => {
    expect(similarityPct('hola', 'hola')).toBe(100)
    expect(similarityPct('', '')).toBe(100)
  })

  it('typo de 1 char en string corto cae cerca de 100%', () => {
    // 'hola' vs 'hala' → distancia 1 / maxLen 4 = 75%
    expect(similarityPct('hola', 'hala')).toBe(75)
  })

  it('similitud >= 85% para "PINTURAS CAVAZZON" vs "PINTURA CAVAZZON"', () => {
    // dist 1, maxLen 17 → ~94%
    const sim = similarityPct('PINTURAS CAVAZZON', 'PINTURA CAVAZZON')
    expect(sim).toBeGreaterThanOrEqual(85)
  })

  it('similitud baja para strings cortos totalmente distintos', () => {
    // 'abc' vs 'xyz' → dist 3, maxLen 3 → 0%
    expect(similarityPct('abc', 'xyz')).toBe(0)
  })

  it('case-insensitive (heredado de levenshtein)', () => {
    expect(similarityPct('PINTURAS CAVAZZON', 'pinturas cavazzon')).toBe(100)
  })

  it('rango siempre entre 0 y 100', () => {
    const cases: [string, string][] = [
      ['', 'abc'],
      ['abc', ''],
      ['hello world', 'goodbye moon'],
      ['s.r.l.', 'sociedad de responsabilidad limitada'],
    ]
    for (const [a, b] of cases) {
      const sim = similarityPct(a, b)
      expect(sim).toBeGreaterThanOrEqual(0)
      expect(sim).toBeLessThanOrEqual(100)
    }
  })
})

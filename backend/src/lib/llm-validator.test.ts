import { describe, it, expect } from 'vitest'
import { validarChunk } from './llm-validator'

describe('validarChunk', () => {
  it('valida chunk con monto + cita', () => {
    const r = validarChunk('La empresa recibió $100M [[node:emp1]] en 2022.')
    expect(r.valid).toBe(true)
  })

  it('falla chunk con monto sin cita', () => {
    const r = validarChunk('La empresa recibió $100M en 2022.')
    expect(r.valid).toBe(false)
    expect(r.reason).toContain('hecho sin cita')
  })

  it('falla chunk con CUIT sin cita', () => {
    const r = validarChunk('CUIT 30-12345678-9 figura en IGJ.')
    expect(r.valid).toBe(false)
  })

  it('valida chunk con CUIT con cita cercana', () => {
    const r = validarChunk('CUIT 30-12345678-9 [[node:cuit-x]] figura en IGJ.')
    expect(r.valid).toBe(true)
  })

  it('valida chunk de interpretación pura sin números', () => {
    const r = validarChunk('Este patrón sugiere captura de área.')
    expect(r.valid).toBe(true)
  })

  it('valida razón social con cita', () => {
    const r = validarChunk('PINTURAS CAVAZZON S.R.L. [[node:cavazzon]] tiene 25 contratos.')
    expect(r.valid).toBe(true)
  })

  it('falla razón social sin cita', () => {
    const r = validarChunk('PINTURAS CAVAZZON S.R.L. tiene actividad atípica.')
    expect(r.valid).toBe(false)
  })
})

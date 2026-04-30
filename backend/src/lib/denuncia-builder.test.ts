// Tests para denuncia-builder (PLAN-DATOS Fase E3).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDb, dbRun, insertSeñalCache } from './db'
import { armarDenunciaDesdeIds, contarEstadoSeñales } from './denuncia-builder'
import { marcarSeñalVerificada, marcarSeñalDescartada, marcarSeñalBloqueada } from './verificacion-senales'

const TEST_MUNICIPIO = '__test_e3_denuncia__'

beforeAll(async () => { await initDb() })
afterAll(async () => {
  try { await dbRun(`DELETE FROM señales_cache WHERE municipio = ?`, [TEST_MUNICIPIO]) } catch { /* idempotente */ }
})

async function insertarSeñalDeTest(): Promise<string> {
  await insertSeñalCache(TEST_MUNICIPIO, {
    tipologia: 'test_e3',
    score: 75,
    titulo: 'Señal de test E3',
    resumen: 'denuncia test',
    evidencia: [{ descripcion: 'test', fuenteUrl: 'https://example.test/' }],
    legal: {
      articulos: ['Ley 25.188'],
      severidad: 'grave',
      denunciarAnte: ['Tribunal de Cuentas'],
    },
  })
  const rows = await import('./db').then(m => m.dbAll<{ id: string }>(
    `SELECT id FROM señales_cache WHERE municipio = ? AND tipologia = 'test_e3' ORDER BY computado_en DESC LIMIT 1`,
    [TEST_MUNICIPIO],
  ))
  return rows[0].id
}

describe('E3 — armarDenunciaDesdeIds', () => {
  it('hidrata señales con estadoVerificacion (default sin_verificar)', async () => {
    const id = await insertarSeñalDeTest()
    const input = await armarDenunciaDesdeIds({
      denunciante: { nombre: 'Test', dni: '12345678', email: 't@test', domicilio: 'X' },
      destinatario: 'tribunal_cuentas',
      casoTitulo: 'Caso test',
      hechos: 'h',
      petitorio: 'p',
      senalIds: [id],
    })
    expect(input.señales).toHaveLength(1)
    expect(input.señales[0].senal_id).toBe(id)
    expect(input.señales[0].estadoVerificacion).toBe('sin_verificar')
    expect(input.señales[0].verificadoPor).toBeNull()
  })

  it('hidrata estadoVerificacion=verificada cuando ya fue verificada', async () => {
    const id = await insertarSeñalDeTest()
    await marcarSeñalVerificada(id, 'auditor@test')
    const input = await armarDenunciaDesdeIds({
      denunciante: { nombre: 'Test', dni: '12345678', email: 't@test', domicilio: 'X' },
      destinatario: 'tribunal_cuentas',
      casoTitulo: 'Caso test',
      hechos: 'h', petitorio: 'p',
      senalIds: [id],
    })
    expect(input.señales[0].estadoVerificacion).toBe('verificada')
    expect(input.señales[0].verificadoPor).toBe('auditor@test')
    expect(input.señales[0].verificadoEn).toBeTruthy()
  })

  it('preserva legal articulos + denunciarAnte de la señal', async () => {
    const id = await insertarSeñalDeTest()
    const input = await armarDenunciaDesdeIds({
      denunciante: { nombre: 'T', dni: '12345678', email: 't', domicilio: 'X' },
      destinatario: 'tribunal_cuentas',
      casoTitulo: 'C', hechos: 'h', petitorio: 'p',
      senalIds: [id],
    })
    expect(input.señales[0].legal.articulos).toContain('Ley 25.188')
    expect(input.señales[0].legal.denunciarAnte).toContain('Tribunal de Cuentas')
  })

  it('hidrata múltiples señales con estados distintos', async () => {
    const idV = await insertarSeñalDeTest()
    const idD = await insertarSeñalDeTest()
    const idB = await insertarSeñalDeTest()
    const idS = await insertarSeñalDeTest()
    await marcarSeñalVerificada(idV, 'auditor@test')
    await marcarSeñalDescartada(idD, 'auditor@test')
    await marcarSeñalBloqueada(idB, 'auditor@test')
    // idS queda en sin_verificar (default)

    const input = await armarDenunciaDesdeIds({
      denunciante: { nombre: 'T', dni: '12345678', email: 't', domicilio: 'X' },
      destinatario: 'tribunal_cuentas',
      casoTitulo: 'C', hechos: 'h', petitorio: 'p',
      senalIds: [idV, idD, idB, idS],
    })
    const estados = new Set(input.señales.map(s => s.estadoVerificacion))
    expect(estados.has('verificada')).toBe(true)
    expect(estados.has('descartada')).toBe(true)
    expect(estados.has('bloqueada')).toBe(true)
    expect(estados.has('sin_verificar')).toBe(true)
  })

  it('senalIds vacío produce señales=[] (no falla)', async () => {
    const input = await armarDenunciaDesdeIds({
      denunciante: { nombre: 'T', dni: '12345678', email: 't', domicilio: 'X' },
      destinatario: 'tribunal_cuentas',
      casoTitulo: 'C', hechos: 'h', petitorio: 'p',
    })
    expect(input.señales).toEqual([])
    expect(input.contratos).toEqual([])
    expect(input.entidades).toEqual([])
  })

  it('preserva los datos del denunciante', async () => {
    const input = await armarDenunciaDesdeIds({
      denunciante: {
        nombre: 'Lautaro Ej',
        dni: '40123456',
        email: 'l@e.com',
        telefono: '+5435100',
        domicilio: 'Calle Falsa 123',
      },
      destinatario: 'fiscalia',
      casoTitulo: 'Test',
      hechos: 'hechos',
      petitorio: 'petitorio',
    })
    expect(input.denuncianteNombre).toBe('Lautaro Ej')
    expect(input.denuncianteDni).toBe('40123456')
    expect(input.denuncianteEmail).toBe('l@e.com')
    expect(input.denuncianteTelefono).toBe('+5435100')
    expect(input.denuncianteDomicilio).toBe('Calle Falsa 123')
    expect(input.destinatario).toBe('fiscalia')
  })
})

describe('E3 review #1 — validación de denunciante', () => {
  it('rechaza dni del denunciante inválido', async () => {
    await expect(armarDenunciaDesdeIds({
      denunciante: { nombre: 'X', dni: '12345', email: 'x', domicilio: 'X' }, // 5 dígitos < 6
      destinatario: 'tribunal_cuentas',
      casoTitulo: 'X', hechos: 'h', petitorio: 'p',
    })).rejects.toThrow(/dni inválido/)
  })

  it('rechaza dni con caracteres no numéricos', async () => {
    await expect(armarDenunciaDesdeIds({
      denunciante: { nombre: 'X', dni: '12345abc', email: 'x', domicilio: 'X' },
      destinatario: 'tribunal_cuentas',
      casoTitulo: 'X', hechos: 'h', petitorio: 'p',
    })).rejects.toThrow(/dni inválido/)
  })

  it('acepta dni válido (8 dígitos limpio o con puntos)', async () => {
    await expect(armarDenunciaDesdeIds({
      denunciante: { nombre: 'X', dni: '12345678', email: 'x', domicilio: 'X' },
      destinatario: 'tribunal_cuentas',
      casoTitulo: 'X', hechos: 'h', petitorio: 'p',
    })).resolves.toBeDefined()
    await expect(armarDenunciaDesdeIds({
      denunciante: { nombre: 'X', dni: '12.345.678', email: 'x', domicilio: 'X' },
      destinatario: 'tribunal_cuentas',
      casoTitulo: 'X', hechos: 'h', petitorio: 'p',
    })).resolves.toBeDefined()
  })
})

describe('E3 — contarEstadoSeñales', () => {
  it('cuenta correctamente con mix de estados', () => {
    const input = {
      destinatario: 't', denuncianteNombre: 'X', denuncianteDni: '1', denuncianteEmail: 'x',
      denuncianteDomicilio: 'X', hechos: '', petitorio: '', casoTitulo: '',
      entidades: [], contratos: [],
      señales: [
        { senal_id: '1', tipologia: 't', titulo: '', resumen: '', score: 0, severidad: '', cuits: [], legal: {}, estadoVerificacion: 'verificada' as const },
        { senal_id: '2', tipologia: 't', titulo: '', resumen: '', score: 0, severidad: '', cuits: [], legal: {}, estadoVerificacion: 'sin_verificar' as const },
        { senal_id: '3', tipologia: 't', titulo: '', resumen: '', score: 0, severidad: '', cuits: [], legal: {}, estadoVerificacion: 'sin_verificar' as const },
        { senal_id: '4', tipologia: 't', titulo: '', resumen: '', score: 0, severidad: '', cuits: [], legal: {}, estadoVerificacion: 'descartada' as const },
        { senal_id: '5', tipologia: 't', titulo: '', resumen: '', score: 0, severidad: '', cuits: [], legal: {}, estadoVerificacion: 'bloqueada' as const },
      ],
    }
    const r = contarEstadoSeñales(input)
    expect(r.total).toBe(5)
    expect(r.verificadas).toBe(1)
    expect(r.sinVerificar).toBe(2)
    expect(r.descartadas).toBe(1)
    expect(r.bloqueadas).toBe(1)
    expect(r.haySinVerificar).toBe(true)
  })

  it('haySinVerificar=false cuando todas están verificadas o descartadas', () => {
    const input = {
      destinatario: 't', denuncianteNombre: 'X', denuncianteDni: '1', denuncianteEmail: 'x',
      denuncianteDomicilio: 'X', hechos: '', petitorio: '', casoTitulo: '',
      entidades: [], contratos: [],
      señales: [
        { senal_id: '1', tipologia: 't', titulo: '', resumen: '', score: 0, severidad: '', cuits: [], legal: {}, estadoVerificacion: 'verificada' as const },
        { senal_id: '2', tipologia: 't', titulo: '', resumen: '', score: 0, severidad: '', cuits: [], legal: {}, estadoVerificacion: 'descartada' as const },
      ],
    }
    expect(contarEstadoSeñales(input).haySinVerificar).toBe(false)
  })

  it('señales sin estadoVerificacion (legacy) se cuentan como sin_verificar', () => {
    const input = {
      destinatario: 't', denuncianteNombre: 'X', denuncianteDni: '1', denuncianteEmail: 'x',
      denuncianteDomicilio: 'X', hechos: '', petitorio: '', casoTitulo: '',
      entidades: [], contratos: [],
      señales: [
        { senal_id: '1', tipologia: 't', titulo: '', resumen: '', score: 0, severidad: '', cuits: [], legal: {} },
      ],
    }
    const r = contarEstadoSeñales(input)
    expect(r.sinVerificar).toBe(1)
    expect(r.haySinVerificar).toBe(true)
  })
})

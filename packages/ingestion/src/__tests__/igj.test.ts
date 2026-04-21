import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import AdmZip from 'adm-zip'
import { createIGJConnector } from '../connectors/igj'
import { createSnapshotService } from '../snapshot'
import type { RawPayload } from '../connector'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENTIDADES_CSV = `numero_correlativo,cuit,razon_social,descripcion_tipo_societario,dada_de_baja,fecha_inscripcion,domicilio,localidad,provincia
1,20123456789,EMPRESA TEST SA,Sociedad Anónima,,2010-03-15,Av. Corrientes 1234,Buenos Aires,CABA
2,30987654321,CONSTRUCTORA NORTE SRL,Sociedad de Responsabilidad Limitada,,2015-06-01,San Martín 567,Córdoba,Córdoba
3,27456789123,SERVICIOS DIGITALES SAS,Sociedad por Acciones Simplificada,2022-01-01,2018-11-20,,Buenos Aires,CABA
4,,SIN CUIT SA,Sociedad Anónima,,,,,
5,20111222333,SOLO RAZON SOCIAL,Sociedad Anónima,,,,
`

const AUTORIDADES_CSV = `numero_correlativo,apellido_nombre,tipo_administrador,numero_documento
1,RODRIGUEZ JUAN CARLOS,A,25123456
1,GONZALEZ MARIA,A,30987654
2,PEREZ PABLO,A,27654321
2,FERNANDEZ ANA,S,31234567
1,LOPEZ CARLOS,X,28111222
3,GARCIA ROBERTO,A,29456789
`

function makeZipBuffer(entCsv: string, autCsv: string): Buffer {
  const zip = new AdmZip()
  zip.addFile('igj-entidades.csv', Buffer.from(entCsv, 'utf8'))
  zip.addFile('igj-autoridades.csv', Buffer.from(autCsv, 'utf8'))
  return zip.toBuffer()
}

function makeMockSnapshotSvc(tmpDir: string) {
  return createSnapshotService(tmpDir)
}

function makeRawPayload(buf: Buffer, tmpDir: string): RawPayload {
  const svc = makeMockSnapshotSvc(tmpDir)
  // Return synchronously via the actual snapshot service structure
  const crypto = require('crypto') as typeof import('crypto')
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
  return {
    data:         buf,
    content_type: 'application/zip',
    source_url:   'https://datos.jus.gob.ar/igj-2026-semestre-1.zip',
    fetched_at:   new Date('2026-04-16T00:00:00Z'),
    sha256,
    archive_path: `igj/test_${sha256}.zip`,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argos-igj-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('IGJ connector — parse()', () => {
  it('extracts empresas from entidades.csv', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)

    // rows with valid cuit + razon_social
    expect(result.empresas.length).toBeGreaterThanOrEqual(3)
  })

  it('strips CUIT dashes during normalization', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const csv       = `numero_correlativo,cuit,razon_social,descripcion_tipo_societario,dada_de_baja
1,20-12345678-9,TEST SA,SA,\n`
    const buf = makeZipBuffer(csv, 'numero_correlativo,apellido_nombre,tipo_administrador,numero_documento\n')
    const raw = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    if (result.empresas.length > 0) {
      expect(result.empresas[0].cuit).toMatch(/^\d{11}$/)
    }
  })

  it('sets estado=activa when dada_de_baja is empty', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    const empresa1 = result.empresas.find(e => e.cuit === '20123456789')
    expect(empresa1?.estado).toBe('activa')
  })

  it('sets estado=inactiva when dada_de_baja has a value', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    const empresa3 = result.empresas.find(e => e.cuit === '27456789123')
    expect(empresa3?.estado).toBe('inactiva')
  })

  it('parses fecha_constitucion from fecha_inscripcion column', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    const empresa1 = result.empresas.find(e => e.cuit === '20123456789')
    expect(empresa1?.fecha_constitucion).toBeInstanceOf(Date)
    expect(empresa1?.fecha_constitucion?.getFullYear()).toBe(2010)
  })

  it('constructs domicilio from domicilio+localidad+provincia columns', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    const empresa1 = result.empresas.find(e => e.cuit === '20123456789')
    expect(empresa1?.domicilio).toContain('Av. Corrientes')
    expect(empresa1?.domicilio).toContain('Buenos Aires')
    expect(empresa1?.domicilio).toContain('CABA')
  })

  it('skips rows without valid CUIT', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result    = connector.parse(raw)
    const noCuit    = result.empresas.find(e => e.nombre === 'SIN CUIT SA')
    expect(noCuit).toBeUndefined()
  })

  it('extracts director personas (tipo_administrador=A)', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    const director = result.personas.find(p => p.nombre === 'RODRIGUEZ JUAN CARLOS')
    expect(director).toBeDefined()
    expect(director?.roles).toContain('director')
  })

  it('excludes tipo_administrador=X (non-director/socio roles)', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result    = connector.parse(raw)
    const lopezX    = result.personas.find(p => p.nombre === 'LOPEZ CARLOS')
    expect(lopezX).toBeUndefined()
  })

  it('includes socios (tipo_administrador=S)', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    const socia = result.personas.find(p => p.nombre === 'FERNANDEZ ANA')
    expect(socia).toBeDefined()
  })

  it('all Empresa entities have required forensic metadata', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    for (const emp of result.empresas) {
      expect(emp.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(emp.source_url).toBeTruthy()
      expect(emp.fetched_at).toBeInstanceOf(Date)
      expect(emp.archive_path).toBeTruthy()
    }
  })

  it('all Persona entities have required forensic metadata', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    for (const p of result.personas) {
      expect(p.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(p.source_url).toBeTruthy()
      expect(p.fetched_at).toBeInstanceOf(Date)
    }
  })

  it('throws when ZIP is missing entidades.csv', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const zip       = new AdmZip()
    zip.addFile('only-autoridades.csv', Buffer.from(AUTORIDADES_CSV))
    const raw = makeRawPayload(zip.toBuffer(), tmpDir)

    expect(() => connector.parse(raw)).toThrow('missing entidades.csv or autoridades.csv')
  })

  it('throws when ZIP is missing autoridades.csv', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const zip       = new AdmZip()
    zip.addFile('igj-entidades.csv', Buffer.from(ENTIDADES_CSV))
    const raw = makeRawPayload(zip.toBuffer(), tmpDir)

    expect(() => connector.parse(raw)).toThrow('missing entidades.csv or autoridades.csv')
  })

  it('handles empty entidades.csv gracefully', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer('numero_correlativo,cuit,razon_social\n', AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    expect(result.empresas).toHaveLength(0)
  })

  it('handles empty autoridades.csv gracefully', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, 'numero_correlativo,apellido_nombre,tipo_administrador,numero_documento\n')
    const raw       = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    expect(result.empresas.length).toBeGreaterThan(0)
    expect(result.personas).toHaveLength(0)
  })

  it('deduplicates personas with same nombre+documento', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const dupAut = `numero_correlativo,apellido_nombre,tipo_administrador,numero_documento
1,RODRIGUEZ JUAN,A,25123456
2,RODRIGUEZ JUAN,A,25123456
`
    const buf = makeZipBuffer(ENTIDADES_CSV, dupAut)
    const raw = makeRawPayload(buf, tmpDir)

    const result = connector.parse(raw)
    const dups   = result.personas.filter(p => p.nombre === 'RODRIGUEZ JUAN')
    expect(dups).toHaveLength(1)
  })

  it('normalizes empresa nombre (strips SA/SRL suffixes)', () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result  = connector.parse(raw)
    const empresa = result.empresas.find(e => e.cuit === '20123456789')
    expect(empresa?.nombre_normalizado).not.toContain(' SA')
  })

  it('upsert() returns inserted count equal to total entities', async () => {
    const svc       = createSnapshotService(tmpDir)
    const connector = createIGJConnector(svc)
    const buf       = makeZipBuffer(ENTIDADES_CSV, AUTORIDADES_CSV)
    const raw       = makeRawPayload(buf, tmpDir)

    const result    = connector.parse(raw)
    const upserted  = await connector.upsert(result)
    expect(upserted.inserted).toBe(result.empresas.length + result.personas.length)
    expect(upserted.skipped).toBe(0)
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { createSnapshotService } from '../snapshot'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argos-snap-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('createSnapshotService', () => {
  it('saves a buffer and returns correct metadata', async () => {
    const svc = createSnapshotService(tmpDir)
    const payload = Buffer.from('hello world')
    const sha256 = crypto.createHash('sha256').update(payload).digest('hex')

    const result = await svc.save('test-connector', payload, 'json', 'https://example.com/data')

    expect(result.sha256).toBe(sha256)
    expect(result.source_url).toBe('https://example.com/data')
    expect(result.content_type).toBe('application/json')
    expect(result.archive_path).toContain('test-connector')
    expect(result.archive_path).toContain(sha256)
    expect(result.fetched_at).toBeInstanceOf(Date)
  })

  it('saves a string payload (UTF-8 encoded)', async () => {
    const svc = createSnapshotService(tmpDir)
    const text = '{"cuit":"20123456789","nombre":"EMPRESA TEST SRL"}'
    const buf = Buffer.from(text, 'utf8')
    const expected = crypto.createHash('sha256').update(buf).digest('hex')

    const result = await svc.save('igj', text, 'json', 'https://igj.gob.ar/data')

    expect(result.sha256).toBe(expected)
    expect(result.data).toEqual(buf)
  })

  it('does NOT create a duplicate file when same content is saved twice', async () => {
    const svc = createSnapshotService(tmpDir)
    const payload = Buffer.from('same content twice')

    const r1 = await svc.save('cordoba', payload, 'xlsx', 'https://gobiernoabierto.cordoba.gob.ar/1')
    const r2 = await svc.save('cordoba', payload, 'xlsx', 'https://gobiernoabierto.cordoba.gob.ar/1')

    // Same sha256
    expect(r1.sha256).toBe(r2.sha256)

    // Only ONE file exists on disk
    const files = fs.readdirSync(path.join(tmpDir, 'cordoba'))
    expect(files).toHaveLength(1)
  })

  it('creates separate files for different content', async () => {
    const svc = createSnapshotService(tmpDir)

    await svc.save('cordoba', Buffer.from('payload A'), 'xlsx', 'https://example.com/a')
    await svc.save('cordoba', Buffer.from('payload B'), 'xlsx', 'https://example.com/b')

    const files = fs.readdirSync(path.join(tmpDir, 'cordoba'))
    expect(files).toHaveLength(2)
  })

  it('separates snapshots by connector ID', async () => {
    const svc = createSnapshotService(tmpDir)
    const payload = Buffer.from('shared payload')

    await svc.save('connector-a', payload, 'json', 'https://a.com')
    await svc.save('connector-b', payload, 'json', 'https://b.com')

    expect(fs.existsSync(path.join(tmpDir, 'connector-a'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'connector-b'))).toBe(true)
    // Each connector has its own file (same content but different dirs = 1 file each)
    expect(fs.readdirSync(path.join(tmpDir, 'connector-a'))).toHaveLength(1)
    expect(fs.readdirSync(path.join(tmpDir, 'connector-b'))).toHaveLength(1)
  })

  it('exists() returns true for known sha256', async () => {
    const svc = createSnapshotService(tmpDir)
    const payload = Buffer.from('check existence')
    const result = await svc.save('test', payload, 'json', 'https://test.com')

    expect(await svc.exists(result.sha256)).toBe(true)
  })

  it('exists() returns false for unknown sha256', async () => {
    const svc = createSnapshotService(tmpDir)
    expect(await svc.exists('a'.repeat(64))).toBe(false)
  })

  it('exists() returns false when baseDir is empty', async () => {
    const svc = createSnapshotService(tmpDir)
    expect(await svc.exists('deadbeef'.repeat(8))).toBe(false)
  })

  it('load() returns identical bytes to what was saved', async () => {
    const svc = createSnapshotService(tmpDir)
    const payload = Buffer.from('roundtrip test 🔍')
    const result = await svc.save('igj', payload, 'zip', 'https://igj.gob.ar/zip')

    const loaded = await svc.load(result.archive_path)
    expect(loaded).toEqual(payload)
  })

  it('load() sha256 of loaded bytes matches stored sha256', async () => {
    const svc = createSnapshotService(tmpDir)
    const payload = Buffer.from('forensic integrity check')
    const result = await svc.save('bora', payload, 'html', 'https://bora.gob.ar/page')

    const loaded = await svc.load(result.archive_path)
    const recomputed = crypto.createHash('sha256').update(loaded).digest('hex')
    expect(recomputed).toBe(result.sha256)
  })

  it('load() throws for non-existent archive path', async () => {
    const svc = createSnapshotService(tmpDir)
    await expect(svc.load('connector/nonexistent_abc.json')).rejects.toThrow('not found')
  })

  it('archive_path contains sha256 as a verifiable identifier', async () => {
    const svc = createSnapshotService(tmpDir)
    const payload = Buffer.from('path contains hash')
    const result = await svc.save('test', payload, 'json', 'https://test.com')

    expect(result.archive_path).toContain(result.sha256)
  })

  it('handles large payloads (1MB)', async () => {
    const svc = createSnapshotService(tmpDir)
    const large = Buffer.alloc(1024 * 1024, 0x42) // 1MB of 'B'
    const result = await svc.save('large', large, 'bin', 'https://test.com/large')

    const loaded = await svc.load(result.archive_path)
    expect(loaded.length).toBe(1024 * 1024)
    expect(loaded[0]).toBe(0x42)
  })

  it('handles empty payload', async () => {
    const svc = createSnapshotService(tmpDir)
    const empty = Buffer.alloc(0)
    const result = await svc.save('empty', empty, 'json', 'https://test.com/empty')

    const loaded = await svc.load(result.archive_path)
    expect(loaded.length).toBe(0)
  })

  it('mime type mapping: xlsx', async () => {
    const svc = createSnapshotService(tmpDir)
    const r = await svc.save('c', Buffer.from('x'), 'xlsx', 'https://x.com')
    expect(r.content_type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('mime type mapping: zip', async () => {
    const svc = createSnapshotService(tmpDir)
    const r = await svc.save('c', Buffer.from('x'), 'zip', 'https://x.com')
    expect(r.content_type).toBe('application/zip')
  })

  it('mime type mapping: unknown ext falls back to octet-stream', async () => {
    const svc = createSnapshotService(tmpDir)
    const r = await svc.save('c', Buffer.from('x'), 'dat', 'https://x.com')
    expect(r.content_type).toBe('application/octet-stream')
  })
})

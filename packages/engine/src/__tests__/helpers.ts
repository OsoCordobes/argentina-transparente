import type { Contrato, Empresa } from '@argos/model'
import type { GraphContext } from '../types'
import { v4 as uuidv4 } from 'uuid'

// ─── Minimal fixture factories ────────────────────────────────────────────────

export function makeContrato(overrides: Partial<Contrato> = {}): Contrato {
  return {
    id:                    uuidv4(),
    municipio_id:          'cordoba-capital',
    numero:                'EXP-001',
    descripcion:           'Servicio de limpieza',
    tipo:                  'contratacion_directa',
    monto:                 1_000_000,
    moneda:                'ARS',
    anio:                  2022,
    fecha:                 new Date('2022-06-01'),
    area:                  'SECRETARÍA DE OBRAS',
    proveedor:             'PROVEEDOR SA',
    proveedor_normalizado: 'PROVEEDOR SA',
    source_url:            'https://gobiernoabierto.cordoba.gob.ar/test',
    fetched_at:            new Date('2024-01-01'),
    sha256:                'a'.repeat(64),
    archive_path:          'test/snapshot.xlsx',
    ...overrides,
  }
}

export function makeEmpresa(overrides: Partial<Empresa> = {}): Empresa {
  return {
    id:                  uuidv4(),
    nombre:              'EMPRESA SRL',
    nombre_normalizado:  'EMPRESA SRL',
    cuit:                '30123456789',
    estado:              'activa',
    source_url:          'https://test.com/igj',
    fetched_at:          new Date('2024-01-01'),
    sha256:              'b'.repeat(64),
    archive_path:        'test/igj.csv',
    ...overrides,
  }
}

// ─── Mock GraphContext builder ────────────────────────────────────────────────

export interface MockContextOpts {
  municipio_id?:    string
  periodo_desde?:   number
  periodo_hasta?:   number
  contratos?:       Contrato[]
  empresas?:        Empresa[]
  directoresCompartidos?: Awaited<ReturnType<GraphContext['directoresCompartidos']>>
}

export function makeMockCtx(opts: MockContextOpts = {}): GraphContext {
  const contratos = opts.contratos ?? []
  const empresas  = opts.empresas  ?? []
  const directores = opts.directoresCompartidos ?? []

  return {
    municipio_id:   opts.municipio_id  ?? 'cordoba-capital',
    periodo_desde:  opts.periodo_desde ?? 2022,
    periodo_hasta:  opts.periodo_hasta ?? 2022,

    contratos:              async () => contratos,
    contratosByProveedor:   async (nombre) => contratos.filter(c => c.proveedor_normalizado === nombre),
    contratosByArea:        async (area) => contratos.filter(c => c.area === area),
    empresa:                async (nombre) => empresas.find(e => e.nombre_normalizado === nombre) ?? null,
    empresas:               async () => empresas,
    directoresByEmpresa:    async () => [],
    cargosByPersona:        async () => [],
    donacionesByDonante:    async () => [],
    directoresCompartidos:  async () => directores,
    redDeEmpresas:          async () => ({ nodos: [], aristas: [] }),
    montoTotal:             async () => contratos.reduce((s, c) => s + c.monto, 0),
    proveedores:            async () => {
      const map = new Map<string, { monto: number; count: number }>()
      for (const c of contratos) {
        const k = c.proveedor_normalizado
        const v = map.get(k) ?? { monto: 0, count: 0 }
        v.monto  += c.monto
        v.count  += 1
        map.set(k, v)
      }
      return Array.from(map.entries()).map(([nombre, v]) => ({ nombre, monto: v.monto, contratos: v.count }))
    },
  }
}

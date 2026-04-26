/**
 * argosMock.ts
 *
 * Fixture provisional para el modo Explorar (ARGOS v2 prototype).
 * Universo coherente: 5 jurisdicciones, 22 proveedores, 8 directores,
 * 35 contratos, 8 señales. Intenta reflejar la forma del backend Neo4j.
 *
 * Migrado desde `.tmp-argos-v2/argos/mockData.jsx` (vanilla JS) — los
 * números/strings se preservan EXACTOS. Eventualmente este módulo será
 * reemplazado por datos reales del backend.
 */

import type {
  ArgosNode,
  ArgosEdge,
  ArgosGraph,
  ArgosNodeType,
  ArgosEdgeKind,
  ArgosSeveridad,
} from '@/lib/argos/types'

// ─── Helpers internos (no exportados) ─────────────────────────────────────────

const fmtCuit = (c: string): string =>
  c.replace(/(\d{2})(\d{8})(\d{1})/, '$1-$2-$3')

// ─── Tipos auxiliares para los fixtures crudos ────────────────────────────────

interface Jurisdiccion {
  id: string
  label: string
  pop: string
  prov: string
  contratos: number
  monto: number
  anioMin: number
  anioMax: number
  senales: number
}

interface Proveedor {
  cuit: string
  razon: string
  act: string
  monto: number
  n: number
  jur: string[]
  inicio: string
  verif: boolean
  w: number
}

interface Director {
  id: string
  label: string
  empresas: string[]
}

interface Contrato {
  id: string
  tipo: string
  monto: number
  anio: number
  area: string
  descripcion: string
  proveedorCuit: string
  jurId: string
  fuenteUrl: string
  numeroExpediente: string
  fechaContrato: string
}

interface SenalTarget {
  type: 'proveedor' | 'jurisdiccion' | 'contrato'
  id: string
}

interface SenalEvidencia {
  descripcion: string
  fuenteUrl: string
}

interface Senal {
  id: string
  tipologia: string
  score: number
  severidad: ArgosSeveridad
  label: string
  sub: string
  target: SenalTarget
  resumen: string
  articulos: string[]
  denunciar: string[]
  evidencia: SenalEvidencia[]
  w: number
}

// ─── Jurisdicciones ───────────────────────────────────────────────────────────

const JUR: Jurisdiccion[] = [
  { id: 'cordoba-capital', label: 'Municipalidad de Córdoba', pop: '1.4M', prov: 'Córdoba',
    contratos: 1390, monto: 18_420_000_000, anioMin: 2019, anioMax: 2023, senales: 5 },
  { id: 'rio-cuarto', label: 'Municipalidad de Río Cuarto', pop: '170K', prov: 'Córdoba',
    contratos: 412, monto: 3_180_000_000, anioMin: 2019, anioMax: 2023, senales: 2 },
  { id: 'villa-maria', label: 'Municipalidad de Villa María', pop: '95K', prov: 'Córdoba',
    contratos: 228, monto: 1_640_000_000, anioMin: 2020, anioMax: 2023, senales: 1 },
  { id: 'salta-capital', label: 'Municipalidad de Salta', pop: '620K', prov: 'Salta',
    contratos: 712, monto: 7_220_000_000, anioMin: 2019, anioMax: 2023, senales: 3 },
  { id: 'rosario', label: 'Municipalidad de Rosario', pop: '950K', prov: 'Santa Fe',
    contratos: 1180, monto: 14_960_000_000, anioMin: 2019, anioMax: 2023, senales: 4 },
]

// ─── 22 proveedores (CUITs sintéticos pero formato válido XX-XXXXXXXX-X) ─────

const PROV: Proveedor[] = [
  { cuit: '30712345678', razon: 'CONSTRUCCIONES DEL CENTRO S.A.', act: 'Construcción de obras de ingeniería civil', monto: 1_240_000_000, n: 47, jur: ['cordoba-capital', 'rio-cuarto'], inicio: '14/03/2014', verif: true, w: 0.78 },
  { cuit: '30708912344', razon: 'VIALMED INGENIERÍA S.R.L.', act: 'Construcción de carreteras y puentes', monto: 980_000_000, n: 34, jur: ['cordoba-capital', 'villa-maria'], inicio: '02/06/2009', verif: true, w: 0.62 },
  { cuit: '30661234562', razon: 'PAVIMENTOS DEL SUR S.A.', act: 'Pavimentación urbana', monto: 870_000_000, n: 29, jur: ['cordoba-capital'], inicio: '10/11/2011', verif: true, w: 0.58 },
  { cuit: '33701239843', razon: 'INSUMOS HOSPITALARIOS HM S.A.', act: 'Comercio al por mayor de productos farmacéuticos', monto: 760_000_000, n: 62, jur: ['cordoba-capital', 'rosario'], inicio: '18/02/2015', verif: true, w: 0.55 },
  { cuit: '30714562231', razon: 'SEGURIDAD INTEGRAL CÓRDOBA S.A.', act: 'Servicios de vigilancia privada', monto: 680_000_000, n: 24, jur: ['cordoba-capital'], inicio: '05/09/2013', verif: true, w: 0.51 },
  { cuit: '33709988774', razon: 'ALIMENTOS RC S.R.L.', act: 'Elaboración de comidas preparadas', monto: 520_000_000, n: 38, jur: ['rio-cuarto'], inicio: '22/04/2017', verif: true, w: 0.42 },
  { cuit: '30654321987', razon: 'TECNOLOGÍA Y SISTEMAS DEL NORTE S.A.', act: 'Servicios de consultoría informática', monto: 430_000_000, n: 18, jur: ['salta-capital', 'cordoba-capital'], inicio: '09/01/2012', verif: true, w: 0.39 },
  { cuit: '30708887776', razon: 'OBRAS Y SERVICIOS NORTE S.A.', act: 'Construcción de edificios públicos', monto: 920_000_000, n: 31, jur: ['salta-capital'], inicio: '14/07/2010', verif: true, w: 0.65 },
  { cuit: '30715123488', razon: 'TRANSPORTES URBANOS ROSARIO S.R.L.', act: 'Transporte automotor de pasajeros', monto: 1_120_000_000, n: 42, jur: ['rosario'], inicio: '30/08/2012', verif: true, w: 0.71 },
  { cuit: '30702334451', razon: 'IMPRENTA Y EDITORIAL OFICIAL S.A.', act: 'Impresión y servicios gráficos', monto: 280_000_000, n: 51, jur: ['cordoba-capital', 'rio-cuarto'], inicio: '01/02/2008', verif: true, w: 0.32 },
  { cuit: '33712331121', razon: 'CONSULTORA NORTE ASOC. S.A.', act: 'Servicios de consultoría en gestión', monto: 340_000_000, n: 22, jur: ['salta-capital'], inicio: '17/05/2016', verif: true, w: 0.36 },
  { cuit: '30716445891', razon: 'LIMPIEZA URBANA SUR S.R.L.', act: 'Servicios de limpieza general', monto: 610_000_000, n: 48, jur: ['villa-maria', 'cordoba-capital'], inicio: '12/12/2014', verif: true, w: 0.49 },
  { cuit: '30709988226', razon: 'ELECTROINSTAL CÓRDOBA S.A.', act: 'Instalaciones eléctricas', monto: 390_000_000, n: 26, jur: ['cordoba-capital'], inicio: '08/06/2013', verif: true, w: 0.38 },
  { cuit: '30714998123', razon: 'AGUAS Y SANEAMIENTO RC S.A.', act: 'Captación, depuración y distribución de agua', monto: 740_000_000, n: 19, jur: ['rio-cuarto'], inicio: '25/03/2011', verif: true, w: 0.56 },
  { cuit: '30717223344', razon: 'ARQUITECTURA Y PROYECTOS VM S.R.L.', act: 'Servicios de arquitectura', monto: 230_000_000, n: 14, jur: ['villa-maria'], inicio: '20/10/2018', verif: true, w: 0.28 },
  { cuit: '30700112233', razon: 'ÁRIDOS Y MATERIALES DEL CENTRO S.A.', act: 'Extracción de áridos', monto: 560_000_000, n: 36, jur: ['cordoba-capital', 'villa-maria'], inicio: '14/01/2007', verif: true, w: 0.46 },
  { cuit: '30715667788', razon: 'GASTRONOMÍA INSTITUCIONAL ROS S.R.L.', act: 'Servicios de catering', monto: 410_000_000, n: 33, jur: ['rosario'], inicio: '09/05/2015', verif: true, w: 0.40 },
  { cuit: '33710023456', razon: 'COMUNICACIONES SALTA S.A.', act: 'Servicios de telecomunicaciones', monto: 670_000_000, n: 21, jur: ['salta-capital'], inicio: '03/02/2010', verif: true, w: 0.52 },
  { cuit: '30716889922', razon: 'MOBILIARIO URBANO ROS S.R.L.', act: 'Fabricación de muebles metálicos', monto: 250_000_000, n: 17, jur: ['rosario'], inicio: '19/11/2016', verif: true, w: 0.30 },
  { cuit: '30701445678', razon: 'SOFTWARE PÚBLICO ARG S.A.', act: 'Desarrollo de software', monto: 380_000_000, n: 15, jur: ['cordoba-capital', 'rosario', 'salta-capital'], inicio: '05/07/2014', verif: true, w: 0.37 },
  { cuit: '30712334567', razon: 'INSUMOS MÉDICOS RC S.A.', act: 'Distribución de equipo médico', monto: 490_000_000, n: 28, jur: ['rio-cuarto', 'rosario'], inicio: '21/09/2013', verif: true, w: 0.43 },
  { cuit: '30717556712', razon: 'OBRAS PÚBLICAS ROSARIO S.A.', act: 'Construcción de obras de ingeniería civil', monto: 1_080_000_000, n: 39, jur: ['rosario'], inicio: '30/04/2009', verif: true, w: 0.69 },
]

// ─── Directores (8) — algunos compartidos para crear señal de red ────────────

const DIR: Director[] = [
  { id: 'd_juan_perez', label: 'JUAN MARTÍN PÉREZ', empresas: ['30712345678', '30708912344', '30661234562'] }, // 3 empresas
  { id: 'd_maria_gomez', label: 'MARÍA INÉS GÓMEZ', empresas: ['33701239843', '30712334567'] },
  { id: 'd_carlos_rivero', label: 'CARLOS A. RIVERO', empresas: ['30708887776', '33710023456'] },
  { id: 'd_lucia_fernandez', label: 'LUCÍA FERNÁNDEZ', empresas: ['30715123488', '30717556712', '30716889922'] }, // 3 empresas Rosario
  { id: 'd_roberto_castro', label: 'ROBERTO O. CASTRO', empresas: ['30714562231', '30709988226'] },
  { id: 'd_natalia_ruiz', label: 'NATALIA RUIZ', empresas: ['30716445891', '30717223344'] },
  { id: 'd_diego_acosta', label: 'DIEGO H. ACOSTA', empresas: ['30702334451', '30700112233', '30701445678'] },
  { id: 'd_paula_giordano', label: 'PAULA GIORDANO', empresas: ['33709988774', '30714998123', '30712334567'] },
]

// ─── Constantes para generar contratos sintéticos ─────────────────────────────

const TIPOS = ['DIRECTA', 'LICITACION_PUBLICA', 'PRORROGA', 'LICITACION_PRIVADA', 'CONCURSO_PRECIOS']

const AREAS: Record<string, string[]> = {
  'cordoba-capital': ['Secretaría de Obras Públicas', 'Salud', 'Servicios Públicos', 'Educación'],
  'rio-cuarto': ['Obras Públicas', 'Salud', 'Desarrollo Social'],
  'villa-maria': ['Obras Públicas', 'Servicios'],
  'salta-capital': ['Obras Públicas', 'Tecnología', 'Comunicación'],
  'rosario': ['Obras Públicas', 'Transporte', 'Salud'],
}

const DESC = [
  'Pavimentación Av. Colón — Tramo Norte',
  'Bacheo y reparación de calzadas',
  'Provisión de medicamentos genéricos',
  'Servicio de vigilancia edificios municipales',
  'Catering comedor municipal',
  'Mantenimiento alumbrado público',
  'Renovación de la red cloacal — Sector B',
  'Equipamiento informático Secretaría de Hacienda',
  'Desarrollo portal de transparencia',
  'Recolección de residuos urbanos zona Sur',
  'Insumos hospitalarios hospital municipal',
  'Limpieza de espacios verdes',
  'Construcción nueva sala de salud barrio Norte',
  'Servicios de impresión y papelería oficial',
  'Renovación parque automotor liviano',
  'Obras de drenaje pluvial Av. Sabattini',
  'Provisión de uniformes personal municipal',
  'Mantenimiento red de semáforos',
  'Sistema de emisión de turnos online',
  'Catering eventos protocolares',
  'Refacciones edificio sede central',
  'Provisión áridos para obra vial',
  'Capacitación equipos municipales',
  'Compra mobiliario urbano (bancos, cestos)',
  'Instalación cámaras de seguridad — Etapa 2',
  'Servicio de telefonía corporativa',
  'Gas envasado para edificios públicos',
  'Mantenimiento sistema de bombeo cloacal',
  'Diseño campaña institucional',
  'Equipamiento médico hospital materno',
  'Pintura y señalización vial',
  'Auditoría informática infraestructura',
  'Provisión combustibles flota municipal',
  'Reparación cubiertas escolares',
  'Servicio de mensajería y traslado documental',
]

// ─── 35 contratos generados ───────────────────────────────────────────────────

const CTR: Contrato[] = []
for (let i = 0; i < 35; i++) {
  const proveedor = PROV[i % PROV.length]
  const jur = proveedor.jur[(i * 3) % proveedor.jur.length]
  const tipo = TIPOS[(i * 7) % TIPOS.length]
  const anio = 2019 + (i % 5)
  const monto = Math.round((30 + ((i * 17) % 220)) * 1_000_000 + (i % 5) * 4_500_000)
  const desc = DESC[i % DESC.length]
  const areaPool = AREAS[jur] || ['Obras Públicas']
  CTR.push({
    id: `c_${(i + 1).toString(16).padStart(5, '0')}`,
    tipo,
    monto,
    anio,
    area: areaPool[i % areaPool.length],
    descripcion: desc,
    proveedorCuit: proveedor.cuit,
    jurId: jur,
    fuenteUrl: `https://gobiernoabierto.${jur.split('-')[0]}.gob.ar/datasets/${6000 + i}`,
    numeroExpediente: `EXP-${anio}-${(1000 + i).toString()}`,
    fechaContrato: `${anio}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
  })
}

// ─── 8 señales (una por tipología) ────────────────────────────────────────────

const SEN: Senal[] = [
  {
    id: 's_proveedor_cronico_001', tipologia: 'proveedor_cronico', score: 78, severidad: 'moderada',
    label: 'Proveedor crónico: 5 años consecutivos',
    sub: 'CONSTRUCCIONES DEL CENTRO · 2019–2023',
    target: { type: 'proveedor', id: '30712345678' },
    resumen: 'Empresa presente en el 100% de los años analizados con facturación promedio anual >$200M.',
    articulos: ['Ley 8835 art. 13', 'Ord. 12.585 art. 7'],
    denunciar: ['Tribunal de Cuentas', 'Defensoría del Pueblo'],
    evidencia: [
      { descripcion: '47 contratos entre 2019 y 2023', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/datasets/6467' },
      { descripcion: 'Concentración del 32% del rubro pavimentación', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/datasets/6470' },
    ],
    w: 0.88,
  },
  {
    id: 's_concentracion_proveedor_001', tipologia: 'concentracion_proveedor', score: 84, severidad: 'grave',
    label: 'Concentración: 1 proveedor = 41% del rubro',
    sub: 'Insumos hospitalarios · Córdoba 2023',
    target: { type: 'proveedor', id: '33701239843' },
    resumen: 'INSUMOS HOSPITALARIOS HM S.A. concentra el 41% del gasto en farmacéuticos en 2023.',
    articulos: ['Ley 8835 art. 28', 'Decreto 305/14 art. 11'],
    denunciar: ['Tribunal de Cuentas', 'Auditoría General'],
    evidencia: [{ descripcion: '62 contratos por $760M en 12 meses', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/datasets/6481' }],
    w: 0.95,
  },
  {
    id: 's_contrataciones_directas_001', tipologia: 'contrataciones_directas', score: 71, severidad: 'moderada',
    label: 'Exceso de contratación directa',
    sub: 'Salta Capital · Comunicaciones · 2022',
    target: { type: 'jurisdiccion', id: 'salta-capital' },
    resumen: '68% de las contrataciones del rubro telecomunicaciones se ejecutaron por modalidad DIRECTA.',
    articulos: ['Ley provincial 6838 art. 9', 'Decreto 1448/96'],
    denunciar: ['Tribunal de Cuentas Salta'],
    evidencia: [{ descripcion: '21 contratos directos sobre 31 totales', fuenteUrl: 'https://gobiernoabierto.salta.gob.ar/datasets/200' }],
    w: 0.74,
  },
  {
    id: 's_prorrogas_excesivas_001', tipologia: 'prorrogas_excesivas', score: 66, severidad: 'moderada',
    label: 'Prórrogas excesivas (>3 sin nueva licitación)',
    sub: 'CONSTRUCCIONES DEL CENTRO · Pavimentación',
    target: { type: 'contrato', id: 'c_00001' },
    resumen: 'Mismo objeto contractual prorrogado 4 veces sin nueva instancia competitiva.',
    articulos: ['Ord. 12.585 art. 14'],
    denunciar: ['Tribunal de Cuentas'],
    evidencia: [{ descripcion: '4 prórrogas consecutivas 2020–2023', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/datasets/6467' }],
    w: 0.70,
  },
  {
    id: 's_monopolio_rubro_001', tipologia: 'monopolio_rubro', score: 88, severidad: 'grave',
    label: 'Monopolio de rubro (>70% por una empresa)',
    sub: 'Transporte urbano · Rosario',
    target: { type: 'proveedor', id: '30715123488' },
    resumen: 'TRANSPORTES URBANOS ROSARIO S.R.L. concentra el 78% del gasto del rubro entre 2019-2023.',
    articulos: ['Ley nacional 25.156 art. 1', 'Ord. municipal 9.232'],
    denunciar: ['CNDC', 'Concejo Municipal'],
    evidencia: [{ descripcion: '42 contratos por $1.12B en 5 años', fuenteUrl: 'https://gobiernoabierto.rosario.gob.ar/datasets/501' }],
    w: 0.92,
  },
  {
    id: 's_fraccionamiento_avanzado_001', tipologia: 'fraccionamiento_avanzado', score: 62, severidad: 'moderada',
    label: 'Fraccionamiento sospechoso de obra',
    sub: 'Río Cuarto · Aguas y saneamiento',
    target: { type: 'proveedor', id: '30714998123' },
    resumen: '5 contratos directos del mismo objeto adjudicados en la misma semana, cada uno bajo umbral de licitación.',
    articulos: ['Ley 8835 art. 22'],
    denunciar: ['Tribunal de Cuentas'],
    evidencia: [{ descripcion: '5 directas del mismo proveedor en 7 días', fuenteUrl: 'https://gobiernoabierto.riocuarto.gob.ar/datasets/108' }],
    w: 0.68,
  },
  {
    id: 's_servicio_sin_historial_001', tipologia: 'servicio_sin_historial', score: 55, severidad: 'leve',
    label: 'Proveedor sin historial verificable',
    sub: 'CONSULTORA NORTE ASOC. · Salta',
    target: { type: 'proveedor', id: '33712331121' },
    resumen: 'Empresa con menos de 12 meses de actividad declarada accede a contratos por $340M.',
    articulos: ['Decreto 305/14 art. 9'],
    denunciar: ['Auditoría General'],
    evidencia: [{ descripcion: 'Inicio actividades 17/05/2016 — primer contrato 2016', fuenteUrl: 'https://gobiernoabierto.salta.gob.ar/datasets/214' }],
    w: 0.55,
  },
  {
    id: 's_gasto_fin_ejercicio_001', tipologia: 'gasto_fin_ejercicio', score: 69, severidad: 'moderada',
    label: 'Pico de gasto fin de ejercicio',
    sub: 'Córdoba Capital · Diciembre 2022',
    target: { type: 'jurisdiccion', id: 'cordoba-capital' },
    resumen: '34% del gasto anual ejecutado en diciembre, mayoritariamente por contratación directa.',
    articulos: ['Ley 8835 art. 13'],
    denunciar: ['Tribunal de Cuentas', 'Auditoría General'],
    evidencia: [{ descripcion: '$6.2B ejecutados en 31 días', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/datasets/6500' }],
    w: 0.78,
  },
]

// ─── Construcción del grafo (nodes + edges) ──────────────────────────────────

function buildGraph(): ArgosGraph {
  const nodes: ArgosNode[] = []
  const edges: ArgosEdge[] = []

  // Jurisdicciones
  JUR.forEach((j) => {
    const node: ArgosNode = {
      id: j.id,
      type: 'jurisdiccion' satisfies ArgosNodeType,
      label: j.label,
      subtitle: `${j.prov} · ${j.pop} habitantes`,
      weight: 1.0,
      data: {
        total_contratos: j.contratos,
        monto_total: j.monto,
        anio_min: j.anioMin,
        anio_max: j.anioMax,
        total_señales: j.senales,
        provincia: j.prov,
        poblacion: j.pop,
      },
    }
    nodes.push(node)
  })

  // Proveedores
  PROV.forEach((p) => {
    const node: ArgosNode = {
      id: p.cuit,
      type: 'proveedor' satisfies ArgosNodeType,
      label: p.razon,
      subtitle: `CUIT ${fmtCuit(p.cuit)} · Activo desde ${p.inicio.slice(-4)}`,
      weight: p.w,
      flags: { verificadoAfip: p.verif },
      data: {
        cuit: fmtCuit(p.cuit),
        esEmpleador: true,
        estado: 'ACTIVO',
        inicioActividades: p.inicio,
        actividadPrincipal: p.act,
        montoTotal: p.monto,
        totalContratos: p.n,
        municipios: p.jur,
        fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/datasets/6467',
      },
    }
    nodes.push(node)
  })

  // Directores
  DIR.forEach((d) => {
    const node: ArgosNode = {
      id: d.id,
      type: 'director' satisfies ArgosNodeType,
      label: d.label,
      subtitle: `Director en ${d.empresas.length} empresa${d.empresas.length > 1 ? 's' : ''}`,
      weight: 0.25 + d.empresas.length * 0.08,
      data: { empresas: d.empresas },
    }
    nodes.push(node)
  })

  // Contratos
  CTR.forEach((c) => {
    const prov = PROV.find((p) => p.cuit === c.proveedorCuit)
    const m = c.monto
    const subM = m >= 1e9 ? `${(m / 1e9).toFixed(2)}B` : `${(m / 1e6).toFixed(1)}M`
    const node: ArgosNode = {
      id: c.id,
      type: 'contrato' satisfies ArgosNodeType,
      label: c.descripcion,
      subtitle: `${c.tipo} · ${c.anio} · ARS ${subM}`,
      weight: Math.min(0.9, 0.18 + m / 1.5e9),
      data: {
        tipo: c.tipo,
        monto: c.monto,
        anio: c.anio,
        area: c.area,
        descripcion: c.descripcion,
        proveedor: prov?.razon || '',
        proveedorCuit: fmtCuit(c.proveedorCuit),
        jurId: c.jurId,
        fuenteUrl: c.fuenteUrl,
        numeroExpediente: c.numeroExpediente,
        fechaContrato: c.fechaContrato,
      },
    }
    nodes.push(node)
  })

  // Señales
  SEN.forEach((s) => {
    const node: ArgosNode = {
      id: s.id,
      type: 'señal' satisfies ArgosNodeType,
      label: s.label,
      subtitle: s.sub,
      weight: s.w,
      flags: { severidad: s.severidad },
      data: {
        tipologia: s.tipologia,
        score: s.score,
        resumen: s.resumen,
        legal: {
          articulos: s.articulos,
          severidad: s.severidad,
          denunciarAnte: s.denunciar,
        },
        evidencia: s.evidencia,
        target: s.target,
      },
    }
    nodes.push(node)
  })

  // ─── Edges ───────────────────────────────────────────────────────────────

  // proveedor opera_en jurisdiccion
  PROV.forEach((p) =>
    p.jur.forEach((j) => {
      const edge: ArgosEdge = {
        source: p.cuit,
        target: j,
        kind: 'opera_en' satisfies ArgosEdgeKind,
        weight: Math.min(1, p.w),
      }
      edges.push(edge)
    }),
  )

  // director tiene_director→ proveedor (revertimos: director → proveedor)
  DIR.forEach((d) =>
    d.empresas.forEach((e) => {
      const edge: ArgosEdge = {
        source: d.id,
        target: e,
        kind: 'tiene_director' satisfies ArgosEdgeKind,
        weight: 0.4,
      }
      edges.push(edge)
    }),
  )

  // proveedor gano contrato
  CTR.forEach((c) => {
    const edge: ArgosEdge = {
      source: c.proveedorCuit,
      target: c.id,
      kind: 'gano' satisfies ArgosEdgeKind,
      weight: Math.min(1, c.monto / 1.5e9),
    }
    edges.push(edge)
  })

  // contrato pertenece a jur (proxy — pinta el contrato cerca de su jur)
  CTR.forEach((c) => {
    const edge: ArgosEdge = {
      source: c.id,
      target: c.jurId,
      kind: 'opera_en' satisfies ArgosEdgeKind,
      weight: 0.25,
    }
    edges.push(edge)
  })

  // señal -> target
  SEN.forEach((s) => {
    const edge: ArgosEdge = {
      source: s.id,
      target: (s.target && s.target.id) || JUR[0].id,
      kind: 'señalado_por' satisfies ArgosEdgeKind,
      weight: 0.6,
    }
    edges.push(edge)
  })

  return { nodes, edges }
}

const GRAPH: ArgosGraph = buildGraph()

// ─── Export ──────────────────────────────────────────────────────────────────

export const ArgosMock = { JUR, PROV, DIR, CTR, SEN, GRAPH }
export default ArgosMock

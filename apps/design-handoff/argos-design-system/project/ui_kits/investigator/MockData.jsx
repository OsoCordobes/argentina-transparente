// Sample data for the investigator mock
const MOCK_ENTITIES = [
  { id: 'e1', type: 'Empresa', label: 'TECNOSERV SA', cuit: '30-71234567-9', contracts: 18 },
  { id: 'e2', type: 'Empresa', label: 'CONSTRUCSUR SRL', cuit: '30-70987654-3', contracts: 12 },
  { id: 'e3', type: 'Empresa', label: 'PROVEER SA', cuit: '30-71555333-1', contracts: 7 },
  { id: 'p1', type: 'Persona', label: 'Juan Carlos Pérez', cuit: 'DNI 20.123.456', contracts: 4 },
  { id: 'p2', type: 'Persona', label: 'María Elena López', cuit: 'DNI 18.765.432', contracts: 2 },
  { id: 'c1', type: 'Contrato', label: 'CT-4821/2023 · Pavimentación Ruta S-271', cuit: '$48.200.000', contracts: null },
  { id: 'c2', type: 'Contrato', label: 'CT-3901/2022 · Alumbrado público Zona Oeste', cuit: '$19.800.000', contracts: null },
  { id: 'a1', type: 'Agencia', label: 'Secretaría de Obras Públicas', cuit: 'Municipalidad de Córdoba', contracts: 214 },
];

const MOCK_GRAPH_NODES = [
  { id: 'e1', type: 'Empresa',  label: 'TECNOSERV SA',       x: 380, y: 140 },
  { id: 'a1', type: 'Agencia',  label: 'Secretaría de Obras Públicas', x: 120, y: 200 },
  { id: 'p1', type: 'Persona',  label: 'Juan Carlos Pérez',  x: 640, y: 80 },
  { id: 'c1', type: 'Contrato', label: 'CT-4821/2023',       x: 380, y: 340 },
  { id: 'c2', type: 'Contrato', label: 'CT-3901/2022',       x: 620, y: 280 },
  { id: 'e2', type: 'Empresa',  label: 'CONSTRUCSUR SRL',    x: 140, y: 400 },
];

const MOCK_GRAPH_EDGES = [
  { from: 'a1', to: 'e1', label: 'adjudica' },
  { from: 'a1', to: 'e2', label: 'adjudica' },
  { from: 'e1', to: 'c1', label: 'titular' },
  { from: 'e1', to: 'c2', label: 'titular' },
  { from: 'p1', to: 'e1', label: 'dir.' },
];

const MOCK_SIGNALS = [
  { id: 's1', severity: 'grave', score: 92, title: 'Concentración de proveedor', desc: 'TECNOSERV SA concentra el 74% del gasto de Obras Públicas en el período 2022–2023.', source: 'Portal de Datos Abiertos · 2024' },
  { id: 's2', severity: 'moderada', score: 64, title: 'Fraccionamiento avanzado', desc: '5 contratos directos del mismo proveedor totalizan $24M sin superar el umbral individual.', source: 'Cruce PDA · CT-4821, CT-4822…' },
  { id: 's3', severity: 'moderada', score: 58, title: 'Prórrogas excesivas', desc: '3 de 4 contratos fueron prorrogados sin nuevo proceso competitivo.', source: 'Boletín Oficial Municipal' },
  { id: 's4', severity: 'leve', score: 24, title: 'CUIT sin actividad declarada', desc: 'AFIP reporta estado "exento" durante el período del contrato.', source: 'AFIP · Padrón' },
];

const MOCK_CONTRACTS = [
  { id: 'c1', year: 2023, type: 'Contratación directa', area: 'Obras Públicas',  amount: 48200000 },
  { id: 'c2', year: 2022, type: 'Prórroga',             area: 'Obras Públicas',  amount: 19800000 },
  { id: 'c3', year: 2022, type: 'Contratación directa', area: 'Servicios',       amount:  8450000 },
  { id: 'c4', year: 2021, type: 'Licitación pública',   area: 'Servicios',       amount: 12400000 },
  { id: 'c5', year: 2021, type: 'Contratación directa', area: 'Obras Públicas',  amount:  6230000 },
  { id: 'c6', year: 2019, type: 'Contratación directa', area: 'Salud',           amount:  5100000 },
];

const MOCK_TIMELINE = [
  { year: 2023, items: [
    { entity: 'Empresa',  color: '#f59e0b', t: 'CT-4821/2023 · Pavimentación Ruta S-271', s: 'Adjudicación · TECNOSERV SA', amt: '$48.200.000' },
    { entity: 'Agencia',  color: '#8b5cf6', t: 'Ordenanza 13.099 · Prórroga de régimen',  s: 'Concejo Deliberante', amt: null },
  ]},
  { year: 2022, items: [
    { entity: 'Contrato', color: '#f59e0b', t: 'CT-3901/2022 · Alumbrado público',         s: 'Prórroga · TECNOSERV SA', amt: '$19.800.000' },
    { entity: 'Contrato', color: '#f59e0b', t: 'CT-3612/2022 · Mantenimiento vehicular',   s: 'Contratación directa · PROVEER SA', amt: '$8.450.000' },
  ]},
  { year: 2021, items: [
    { entity: 'Contrato', color: '#3b82f6', t: 'CT-3122/2021 · Servicios generales',       s: 'Licitación pública · CONSTRUCSUR SRL', amt: '$12.400.000' },
  ]},
  { year: 2019, items: [
    { entity: 'Contrato', color: '#10b981', t: 'CT-2201/2019 · Provisión insumos salud',   s: 'Contratación directa · PROVEER SA', amt: '$5.100.000' },
  ]},
];

const MOCK_CHAT = [
  { who: 'bot',  text: 'Soy tu co-investigador IA. ¿Qué querés explorar sobre TECNOSERV SA?' },
  { who: 'user', text: '¿Cuál es el monto total adjudicado en los últimos 5 años?' },
  { who: 'bot',  text: 'TECNOSERV SA recibió $2.847.392.100 en 18 contratos entre 2019 y 2023. El 74% proviene de la Secretaría de Obras Públicas. Hay 2 señales GRAVES y 2 MODERADAS detectadas para esta entidad.' },
];

const fmtARS = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

Object.assign(window, {
  MOCK_ENTITIES, MOCK_GRAPH_NODES, MOCK_GRAPH_EDGES, MOCK_SIGNALS, MOCK_CONTRACTS, MOCK_TIMELINE, MOCK_CHAT, fmtARS,
});

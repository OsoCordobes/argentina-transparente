// Rich mock data for the ARGOS investigator prototype
// Based on the ui_kits/investigator mock data but expanded with richer
// graph, signals, evidence, timeline, alerts, and boards.

const fmtARS = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const fmtARSshort = (n) => {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1).replace('.', ',') + ' MM';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + ' K';
  return '$' + n;
};

// ── Entities ────────────────────────────────────────────────────────────────
const ENTITIES = {
  'e1': { id: 'e1', type: 'Empresa',  label: 'TECNOSERV SA',        cuit: '30-71234567-9', founded: 2014, employees: 12, estado: 'activa',  contracts: 18, total: 2847392100 },
  'e2': { id: 'e2', type: 'Empresa',  label: 'CONSTRUCSUR SRL',     cuit: '30-70987654-3', founded: 2011, employees: 38, estado: 'activa',  contracts: 12, total: 1124500000 },
  'e3': { id: 'e3', type: 'Empresa',  label: 'PROVEER SA',          cuit: '30-71555333-1', founded: 2019, employees: 3,  estado: 'activa',  contracts:  7, total:  412800000 },
  'e4': { id: 'e4', type: 'Empresa',  label: 'GRUPO VIAL CENTRO SA',cuit: '30-71888222-4', founded: 2021, employees: 0,  estado: 'activa',  contracts:  3, total:  187200000 },
  'e5': { id: 'e5', type: 'Empresa',  label: 'SERVIAMBIENTE SRL',   cuit: '30-70445566-7', founded: 2008, employees: 54, estado: 'activa',  contracts:  9, total:  631000000 },
  'p1': { id: 'p1', type: 'Persona',  label: 'Juan Carlos Pérez',   cuit: 'DNI 20.123.456', role: 'Director', directorships: ['e1','e4'] },
  'p2': { id: 'p2', type: 'Persona',  label: 'María Elena López',   cuit: 'DNI 18.765.432', role: 'Directora suplente', directorships: ['e1'] },
  'p3': { id: 'p3', type: 'Persona',  label: 'Rodrigo Suárez',      cuit: 'DNI 25.334.221', role: 'Director', directorships: ['e3','e4'] },
  'p4': { id: 'p4', type: 'Persona',  label: 'Alicia Ferreyra',     cuit: 'DNI 14.998.112', role: 'Funcionaria', cargo: 'Secretaria de Obras Públicas 2019–2023' },
  'c1': { id: 'c1', type: 'Contrato', label: 'CT-4821/2023',        desc: 'Pavimentación Ruta S-271', amount: 48200000, year: 2023, tipo: 'Contratación directa' },
  'c2': { id: 'c2', type: 'Contrato', label: 'CT-3901/2022',        desc: 'Alumbrado público Zona Oeste', amount: 19800000, year: 2022, tipo: 'Prórroga' },
  'c3': { id: 'c3', type: 'Contrato', label: 'CT-3612/2022',        desc: 'Mantenimiento vehicular',  amount:  8450000, year: 2022, tipo: 'Contratación directa' },
  'c4': { id: 'c4', type: 'Contrato', label: 'CT-3122/2021',        desc: 'Servicios generales',       amount: 12400000, year: 2021, tipo: 'Licitación pública' },
  'c5': { id: 'c5', type: 'Contrato', label: 'CT-2844/2021',        desc: 'Bacheo y reparación',       amount:  6230000, year: 2021, tipo: 'Contratación directa' },
  'c6': { id: 'c6', type: 'Contrato', label: 'CT-2201/2019',        desc: 'Provisión insumos salud',   amount:  5100000, year: 2019, tipo: 'Contratación directa' },
  'c7': { id: 'c7', type: 'Contrato', label: 'CT-4901/2023',        desc: 'Recolección residuos',      amount: 92400000, year: 2023, tipo: 'Licitación pública' },
  'a1': { id: 'a1', type: 'Agencia',  label: 'Secretaría de Obras Públicas', sub: 'Municipalidad de Córdoba', contracts: 214 },
  'a2': { id: 'a2', type: 'Agencia',  label: 'Secretaría de Ambiente',       sub: 'Municipalidad de Córdoba', contracts:  88 },
  'm1': { id: 'm1', type: 'Municipio', label: 'Córdoba Capital',              sub: 'Provincia de Córdoba' },
  'd1': { id: 'd1', type: 'Donacion', label: 'Aporte campaña 2019', amount: 2400000, year: 2019 },
};

const ENT_LIST = Object.values(ENTITIES);

// ── Graph for TECNOSERV SA investigation ────────────────────────────────────
// Layout is recomputed per-concept, but base adjacency is stable.
const EDGES = [
  { from: 'a1', to: 'e1', label: 'adjudica',   weight: 3 },
  { from: 'a1', to: 'e2', label: 'adjudica',   weight: 2 },
  { from: 'a1', to: 'e5', label: 'adjudica',   weight: 1 },
  { from: 'a2', to: 'e5', label: 'adjudica',   weight: 2 },
  { from: 'a2', to: 'e3', label: 'adjudica',   weight: 1 },
  { from: 'e1', to: 'c1', label: 'titular',    weight: 2 },
  { from: 'e1', to: 'c2', label: 'titular',    weight: 2 },
  { from: 'e2', to: 'c4', label: 'titular',    weight: 1 },
  { from: 'e3', to: 'c3', label: 'titular',    weight: 1 },
  { from: 'e3', to: 'c6', label: 'titular',    weight: 1 },
  { from: 'e4', to: 'c5', label: 'titular',    weight: 1 },
  { from: 'e5', to: 'c7', label: 'titular',    weight: 2 },
  { from: 'p1', to: 'e1', label: 'director',   weight: 3 },
  { from: 'p1', to: 'e4', label: 'director',   weight: 2 },
  { from: 'p2', to: 'e1', label: 'dir. supl.', weight: 1 },
  { from: 'p3', to: 'e3', label: 'director',   weight: 2 },
  { from: 'p3', to: 'e4', label: 'director',   weight: 2 },
  { from: 'p4', to: 'a1', label: 'titular',    weight: 3 },
  { from: 'p4', to: 'd1', label: 'recibe',     weight: 2 },
  { from: 'e1', to: 'd1', label: 'aporta',     weight: 3 },
  { from: 'm1', to: 'a1', label: 'depende',    weight: 1 },
  { from: 'm1', to: 'a2', label: 'depende',    weight: 1 },
];

// ── Signals (risk findings) ─────────────────────────────────────────────────
const SIGNALS = [
  {
    id: 's1', severity: 'grave', score: 92,
    tipologia: 'concentracion_proveedor',
    title: 'Concentración de proveedor',
    subject: 'e1',
    desc: 'TECNOSERV SA concentra el 74% del gasto de la Secretaría de Obras Públicas en el período 2022–2023.',
    evidence: ['CT-4821/2023', 'CT-3901/2022', 'Dataset PDA 2022', 'Dataset PDA 2023'],
    source: 'Portal de Datos Abiertos · Municipalidad de Córdoba',
    norma: 'Ley 2095 · Art. 10 (principio de concurrencia)',
    date: '2024-09-12',
  },
  {
    id: 's2', severity: 'grave', score: 88,
    tipologia: 'captura_politica',
    title: 'Aportante y contratista',
    subject: 'e1',
    desc: 'La empresa aportó $2,4M a la campaña 2019 y recibió $2.847M en contratos durante la gestión siguiente.',
    evidence: ['Declaración CNE 2019', 'CT-4821/2023', 'CT-3901/2022'],
    source: 'Cámara Nacional Electoral · CNE',
    norma: 'Ley 26.215 · Art. 44 (financiamiento de partidos)',
    date: '2024-09-10',
  },
  {
    id: 's3', severity: 'moderada', score: 68,
    tipologia: 'fraccionamiento_avanzado',
    title: 'Fraccionamiento avanzado',
    subject: 'e3',
    desc: '5 contratos directos del mismo proveedor totalizan $24M sin superar el umbral individual por $5M.',
    evidence: ['CT-3612/2022', 'CT-3614/2022', 'CT-3619/2022', 'CT-3622/2022', 'CT-3625/2022'],
    source: 'Cruce PDA · auto-detectado',
    norma: 'Ordenanza Municipal 12.884 · umbral contratación directa',
    date: '2024-09-08',
  },
  {
    id: 's4', severity: 'moderada', score: 64,
    tipologia: 'empresa_sin_empleados',
    title: 'Empresa sin empleados declarados',
    subject: 'e4',
    desc: 'GRUPO VIAL CENTRO SA recibió $187M con 0 empleados registrados en AFIP.',
    evidence: ['AFIP Padrón 2023', 'CT-2844/2021'],
    source: 'AFIP · cruce automático',
    norma: 'Ley 19.549 · verificación de capacidad operativa',
    date: '2024-09-06',
  },
  {
    id: 's5', severity: 'moderada', score: 58,
    tipologia: 'red_de_empresas',
    title: 'Red de empresas con directores compartidos',
    subject: 'e1',
    desc: '3 empresas (TECNOSERV, PROVEER, GRUPO VIAL CENTRO) comparten directores y reciben contratos de la misma secretaría.',
    evidence: ['Juan Carlos Pérez (e1, e4)', 'Rodrigo Suárez (e3, e4)'],
    source: 'IGJ · cruce Neo4j',
    norma: 'Ley 19.550 · Art. 33 (sociedades vinculadas)',
    date: '2024-09-05',
  },
  {
    id: 's6', severity: 'leve', score: 32,
    tipologia: 'prorrogas_excesivas',
    title: 'Prórrogas excesivas',
    subject: 'e1',
    desc: '3 de 4 contratos fueron prorrogados sin nuevo proceso competitivo.',
    evidence: ['CT-3901/2022', 'CT-3612/2022'],
    source: 'Boletín Oficial Municipal',
    norma: 'Ordenanza 12.884 · Art. 27',
    date: '2024-09-03',
  },
  {
    id: 's7', severity: 'leve', score: 24,
    tipologia: 'cuit_sin_actividad',
    title: 'CUIT con actividad intermitente',
    subject: 'e3',
    desc: 'PROVEER SA aparece como "exento" durante parte del período de ejecución del contrato.',
    evidence: ['AFIP Padrón 2022 Q3'],
    source: 'AFIP · Padrón',
    norma: 'RG AFIP 1415',
    date: '2024-09-01',
  },
];

// ── Alerts feed (what changed since last visit) ─────────────────────────────
const ALERTS = [
  { id: 'al1', when: 'hace 2 h',  severity: 'grave',    title: 'Nueva adjudicación a TECNOSERV SA',      desc: 'CT-5012/2024 · $68.400.000 · Contratación directa',      source: 'PDA Córdoba' },
  { id: 'al2', when: 'hace 5 h',  severity: 'moderada', title: 'Umbral de fraccionamiento superado',     desc: 'PROVEER SA acumula 6 contratos directos en el trimestre.', source: 'Motor de señales' },
  { id: 'al3', when: 'ayer',      severity: 'leve',     title: 'Cambio de directorio en GRUPO VIAL CENTRO', desc: 'Se incorpora nuevo director: Daniel Ibáñez.',            source: 'IGJ · Boletín' },
  { id: 'al4', when: 'ayer',      severity: 'moderada', title: 'Boletín Oficial menciona CT-4821/2023',  desc: 'Prórroga publicada sin proceso competitivo nuevo.',        source: 'Boletín Municipal' },
  { id: 'al5', when: 'hace 2 d',  severity: 'grave',    title: 'Aporte de campaña 2023 declarado',       desc: 'TECNOSERV SA figura como aportante · $4.200.000',          source: 'CNE' },
];

// ── Saved boards (investigations) ───────────────────────────────────────────
const BOARDS = [
  { id: 'b1', title: 'Pavimentación Ruta S-271',       owner: 'vos',      updated: 'hace 20 min', entities: 14, signals: 7,  status: 'activa'   },
  { id: 'b2', title: 'Recolección de residuos 2020–24', owner: 'M. Torres', updated: 'hace 2 h',   entities: 28, signals: 12, status: 'activa'   },
  { id: 'b3', title: 'Aportes de campaña · Córdoba',    owner: 'vos',      updated: 'ayer',       entities: 41, signals: 19, status: 'pausada'  },
  { id: 'b4', title: 'Compras salud 2019–2023',         owner: 'J. Rivera', updated: 'hace 3 d',   entities: 62, signals: 23, status: 'archivada'},
];

// ── Timeline events for selected entity (TECNOSERV SA) ──────────────────────
const TIMELINE = [
  { year: 2014, items: [{ kind: 'hito',      t: 'Constitución de TECNOSERV SA',             s: 'IGJ · CUIT 30-71234567-9' }]},
  { year: 2019, items: [
    { kind: 'donacion', t: 'Aporte de campaña',                      s: '$2.400.000 · Campaña 2019',       amt: 2400000 },
    { kind: 'contrato', t: 'CT-2201/2019 · Provisión insumos salud', s: 'Contratación directa',           amt: 5100000 },
  ]},
  { year: 2021, items: [
    { kind: 'contrato', t: 'CT-3122/2021 · Servicios generales',     s: 'Licitación pública',              amt: 12400000 },
    { kind: 'contrato', t: 'CT-2844/2021 · Bacheo y reparación',     s: 'Contratación directa',            amt: 6230000 },
  ]},
  { year: 2022, items: [
    { kind: 'contrato', t: 'CT-3901/2022 · Alumbrado público',       s: 'Prórroga',                        amt: 19800000 },
    { kind: 'contrato', t: 'CT-3612/2022 · Mantenimiento vehicular', s: 'Contratación directa',            amt: 8450000 },
    { kind: 'signal',   t: 'Señal detectada: fraccionamiento',       s: 'Moderada · score 68',             severity: 'moderada' },
  ]},
  { year: 2023, items: [
    { kind: 'contrato', t: 'CT-4821/2023 · Pavimentación Ruta S-271', s: 'Contratación directa',           amt: 48200000 },
    { kind: 'contrato', t: 'CT-4901/2023 · Recolección residuos',    s: 'Licitación pública',              amt: 92400000 },
    { kind: 'signal',   t: 'Señal detectada: concentración',         s: 'Grave · score 92',                severity: 'grave' },
    { kind: 'signal',   t: 'Señal detectada: aportante+contratista', s: 'Grave · score 88',                severity: 'grave' },
  ]},
  { year: 2024, items: [
    { kind: 'contrato', t: 'CT-5012/2024 · Nueva adjudicación',      s: 'Contratación directa · reciente', amt: 68400000 },
  ]},
];

// Spend by year (for Sparkline on entity cards)
const SPEND_BY_YEAR = [
  { y: 2019, v:   5100000 },
  { y: 2020, v:         0 },
  { y: 2021, v:  18630000 },
  { y: 2022, v:  28250000 },
  { y: 2023, v: 140600000 },
  { y: 2024, v:  68400000 },
];

// ── Pre-seeded AI conversation (scripted fallback if no Claude key) ─────────
const CHAT_SEED = [
  {
    who: 'bot',
    text: 'Hola. Soy tu co-investigador. Esta investigación se enfoca en **TECNOSERV SA** y su relación con la Secretaría de Obras Públicas de Córdoba Capital. Hay **2 señales graves** y **3 moderadas** detectadas. ¿Por dónde querés empezar?',
    suggestions: ['Explicá la señal de concentración', '¿Quiénes son los directores?', 'Generar dossier preliminar'],
  },
];

// Expose everything globally for cross-script access (Babel-scope workaround)
Object.assign(window, {
  ENTITIES, ENT_LIST, EDGES, SIGNALS, ALERTS, BOARDS, TIMELINE, SPEND_BY_YEAR, CHAT_SEED,
  fmtARS, fmtARSshort,
});

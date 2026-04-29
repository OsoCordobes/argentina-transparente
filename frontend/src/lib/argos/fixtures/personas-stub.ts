// Fixtures sintéticas para el Profile stub (PLAN-UI §3 + Stub-2).
// CUITs calculados con módulo-11 (todos validan vía validarCUIT del backend).
//
// Personajes diseñados para ejercitar los 4 estados del badge de verificación
// y los flujos de cross-actor del PLAN-UI:
//
//   FERNANDEZ MARIA      — funcionaria activa Córdoba Capital, sin señales
//                          (caso de control)
//   PEREZ CARLOS         — ex-funcionario provincial → director PJ proveedora
//                          (conflicto sin_verificar)
//   GIMENEZ JUANA        — concejala con aporte de campaña + señal verificada
//
//   CONSTRUCTORA DEL CENTRO S.A. — empresa Córdoba, contratos municipales,
//                                  sin señales (control)
//   SERVICIOS INTEGRALES SUR S.R.L. — empresa Córdoba, contratos municipales,
//                                     director es PEREZ → señal sin_verificar
//   LOGISTICA NACIONAL S.A.        — empresa CABA, no Córdoba, ejemplifica
//                                     el filtro geográfico de Fase C1
//
// IMPORTANTE: estos datos NO se cargan a la DB. Solo viven en el cliente
// para alimentar el stub del Profile. Las queries reales se enchufan en
// Fase A4-A6 (backfill) + UI real.

import type { PersonaFisica, PersonaJuridica } from '../types'

// ─── Personas Físicas (DNIs sintéticos, CUITs validados módulo-11) ────────────

export const FIXTURE_FERNANDEZ_MARIA: PersonaFisica = {
  dni: '24563128',
  cuit: '27-24563128-1', // verificado: prefijo 27 + DNI + DV módulo-11 = 1
  apellidoNombre: 'FERNANDEZ, María Alejandra',
  apellidoNombreNorm: 'FERNANDEZ MARIA ALEJANDRA',
  fuentesUrl: [
    'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/85',
    'https://gobiernoabierto.cordoba.gob.ar/agentes-publicos/2024',
  ],
  fuenteDniUrl: 'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/85',
  primerVisto: '2018-03-12T00:00:00Z',
  ultimoVisto: '2026-04-15T00:00:00Z',
  cargosPublicos: [
    {
      jurisdiccion: 'cordoba-capital',
      reparticion: 'Secretaría de Hacienda',
      cargo: 'Directora de Tesorería',
      vigenteDesde: '2020-01-01',
      vigenteHasta: null,
      brutoMensual: 1850000,
      fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/agentes-publicos/2024',
    },
    {
      jurisdiccion: 'cordoba-capital',
      reparticion: 'Secretaría de Hacienda',
      cargo: 'Jefa de Departamento Contable',
      vigenteDesde: '2018-03-12',
      vigenteHasta: '2019-12-31',
      brutoMensual: 1100000,
      fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/agentes-publicos/2018',
    },
  ],
  direccionesEmpresas: [],
  ddjj: [
    { anio: 2023, montoDeclarado: 18500000, pdfUrl: 'https://example.test/ddjj/fernandez-2023.pdf', cuitDeclarante: '27-24563128-1', dniDeclarante: '24563128', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/declaraciones/85' },
    { anio: 2022, montoDeclarado: 16200000, pdfUrl: 'https://example.test/ddjj/fernandez-2022.pdf', cuitDeclarante: '27-24563128-1', dniDeclarante: '24563128', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/declaraciones/85' },
    { anio: 2021, montoDeclarado: 14100000, pdfUrl: 'https://example.test/ddjj/fernandez-2021.pdf', cuitDeclarante: '27-24563128-1', dniDeclarante: '24563128', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/declaraciones/85' },
  ],
  aportesCampana: [],
  señales: [], // caso de control: funcionaria limpia, sin alertas
  jurisdiccionPrimaria: 'cordoba-capital',
  badges: ['Funcionaria activa', 'Declarante DJP'],
}

export const FIXTURE_PEREZ_CARLOS: PersonaFisica = {
  dni: '14289301',
  cuit: '20-14289301-1',
  apellidoNombre: 'PEREZ, Carlos Demetrio',
  apellidoNombreNorm: 'PEREZ CARLOS DEMETRIO',
  fuentesUrl: [
    'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/281',
    'https://igj.gob.ar/autoridades/14289301',
  ],
  fuenteDniUrl: 'https://igj.gob.ar/autoridades/14289301',
  primerVisto: '2015-06-01T00:00:00Z',
  ultimoVisto: '2026-04-20T00:00:00Z',
  cargosPublicos: [
    {
      jurisdiccion: 'cordoba-provincia',
      reparticion: 'Ministerio de Obras Públicas',
      cargo: 'Subsecretario de Infraestructura',
      vigenteDesde: '2018-12-10',
      vigenteHasta: '2020-12-09',
      brutoMensual: 2400000,
      fuenteUrl: 'https://gobiernoabierto.cba.gov.ar/agentes/281',
    },
  ],
  direccionesEmpresas: [
    {
      cuitEmpresa: '30-68923451-4',
      razonSocial: 'SERVICIOS INTEGRALES SUR S.R.L.',
      tipoCargo: 'Director Titular',
      vigenteDesde: '2021-03-15',
      vigenteHasta: null,
      fuenteUrl: 'https://igj.gob.ar/sociedades/30-68923451-4/autoridades',
    },
  ],
  ddjj: [
    { anio: 2020, montoDeclarado: 9800000, pdfUrl: 'https://example.test/ddjj/perez-2020.pdf', cuitDeclarante: '20-14289301-1', dniDeclarante: '14289301', fuenteUrl: 'https://gobiernoabierto.cba.gov.ar/declaraciones/85' },
  ],
  aportesCampana: [],
  señales: [
    {
      id: 'sig-stub-conflicto-perez-001',
      titulo: 'Conflicto potencial: PEREZ CARLOS (cordoba-provincia ex) y SERVICIOS INTEGRALES SUR ($XXX M)',
      resumen: 'Ex-funcionario provincial figura como director de empresa proveedora de la municipalidad. Requiere verificación de DNI vs. director IGJ y temporalidad de cargos.',
      tipologia: 'conflicto_funcionario_proveedor',
      score: 78,
      severidad: 'grave',
      estadoVerificacion: 'sin_verificar', // ◌ amarillo del badge
      verificadoPor: null,
      verificadoEn: null,
      evidencia: [
        { descripcion: 'PEREZ figura en agentes_publicos provinciales 2018-2020.', fuenteUrl: 'https://gobiernoabierto.cba.gov.ar/agentes/281' },
        { descripcion: 'PEREZ figura como Director Titular de SERVICIOS INTEGRALES SUR desde 2021-03-15.', fuenteUrl: 'https://igj.gob.ar/sociedades/30-68923451-4/autoridades' },
        { descripcion: 'SERVICIOS INTEGRALES SUR firmó 3 contratos con Municipalidad de Córdoba 2022-2024.', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos' },
      ],
      legal: {
        articulos: [
          'Ley 25.188 — Ética Pública: incompatibilidades por interés económico (art. 13-15)',
          'Ley Provincial 8.835 — Carta del Ciudadano: prohibición de conflicto de intereses',
        ],
        severidad: 'grave',
        denunciarAnte: ['Tribunal de Cuentas de Córdoba', 'Fiscalía de Estado de Córdoba'],
      },
    },
  ],
  jurisdiccionPrimaria: 'cordoba-provincia',
  badges: ['Ex-funcionario', 'Director sociedad'],
}

export const FIXTURE_GIMENEZ_JUANA: PersonaFisica = {
  dni: '18567892',
  cuit: '27-18567892-5',
  apellidoNombre: 'GIMENEZ, Juana Aydee',
  apellidoNombreNorm: 'GIMENEZ JUANA AYDEE',
  fuentesUrl: [
    'https://gobiernoabierto.cordoba.gob.ar/concejo-deliberante',
    'https://aportantes.electoral.gob.ar/aportes/2023',
  ],
  fuenteDniUrl: 'https://aportantes.electoral.gob.ar/aportes/2023',
  primerVisto: '2019-12-10T00:00:00Z',
  ultimoVisto: '2026-04-25T00:00:00Z',
  cargosPublicos: [
    {
      jurisdiccion: 'cordoba-capital',
      reparticion: 'Concejo Deliberante',
      cargo: 'Concejala',
      vigenteDesde: '2019-12-10',
      vigenteHasta: null,
      brutoMensual: 1900000,
      fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/concejo-deliberante',
    },
  ],
  direccionesEmpresas: [],
  ddjj: [
    { anio: 2023, montoDeclarado: 22000000, pdfUrl: 'https://example.test/ddjj/gimenez-2023.pdf', cuitDeclarante: '27-18567892-5', dniDeclarante: '18567892', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/declaraciones/85' },
  ],
  aportesCampana: [
    {
      anioElectoral: 2023,
      partido: 'Frente Cordobés Renovador',
      alianza: null,
      monto: 450000,
      tipoAporte: 'monetario',
      fechaAporte: '2023-08-12',
      fuenteUrl: 'https://aportantes.electoral.gob.ar/aportes/2023/cordoba',
    },
  ],
  señales: [
    {
      id: 'sig-stub-aportante-gimenez-001',
      titulo: 'Concejala aportante a campaña + LOGISTICA NACIONAL gana contrato municipal',
      resumen: 'GIMENEZ aportó $450K al Frente Cordobés Renovador en 2023. Una empresa con CUIT registrado a un aportante del MISMO partido recibió contrato municipal post-electoral. Cruz por CUIT verificado.',
      tipologia: 'aportante_de_campana_y_proveedor',
      score: 88,
      severidad: 'grave',
      estadoVerificacion: 'verificada', // ✓ verde del badge
      verificadoPor: 'auditor@argos.test',
      verificadoEn: '2026-03-15T14:22:00Z',
      evidencia: [
        { descripcion: 'GIMENEZ aportó $450K a Frente Cordobés Renovador en 2023.', fuenteUrl: 'https://aportantes.electoral.gob.ar/aportes/2023/cordoba' },
        { descripcion: 'LOGISTICA NACIONAL S.A. (CUIT 33-50012345-7) figura entre aportantes del MISMO partido.', fuenteUrl: 'https://aportantes.electoral.gob.ar/aportes/2023/cordoba' },
        { descripcion: 'LOGISTICA NACIONAL ganó contrato municipal por $14M en febrero 2024.', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos/2024' },
      ],
      legal: {
        articulos: [
          'Ley 26.215 — Financiamiento de los Partidos Políticos',
          'Ley 25.188 — Ética Pública',
        ],
        severidad: 'grave',
        denunciarAnte: ['Cámara Nacional Electoral', 'Tribunal de Cuentas de Córdoba'],
      },
    },
  ],
  jurisdiccionPrimaria: 'cordoba-capital',
  badges: ['Concejala', 'Declarante DJP', 'Aportante 2023'],
}

// ─── Personas Jurídicas (CUITs validados módulo-11) ──────────────────────────

export const FIXTURE_CONSTRUCTORA_CENTRO: PersonaJuridica = {
  cuit: '30-71234567-1',
  razonSocial: 'CONSTRUCTORA DEL CENTRO S.A.',
  razonSocialNorm: 'CONSTRUCTORA DEL CENTRO',
  alias: ['Constructora del Centro', 'CDCSA'],
  tipoSocietario: 'SA',
  fechaConstitucion: '2008-04-22',
  domFiscalProvincia: 'CORDOBA',
  domFiscalLocalidad: 'CORDOBA',
  domLegalProvincia: 'CORDOBA',
  domLegalLocalidad: 'CORDOBA',
  estado: 'activa',
  esEmpleador: true,
  actividadPrincipal: 'Construcción de obras de ingeniería civil',
  fuentesUrl: [
    'https://igj.gob.ar/sociedades/30-71234567-1',
    'https://datos.jus.gob.ar/dataset/registro-nacional-de-sociedades',
  ],
  primerVisto: '2008-04-22T00:00:00Z',
  ultimoVisto: '2026-04-20T00:00:00Z',
  contratos: [
    { hash: 'h-stub-cdc-001', jurisdiccion: 'cordoba-capital', anio: 2024, partidaPresupuestaria: '5.1.2', programaPresupuestario: 'Programa 311 — Vialidad Urbana', monto: 8500000, area: 'Secretaría de Obras Públicas', tipo: 'Licitación Pública', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos/2024/cdc-001' },
    { hash: 'h-stub-cdc-002', jurisdiccion: 'cordoba-capital', anio: 2023, partidaPresupuestaria: '5.1.2', programaPresupuestario: 'Programa 311 — Vialidad Urbana', monto: 6200000, area: 'Secretaría de Obras Públicas', tipo: 'Licitación Pública', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos/2023/cdc-002' },
    { hash: 'h-stub-cdc-003', jurisdiccion: 'cordoba-capital', anio: 2022, partidaPresupuestaria: '5.1.4', programaPresupuestario: 'Programa 312 — Mantenimiento', monto: 4100000, area: 'Secretaría de Obras Públicas', tipo: 'Compulsa Abreviada', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos/2022/cdc-003' },
    { hash: 'h-stub-cdc-004', jurisdiccion: 'cordoba-capital', anio: 2021, partidaPresupuestaria: '5.1.4', programaPresupuestario: 'Programa 312 — Mantenimiento', monto: 3800000, area: 'Secretaría de Obras Públicas', tipo: 'Licitación Pública', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos/2021/cdc-004' },
    { hash: 'h-stub-cdc-005', jurisdiccion: 'cordoba-provincia', anio: 2020, partidaPresupuestaria: '4.2.1', programaPresupuestario: 'Programa 415 — Aulas Provinciales', monto: 11000000, area: 'Ministerio de Obras Públicas', tipo: 'Licitación Pública', fuenteUrl: 'https://gobiernoabierto.cba.gov.ar/contratos/2020/cdc-005' },
  ],
  pagos: [
    { fechaPago: '2024-09-30', monto: 8500000, contratoHash: 'h-stub-cdc-001', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/pagos/2024/cdc-001' },
    { fechaPago: '2023-12-15', monto: 6200000, contratoHash: 'h-stub-cdc-002', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/pagos/2023/cdc-002' },
  ],
  directores: [
    { dni: '13456789', apellidoNombre: 'TORRES, Pablo Ernesto', tipoCargo: 'Presidente', vigenteDesde: '2008-04-22', vigenteHasta: null, fuenteUrl: 'https://igj.gob.ar/sociedades/30-71234567-1/autoridades' },
    { dni: '15234890', apellidoNombre: 'TORRES, Esteban', tipoCargo: 'Vicepresidente', vigenteDesde: '2008-04-22', vigenteHasta: null, fuenteUrl: 'https://igj.gob.ar/sociedades/30-71234567-1/autoridades' },
  ],
  aportesHechos: [],
  transferenciasRecibidas: [],
  señales: [], // caso de control sin señales
}

export const FIXTURE_SERVICIOS_INTEGRALES_SUR: PersonaJuridica = {
  cuit: '30-68923451-4',
  razonSocial: 'SERVICIOS INTEGRALES SUR S.R.L.',
  razonSocialNorm: 'SERVICIOS INTEGRALES SUR',
  alias: ['SISSRL'],
  tipoSocietario: 'SRL',
  fechaConstitucion: '2019-11-30',
  domFiscalProvincia: 'CORDOBA',
  domFiscalLocalidad: 'CORDOBA',
  domLegalProvincia: 'CORDOBA',
  domLegalLocalidad: 'CORDOBA',
  estado: 'activa',
  esEmpleador: true,
  actividadPrincipal: 'Servicios empresariales NCP',
  fuentesUrl: [
    'https://igj.gob.ar/sociedades/30-68923451-4',
  ],
  primerVisto: '2019-11-30T00:00:00Z',
  ultimoVisto: '2026-04-22T00:00:00Z',
  contratos: [
    { hash: 'h-stub-sis-001', jurisdiccion: 'cordoba-capital', anio: 2024, partidaPresupuestaria: '3.4.5', programaPresupuestario: 'Programa 207 — Servicios Generales', monto: 5400000, area: 'Secretaría de Servicios Públicos', tipo: 'Contratación Directa', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos/2024/sis-001' },
    { hash: 'h-stub-sis-002', jurisdiccion: 'cordoba-capital', anio: 2023, partidaPresupuestaria: '3.4.5', programaPresupuestario: 'Programa 207 — Servicios Generales', monto: 4900000, area: 'Secretaría de Servicios Públicos', tipo: 'Contratación Directa', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos/2023/sis-002' },
    { hash: 'h-stub-sis-003', jurisdiccion: 'cordoba-capital', anio: 2022, partidaPresupuestaria: '3.4.5', programaPresupuestario: 'Programa 207 — Servicios Generales', monto: 3200000, area: 'Secretaría de Servicios Públicos', tipo: 'Contratación Directa', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos/2022/sis-003' },
  ],
  pagos: [
    { fechaPago: '2024-08-22', monto: 5400000, contratoHash: 'h-stub-sis-001', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/pagos/2024/sis-001' },
  ],
  directores: [
    { dni: '14289301', apellidoNombre: 'PEREZ, Carlos Demetrio', tipoCargo: 'Director Titular', vigenteDesde: '2021-03-15', vigenteHasta: null, fuenteUrl: 'https://igj.gob.ar/sociedades/30-68923451-4/autoridades' },
  ],
  aportesHechos: [],
  transferenciasRecibidas: [],
  señales: [
    {
      id: 'sig-stub-conflicto-perez-001', // mismo id que en PEREZ — la señal aparece en ambos perfiles
      titulo: 'Conflicto potencial: PEREZ CARLOS (cordoba-provincia ex) y SERVICIOS INTEGRALES SUR ($XXX M)',
      resumen: 'Ex-funcionario provincial figura como director de empresa proveedora de la municipalidad. Requiere verificación de DNI vs. director IGJ y temporalidad de cargos.',
      tipologia: 'conflicto_funcionario_proveedor',
      score: 78,
      severidad: 'grave',
      estadoVerificacion: 'sin_verificar',
      verificadoPor: null,
      verificadoEn: null,
      evidencia: [
        { descripcion: 'PEREZ figura en agentes_publicos provinciales 2018-2020.', fuenteUrl: 'https://gobiernoabierto.cba.gov.ar/agentes/281' },
        { descripcion: 'PEREZ figura como Director Titular de SERVICIOS INTEGRALES SUR desde 2021-03-15.', fuenteUrl: 'https://igj.gob.ar/sociedades/30-68923451-4/autoridades' },
        { descripcion: 'SERVICIOS INTEGRALES SUR firmó 3 contratos con Municipalidad de Córdoba 2022-2024.', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos' },
      ],
      legal: {
        articulos: [
          'Ley 25.188 — Ética Pública: incompatibilidades por interés económico (art. 13-15)',
          'Ley Provincial 8.835 — Carta del Ciudadano: prohibición de conflicto de intereses',
        ],
        severidad: 'grave',
        denunciarAnte: ['Tribunal de Cuentas de Córdoba', 'Fiscalía de Estado de Córdoba'],
      },
    },
  ],
}

export const FIXTURE_LOGISTICA_NACIONAL: PersonaJuridica = {
  cuit: '33-50012345-7',
  razonSocial: 'LOGISTICA NACIONAL S.A.',
  razonSocialNorm: 'LOGISTICA NACIONAL',
  alias: [],
  tipoSocietario: 'SA',
  fechaConstitucion: '2005-09-15',
  // Empresa con domicilio fiscal en CABA — activa filtro geográfico de C1
  domFiscalProvincia: 'CIUDAD AUTONOMA DE BUENOS AIRES',
  domFiscalLocalidad: 'CABA',
  domLegalProvincia: 'CIUDAD AUTONOMA DE BUENOS AIRES',
  domLegalLocalidad: 'CABA',
  estado: 'activa',
  esEmpleador: true,
  actividadPrincipal: 'Servicios de transporte de carga',
  fuentesUrl: [
    'https://igj.gob.ar/sociedades/33-50012345-7',
  ],
  primerVisto: '2005-09-15T00:00:00Z',
  ultimoVisto: '2026-04-15T00:00:00Z',
  contratos: [
    { hash: 'h-stub-log-001', jurisdiccion: 'cordoba-capital', anio: 2024, partidaPresupuestaria: '2.1.1', programaPresupuestario: 'Programa 105 — Logística Municipal', monto: 14000000, area: 'Secretaría de Servicios Públicos', tipo: 'Licitación Privada', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos/2024/log-001' },
  ],
  pagos: [
    { fechaPago: '2024-06-10', monto: 14000000, contratoHash: 'h-stub-log-001', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/pagos/2024/log-001' },
  ],
  directores: [
    { dni: '11567432', apellidoNombre: 'RODRIGUEZ, Eduardo Antonio', tipoCargo: 'Presidente', vigenteDesde: '2005-09-15', vigenteHasta: null, fuenteUrl: 'https://igj.gob.ar/sociedades/33-50012345-7/autoridades' },
  ],
  aportesHechos: [
    {
      anioElectoral: 2023,
      partido: 'Frente Cordobés Renovador',
      alianza: null,
      monto: 1200000,
      tipoAporte: 'monetario',
      fechaAporte: '2023-09-05',
      fuenteUrl: 'https://aportantes.electoral.gob.ar/aportes/2023/cordoba',
    },
  ],
  transferenciasRecibidas: [],
  señales: [
    {
      id: 'sig-stub-aportante-gimenez-001',
      titulo: 'Concejala aportante a campaña + LOGISTICA NACIONAL gana contrato municipal',
      resumen: 'LOGISTICA NACIONAL aportó $1.2M al Frente Cordobés Renovador en septiembre 2023. En febrero 2024 ganó contrato municipal por $14M con jurisdicción cordobesa donde la concejala GIMENEZ del mismo partido tiene cargo electivo activo.',
      tipologia: 'aportante_de_campana_y_proveedor',
      score: 88,
      severidad: 'grave',
      estadoVerificacion: 'verificada',
      verificadoPor: 'auditor@argos.test',
      verificadoEn: '2026-03-15T14:22:00Z',
      evidencia: [
        { descripcion: 'LOGISTICA NACIONAL aportó $1.2M al Frente Cordobés Renovador (CUIT 33-50012345-7).', fuenteUrl: 'https://aportantes.electoral.gob.ar/aportes/2023/cordoba' },
        { descripcion: 'GIMENEZ JUANA del MISMO partido aportó $450K en agosto 2023 y es Concejala activa.', fuenteUrl: 'https://aportantes.electoral.gob.ar/aportes/2023/cordoba' },
        { descripcion: 'LOGISTICA NACIONAL ganó contrato municipal por $14M en febrero 2024 (Licitación Privada).', fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/contratos/2024/log-001' },
      ],
      legal: {
        articulos: ['Ley 26.215 — Financiamiento de los Partidos Políticos', 'Ley 25.188 — Ética Pública'],
        severidad: 'grave',
        denunciarAnte: ['Cámara Nacional Electoral', 'Tribunal de Cuentas de Córdoba'],
      },
    },
  ],
}

// ─── Lookup helpers para el stub ──────────────────────────────────────────────

export const PERSONAS_FISICAS_STUB: Record<string, PersonaFisica> = {
  '24563128': FIXTURE_FERNANDEZ_MARIA,
  '14289301': FIXTURE_PEREZ_CARLOS,
  '18567892': FIXTURE_GIMENEZ_JUANA,
}

export const PERSONAS_JURIDICAS_STUB: Record<string, PersonaJuridica> = {
  '30-71234567-1': FIXTURE_CONSTRUCTORA_CENTRO,
  '30-68923451-4': FIXTURE_SERVICIOS_INTEGRALES_SUR,
  '33-50012345-7': FIXTURE_LOGISTICA_NACIONAL,
}

export function getPersonaFisicaStub(dni: string): PersonaFisica | null {
  // Acepta DNI con puntos/guiones para tolerancia URL-friendly.
  const norm = dni.replace(/\D/g, '')
  return PERSONAS_FISICAS_STUB[norm] ?? null
}

export function getPersonaJuridicaStub(cuit: string): PersonaJuridica | null {
  // Acepta CUIT con o sin guiones.
  const norm = cuit.replace(/\D/g, '')
  if (norm.length !== 11) return null
  const formatted = `${norm.slice(0, 2)}-${norm.slice(2, 10)}-${norm.slice(10)}`
  return PERSONAS_JURIDICAS_STUB[formatted] ?? null
}

import { z } from 'zod'

// ─── Forensic metadata ────────────────────────────────────────────────────────
// Required on every entity: full chain of custody for legal defensibility.
export const ForensicMetadata = z.object({
  source_url:   z.string().url(),
  fetched_at:   z.date(),
  sha256:       z.string().regex(/^[a-f0-9]{64}$/, 'must be a 64-char hex SHA-256 hash'),
  archive_path: z.string(), // relative to data/snapshots/
})

export type ForensicMetadata = z.infer<typeof ForensicMetadata>

export type ForensicMetadataInput = z.input<typeof ForensicMetadata>

// ─── Persona ──────────────────────────────────────────────────────────────────
// Física: funcionarios públicos, directores de empresa, donantes, imputados.
export const PersonaRol = z.enum([
  'director',
  'funcionario',
  'contratista',
  'donante',
  'imputado',
])

export const Persona = z.object({
  id:                 z.string().uuid(),
  nombre:             z.string().min(1),
  nombre_normalizado: z.string(),
  cuit:               z.string().regex(/^\d{11}$/).optional(),
  dni:                z.string().optional(),
  roles:              z.array(PersonaRol).default([]),
  ...ForensicMetadata.shape,
})

export type Persona = z.infer<typeof Persona>

// ─── Empresa ─────────────────────────────────────────────────────────────────
export const EstadoEmpresa = z.enum([
  'activa',
  'inactiva',
  'en_liquidacion',
  'cancelada',
  'desconocido',
])

export const Empresa = z.object({
  id:                  z.string().uuid(),
  nombre:              z.string().min(1),
  nombre_normalizado:  z.string(),
  cuit:                z.string().regex(/^\d{11}$/).optional(),
  fecha_constitucion:  z.date().optional(),
  domicilio:           z.string().optional(),
  estado:              EstadoEmpresa.default('desconocido'),
  empleados_estimados: z.number().int().nonnegative().optional(),
  ...ForensicMetadata.shape,
})

export type Empresa = z.infer<typeof Empresa>

// ─── Contrato ─────────────────────────────────────────────────────────────────
export const TipoContrato = z.enum([
  'licitacion_publica',
  'licitacion_privada',
  'contratacion_directa',
  'prorroga',
  'adenda',
  'convenio',
  'otro',
])

export const Moneda = z.enum(['ARS', 'USD', 'EUR'])

export const Contrato = z.object({
  id:                   z.string().uuid(),
  municipio_id:         z.string(),
  numero:               z.string().optional(),
  numero_expediente:    z.string().optional(),
  proveedor:            z.string().min(1),
  proveedor_normalizado:z.string(),
  proveedor_cuit:       z.string().regex(/^\d{11}$/).optional(),
  monto:                z.number().nonnegative(),
  moneda:               Moneda.default('ARS'),
  fecha:                z.date(),
  anio:                 z.number().int().min(2000).max(2099),
  tipo:                 TipoContrato,
  rubro:                z.string().optional(),
  descripcion:          z.string().optional(),
  area:                 z.string().optional(),
  precio_unitario:      z.number().nonnegative().optional(),
  ...ForensicMetadata.shape,
})

export type Contrato = z.infer<typeof Contrato>

// ─── Organismo ────────────────────────────────────────────────────────────────
export const TipoOrganismo = z.enum([
  'municipio',
  'secretaria',
  'ministerio',
  'ese',
  'organismo_descentralizado',
  'agencia',
])

export const Organismo = z.object({
  id:           z.string().uuid(),
  nombre:       z.string().min(1),
  tipo:         TipoOrganismo,
  jurisdiccion: z.string(),
  parent_id:    z.string().uuid().optional(),
  ...ForensicMetadata.shape,
})

export type Organismo = z.infer<typeof Organismo>

// ─── Cargo ───────────────────────────────────────────────────────────────────
// Designación pública — fuente primaria: BORA + boletines provinciales/municipales.
export const Cargo = z.object({
  id:               z.string().uuid(),
  persona_id:       z.string().uuid(),
  organismo_id:     z.string().uuid(),
  titulo:           z.string().min(1),
  desde:            z.date(),
  hasta:            z.date().optional(),
  decreto_numero:   z.string().optional(),
  bora_url:         z.string().url().optional(),
  ...ForensicMetadata.shape,
})

export type Cargo = z.infer<typeof Cargo>

// ─── Donacion ─────────────────────────────────────────────────────────────────
// Aportes electorales — fuente: Cámara Nacional Electoral (CNE / datos.gob.ar).
export const Donacion = z.object({
  id:             z.string().uuid(),
  donante:        z.string().min(1),
  donante_cuit:   z.string().regex(/^\d{11}$/).optional(),
  partido:        z.string().min(1),
  monto:          z.number().nonnegative(),
  moneda:         Moneda.default('ARS'),
  fecha:          z.date(),
  eleccion:       z.string().optional(),
  distrito:       z.string().optional(),
  ...ForensicMetadata.shape,
})

export type Donacion = z.infer<typeof Donacion>

// ─── DDJJ ─────────────────────────────────────────────────────────────────────
// Declaración jurada patrimonial — fuente: OA argentina.gob.ar/anticorrupcion.
export const DDJJ = z.object({
  id:                      z.string().uuid(),
  persona_id:              z.string().uuid(),
  anio:                    z.number().int().min(2000),
  cargo_declarado:         z.string(),
  patrimonio_declarado:    z.number().optional(),
  variacion_interanual:    z.number().optional(),
  pdf_url:                 z.string().url().optional(),
  inconsistencia_detectada:z.boolean().default(false),
  ...ForensicMetadata.shape,
})

export type DDJJ = z.infer<typeof DDJJ>

// ─── Causa ────────────────────────────────────────────────────────────────────
// Expediente judicial — fuente: CIJ / CPCSP / fueros provinciales.
export const EstadoCausa = z.enum([
  'en_instruccion',
  'elevada_juicio',
  'sobreseida',
  'condenada',
  'absuelta',
  'prescripta',
  'desconocido',
])

export const Causa = z.object({
  id:                  z.string().uuid(),
  numero:              z.string(),
  caratula:            z.string(),
  fuero:               z.string().optional(),
  juzgado:             z.string().optional(),
  fiscalia:            z.string().optional(),
  estado:              EstadoCausa.default('desconocido'),
  fecha_inicio:        z.date().optional(),
  personas_ids:        z.array(z.string().uuid()).default([]),
  empresas_ids:        z.array(z.string().uuid()).default([]),
  ...ForensicMetadata.shape,
})

export type Causa = z.infer<typeof Causa>

// ─── Obra ─────────────────────────────────────────────────────────────────────
// Obra pública georreferenciada.
export const EstadoObra = z.enum([
  'proyectada',
  'en_ejecucion',
  'paralizada',
  'completada',
  'abandonada',
  'desconocido',
])

export const Obra = z.object({
  id:                   z.string().uuid(),
  nombre:               z.string().min(1),
  contrato_id:          z.string().uuid().optional(),
  municipio_id:         z.string(),
  lat:                  z.number().min(-90).max(90).optional(),
  lng:                  z.number().min(-180).max(180).optional(),
  estado:               EstadoObra.default('desconocido'),
  monto_presupuestado:  z.number().nonnegative().optional(),
  monto_ejecutado:      z.number().nonnegative().optional(),
  fecha_inicio:         z.date().optional(),
  fecha_fin_prevista:   z.date().optional(),
  fecha_fin_real:       z.date().optional(),
  ...ForensicMetadata.shape,
})

export type Obra = z.infer<typeof Obra>

// ─── Hallazgo (señal de corrupción) ───────────────────────────────────────────
export const SeveridadHallazgo = z.enum(['grave', 'moderada', 'leve'])

export const CategoriaSenal = z.enum([
  'procedimiento',       // prórrogas, fraccionamiento, directas abusivas
  'concentracion',       // proveedor, rubro, temporal, geográfica
  'entity',              // empresa nueva, sin empleados, directores compartidos
  'politico_institucional', // puerta giratoria, donante-contratista, nepotismo
  'economico',           // sobreprecio, obras abandonadas
  'temporal',            // gasto fin ejercicio, aceleración pre-electoral
])

export const Hallazgo = z.object({
  id:          z.string().uuid(),
  señal_id:    z.string(),
  tipologia:   z.string(),
  categoria:   CategoriaSenal,
  score:       z.number().int().min(0).max(100),
  titulo:      z.string(),
  resumen:     z.string(),
  severidad:   SeveridadHallazgo,
  entidades_afectadas: z.array(z.object({
    tipo: z.enum(['Empresa', 'Persona', 'Contrato', 'Organismo']),
    id:   z.string(),
    nombre: z.string(),
  })).default([]),
  evidencia: z.array(z.object({
    descripcion: z.string(),
    fuente_url:  z.string().url(),
    snapshot_sha256: z.string().optional(),
  })).default([]),
  legal: z.object({
    articulos:      z.array(z.string()),
    severidad:      SeveridadHallazgo,
    denunciar_ante: z.array(z.string()),
    tipologia_ti:   z.string().optional(), // Transparency International taxonomy
  }),
  municipio_id: z.string(),
  periodo:      z.string(), // "2019-2023"
  generado_en:  z.date(),
})

export type Hallazgo = z.infer<typeof Hallazgo>

// ─── Enum type aliases ────────────────────────────────────────────────────────
export type PersonaRol       = z.infer<typeof PersonaRol>
export type EstadoEmpresa    = z.infer<typeof EstadoEmpresa>
export type TipoContrato     = z.infer<typeof TipoContrato>
export type Moneda           = z.infer<typeof Moneda>
export type TipoOrganismo    = z.infer<typeof TipoOrganismo>
export type EstadoCausa      = z.infer<typeof EstadoCausa>
export type EstadoObra       = z.infer<typeof EstadoObra>
export type SeveridadHallazgo= z.infer<typeof SeveridadHallazgo>
export type CategoriaSenal   = z.infer<typeof CategoriaSenal>


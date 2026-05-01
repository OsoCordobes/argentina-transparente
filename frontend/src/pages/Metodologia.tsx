/**
 * Metodologia.tsx — V4 forensic. Especificación técnica con § sections.
 *
 * Lenguaje: técnico-forense (describabilidad estructural, snapshot
 * content-addressed, blocking + Jaro-Winkler, Herfindahl, audit log).
 * Port directo del copy del bundle de Claude Design (surfaces-rest.jsx
 * MetodologiaSurface).
 *
 * Footer: stats schema/detectores/fuentes/SLA.
 */
import { ArgosShell } from '@/components/argos/ArgosShell'

const SECTIONS = [
  {
    h: 'Modelo de evidencia y tier',
    body:
      'Cada hecho lleva metadata {tier, source, snapshot_id, ingested_at, confidence}. ' +
      'T1: registro oficial parseable con identificador único (CUIT, expediente, decreto). ' +
      'T2: vínculo derivado por matching determinista sobre campos públicos (DNI inferido por ' +
      'apellido + cargo + jurisdicción + período); requiere score ≥ umbral configurado por detector. ' +
      'T3: extraído de fuente no estructurada (medios, ONGs); sujeto a revisión manual antes de ' +
      'publicación. El tier es propiedad inmutable del nodo/edge y se propaga en todo export, ' +
      'citación y comparación.',
  },
  {
    h: 'Detectores y umbrales',
    body:
      '17 detectores deterministas clasificados en 5 familias: concentración (Herfindahl por ' +
      'área/rubro), conflicto de interés (intersección personas-empresas), red densa (clustering ' +
      'coefficient ≥ θ en bipartito proveedor-director), patrón temporal (rotación coordinada, ' +
      'fraccionamiento Benford), y capacidad inversa (ratio contrato/empleados-AFIP). Cada ' +
      'detector publica: query Cypher firmada, parámetros, umbral, score normalizado [0,100], y ' +
      'test set de regresión. Los umbrales se ajustan por jurisdicción y se versionan; el cambio ' +
      'de umbral genera nuevo snapshot, no reescritura.',
  },
  {
    h: 'Resolución de entidades',
    body:
      'Entity resolution en dos fases. Fase 1 (determinista): match por CUIT/CUIL/DNI cuando el ' +
      'registro lo expone — produce nodos T1. Fase 2 (probabilística): bloqueo por (apellido ' +
      'normalizado, jurisdicción, ventana temporal) seguido de scoring Jaro-Winkler sobre nombre ' +
      '+ Levenshtein sobre cargo. Match si score ≥ 0.86 y no hay homonimia detectada en padrón ' +
      'electoral. Caso de homonimia: nodo se marca {disambiguation_required: true} y aparece como ' +
      'warning en el panel. Decisiones de merge son reversibles y quedan en el audit log.',
  },
  {
    h: 'Modelo temporal y snapshots',
    body:
      'ARGOS materializa el grafo como secuencia de snapshots inmutables (uno por sincronización ' +
      'exitosa de fuente primaria). Cada snapshot es content-addressed por hash del rollup de ' +
      'fuentes ingeridas. Las visualizaciones referencian el snapshot activo (header: "Datos ' +
      'al…"). Operación Δ entre snapshots produce diff tipado (nodos agregados/removidos/mutados, ' +
      'edges nuevos, señales nuevas) sin reescribir historia. Retención: snapshots diarios 90 ' +
      'días, semanales 2 años, mensuales indefinidos.',
  },
  {
    h: 'Pipeline de ingestión',
    body:
      'Adaptadores por fuente con contrato {fetch, parse, validate, diff, emit}. Validación ' +
      'incluye: schema (JSON Schema versionado), referencial (FK contra catálogos oficiales), y ' +
      'sanity (rangos, formatos, duplicados). Records que fallan validación van a quarantine_log ' +
      'con causa estructurada — nunca al grafo. Latencia objetivo: T1 ≤ 24h desde publicación ' +
      'oficial; T2 ≤ 72h; T3 según fuente. Disponibilidad: status por fuente expuesto en /fuentes ' +
      'con timestamp de última sincronización exitosa.',
  },
  {
    h: 'Garantías y límites del sistema',
    body:
      'Garantiza: trazabilidad por construcción (cada celda → fuente), reproducibilidad (snapshot ' +
      '+ query → resultado idéntico), determinismo de detectores (sin componentes estocásticos en ' +
      'producción). No garantiza: completitud (la fuente puede omitir registros), corrección de ' +
      'la fuente (ARGOS no audita al emisor), ni cobertura uniforme entre jurisdicciones. La capa ' +
      'LLM, cuando esté disponible, opera read-only sobre el grafo y nunca modifica nodos, ' +
      'edges, ni señales.',
  },
  {
    h: 'Lo que ARGOS no hace',
    body:
      'No emite juicios de valor ni imputaciones. No publica datos personales fuera del registro ' +
      'público de origen. No reemplaza investigación periodística ni judicial — la ' +
      'describabilidad estructural es insumo, no conclusión. No aprende del comportamiento del ' +
      'usuario para reordenar resultados; la priorización de señales se basa exclusivamente en ' +
      'score del detector. No expone PII derivada (cruces que producirían información no presente ' +
      'en ninguna fuente individual) sin flag explícito y opt-in del operador.',
  },
]

export default function Metodologia() {
  return (
    <ArgosShell title="Metodología · especificación técnica">
      <div style={{ maxWidth: 1040, padding: '20px 0' }}>
        <div className="fx-eyebrow" style={{ marginBottom: 18 }}>
          ESPECIFICACIÓN TÉCNICA · v3.0
        </div>
        <h1
          style={{
            fontSize: 30,
            color: 'var(--text-1)',
            fontWeight: 300,
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
            marginBottom: 14,
            marginTop: 0,
          }}
        >
          Modelo de evidencia, ingestión y deducción
        </h1>
        <p
          style={{
            fontSize: 13.5,
            color: 'var(--text-2)',
            lineHeight: 1.65,
            marginBottom: 8,
          }}
        >
          ARGOS opera como sistema de{' '}
          <span style={{ color: 'var(--text-1)' }}>describabilidad estructural</span>: ingesta
          registros públicos verificables, construye un grafo tipado en Neo4j (entidades,
          relaciones, períodos), y ejecuta detectores deterministas que enumeran configuraciones de
          bajo prior estadístico. El sistema no produce inferencias causales; produce{' '}
          <span style={{ color: 'var(--text-1)' }}>indicadores reproducibles</span> con query,
          umbral y fuente trazables.
        </p>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-3)',
            lineHeight: 1.6,
            marginBottom: 30,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.02em',
          }}
        >
          Toda salida es auditable end-to-end: snapshot_id → query_hash → source_uri → record_id.
        </p>

        {SECTIONS.map((s, i) => (
          <div
            key={i}
            style={{
              borderTop: '1px solid var(--hairline-1)',
              padding: '22px 0',
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: 'var(--text-3)',
                letterSpacing: '0.20em',
                fontFamily: 'var(--font-mono)',
                marginBottom: 8,
              }}
            >
              § {String(i + 1).padStart(2, '0')} · {s.h.toUpperCase()}
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>
              {s.body}
            </p>
          </div>
        ))}

        <div
          style={{
            borderTop: '1px solid var(--hairline-2)',
            marginTop: 20,
            padding: '22px 0',
            display: 'flex',
            gap: 30,
            fontSize: 11,
            color: 'var(--text-3)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.06em',
            flexWrap: 'wrap',
          }}
        >
          <div>SCHEMA · neo4j 5.x</div>
          <div>DETECTORES · 17</div>
          <div>FUENTES · ver /fuentes</div>
          <div>SLA T1 · 24h objetivo</div>
        </div>
      </div>
    </ArgosShell>
  )
}

/**
 * Metodologia.tsx — V4 forensic. Especificación técnica con § sections.
 *
 * Lenguaje: técnico-forense (describabilidad estructural, snapshot
 * content-addressed, blocking + Jaro-Winkler, Herfindahl, audit log).
 * Port directo del copy del bundle de Claude Design (surfaces-rest.jsx
 * MetodologiaSurface).
 *
 * Footer: stats schema/detectores/fuentes/SLA.
 *
 * Wave 3.C — design tokens canónicos:
 *   - legacy aliases (--text-1/2/3, --hairline-1/2) → canónicos
 *     (--text-primary/secondary/muted, mantenidos hairline-1/2 ya
 *     definidos en tokens.css)
 *   - spacing/font numéricos → var(--space-X)/var(--text-X) cuando aplica
 *   - se preservan magic numbers chicos (9, 10.5) cuando no calzan en la
 *     escala (--text-xs es 10px), pero están documentados.
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
      <div style={{ maxWidth: 1040, padding: 'var(--space-5) 0' }}>
        <div className="fx-eyebrow" style={{ marginBottom: 'var(--space-4)' }}>
          ESPECIFICACIÓN TÉCNICA · v3.0
        </div>
        <h1
          style={{
            fontSize: 'var(--text-3xl)',
            color: 'var(--text-primary)',
            fontWeight: 'var(--weight-normal)',
            letterSpacing: 'var(--tracking-tight)',
            lineHeight: 'var(--leading-tight)',
            marginBottom: 'var(--space-3)',
            marginTop: 0,
            fontFamily: 'var(--font-display)',
          }}
        >
          Modelo de evidencia, ingestión y deducción
        </h1>
        <p
          style={{
            fontSize: 'var(--text-md)',
            color: 'var(--text-secondary)',
            lineHeight: 'var(--leading-relaxed)',
            marginBottom: 'var(--space-2)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          ARGOS opera como sistema de{' '}
          <span style={{ color: 'var(--text-primary)' }}>describabilidad estructural</span>: ingesta
          registros públicos verificables, construye un grafo tipado en Neo4j (entidades,
          relaciones, períodos), y ejecuta detectores deterministas que enumeran configuraciones de
          bajo prior estadístico. El sistema no produce inferencias causales; produce{' '}
          <span style={{ color: 'var(--text-primary)' }}>indicadores reproducibles</span> con query,
          umbral y fuente trazables.
        </p>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            lineHeight: 'var(--leading-normal)',
            marginBottom: 'var(--space-8)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: 'var(--tracking-wide)',
          }}
        >
          Toda salida es auditable end-to-end: snapshot_id → query_hash → source_uri → record_id.
        </p>

        {SECTIONS.map((s, i) => (
          <div
            key={i}
            style={{
              borderTop: '1px solid var(--hairline-1)',
              padding: 'var(--space-5) 0',
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: 'var(--text-muted)',
                letterSpacing: 'var(--tracking-wider)',
                fontFamily: 'var(--font-mono)',
                marginBottom: 'var(--space-2)',
                fontWeight: 'var(--weight-medium)',
              }}
            >
              § {String(i + 1).padStart(2, '0')} · {s.h.toUpperCase()}
            </div>
            <p
              style={{
                fontSize: 'var(--text-md)',
                color: 'var(--text-secondary)',
                lineHeight: 'var(--leading-relaxed)',
                margin: 0,
                fontFamily: 'var(--font-sans)',
              }}
            >
              {s.body}
            </p>
          </div>
        ))}

        <div
          style={{
            borderTop: '1px solid var(--hairline-2)',
            marginTop: 'var(--space-5)',
            padding: 'var(--space-5) 0',
            display: 'flex',
            gap: 'var(--space-8)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: 'var(--tracking-wide)',
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

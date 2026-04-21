import type {
  Contrato,
  Empresa,
  Persona,
  Organismo,
  Cargo,
  Donacion,
  Hallazgo,
  CategoriaSenal,
} from '@argos/model'

// ─── Graph context ────────────────────────────────────────────────────────────
// Abstraction over the data layer (DuckDB + Neo4j).
// Signals receive a GraphContext and query what they need — no direct DB access.
export interface GraphContext {
  municipio_id:  string
  periodo_desde: number
  periodo_hasta: number

  // Entity queries
  contratos():                           Promise<Contrato[]>
  contratosByProveedor(nombre: string):  Promise<Contrato[]>
  contratosByArea(area: string):         Promise<Contrato[]>
  empresa(nombre: string):               Promise<Empresa | null>
  empresas():                            Promise<Empresa[]>
  directoresByEmpresa(cuit: string):     Promise<Persona[]>
  cargosByPersona(personaId: string):    Promise<Cargo[]>
  donacionesByDonante(nombre: string):   Promise<Donacion[]>

  // Graph queries (Neo4j-backed)
  directoresCompartidos(umbralEmpresas?: number): Promise<{
    director:  string
    empresas:  string[]
    contratos: number
    monto_total: number
  }[]>

  redDeEmpresas(cuit: string, depth?: number): Promise<{
    nodos:  { id: string; tipo: string; nombre: string }[]
    aristas: { desde: string; hasta: string; relacion: string }[]
  }>

  // Stats helpers
  montoTotal():  Promise<number>
  proveedores(): Promise<{ nombre: string; monto: number; contratos: number }[]>
}

// ─── Signal detector ──────────────────────────────────────────────────────────
// One file = one detector. Each implements this interface.
export interface SignalDetector {
  id:          string
  tipologia:   string
  categoria:   CategoriaSenal
  descripcion: string

  // Returns zero or more findings. Never throws — catches internal errors and returns [].
  detect(ctx: GraphContext): Promise<Hallazgo[]>

  // Legal framework this signal relates to (for auto-populating Hallazgo.legal)
  legalFramework: {
    articulos:      string[]        // ["Art. 265 CP", "Ley 25.188 Art. 6"]
    denunciar_ante: string[]        // ["Fiscalía de Instrucción", "OA", "AGN"]
    tipologia_ti?:  string          // Transparency International taxonomy
  }
}

// ─── Meta-signal ──────────────────────────────────────────────────────────────
// Composes multiple elementary signals into a higher-order finding.
// Example: empresa_nueva + donante_contratista + monto_alto = score elevado
export interface MetaSignal {
  id:          string
  descripcion: string
  signals:     string[]    // detector IDs that must all trigger
  score_bonus: number      // additional score when all signals fire together
  compose(hallazgos: Hallazgo[]): Hallazgo | null
}

// ─── Engine runner ────────────────────────────────────────────────────────────
export interface EngineOptions {
  detectors:    SignalDetector[]
  metaSignals?: MetaSignal[]
}

export async function runEngine(
  ctx: GraphContext,
  opts: EngineOptions,
): Promise<Hallazgo[]> {
  const all: Hallazgo[] = []

  for (const detector of opts.detectors) {
    try {
      const found = await detector.detect(ctx)
      all.push(...found)
    } catch (err) {
      // Signals must not crash the pipeline — log and continue
      console.error(`[engine] detector ${detector.id} failed:`, err)
    }
  }

  if (opts.metaSignals) {
    for (const meta of opts.metaSignals) {
      try {
        const composed = meta.compose(all)
        if (composed) all.push(composed)
      } catch (err) {
        console.error(`[engine] meta-signal ${meta.id} failed:`, err)
      }
    }
  }

  return all.sort((a, b) => b.score - a.score)
}

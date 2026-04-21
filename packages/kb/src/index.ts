// ─── Knowledge Base — stub for Fase 3 ────────────────────────────────────────
// This package will hold:
//   - Curated Argentine law corpus (Ley 25.188, 27.275, CP arts 256-268, etc.)
//   - TI / FATF / OECD / UNODC corruption typologies
//   - Historical cases: Vialidad, Cuadernos, Odebrecht, Ciccone, Skanska, IBM-BN, Hotesur
//   - Chunked markdown + local embeddings (vector store TBD: LanceDB | pgvector | chromadb)
//
// Implemented in Fase 3. Consumers: apps/api AI co-investigator endpoint.

export interface KBDocument {
  id:          string
  tipo:        'ley' | 'tipologia' | 'caso_historico' | 'jurisprudencia'
  titulo:      string
  contenido:   string
  tags:        string[]
  fuente_url?: string
  fecha?:      Date
}

export interface KBSearchResult {
  documento:   KBDocument
  similitud:   number   // cosine similarity 0..1
  fragmento:   string   // the matching chunk
}

// Will be implemented by LanceDB/pgvector/chromadb adapter in Fase 3
export interface VectorStore {
  index(docs: KBDocument[]): Promise<void>
  search(query: string, topK?: number): Promise<KBSearchResult[]>
}

// Leyes argentinas que aplican a corrupción en contrataciones públicas
export const LEYES = {
  'Ley 25.188': 'Ética en el Ejercicio de la Función Pública',
  'Ley 27.275': 'Derecho de Acceso a la Información Pública',
  'Ley 13.064': 'Obras Públicas',
  'Ley 24.759': 'Convención Interamericana contra la Corrupción (CICC)',
  'Ley 26.097': 'Convención de las Naciones Unidas contra la Corrupción (UNCAC)',
  'CP Art. 256': 'Cohecho y tráfico de influencias — funcionario que recibe dadiva',
  'CP Art. 257': 'Cohecho agravado — juez o miembro del Ministerio Público',
  'CP Art. 258': 'Cohecho activo — quien da o promete dadiva',
  'CP Art. 259': 'Dádivas a funcionario',
  'CP Art. 260': 'Malversación de caudales públicos',
  'CP Art. 261': 'Peculado',
  'CP Art. 262': 'Malversación culposa',
  'CP Art. 263': 'Extensión a funcionarios de organismos descentralizados',
  'CP Art. 264': 'Demora injustificada de pagos',
  'CP Art. 265': 'Negociaciones incompatibles con el ejercicio de funciones públicas',
  'CP Art. 266': 'Exacciones ilegales',
  'CP Art. 267': 'Exacciones ilegales agravadas',
  'CP Art. 268': 'Enriquecimiento ilícito de funcionario público',
} as const

export type LeyKey = keyof typeof LEYES

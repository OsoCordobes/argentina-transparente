// Backend base URL — prefer VITE_BACKEND_URL env var (Python/Railway), fall back to n8n cloud
const BACKEND_BASE_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "https://osocordobes.app.n8n.cloud";

export const BESTIA_RUN_ENDPOINT    = `${BACKEND_BASE_URL}/webhook/bestia-run`;
export const BESTIA_STATUS_ENDPOINT = `${BACKEND_BASE_URL}/webhook/bestia-status`;
export const BESTIA_RESULT_ENDPOINT = `${BACKEND_BASE_URL}/webhook/bestia-result`;
export const BESTIA_CANCEL_ENDPOINT = `${BACKEND_BASE_URL}/webhook/bestia-cancel`;

import { municipiosCordoba } from '@/data/municipios-cordoba';

// Derived from the verified catalog — single source of truth
export const MUNICIPALITIES = municipiosCordoba.map((m) => ({
  label: m.name,
  value: m.name,
  population: m.population,
}));

export const POLLING_INTERVAL_MS = 4000;
export const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

export const PROGRESS_MESSAGES: { max: number; message: string }[] = [
  { max: 20, message: "Buscando fuentes oficiales..." },
  { max: 50, message: "Descargando documentos públicos..." },
  { max: 80, message: "Analizando patrones de gasto..." },
  { max: 100, message: "Generando informe ciudadano..." },
];

export function getProgressMessage(progress: number): string {
  for (const { max, message } of PROGRESS_MESSAGES) {
    if (progress <= max) return message;
  }
  return "Finalizando...";
}

export interface BestiaRunRequest {
  localityName: string;
  plan: string;
  dateFrom: string;
  dateTo: string;
}

export interface BestiaRunResponse {
  runId: string;
}

export interface BestiaStatusResponse {
  status: "running" | "done" | "error";
  progress: number;
  step?: string;
}

export interface Finding {
  title: string;
  description: string;
  risk_level: "alto" | "medio" | "bajo";
  recommendations: string[];
}

export interface Procedure {
  id?: string;
  title: string;
  supplier?: string;
  amount?: number;
  date?: string;
  type?: string;
  evidence_quote?: string;
  url?: string;
}

export interface ProcedureRow {
  id: string;
  date: string;
  type: string;
  object: string;
  supplier: string;
  amount_ars: number | null;
  source_url: string;
}

export interface BestiaReport {
  executive_summary: string;
  risk_score: number;
  findings: Finding[];
  procedures?: ProcedureRow[];
  coverage: {
    sources_analyzed: number;
    documents_found: number;
  };
  limitations: string;
}

export interface BestiaResultResponse {
  report: BestiaReport;
}

// n8n-config.ts
// Configuración del backend n8n y helpers para la API de La Bestia.

import { MUNICIPIOS } from "./municipios-cordoba";

// ─── Endpoints ────────────────────────────────────────────────────────────────
export const N8N_BASE = "https://osocordobes.app.n8n.cloud/webhook";

export const ENDPOINTS = {
  run:    `${N8N_BASE}/bestia-run`,
  status: `${N8N_BASE}/bestia-status`,
  result: `${N8N_BASE}/bestia-result`,
} as const;

// ─── Workflow IDs ─────────────────────────────────────────────────────────────
export const WORKFLOW_IDS = {
  main:          "wJwPqRvunFIWRtPfFxvSC",
  editorRemoto:  "BEdGwkym9JmiIAlg",
} as const;

// ─── Municipios disponibles (derivados del catálogo verificado) ───────────────
export const MUNICIPALITIES = MUNICIPIOS.map((m) => ({
  id:         m.id,
  name:       m.name,
  population: m.population,
  label:      `${m.name} · ${(m.population / 1000).toFixed(0)}k hab.`,
}));

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RunRequest {
  localityName: string;
  dateFrom:     string; // YYYY-MM-DD
  dateTo:       string; // YYYY-MM-DD
  plan?:        "free" | "pro";
  runId?:       string;
}

export interface RunAck {
  ok:             boolean;
  runId:          string;
  statusEndpoint: string;
  resultEndpoint: string;
}

export interface StatusResponse {
  ok:       boolean;
  runId:    string;
  status:   "running" | "done" | "error";
  step:     string;
  progress: number; // 0–100
  message?: string;
}

export interface Signal {
  typology:   string;
  score:      number;   // 0–100
  confidence: "high" | "med" | "low";
  title:      string;
  summary:    string;
  checklist:  string[];
  evidence:   { quote: string; url: string }[];
  legal?: {
    articles:        string[];
    severity:        "grave" | "moderada" | "leve";
    denunciable_to:  string[];
  };
}

export interface Finding {
  title:           string;
  description:     string;
  risk_level:      "alto" | "medio" | "bajo";
  recommendations: string[];
}

export interface Report {
  executive_summary: string;
  risk_score:        number;
  findings:          Finding[];
  coverage: {
    sources_analyzed: number;
    documents_found:  number;
  };
  limitations: string;
}

export interface RunResult {
  ok:           boolean;
  runId:        string;
  localityName: string;
  dateFrom:     string;
  dateTo:       string;
  coverage: {
    docs:            number;
    structured_docs: number;
  };
  sources:  { kind: string; url: string; confidence: number }[];
  signals:  Signal[];
  report:   Report;
  logs:     { t: string; m: string }[];
  denunciation_guide?: {
    body:    string;
    contact: string;
    law:     string;
  };
}

// ─── API Client ───────────────────────────────────────────────────────────────

export async function startRun(req: RunRequest): Promise<RunAck> {
  const res = await fetch(ENDPOINTS.run, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Run failed: ${res.status}`);
  return res.json();
}

export async function getResult(runId: string): Promise<RunResult | null> {
  const res = await fetch(`${ENDPOINTS.result}?runId=${runId}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.ok || data.status === "running") return null;
  return data as RunResult;
}

/**
 * Polling helper: reintenta hasta que el resultado esté disponible o timeout.
 * Usa SOLO /bestia-result — NO pollear /bestia-status (staticData poco confiable).
 */
export async function pollResult(
  runId:         string,
  intervalMs  =  5000,
  timeoutMs   = 180000
): Promise<RunResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await getResult(runId);
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for runId ${runId}`);
}

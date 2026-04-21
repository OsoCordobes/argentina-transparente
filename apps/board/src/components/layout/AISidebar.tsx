// ─── AI co-investigador sidebar ────────────────────────────
// Right-side panel split into:
//   · header (status dot + tier badge)
//   · suggestions (passive insights — stubbed until
//     POST /api/ai/suggestions is live)
//   · chat (existing AIChatPanel reused as-is)

import { Sparkles, Zap } from 'lucide-react'
import AIChatPanel from '@/components/board/AIChatPanel'

export default function AISidebar() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-[14px] py-2.5 border-b border-[color:var(--gray-200)]">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-[color:var(--fg)]">
          <span
            className="inline-block rounded-full"
            style={{
              width: 8,
              height: 8,
              background: '#10b981',
              boxShadow: '0 0 0 2px rgba(16,185,129,0.2)',
            }}
          />
          Co-investigador
        </div>
        <span
          className="uppercase text-[9px] font-semibold tracking-wider px-1.5 py-0.5 rounded-full"
          style={{
            color: 'var(--fg-muted)',
            background: 'var(--bg-subtle)',
          }}
        >
          FREE
        </span>
      </div>

      {/* Suggestions (placeholder until /api/ai/suggestions ships) */}
      <div className="px-3 py-2.5 border-b border-[color:var(--gray-200)] flex-shrink-0">
        <div className="flex justify-between mb-2">
          <span className="eyebrow inline-flex items-center gap-1">
            <Sparkles size={11} />
            Sugerencias
          </span>
          <span className="text-[10px] text-[color:var(--fg-subtle)]">
            al pinear entidades
          </span>
        </div>
        <div
          className="text-[11px] italic leading-snug text-center p-2.5 rounded-md"
          style={{
            color: 'var(--fg-subtle)',
            border: '1px dashed var(--gray-200)',
          }}
        >
          Pineá entidades al caso para recibir conexiones y anomalías sugeridas.
        </div>
      </div>

      {/* Agente premium teaser */}
      <div
        className="mx-3 my-2.5 p-3 rounded-md flex-shrink-0"
        style={{
          background:
            'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.06))',
          border: '1px solid var(--gray-200)',
        }}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--fg)] mb-1">
          <Zap size={12} style={{ color: '#7c3aed' }} />
          Agente autónomo
        </div>
        <div className="text-[11px] text-[color:var(--fg-muted)] leading-snug mb-2">
          Definí un objetivo — el agente investiga overnight y te manda los hallazgos.
        </div>
        <button
          type="button"
          className="w-full py-1.5 px-2.5 text-[11px] font-semibold rounded-sm text-[#7c3aed]"
          style={{
            background: 'transparent',
            border: '1px solid rgba(124,58,237,0.3)',
          }}
        >
          Probar (premium)
        </button>
      </div>

      {/* Chat — reuses existing panel */}
      <div
        className="flex-1 min-h-0 overflow-hidden flex"
        style={{ borderTop: '1px solid var(--gray-200)' }}
      >
        <div className="flex-1 min-h-0">
          <AIChatPanel />
        </div>
      </div>
    </div>
  )
}

// ─── Pistas sidebar ────────────────────────────────────────
// Persistent left-side investigator panel for the caso. Groups
// what the user is tracking: entidades pinneadas, señales,
// archivos subidos y notas. Survives across the 5 views.
//
// v1 scope: reads from useBoardStore (local-only). When casos are
// persisted server-side, swap to GET /api/casos/:id which returns
// { caso, archivos, notas } and merge hallazgos store.

import { useState } from 'react'
import {
  Building2,
  AlertTriangle,
  FileText as FileIcon,
  StickyNote,
  ChevronRight,
  X as XIcon,
  Plus,
} from 'lucide-react'
import { useBoardStore, type EntityType } from '@/store/useBoardStore'

type SectionKey = 'entidades' | 'senales' | 'archivos' | 'notas'

const ENT_COLOR: Record<EntityType, string> = {
  Empresa:   'var(--ent-empresa)',
  Persona:   'var(--ent-persona)',
  Contrato:  'var(--ent-contrato)',
  Organismo: 'var(--ent-agencia)',
}

export default function PistasSidebar() {
  const pinnedEntities = useBoardStore((s) => Object.values(s.pinnedEntities))
  const hallazgos = useBoardStore((s) => s.hallazgos)
  const selectedNodeId = useBoardStore((s) => s.selectedNodeId)
  const selectNode = useBoardStore((s) => s.selectNode)
  const unpinEntity = useBoardStore((s) => s.unpinEntity)

  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    entidades: true,
    senales: true,
    archivos: true,
    notas: true,
  })
  const toggle = (k: SectionKey) => setOpen((s) => ({ ...s, [k]: !s[k] }))

  // Archivos + notas: backend-sourced; stub empty until /api/casos wired.
  const archivos: Array<{ id: string; filename: string; ocr_status: string; sha256?: string }> = []
  const notas: Array<{ id: string; texto: string; anclada_a?: string }> = []

  return (
    <div className="flex flex-col h-full">
      {/* Head */}
      <div className="flex justify-between items-start px-[14px] py-[10px] border-b border-[color:var(--gray-200)]">
        <div className="min-w-0">
          <div className="eyebrow" style={{ fontSize: 9, marginBottom: 2 }}>
            Pistas · caso activo
          </div>
          <div className="text-[13px] font-semibold text-[color:var(--fg)] leading-tight truncate">
            Nueva investigación
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto py-1 pb-3">
        <Section
          k="entidades"
          label="Entidades"
          icon={<Building2 size={13} />}
          count={pinnedEntities.length}
          open={open.entidades}
          onToggle={() => toggle('entidades')}
        >
          {pinnedEntities.length === 0 ? (
            <Empty>Nada pinneado aún · click‑derecho en un nodo para agregar.</Empty>
          ) : (
            pinnedEntities.map((e) => (
              <button
                key={e.entityId}
                type="button"
                className={`pistas-row ${selectedNodeId === e.entityId ? 'is-selected' : ''}`}
                onClick={() => selectNode(e.entityId)}
                style={{ ['--ent-color' as string]: ENT_COLOR[e.entityType] }}
              >
                <span
                  className="pistas-row-icon"
                  style={{
                    background: `color-mix(in srgb, ${ENT_COLOR[e.entityType]} 14%, transparent)`,
                    color: ENT_COLOR[e.entityType],
                  }}
                >
                  <Building2 size={12} />
                </span>
                <span className="pistas-row-label">{e.nombre}</span>
                <span
                  className="inline-flex items-center justify-center min-w-[18px] px-[5px] py-[1px] rounded-sm text-[9px] border mono"
                  style={{
                    color: 'var(--fg-muted)',
                    background: 'var(--surface)',
                    borderColor: 'var(--gray-200)',
                  }}
                >
                  {e.entityType[0]}
                </span>
                <XRemove onClick={() => unpinEntity(e.entityId)} />
              </button>
            ))
          )}
        </Section>

        <Section
          k="senales"
          label="Señales"
          icon={<AlertTriangle size={13} />}
          count={hallazgos.length}
          open={open.senales}
          onToggle={() => toggle('senales')}
        >
          {hallazgos.length === 0 ? (
            <Empty>Sin señales detectadas.</Empty>
          ) : (
            hallazgos.map((h) => (
              <div key={h.id} className="pistas-row" style={{ cursor: 'default' }}>
                <span
                  className="inline-block rounded-full flex-shrink-0"
                  style={{
                    width: 6,
                    height: 6,
                    background:
                      h.severidad === 'grave'
                        ? 'var(--red-500)'
                        : h.severidad === 'moderada'
                          ? 'var(--amber-500)'
                          : 'var(--gray-400)',
                  }}
                />
                <span className="pistas-row-label">{h.titulo}</span>
                <span
                  className="mono"
                  style={{
                    fontSize: 9,
                    color: 'var(--fg-muted)',
                    background: 'var(--surface)',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 999,
                    padding: '1px 5px',
                  }}
                >
                  {h.score}
                </span>
              </div>
            ))
          )}
        </Section>

        <Section
          k="archivos"
          label="Archivos"
          icon={<FileIcon size={13} />}
          count={archivos.length}
          open={open.archivos}
          onToggle={() => toggle('archivos')}
        >
          {archivos.length === 0 ? (
            <Empty>Arrastrá un PDF o imagen aquí para agregarlo al caso.</Empty>
          ) : (
            archivos.map((a) => (
              <div
                key={a.id}
                className="flex gap-2 p-2 rounded-sm bg-[color:var(--surface)] border border-[color:var(--gray-200)] mb-1"
              >
                <FileIcon size={13} className="text-[color:var(--fg-muted)] mt-[1px]" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] truncate">{a.filename}</div>
                  <div className="flex gap-1.5 text-[10px] mt-0.5">
                    <span
                      style={{
                        color:
                          a.ocr_status === 'done'
                            ? 'var(--green-600)'
                            : a.ocr_status === 'pending'
                              ? 'var(--amber-600)'
                              : 'var(--red-600)',
                      }}
                    >
                      {a.ocr_status === 'done' ? 'OCR ✓' : a.ocr_status === 'pending' ? 'OCR…' : 'OCR ×'}
                    </span>
                    {a.sha256 && (
                      <span className="mono-sm text-[color:var(--fg-subtle)]">
                        sha {a.sha256.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <AddButton label="Subir archivo" />
        </Section>

        <Section
          k="notas"
          label="Notas"
          icon={<StickyNote size={13} />}
          count={notas.length}
          open={open.notas}
          onToggle={() => toggle('notas')}
        >
          {notas.length === 0 ? (
            <Empty>Anotá hipótesis, preguntas o pendientes.</Empty>
          ) : (
            notas.map((n) => (
              <div key={n.id} className="pistas-note">
                <div>{n.texto}</div>
                {n.anclada_a && (
                  <div className="mt-1 text-[10px] opacity-75" style={{ color: '#713f12' }}>
                    ↳ {n.anclada_a}
                  </div>
                )}
              </div>
            ))
          )}
          <AddButton label="Agregar nota" />
        </Section>
      </div>
    </div>
  )
}

// ─── Subcomponents ───────────────────────────────────────

function Section({
  label,
  icon,
  count,
  open,
  onToggle,
  children,
}: {
  k: SectionKey
  label: string
  icon: React.ReactNode
  count: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-[14px] py-2 text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] text-[11px] font-semibold uppercase tracking-[0.08em]"
      >
        <span
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            transition: 'transform 150ms',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          <ChevronRight size={10} strokeWidth={2.5} />
        </span>
        <span className="opacity-70 inline-grid place-items-center">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: 'var(--fg-subtle)',
            background: 'var(--surface)',
            border: '1px solid var(--gray-200)',
            borderRadius: 999,
            padding: '0 6px',
            minWidth: 18,
            textAlign: 'center',
          }}
        >
          {count}
        </span>
      </button>
      {open && <div className="px-2 pb-1.5">{children}</div>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-3 pt-2 text-[11px] text-[color:var(--fg-subtle)] leading-snug">
      {children}
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-[calc(100%-8px)] mx-1 mt-1 mb-0.5 px-2 py-1.5 inline-flex items-center justify-center gap-1.5 rounded-md text-[11px] text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] hover:bg-[color:var(--surface-hover)]"
      style={{ border: '1px dashed var(--gray-300)' }}
    >
      <Plus size={12} />
      {label}
    </button>
  )
}

function XRemove({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="w-[18px] h-[18px] border-0 bg-transparent text-[color:var(--fg-subtle)] hover:bg-[color:var(--red-100)] hover:text-[color:var(--red-600)] rounded-sm grid place-items-center opacity-0 group-hover:opacity-100"
      style={{ marginLeft: 'auto' }}
      aria-label="Desanclar"
    >
      <XIcon size={11} />
    </button>
  )
}

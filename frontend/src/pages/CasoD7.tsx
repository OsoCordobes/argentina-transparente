/**
 * CasoD7.tsx — workspace de armado de denuncia (PLAN-UI D7).
 *
 * Two-pane: forma izq + preview HTML del PDF en vivo der.
 * Persistencia en localStorage. Cada cambio guarda automáticamente.
 *
 * El "preview PDF" es HTML formateado que mimica el PDF final;
 * el PDF real se genera al hacer click en "Generar PDF" (endpoint E3).
 */
import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ForensicHeader, ForensicFooter } from '@/components/argos/ForensicHeader'
import { getCaso, saveCaso, exportCaso, DESTINATARIOS, type CasoLS } from '@/lib/argos/caso-storage'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export default function CasoD7() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [caso, setCaso] = useState<CasoLS | null>(null)
  const [activeSection, setActiveSection] = useState('senales')
  const [generatingPdf, setGeneratingPdf] = useState(false)
  // Audit fix EH-W3: error inline copiable en lugar de alert() bloqueante.
  const [pdfError, setPdfError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const c = getCaso(id)
    setCaso(c)
  }, [id])

  // Auto-save on changes (debounced)
  useEffect(() => {
    if (!caso) return
    const t = setTimeout(() => saveCaso(caso), 400)
    return () => clearTimeout(t)
  }, [caso])

  if (!caso) {
    return (
      <div style={s.page}>
        <ForensicHeader />
        <main style={{ ...s.main, textAlign: 'center', paddingTop: 80 }}>
          <div style={{ color: '#9BA3B4', fontSize: 14, marginBottom: 16 }}>
            Caso no encontrado
          </div>
          <Link to="/casos" style={{ color: '#7da3ff', textDecoration: 'none' }}>
            ← Volver a mis casos
          </Link>
        </main>
        <ForensicFooter />
      </div>
    )
  }

  function update<K extends keyof CasoLS>(key: K, value: CasoLS[K]) {
    setCaso(c => c ? { ...c, [key]: value } : c)
  }
  function updateDenunciante<K extends keyof CasoLS['denunciante']>(key: K, value: CasoLS['denunciante'][K]) {
    setCaso(c => c ? { ...c, denunciante: { ...c.denunciante, [key]: value } } : c)
  }
  function removeSenal(idSig: string) {
    setCaso(c => c ? { ...c, senalIds: c.senalIds.filter(x => x !== idSig) } : c)
  }
  function removePj(cuit: string) {
    setCaso(c => c ? { ...c, entidadCuits: c.entidadCuits.filter(x => x !== cuit) } : c)
  }
  function removePf(dni: string) {
    setCaso(c => c ? { ...c, personaDnis: c.personaDnis.filter(x => x !== dni) } : c)
  }

  async function generarPdf() {
    setGeneratingPdf(true); setPdfError(null)
    try {
      const r = await fetch(`${API_URL}/api/denuncia/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          casoTitulo: caso.titulo,
          casoDescripcion: caso.descripcion,
          denunciante: caso.denunciante,
          destinatario: caso.destinatario,
          hechos: caso.hechos,
          petitorio: caso.petitorio,
          senalIds: caso.senalIds,
          contratoHashes: caso.contratoHashes,
          entidadCuits: caso.entidadCuits,
          incluirCadenaDePago: true,
        }),
      })
      if (!r.ok) {
        // Audit fix EH-W3: error inline en lugar de alert (que era
        // bloqueante + no copiable + se le escapaba al usuario).
        const txt = await r.text().catch(() => 'sin detalle')
        setPdfError(`HTTP ${r.status}: ${txt.slice(0, 300)}`)
        return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `denuncia_${caso.titulo.replace(/[^\w]+/g, '_')}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      update('estado', 'generado')
    } catch (e) {
      setPdfError(`Error de red: ${(e as Error).message}`)
    } finally {
      setGeneratingPdf(false)
    }
  }

  function exportJson() {
    const blob = new Blob([exportCaso(caso!)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${caso!.titulo.replace(/[^\w]+/g, '_')}.argos-caso.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div style={s.page}>
      <ForensicHeader />
      <main style={s.main}>
        <header style={s.head}>
          <div style={{ flex: 1 }}>
            <input
              type="text" value={caso.titulo}
              onChange={e => update('titulo', e.target.value)}
              style={s.headTitle}
              placeholder="Título del caso"
            />
            <div style={{ fontSize: 11, color: '#9BA3B4', marginTop: 4 }}>
              {caso.estado.toUpperCase()} · creado {new Date(caso.creadoEn).toLocaleDateString('es-AR')}
              · modificado {new Date(caso.modificadoEn).toLocaleString('es-AR')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportJson} style={s.headBtn}>↓ Exportar JSON</button>
            <button onClick={() => navigate('/casos')} style={s.headBtn}>← Volver</button>
            <button onClick={generarPdf} disabled={generatingPdf} style={s.primaryBtn}>
              {generatingPdf ? 'Generando…' : 'Generar PDF'}
            </button>
          </div>
        </header>
        {pdfError && (
          <div style={{
            padding: 12, background: '#3a1d1d', color: '#E25656', borderRadius: 4,
            marginBottom: 12, fontSize: 12, fontFamily: 'ui-monospace, monospace',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ flex: 1 }}>{pdfError}</span>
            <button
              onClick={() => navigator.clipboard.writeText(pdfError)
                .then(() => setPdfError(null))
                .catch(() => undefined)}
              style={{
                background: 'transparent', border: '1px solid #E25656',
                color: '#E25656', padding: '4px 10px', borderRadius: 3, fontSize: 11,
                cursor: 'pointer',
              }}
            >Copiar detalle</button>
            <button
              onClick={() => setPdfError(null)}
              style={{
                background: 'transparent', border: 'none', color: '#E25656',
                cursor: 'pointer', fontSize: 14,
              }}
            >×</button>
          </div>
        )}

        <div style={s.twoPane}>
          <div style={s.formPane}>
            <SectionTabs active={activeSection} onChange={setActiveSection} caso={caso} />

            {activeSection === 'senales' && (
              <SectionSenales caso={caso} onRemove={removeSenal} />
            )}
            {activeSection === 'actores' && (
              <SectionActores caso={caso} onRemovePj={removePj} onRemovePf={removePf} />
            )}
            {activeSection === 'notas' && (
              <SectionNotas
                value={caso.notas}
                onChange={v => update('notas', v)}
                desc={caso.descripcion}
                onDesc={v => update('descripcion', v)}
              />
            )}
            {activeSection === 'denunciante' && (
              <SectionDenunciante
                d={caso.denunciante}
                onChange={updateDenunciante}
                destinatario={caso.destinatario}
                setDestinatario={v => update('destinatario', v)}
              />
            )}
            {activeSection === 'hechos' && (
              <SectionHechos
                hechos={caso.hechos}
                onHechos={v => update('hechos', v)}
                petitorio={caso.petitorio}
                onPetitorio={v => update('petitorio', v)}
              />
            )}
          </div>

          <div style={s.previewPane}>
            <div style={s.previewLabel}>PREVIEW DEL PDF</div>
            <div style={s.previewDoc}>
              <PreviewPDF caso={caso} />
            </div>
          </div>
        </div>
      </main>
      <ForensicFooter />
    </div>
  )
}

function SectionTabs({ active, onChange, caso }: {
  active: string; onChange: (s: string) => void; caso: CasoLS
}) {
  const tabs = [
    { id: 'senales', label: 'Señales', count: caso.senalIds.length },
    { id: 'actores', label: 'Actores', count: caso.entidadCuits.length + caso.personaDnis.length },
    { id: 'notas', label: 'Notas' },
    { id: 'denunciante', label: 'Denunciante' },
    { id: 'hechos', label: 'Hechos / Petitorio' },
  ]
  return (
    <div style={s.tabs}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{ ...s.tab, ...(active === t.id ? s.tabActive : null) }}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span style={s.tabBadge}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

function SectionSenales({ caso, onRemove }: { caso: CasoLS; onRemove: (id: string) => void }) {
  if (caso.senalIds.length === 0) {
    return (
      <div style={s.emptySection}>
        <div style={{ color: '#9BA3B4', marginBottom: 12 }}>
          Sin señales adjuntadas todavía. Agregalas desde <Link to="/senales" style={s.link}>/senales</Link>.
        </div>
      </div>
    )
  }
  return (
    <ul style={s.list}>
      {caso.senalIds.map(id => (
        <li key={id} style={s.listItem}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#9BA3B4', flex: 1 }}>
            {id}
          </span>
          <button onClick={() => onRemove(id)} style={s.removeBtn}>×</button>
        </li>
      ))}
    </ul>
  )
}

function SectionActores({ caso, onRemovePj, onRemovePf }: {
  caso: CasoLS; onRemovePj: (cuit: string) => void; onRemovePf: (dni: string) => void
}) {
  const empty = caso.entidadCuits.length === 0 && caso.personaDnis.length === 0
  if (empty) {
    return (
      <div style={s.emptySection}>
        <div style={{ color: '#9BA3B4' }}>
          Sin actores adjuntados. Agregalos desde <Link to="/actores" style={s.link}>/actores</Link>
          {' '}o desde un perfil con +Caso.
        </div>
      </div>
    )
  }
  return (
    <div>
      {caso.entidadCuits.length > 0 && (
        <>
          <div style={s.subhead}>Personas Jurídicas</div>
          <ul style={s.list}>
            {caso.entidadCuits.map(cuit => (
              <li key={cuit} style={s.listItem}>
                <span style={{ color: '#ff9b5c', marginRight: 8 }}>■</span>
                <Link to={`/empresa/${cuit}`} style={{ ...s.link, flex: 1, fontFamily: 'ui-monospace, monospace' }}>
                  {cuit}
                </Link>
                <button onClick={() => onRemovePj(cuit)} style={s.removeBtn}>×</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {caso.personaDnis.length > 0 && (
        <>
          <div style={s.subhead}>Personas Físicas</div>
          <ul style={s.list}>
            {caso.personaDnis.map(dni => (
              <li key={dni} style={s.listItem}>
                <span style={{ color: '#7da3ff', marginRight: 8 }}>●</span>
                <Link to={`/persona/${dni}`} style={{ ...s.link, flex: 1, fontFamily: 'ui-monospace, monospace' }}>
                  {dni}
                </Link>
                <button onClick={() => onRemovePf(dni)} style={s.removeBtn}>×</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function SectionNotas({ value, onChange, desc, onDesc }: {
  value: string; onChange: (v: string) => void;
  desc: string; onDesc: (v: string) => void;
}) {
  return (
    <div style={s.formGrid}>
      <div>
        <div style={s.labelText}>Descripción breve</div>
        <input
          type="text" value={desc} onChange={e => onDesc(e.target.value)}
          style={s.input} placeholder="Una línea que resume el caso"
        />
      </div>
      <div>
        <div style={s.labelText}>Notas del periodista (markdown)</div>
        <textarea
          value={value} onChange={e => onChange(e.target.value)}
          rows={14} style={s.textarea}
          placeholder="Notas, contexto, narrativa..."
        />
      </div>
    </div>
  )
}

function SectionDenunciante({
  d, onChange, destinatario, setDestinatario,
}: {
  d: CasoLS['denunciante']
  onChange: <K extends keyof CasoLS['denunciante']>(k: K, v: CasoLS['denunciante'][K]) => void
  destinatario: CasoLS['destinatario']
  setDestinatario: (v: CasoLS['destinatario']) => void
}) {
  return (
    <div style={s.formGrid}>
      <div>
        <div style={s.labelText}>Nombre y apellido</div>
        <input value={d.nombre} onChange={e => onChange('nombre', e.target.value)} style={s.input} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={s.labelText}>DNI</div>
          <input value={d.dni} onChange={e => onChange('dni', e.target.value)} style={s.input} />
        </div>
        <div>
          <div style={s.labelText}>Teléfono</div>
          <input value={d.telefono ?? ''} onChange={e => onChange('telefono', e.target.value)} style={s.input} />
        </div>
      </div>
      <div>
        <div style={s.labelText}>Email</div>
        <input value={d.email} onChange={e => onChange('email', e.target.value)} style={s.input} type="email" />
      </div>
      <div>
        <div style={s.labelText}>Domicilio</div>
        <input value={d.domicilio} onChange={e => onChange('domicilio', e.target.value)} style={s.input} />
      </div>
      <div>
        <div style={s.labelText}>Destinatario</div>
        <select value={destinatario} onChange={e => setDestinatario(e.target.value as CasoLS['destinatario'])} style={s.select}>
          {DESTINATARIOS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
    </div>
  )
}

function SectionHechos({ hechos, onHechos, petitorio, onPetitorio }: {
  hechos: string; onHechos: (v: string) => void;
  petitorio: string; onPetitorio: (v: string) => void;
}) {
  return (
    <div style={s.formGrid}>
      <div>
        <div style={s.labelText}>Hechos</div>
        <textarea value={hechos} onChange={e => onHechos(e.target.value)} rows={8} style={s.textarea} />
      </div>
      <div>
        <div style={s.labelText}>Petitorio</div>
        <textarea value={petitorio} onChange={e => onPetitorio(e.target.value)} rows={6} style={s.textarea} />
      </div>
    </div>
  )
}

function PreviewPDF({ caso }: { caso: CasoLS }) {
  const desti = useMemo(() =>
    DESTINATARIOS.find(d => d.id === caso.destinatario)?.label ?? caso.destinatario,
    [caso.destinatario],
  )
  return (
    <div>
      <div style={pdf.header}>
        <div style={pdf.formal}>SR./SRA.</div>
        <div style={pdf.dest}>{desti.toUpperCase()}</div>
        <div style={pdf.formal}>S./D.</div>
      </div>
      <div style={pdf.body}>
        <p style={pdf.p}>
          {caso.denunciante.nombre || '[Nombre del denunciante]'}, DNI {caso.denunciante.dni || '[DNI]'},
          con domicilio en {caso.denunciante.domicilio || '[Domicilio]'},
          email {caso.denunciante.email || '[Email]'}, me presento ante US./Sa.
          a los efectos de denunciar lo siguiente:
        </p>
        <h3 style={pdf.section}>HECHOS</h3>
        <p style={pdf.p}>{caso.hechos || '[Pendiente de redactar — ver pestaña "Hechos / Petitorio"]'}</p>

        <h3 style={pdf.section}>EVIDENCIA</h3>
        {caso.senalIds.length > 0 ? (
          <ul style={pdf.list}>
            {caso.senalIds.map(id => (
              <li key={id} style={pdf.li}>
                Señal ARGOS <code>{id}</code> (verificable en /senales?focus={id})
              </li>
            ))}
          </ul>
        ) : (
          <p style={pdf.p}>[Sin señales adjuntadas]</p>
        )}
        {caso.entidadCuits.length > 0 && (
          <p style={pdf.p}>
            <strong>Personas jurídicas implicadas:</strong>{' '}
            {caso.entidadCuits.join(' · ')}
          </p>
        )}
        {caso.personaDnis.length > 0 && (
          <p style={pdf.p}>
            <strong>Personas físicas implicadas:</strong>{' '}
            {caso.personaDnis.join(' · ')}
          </p>
        )}

        <h3 style={pdf.section}>PETITORIO</h3>
        <p style={pdf.p}>{caso.petitorio || '[Pendiente]'}</p>

        {caso.notas && (
          <>
            <h3 style={pdf.section}>NOTAS COMPLEMENTARIAS</h3>
            <p style={pdf.p}>{caso.notas}</p>
          </>
        )}

        <div style={pdf.footer}>
          Generado por ARGOS · {new Date().toLocaleDateString('es-AR')} ·
          Toda señal con fuente trazable
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    background: '#0d1117', color: '#dde3ee',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  main: { flex: 1, maxWidth: 1480, width: '100%', margin: '0 auto', padding: '20px 24px' },
  head: {
    display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18,
    paddingBottom: 14, borderBottom: '1px solid #1f2937',
  },
  headTitle: {
    background: 'transparent', border: 'none', borderBottom: '1px dashed #2a3140',
    color: '#dde3ee', fontSize: 20, fontWeight: 600, padding: '4px 0',
    width: '100%', outline: 'none',
  },
  headBtn: {
    background: 'transparent', border: '1px solid #2a3140', color: '#dde3ee',
    padding: '6px 12px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
  },
  primaryBtn: {
    background: '#62C7A022', border: '1px solid #62C7A0', color: '#62C7A0',
    padding: '6px 14px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
  },

  twoPane: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
    height: 'calc(100vh - 200px)', minHeight: 500,
  },
  formPane: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  previewPane: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  previewLabel: {
    fontSize: 10, letterSpacing: 1.5, color: '#9BA3B4', fontWeight: 600,
    textTransform: 'uppercase' as const,
    padding: '10px 14px', borderBottom: '1px solid #1f2937',
  },
  previewDoc: {
    flex: 1, overflow: 'auto', background: '#fff', color: '#222',
    padding: '32px 40px',
    fontFamily: 'Georgia, "Times New Roman", serif',
  },

  tabs: {
    display: 'flex', gap: 0, borderBottom: '1px solid #1f2937', overflow: 'auto',
  },
  tab: {
    background: 'transparent', border: 'none',
    color: '#9BA3B4', padding: '10px 14px', fontSize: 12, cursor: 'pointer',
    borderBottom: '2px solid transparent',
    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' as const,
  },
  tabActive: {
    color: '#dde3ee', borderBottom: '2px solid #62C7A0',
  },
  tabBadge: {
    background: '#1f2937', color: '#dde3ee',
    fontSize: 10, padding: '1px 6px', borderRadius: 8, minWidth: 18, textAlign: 'center' as const,
    fontFamily: 'ui-monospace, monospace',
  },

  formGrid: { display: 'flex', flexDirection: 'column' as const, gap: 14, padding: 16, overflow: 'auto' },
  labelText: { fontSize: 10, color: '#9BA3B4', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' as const },
  input: {
    width: '100%', background: '#0d1117', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '7px 10px', borderRadius: 3, fontSize: 12,
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%', background: '#0d1117', border: '1px solid #2a3140',
    color: '#dde3ee', padding: 10, borderRadius: 3, fontSize: 12,
    boxSizing: 'border-box' as const, fontFamily: 'inherit', resize: 'vertical' as const,
  },
  select: {
    background: '#0d1117', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '7px 10px', borderRadius: 3, fontSize: 12,
  },

  emptySection: { padding: 16, fontSize: 13 },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  listItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 16px', borderBottom: '1px solid #1f2937',
  },
  removeBtn: {
    background: 'transparent', border: 'none', color: '#9BA3B4',
    cursor: 'pointer', fontSize: 16, padding: '0 6px',
  },
  subhead: {
    fontSize: 10, letterSpacing: 1.5, color: '#9BA3B4',
    textTransform: 'uppercase' as const, padding: '12px 16px 6px',
  },

  link: { color: '#7da3ff', textDecoration: 'none' },
}

const pdf: Record<string, React.CSSProperties> = {
  header: { textAlign: 'center' as const, marginBottom: 28 },
  formal: { fontSize: 12, color: '#666', margin: '4px 0' },
  dest: { fontSize: 14, fontWeight: 700, margin: '6px 0', color: '#222' },
  body: { fontSize: 13, lineHeight: 1.6, color: '#222' },
  section: {
    fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8,
    textTransform: 'uppercase' as const, letterSpacing: 1, color: '#222',
    borderBottom: '1px solid #ddd', paddingBottom: 4,
  },
  p: { margin: '6px 0', textAlign: 'justify' as const, color: '#333' },
  list: { paddingLeft: 24, margin: '8px 0' },
  li: { marginBottom: 4, color: '#333' },
  footer: {
    marginTop: 32, paddingTop: 12, borderTop: '1px solid #ddd',
    fontSize: 10, color: '#999', textAlign: 'center' as const,
  },
}

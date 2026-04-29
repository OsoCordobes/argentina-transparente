/**
 * Metodologia.tsx — superficie /metodologia (PLAN-UI Módulo #8).
 *
 * TOC sidebar Notion-style + scroll-spy + demos vivos del módulo-11
 * y el cap dinámico de score. Footer con commit hash.
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { ForensicHeader, ForensicFooter } from '@/components/argos/ForensicHeader'

const SECTIONS = [
  { id: 'que-hace', label: 'Qué hace ARGOS' },
  { id: 'fuentes', label: 'Fuentes de datos' },
  { id: 'identidad', label: 'Identidad PF / PJ' },
  { id: 'detectores', label: 'Detectores' },
  { id: 'garantias', label: 'Garantías de proceso' },
  { id: 'limitaciones', label: 'Limitaciones honestas' },
  { id: 'licencia', label: 'Licencia y responsabilidad' },
] as const

export default function Metodologia() {
  const [active, setActive] = useState<string>(SECTIONS[0].id)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // Scroll-spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = e.target.getAttribute('data-section-id')
            if (id) setActive(id)
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px' },
    )
    Object.values(sectionRefs.current).forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [])

  function jumpTo(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={s.page}>
      <ForensicHeader />
      <main style={s.main}>
        <div style={s.layout}>
          <nav style={s.toc}>
            <div style={s.tocLabel}>METODOLOGÍA</div>
            {SECTIONS.map(sec => (
              <button
                key={sec.id}
                onClick={() => jumpTo(sec.id)}
                style={{
                  ...s.tocBtn,
                  ...(active === sec.id ? s.tocBtnActive : null),
                }}
              >
                {active === sec.id ? '» ' : '  '}{sec.label}
              </button>
            ))}
            <div style={s.commitHash}>
              v1.1 · ARGOS Fase D · {new Date().toLocaleDateString('es-AR')}
            </div>
          </nav>

          <article style={s.content}>
            <Section id="que-hace" refs={sectionRefs}>
              <h2 style={s.h2}>Qué hace ARGOS</h2>
              <p style={s.p}>
                ARGOS audita el gasto público argentino contrastando datasets
                de compras públicas, registros societarios, declaraciones
                juradas y aportes a campañas con un motor de detección que
                emite <strong>señales</strong> sobre patrones de riesgo
                (concentración, conflicto de intereses potencial,
                irregularidad administrativa).
              </p>
              <p style={s.p}>
                <strong>La plataforma describe, no acusa.</strong> Cada señal
                requiere verificación humana antes de poder citarse como
                evidencia. Los usuarios — periodistas, fiscales, auditores —
                son quienes asumen la responsabilidad de la denuncia
                cuando arman un caso y firman el PDF.
              </p>
              <CycleDiagram />
            </Section>

            <Section id="fuentes" refs={sectionRefs}>
              <h2 style={s.h2}>Fuentes de datos</h2>
              <p style={s.p}>
                Todo dato cargado en ARGOS lleva su <code style={s.code}>fuente_url</code>
                {' '}al portal oficial. La plataforma no publica nada sin
                origen verificable.
              </p>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Fuente</th>
                    <th style={s.th}>Cobertura</th>
                    <th style={s.th}>Frecuencia</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={s.tr}>
                    <td style={s.td}>Compras Córdoba Capital</td>
                    <td style={s.td}>2015–presente</td>
                    <td style={s.td}>API REST diaria</td>
                  </tr>
                  <tr style={s.tr}>
                    <td style={s.td}>Boletín Oficial Córdoba</td>
                    <td style={s.td}>2013–2018 (OCR)</td>
                    <td style={s.td}>histórico</td>
                  </tr>
                  <tr style={s.tr}>
                    <td style={s.td}>IGJ entidades + autoridades</td>
                    <td style={s.td}>nacional bulk</td>
                    <td style={s.td}>mensual</td>
                  </tr>
                  <tr style={s.tr}>
                    <td style={s.td}>DDJJ patrimoniales</td>
                    <td style={s.td}>cordoba-capital 2016–presente</td>
                    <td style={s.td}>anual</td>
                  </tr>
                  <tr style={s.tr}>
                    <td style={s.td}>CNE aportantes a campañas</td>
                    <td style={s.td}>nacional 2019–presente</td>
                    <td style={s.td}>por elección</td>
                  </tr>
                  <tr style={s.tr}>
                    <td style={s.td}>RNS / AFIP padrón</td>
                    <td style={s.td}>nacional</td>
                    <td style={s.td}>según disponibilidad</td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Section id="identidad" refs={sectionRefs}>
              <h2 style={s.h2}>Identidad PF / PJ</h2>
              <p style={s.p}>
                Argentina distingue duramente <strong>Persona Física (PF)</strong>{' '}
                de <strong>Persona Jurídica (PJ)</strong>. ARGOS materializa
                esa distinción en dos tablas maestras: <code style={s.code}>personas_fisicas</code>
                {' '}(PK = DNI 8 dígitos) y <code style={s.code}>personas_juridicas</code>
                {' '}(PK = CUIT prefijo 30/33/34).
              </p>
              <p style={s.p}>
                Toda fila de identidad se valida con módulo-11 antes de
                insertarse. Las que no validan caen a <code style={s.code}>quarantine</code>
                {' '}con razón explícita.
              </p>
              <Modulo11Demo />
            </Section>

            <Section id="detectores" refs={sectionRefs}>
              <h2 style={s.h2}>Detectores</h2>
              <p style={s.p}>
                ARGOS opera 16 detectores agrupados en 3 tiers según la
                fuerza de su evidencia:
              </p>
              <ul style={s.list}>
                <li style={s.li}><strong>Tier 1 publicable</strong> — CUIT verificado
                  ambos lados del cruce. Ej.: <code style={s.code}>aportante_de_campana_y_proveedor</code>,
                  {' '}<code style={s.code}>concentracion_cuit</code>.</li>
                <li style={s.li}><strong>Tier 2 administrativo</strong> — irregularidades
                  de proceso confirmables. Ej.: <code style={s.code}>ddjj_omitida</code>,
                  {' '}<code style={s.code}>gap_compromiso_pagado</code>.</li>
                <li style={s.li}><strong>Tier 3 exploratorio</strong> — match por
                  nombre con cap-60 sin verificación de DNI. Ej.:
                  {' '}<code style={s.code}>conflicto_funcionario_proveedor</code>{' '}
                  (pasa a Tier 1 cuando hay DNI confirmado).</li>
              </ul>
              <CapDemo />
            </Section>

            <Section id="garantias" refs={sectionRefs}>
              <h2 style={s.h2}>Garantías de proceso</h2>
              <ol style={s.list}>
                <li style={s.li}>
                  <strong>Identidad primero.</strong> Toda PF lleva DNI; toda PJ lleva
                  CUIT. Validación módulo-11 obligatoria.
                </li>
                <li style={s.li}>
                  <strong>Cap dinámico de score.</strong> Sin DNI verificado externamente,
                  cap-60 (severidad ≤ moderada). Con DNI verificado, cap-95.
                </li>
                <li style={s.li}>
                  <strong>Filtro geográfico.</strong> Una empresa con domicilio fiscal
                  en otra provincia que la del funcionario no genera señal de conflicto.
                </li>
                <li style={s.li}>
                  <strong>Badge de verificación universal.</strong> ✓ verificada · ◌ sin
                  verificar · ✗ descartada · ⚠ bloqueada. Innegociable.
                </li>
                <li style={s.li}>
                  <strong>Trazabilidad por fila.</strong> origen + fecha + método +
                  formato + nivel_confianza + fuente_url. Sin URL, no entra al sistema.
                </li>
                <li style={s.li}>
                  <strong>Tier 4-5 LLM-ambiguous</strong> nunca alimenta detectores
                  publicables. Solo modo exploratorio.
                </li>
              </ol>
            </Section>

            <Section id="limitaciones" refs={sectionRefs}>
              <h2 style={s.h2}>Limitaciones honestas</h2>
              <ul style={s.list}>
                <li style={s.li}>
                  ARGOS NO accede a registros que no son públicos (registro civil,
                  RENAPER, AFIP padrón completo). Si una verificación de DNI requiere
                  esos datos, queda en estado <code style={s.code}>bloqueada</code>.
                </li>
                <li style={s.li}>
                  La cobertura geográfica del MVP es Córdoba Capital. Connectors para
                  CABA / Nación / Santa Fe existen pero no se exponen en el menú
                  hasta validar calidad de datos.
                </li>
                <li style={s.li}>
                  El motor puede generar falsos positivos por homonimia. Por eso
                  el badge universal y la verificación humana son obligatorios.
                </li>
                <li style={s.li}>
                  Errores conocidos se trackean en GitHub Issues del repo público.
                </li>
              </ul>
            </Section>

            <Section id="licencia" refs={sectionRefs}>
              <h2 style={s.h2}>Licencia y responsabilidad</h2>
              <p style={s.p}>
                Código abierto bajo AGPL (sujeto a confirmación legal). Datos
                cargados respetan la licencia de cada fuente original. Cualquier
                uso comercial debe consultar al equipo.
              </p>
              <p style={s.p}>
                <strong>Responsabilidad del usuario:</strong> al firmar un PDF de
                denuncia generado por ARGOS, el usuario asume la responsabilidad
                de las afirmaciones que contiene. ARGOS no garantiza que las
                señales detectadas constituyan delito; solo que son patrones
                detectados según los criterios documentados arriba.
              </p>
            </Section>

            <div style={s.docFooter}>
              ARGOS · Argentina Transparente · Fase D · v1.1 ·{' '}
              {new Date().toLocaleDateString('es-AR')} · La plataforma describe, no acusa.
            </div>
          </article>
        </div>
      </main>
      <ForensicFooter />
    </div>
  )
}

function Section({
  id, refs, children,
}: {
  id: string
  refs: React.MutableRefObject<Record<string, HTMLElement | null>>
  children: React.ReactNode
}) {
  return (
    <section
      ref={el => { refs.current[id] = el }}
      data-section-id={id}
      id={id}
      style={s.section}
    >
      {children}
    </section>
  )
}

// ─── Demo: validador módulo-11 interactivo ──────────────────────────────────

function Modulo11Demo() {
  const [input, setInput] = useState('30-71234567-1')

  const result = useMemo(() => {
    const norm = input.replace(/\D/g, '')
    if (norm.length !== 11) return { ok: false, reason: 'Debe tener 11 dígitos', norm }
    const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    const PREFIJOS_VALIDOS = ['20', '23', '24', '27', '30', '33', '34']
    const prefijo = norm.slice(0, 2)
    if (!PREFIJOS_VALIDOS.includes(prefijo)) {
      return { ok: false, reason: `Prefijo "${prefijo}" no es válido (PF: 20/23/24/27, PJ: 30/33/34)`, norm }
    }
    const productos: number[] = []
    let suma = 0
    for (let i = 0; i < 10; i++) {
      const p = Number(norm[i]) * PESOS[i]
      productos.push(p); suma += p
    }
    const resto = suma % 11
    let dvEsperado = 11 - resto
    if (dvEsperado === 11) dvEsperado = 0
    const dvActual = Number(norm[10])
    if (dvEsperado === 10) {
      return { ok: false, reason: 'CUIT no asignable (DV resultó 10)', norm, productos, suma, resto, dvEsperado, dvActual }
    }
    return {
      ok: dvEsperado === dvActual,
      reason: dvEsperado === dvActual ? 'CUIT válido' : `DV esperado ${dvEsperado}, recibido ${dvActual}`,
      norm, productos, suma, resto, dvEsperado, dvActual,
      tipo: ['20', '23', '24', '27'].includes(prefijo) ? 'PF' : 'PJ',
    }
  }, [input])

  return (
    <div style={s.demo}>
      <div style={s.demoLabel}>VALIDADOR MÓDULO-11 (DEMO)</div>
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="20-12345678-1"
        style={s.demoInput}
      />
      {result.norm.length === 11 && 'productos' in result && result.productos && (
        <div style={s.demoOut}>
          <div style={s.demoLine}>Dígitos: <span style={s.demoMono}>{result.norm.split('').join(' ')}</span></div>
          <div style={s.demoLine}>Pesos: <span style={s.demoMono}>5 4 3 2 7 6 5 4 3 2</span></div>
          <div style={s.demoLine}>Productos: <span style={s.demoMono}>
            {result.productos.join('+')} = {result.suma}
          </span></div>
          <div style={s.demoLine}>{result.suma} % 11 = {result.resto} → 11 - {result.resto} = <strong>{result.dvEsperado}</strong></div>
          <div style={s.demoLine}>DV recibido: <span style={s.demoMono}>{result.dvActual}</span></div>
          <div style={{
            ...s.demoLine, marginTop: 8, padding: 8,
            background: result.ok ? '#62C7A022' : '#E2565622',
            border: `1px solid ${result.ok ? '#62C7A0' : '#E25656'}`,
            borderRadius: 3,
          }}>
            {result.ok ? '✓ válido' : '✗ inválido'}
            {' — '}{result.reason}
            {result.ok && 'tipo' in result && (
              <span style={{ marginLeft: 8, fontSize: 11 }}>· {result.tipo}</span>
            )}
          </div>
        </div>
      )}
      {result.norm.length !== 11 && (
        <div style={{ ...s.demoLine, color: '#9BA3B4' }}>{result.reason}</div>
      )}
    </div>
  )
}

// ─── Demo: cap dinámico de score ────────────────────────────────────────────

function CapDemo() {
  const [score, setScore] = useState(78)
  const [dniVerificado, setDniVerificado] = useState(false)
  const cap = dniVerificado ? 95 : 60
  const finalScore = Math.min(score, cap)
  const sev = finalScore >= 75 ? 'grave' : finalScore >= 55 ? 'moderada' : 'leve'
  const sevColor = sev === 'grave' ? '#E25656' : sev === 'moderada' ? '#F5B544' : '#9BA3B4'

  return (
    <div style={s.demo}>
      <div style={s.demoLabel}>CAP DINÁMICO DE SCORE (DEMO)</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: '#9BA3B4' }}>
          <input
            type="checkbox" checked={dniVerificado}
            onChange={e => setDniVerificado(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          DNI verificado externamente
        </label>
        <span style={{ fontSize: 11, color: '#9BA3B4' }}>
          Cap actual: <strong style={{ color: '#dde3ee' }}>{cap}</strong>
        </span>
      </div>
      <div style={{ marginBottom: 12 }}>
        <input
          type="range" min={0} max={100} value={score}
          onChange={e => setScore(Number(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9BA3B4' }}>
          <span>0</span><span>50</span><span>100</span>
        </div>
      </div>
      <div style={{ ...s.demoLine, fontSize: 13 }}>
        Score crudo: <span style={s.demoMono}>{score}</span>
        {' → '}
        Cap aplicado: <span style={s.demoMono}>{finalScore}</span>
        {' → '}
        Severidad: <span style={{ color: sevColor, fontWeight: 600 }}>{sev}</span>
      </div>
      {score > cap && (
        <div style={{ fontSize: 11, color: '#F5B544', marginTop: 6 }}>
          ⚠ Sin DNI verificado, este score se cappa de {score} a {cap}.
        </div>
      )}
    </div>
  )
}

// ─── Diagrama del ciclo ARGOS ───────────────────────────────────────────────

function CycleDiagram() {
  const steps = [
    { label: 'Datos crudos', sub: 'fuentes oficiales con URL' },
    { label: 'Identidad', sub: 'PF/PJ módulo-11' },
    { label: 'Detectores', sub: '16 patrones tier 1-3' },
    { label: 'Verificación humana', sub: 'badge universal' },
    { label: 'Denuncia', sub: 'PDF con cadena de custodia' },
  ]
  return (
    <div style={s.cycleWrap}>
      {steps.map((step, i) => (
        <div key={step.label} style={s.cycleStep}>
          <div style={s.cycleNum}>{i + 1}</div>
          <div style={s.cycleLabel}>{step.label}</div>
          <div style={s.cycleSub}>{step.sub}</div>
          {i < steps.length - 1 && <div style={s.cycleArrow}>→</div>}
        </div>
      ))}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    background: '#0d1117', color: '#dde3ee',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  main: { flex: 1, maxWidth: 1480, width: '100%', margin: '0 auto', padding: '24px' },

  layout: { display: 'grid', gridTemplateColumns: '220px 1fr', gap: 32 },
  toc: {
    position: 'sticky', top: 80, alignSelf: 'flex-start',
    display: 'flex', flexDirection: 'column' as const, gap: 2,
    paddingTop: 6,
  },
  tocLabel: {
    fontSize: 9, letterSpacing: 1.5, color: '#9BA3B4',
    textTransform: 'uppercase' as const, fontWeight: 600, marginBottom: 8,
  },
  tocBtn: {
    background: 'transparent', border: 'none',
    color: '#9BA3B4', textAlign: 'left' as const,
    padding: '6px 8px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tocBtnActive: { color: '#dde3ee', background: '#161b22' },
  commitHash: {
    fontSize: 10, color: '#9BA3B4', marginTop: 24,
    paddingTop: 12, borderTop: '1px solid #1f2937',
    fontFamily: 'ui-monospace, monospace',
  },

  content: { minWidth: 0, paddingBottom: 60 },
  section: { marginBottom: 48, scrollMarginTop: 80 },
  h2: {
    fontSize: 24, fontWeight: 600, color: '#dde3ee',
    marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #1f2937',
  },
  p: { fontSize: 14, color: '#dde3ee', lineHeight: 1.7, margin: '12px 0' },
  list: { fontSize: 14, color: '#dde3ee', lineHeight: 1.7, paddingLeft: 22, margin: '12px 0' },
  li: { marginBottom: 6 },
  code: {
    background: '#161b22', color: '#62C7A0',
    padding: '2px 6px', borderRadius: 3,
    fontFamily: 'ui-monospace, monospace', fontSize: 12,
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12, marginTop: 12 },
  th: {
    padding: '8px 10px', textAlign: 'left' as const, fontSize: 10,
    color: '#9BA3B4', letterSpacing: 1.5,
    textTransform: 'uppercase' as const, fontWeight: 600,
    borderBottom: '1px solid #2a3140',
  },
  tr: { borderBottom: '1px solid #1f2937' },
  td: { padding: '8px 10px', color: '#dde3ee' },

  // Demo boxes
  demo: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    padding: 16, marginTop: 14,
  },
  demoLabel: {
    fontSize: 10, color: '#9BA3B4', letterSpacing: 1.5, fontWeight: 600,
    textTransform: 'uppercase' as const, marginBottom: 10,
  },
  demoInput: {
    width: '100%', background: '#0d1117', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '8px 10px', borderRadius: 3,
    fontSize: 14, fontFamily: 'ui-monospace, monospace',
    boxSizing: 'border-box' as const, marginBottom: 12,
  },
  demoOut: { fontSize: 12, lineHeight: 1.7, color: '#9BA3B4' },
  demoLine: { fontSize: 12, color: '#dde3ee', margin: '4px 0' },
  demoMono: {
    fontFamily: 'ui-monospace, monospace', color: '#62C7A0',
  },

  // Cycle diagram
  cycleWrap: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8,
    marginTop: 20, padding: '14px 0',
  },
  cycleStep: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    padding: '10px 14px', position: 'relative' as const,
    flex: '1 1 140px',
  },
  cycleNum: {
    position: 'absolute' as const, top: -8, left: 10,
    background: '#62C7A0', color: '#0d1117', fontWeight: 700,
    width: 18, height: 18, borderRadius: '50%',
    fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  cycleLabel: { fontSize: 12, color: '#dde3ee', fontWeight: 600, marginTop: 4 },
  cycleSub: { fontSize: 10, color: '#9BA3B4', marginTop: 2 },
  cycleArrow: {
    position: 'absolute' as const, right: -16, top: '50%',
    transform: 'translateY(-50%)', color: '#3a4150', fontSize: 18,
  },

  docFooter: {
    fontSize: 11, color: '#9BA3B4',
    paddingTop: 24, marginTop: 24, borderTop: '1px solid #1f2937',
    textAlign: 'center' as const, fontFamily: 'ui-monospace, monospace',
  },
}

// ─── Dossier Editor ──────────────────────────────────────────────
// 3-mode document editor. Blocks can be rewritten by AI inline.
// Modes: Forense / Periodístico / Denuncia judicial.
// Export: PDF / DOCX / Markdown / Paquete ZIP (con evidencia).

const MODE_META = {
  forense: {
    label: 'Forense',
    desc: 'Estrictamente descriptivo. Sin interpretación.',
    accent: 'var(--gray-700)',
    eyebrow: 'Informe técnico',
  },
  periodistico: {
    label: 'Periodístico',
    desc: 'Narrativo, con hipótesis claramente marcadas.',
    accent: 'var(--blue-600)',
    eyebrow: 'Investigación periodística',
  },
  denuncia: {
    label: 'Denuncia',
    desc: 'Formato judicial. Hechos + prueba + normativa invocada.',
    accent: 'var(--red-600)',
    eyebrow: 'Denuncia penal · borrador',
  },
};

// Seed content per mode. In production, each block is the AI's initial draft
// returned from POST /api/dossier/:caso_id/render with { modo }.
const DOSSIER_SEED = {
  forense: {
    title: 'Caso S-271 · Resumen técnico',
    subtitle: 'Pavimentación Ruta S-271 · Período 2019–2024',
    blocks: [
      {
        id: 'b1', heading: 'Antecedentes',
        body: 'La empresa TECNOSERV SA (CUIT 30-71234567-9) figura como adjudicataria de 18 contratos emitidos por la Secretaría de Obras Públicas de la Municipalidad de Córdoba Capital entre 2019-01-01 y 2024-08-31. Monto total adjudicado: $2.847.392.100 (ARS).',
      },
      {
        id: 'b2', heading: 'Concentración de proveedor',
        body: 'Sobre un universo de 214 contratos emitidos por la Secretaría en el período analizado, la empresa mencionada captura el 74,3% del gasto. Las 5 empresas siguientes en volumen captan en conjunto el 14,1%.',
      },
      {
        id: 'b3', heading: 'Señales detectadas',
        body: 'El motor de análisis registra 7 señales asociadas a la entidad: 2 graves (concentración de proveedor · aportante que es contratista), 3 moderadas (fraccionamiento avanzado · red de empresas con directores compartidos · empresa vinculada sin empleados declarados), y 2 leves.',
      },
      {
        id: 'b4', heading: 'Fuentes consultadas',
        body: 'Portal de Datos Abiertos · Municipalidad de Córdoba (sincronización 2024-10-14). Cámara Nacional Electoral · declaraciones de aportes 2019. Boletín Oficial Municipal. Inspección General de Justicia · registros societarios. AFIP · padrón de empleadores.',
      },
    ],
  },
  periodistico: {
    title: 'La ruta que construyó una fortuna',
    subtitle: 'Cómo una empresa con 12 empleados se llevó $2.847 millones en contratos municipales',
    blocks: [
      {
        id: 'b1', heading: null,
        lede: true,
        body: 'Entre 2019 y 2024 la Municipalidad de Córdoba adjudicó a TECNOSERV SA contratos por $2.847 millones — el 74% del presupuesto ejecutado por la Secretaría de Obras Públicas. La historia empieza un año antes, cuando la misma empresa aportó $2,4 millones a la campaña que llevaría al poder a la gestión que firmaría los contratos.',
      },
      {
        id: 'b2', heading: 'Una red chica',
        body: 'Los directores de TECNOSERV figuran también en GRUPO VIAL CENTRO SA y PROVEER SA — tres empresas que comparten directivos y compiten (o no) entre sí por los mismos contratos. El cruce de registros de la Inspección General de Justicia con el padrón de proveedores municipal devuelve una red de al menos cinco sociedades con vínculos entrecruzados.',
      },
      {
        id: 'b3', heading: 'El año sin licitación',
        body: '12 de los 18 contratos fueron firmados bajo el régimen de "contratación directa", evitando los procesos competitivos. Tres de los restantes son prórrogas del mismo acuerdo — técnicamente legales pero repetidamente observadas por la Auditoría Municipal.',
      },
      {
        id: 'b4', heading: 'Qué dice la empresa',
        body: 'Consultada por este medio, TECNOSERV SA respondió por escrito que "cumple con todos los requisitos legales" y que "compite en igualdad de condiciones con cualquier otro oferente". La Secretaría de Obras Públicas no respondió pedidos de información hasta el cierre de esta nota.',
      },
    ],
  },
  denuncia: {
    title: 'Denuncia penal · art. 256 y 265 CP',
    subtitle: 'Expte. s/n · Ministerio Público Fiscal · Jurisdicción Córdoba Capital',
    blocks: [
      {
        id: 'b1', heading: 'I. Hechos',
        body: 'Que se formula la presente denuncia contra quien resulte responsable por la presunta comisión de los delitos tipificados en los artículos 256 (Cohecho) y 265 (Negociaciones incompatibles con el ejercicio de funciones públicas) del Código Penal de la Nación, en base a los hechos que a continuación se detallan, todos documentados y con respaldo en fuentes oficiales cuya cadena de custodia se adjunta como Anexo I.',
      },
      {
        id: 'b2', heading: 'II. Prueba documental',
        body: 'Se acompaña: (a) Registro de adjudicaciones emitido por el Portal de Datos Abiertos de la Municipalidad de Córdoba, exportado el 2024-10-14, hash SHA-256 verificado; (b) Declaración de aportes de campaña 2019 emitida por la Cámara Nacional Electoral; (c) Registros societarios de la Inspección General de Justicia correspondientes a TECNOSERV SA, GRUPO VIAL CENTRO SA y PROVEER SA; (d) Informe de cruce automatizado producido por el sistema ARGOS, con el detalle del algoritmo aplicado.',
      },
      {
        id: 'b3', heading: 'III. Marco normativo',
        body: 'La conducta denunciada encuadraría prima facie en los tipos penales de: Cohecho pasivo (art. 256 CP), en cuanto el funcionario público habría recibido un beneficio en relación con el ejercicio de su función. Negociaciones incompatibles (art. 265 CP), en cuanto habría participado en contrataciones teniendo interés económico directo. Adicionalmente, se habrían violado: Ley 2095 · art. 10 (principio de concurrencia), Ley 26.215 · art. 44 (financiamiento de campañas), Ley 19.550 · art. 33 (sociedades vinculadas).',
      },
      {
        id: 'b4', heading: 'IV. Petición',
        body: 'Por todo lo expuesto, solicito: (1) se tenga por presentada la presente denuncia; (2) se ordene la instrucción del sumario pertinente; (3) se requieran a los organismos mencionados los expedientes administrativos completos; (4) se oiga en declaración testimonial a los firmantes de los actos administrativos observados. Reservo el derecho de ampliar la presente.',
      },
    ],
  },
};

function DossierEditor({ mode, onChangeMode, onClose, onFeedback }) {
  const meta = MODE_META[mode];
  const doc = DOSSIER_SEED[mode];
  const [blocks, setBlocks] = React.useState(doc.blocks);
  const [rewriting, setRewriting] = React.useState(null); // blockId

  // Reset blocks when mode changes
  React.useEffect(() => { setBlocks(DOSSIER_SEED[mode].blocks); }, [mode]);

  const rewrite = (blockId, instruction) => {
    setRewriting(blockId);
    // Simulated AI rewrite (in production: POST /api/ai with cached case context)
    setTimeout(() => {
      setBlocks(bs => bs.map(b => b.id !== blockId ? b : ({
        ...b,
        body: instructionApply(b.body, instruction),
      })));
      setRewriting(null);
    }, 900);
  };

  return (
    <div className={`dossier-editor mode-${mode}`}>
      {/* Mode bar */}
      <div className="de-mode-bar">
        <div className="de-mode-bar-left">
          <div className="eyebrow">Dossier · {meta.eyebrow}</div>
          <div className="de-mode-desc">{meta.desc}</div>
        </div>
        <div className="de-mode-switcher">
          {Object.entries(MODE_META).map(([k, m]) => (
            <button
              key={k}
              className={`de-mode-btn ${mode === k ? 'on' : ''}`}
              onClick={() => onChangeMode(k)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="de-mode-bar-right">
          <button className="top-action">{I.ext({ s: 12 })} PDF</button>
          <button className="top-action">{I.ext({ s: 12 })} DOCX</button>
          <button className="top-action">{I.ext({ s: 12 })} MD</button>
          <button className="top-action primary">{I.share({ s: 12 })} Paquete ZIP</button>
        </div>
      </div>

      {/* Paper */}
      <div className="de-stage">
        <article className="de-paper">
          <header className="de-header">
            <div className="de-paper-eyebrow" style={{ color: meta.accent }}>{meta.eyebrow.toUpperCase()}</div>
            <h1 className="de-title">{doc.title}</h1>
            <div className="de-subtitle">{doc.subtitle}</div>
            <div className="de-meta">
              <span>Caso: Pavimentación Ruta S-271</span>
              <span>·</span>
              <span>Autor: María Clara</span>
              <span>·</span>
              <span>Generado: {new Date().toLocaleDateString('es-AR')}</span>
              <span>·</span>
              <span className="de-badge-draft">borrador</span>
            </div>
          </header>

          <div className="de-body">
            {blocks.map((b, idx) => (
              <DossierBlock
                key={b.id}
                block={b}
                mode={mode}
                index={idx}
                rewriting={rewriting === b.id}
                onRewrite={(instruction) => rewrite(b.id, instruction)}
              />
            ))}
          </div>

          {/* Chain-of-custody footer */}
          <footer className="de-footer">
            <div className="eyebrow">Cadena de custodia</div>
            <ul className="de-sources">
              <li>
                <span className="mono">PDA‑CBA‑2024‑10‑14.json</span>
                <span className="de-src-sha mono">sha 7b3a…e2f1</span>
                <a className="de-src-link" href="#">ver fuente ↗</a>
              </li>
              <li>
                <span className="mono">CNE‑APORTES‑2019.csv</span>
                <span className="de-src-sha mono">sha c1d9…4a8b</span>
                <a className="de-src-link" href="#">ver fuente ↗</a>
              </li>
              <li>
                <span className="mono">IGJ‑TECNOSERV‑2024.pdf</span>
                <span className="de-src-sha mono">sha 9e22…110c</span>
                <a className="de-src-link" href="#">ver fuente ↗</a>
              </li>
            </ul>
            <div className="de-disclaimer">
              Documento de carácter investigativo. No constituye imputación penal salvo que sea formalmente presentado
              ante autoridad competente. Datos de fuentes oficiales, verificables por los hashes indicados.
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
}

function DossierBlock({ block, mode, index, rewriting, onRewrite }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [customOpen, setCustomOpen] = React.useState(false);
  const [customText, setCustomText] = React.useState('');

  const presets = mode === 'forense'
    ? ['Más seco y técnico', 'Agregar cita de la ley', 'Acortar']
    : mode === 'periodistico'
      ? ['Más narrativo', 'Menos literario', 'Agregar contexto', 'Acortar']
      : ['Más formal', 'Citar art. 256 CP', 'Acortar'];

  return (
    <section className={`de-block ${block.lede ? 'is-lede' : ''} ${rewriting ? 'is-rewriting' : ''}`}>
      {block.heading && <h3 className="de-block-h">{block.heading}</h3>}
      <p className="de-block-p" contentEditable suppressContentEditableWarning>
        {block.body}
      </p>

      {/* Inline rewrite control */}
      <div className="de-rewrite">
        <button className="de-rewrite-btn" onClick={() => setMenuOpen(o => !o)}>
          {I.sparkles({ s: 11 })} Reescribir
        </button>
        {menuOpen && (
          <div className="de-rewrite-menu" onMouseLeave={() => setMenuOpen(false)}>
            {presets.map(p => (
              <button key={p} onClick={() => { onRewrite(p); setMenuOpen(false); }}>
                {p}
              </button>
            ))}
            <div className="de-rewrite-divider"/>
            <button onClick={() => { setCustomOpen(true); setMenuOpen(false); }}>
              Instrucción personalizada…
            </button>
          </div>
        )}
        {customOpen && (
          <div className="de-rewrite-custom">
            <input
              autoFocus
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="p.ej. agregá la cifra en dólares"
              onKeyDown={e => {
                if (e.key === 'Enter') { onRewrite(customText); setCustomOpen(false); setCustomText(''); }
                if (e.key === 'Escape') { setCustomOpen(false); setCustomText(''); }
              }}
            />
            <button onClick={() => { onRewrite(customText); setCustomOpen(false); setCustomText(''); }}>
              {I.send({ s: 11 })}
            </button>
          </div>
        )}
        {rewriting && <span className="de-rewriting">Reescribiendo…</span>}
      </div>
    </section>
  );
}

// Tiny simulation of AI rewrite for prototype.
function instructionApply(body, instruction) {
  if (!instruction) return body;
  if (/acortar/i.test(instruction)) {
    const sentences = body.split('. ');
    return sentences.slice(0, Math.max(1, Math.floor(sentences.length / 2))).join('. ') + '.';
  }
  if (/seco|técnico|formal/i.test(instruction)) {
    return body.replace(/la historia empieza/gi, 'el antecedente se remonta a')
               .replace(/una empresa con/gi, 'una persona jurídica con')
               .replace(/se llevó/gi, 'percibió');
  }
  if (/narrativo|literario/i.test(instruction)) {
    return body + ' La evidencia, cuando se la pone una al lado de la otra, cuenta una historia coherente.';
  }
  if (/cita/i.test(instruction) || /ley|artículo|art\./i.test(instruction)) {
    return body + ' (cf. Ley 2095, art. 10: "Todo acto de contratación debe observar el principio de concurrencia").';
  }
  if (/dólares/i.test(instruction)) {
    return body.replace(/\$2\.847 millones/g, '$2.847 millones (aprox. USD 2,2 M al tipo de cambio oficial del período)');
  }
  return body + ` [reescrito: ${instruction}]`;
}

Object.assign(window, { DossierEditor });

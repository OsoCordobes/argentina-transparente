/**
 * TierBadge.tsx
 *
 * Chip pequeño que indica de qué fuente (tier) proviene un dato.
 *
 * Tiers:
 *   T0 CKAN Córdoba         — fuente directa, máxima confianza
 *   T1 AFIP                 — fuente directa, máxima confianza
 *   T2 Padrón Provincial    — oficial provincial
 *   T3 IGJ Nación           — oficial nacional
 *   T4 Boletín (LLM)        — extracción asistida por LLM (verificable)
 *   T5 OpenSanctions        — third-party
 *
 * El color codifica nivel de confianza, no la fuente en sí: verde para
 * fuentes directas, celeste para oficiales provinciales, lila para IGJ,
 * amarillo para extracción LLM (avisar al usuario), gris para third-party.
 */

interface Props { tier: 0 | 1 | 2 | 3 | 4 | 5; source: string }

const LABELS: Record<number, string> = {
  0: 'CKAN Córdoba',
  1: 'AFIP',
  2: 'Padrón Provincial',
  3: 'IGJ Nación',
  4: 'Boletín (LLM)',
  5: 'OpenSanctions',
}

const COLORS: Record<number, string> = {
  0: '#62C7A0', // verde — fuente directa
  1: '#62C7A0',
  2: '#6FB8E8', // celeste — oficial provincial
  3: '#B79CFF', // lila — IGJ
  4: '#F5B544', // amarillo — extracción LLM
  5: '#9BA3B4', // gris — third-party
}

export function TierBadge({ tier, source }: Props) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 3,
        background: COLORS[tier] + '22',
        color: COLORS[tier],
        border: `1px solid ${COLORS[tier]}`,
        marginLeft: 6,
        whiteSpace: 'nowrap',
      }}
      title={`Fuente: ${source} (Tier ${tier})`}
    >
      T{tier} {LABELS[tier]}
    </span>
  )
}

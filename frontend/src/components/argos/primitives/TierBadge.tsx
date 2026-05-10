/**
 * TierBadge — pill que indica el tier de verificación de un dato.
 *
 * Tiers (CLAUDE.md §6 — research forense):
 *   T1 verde:   verificado por CUIT/DNI canónico (publicable, LAI Ar)
 *   T2 ámbar:   inferido por matching determinista (queue auditoría)
 *   T3 gris:    sin verificación, solo para uso interno
 *
 * Tooltip explicativo opcional (Radix). Variante 'sm' para tabular,
 * 'md' default para inline en cards/headers.
 */
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { CSSProperties } from 'react'

interface Props {
  tier: 1 | 2 | 3
  /** Mostrar tooltip Radix con explicación del tier. Default: true. */
  showTooltip?: boolean
  /** Tamaño del badge. Default: 'md'. */
  size?: 'sm' | 'md'
}

const TIER_COPY: Record<1 | 2 | 3, { label: string; tone: string; desc: string }> = {
  1: {
    label: 'T1',
    tone: 'var(--tier-1)',
    desc: 'Verificado por CUIT/DNI canónico contra fuente oficial.',
  },
  2: {
    label: 'T2',
    tone: 'var(--tier-2)',
    desc: 'Inferido por matching determinista — queue de auditoría.',
  },
  3: {
    label: 'T3',
    tone: 'var(--tier-3)',
    desc: 'Sin verificación canónica — solo uso interno, no publicar.',
  },
}

export function TierBadge({ tier, showTooltip = true, size = 'md' }: Props) {
  const cfg = TIER_COPY[tier]
  const isSmall = size === 'sm'

  const badgeStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    paddingInline: isSmall ? 'var(--space-1-5)' : 'var(--space-2)',
    paddingBlock: isSmall ? '1px' : 'var(--space-0-5)',
    fontFamily: 'var(--font-mono)',
    fontSize: isSmall ? 'var(--text-xs)' : 'var(--text-sm)',
    fontWeight: 'var(--weight-medium)',
    letterSpacing: 'var(--tracking-wide)',
    color: cfg.tone,
    // alpha 12% del color base — usamos color-mix para transparentizar
    // sin tener que duplicar variables por tier.
    backgroundColor: `color-mix(in srgb, ${cfg.tone} 12%, transparent)`,
    border: `1px solid color-mix(in srgb, ${cfg.tone} 60%, transparent)`,
    borderRadius: 'var(--radius-pill)',
    whiteSpace: 'nowrap',
    cursor: showTooltip ? 'help' : 'default',
    userSelect: 'none',
    lineHeight: 'var(--leading-tight)',
  }

  const badge = (
    <span style={badgeStyle} aria-label={`Tier ${tier}: ${cfg.desc}`}>
      {cfg.label}
    </span>
  )

  if (!showTooltip) return badge

  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{badge}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            style={{
              maxWidth: 280,
              padding: 'var(--space-2) var(--space-3)',
              backgroundColor: 'var(--surface-popover)',
              border: '1px solid var(--hairline-2)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--elevation-2)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)',
              lineHeight: 'var(--leading-normal)',
              color: 'var(--text-primary)',
              zIndex: 100,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: cfg.tone,
                marginBottom: 'var(--space-1)',
                fontWeight: 'var(--weight-semibold)',
                letterSpacing: 'var(--tracking-wide)',
              }}
            >
              {cfg.label}
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>{cfg.desc}</div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

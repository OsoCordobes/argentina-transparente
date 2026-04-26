/**
 * IdentityBadge.tsx
 *
 * Chip que indica el grado de confianza en el match de identidad de
 * una empresa. Refleja el tier devuelto por `resolverEmpresa()` en el
 * backend (lib/identity-resolver.ts):
 *
 *   1 cuit_exact          ✓ CUIT verificado          verde
 *   2 name_normalized     ⚠ posible homónimo         amarillo
 *   3 name_fuzzy_high     ⚠ posible homónimo         amarillo
 *   4 llm_ambiguous       🤖 inferencia LLM          lila
 *   5 no_match            ✗ sin match                gris
 *
 * El score (0-100) opcional se muestra entre paréntesis cuando tier > 1.
 */

interface Props { tier: 1 | 2 | 3 | 4 | 5; score?: number }

export function IdentityBadge({ tier, score }: Props) {
  const label = tier === 1 ? '✓ CUIT verificado'
              : tier <= 3 ? '⚠ posible homónimo (nombre)'
              : tier === 4 ? '🤖 inferencia LLM'
              : '✗ sin match'

  const color = tier === 1 ? '#62C7A0'
              : tier <= 3 ? '#F5B544'
              : tier === 4 ? '#B79CFF'
              : '#9BA3B4'

  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 3,
        background: color + '22',
        color: color,
        border: `1px solid ${color}`,
      }}
      title={score ? `Score ${score}/100` : undefined}
    >
      {label}{score && tier > 1 ? ` (${score})` : ''}
    </span>
  )
}

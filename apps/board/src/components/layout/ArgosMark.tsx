// ARGOS mark — inline SVG for React.
// Three-node graph: two neutral nodes (currentColor stroke) linked to a
// solid blue "investigator" node. Sized via `size` prop; outline stroke
// inherits from currentColor so parent can tint via text color.

type ArgosMarkProps = {
  size?: number
  className?: string
  title?: string
}

export default function ArgosMark({ size = 28, className, title = 'ARGOS' }: ArgosMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <line x1="14" y1="16" x2="26" y2="36" stroke="currentColor" strokeWidth="1.5" />
      <line x1="38" y1="16" x2="26" y2="36" stroke="currentColor" strokeWidth="1.5" />
      <line x1="14" y1="16" x2="38" y2="16" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="16" r="4.5" fill="var(--bg, #fff)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="38" cy="16" r="4.5" fill="var(--bg, #fff)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="26" cy="36" r="5.5" fill="#2563eb" />
    </svg>
  )
}

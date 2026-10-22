const R = 6
const C = 2 * Math.PI * R

/** A 12px progress ring for the card's steps. */
export function Ring({ pct }: { pct: number }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3 shrink-0">
      <circle cx="8" cy="8" r={R} fill="none" strokeWidth="2.5" className="stroke-surface-inset" />
      <circle
        cx="8" cy="8" r={R} fill="none" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 8 8)"
        className="stroke-[var(--indigo-200)]"
      />
    </svg>
  )
}

/** Vector recreation of Option 1, “The Table,” from the supplied concept sheet. */
export function GatherMark() {
  return <svg viewBox="0 0 128 128" width="48" height="48" aria-hidden="true" focusable="false">
    {/* Eight people surround a visibly open center; the upper three are gold. */}
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => <g key={angle} transform={`rotate(${angle} 64 64)`} fill={angle === 0 || angle === 45 || angle === 315 ? "var(--brand-gold)" : "var(--brand-hunter)"}>
      <circle cx="64" cy="15" r="10" />
      {angle % 90 === 0 && <path d="M45 34C48 29 55 28 64 28S80 29 83 34C85 38 84 43 80 43C75 43 72 39 64 39S53 43 48 43C44 43 43 38 45 34Z" />}
    </g>)}
  </svg>;
}

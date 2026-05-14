// Flaggkomponent baserad på flag-icons-biblioteket
// Fungerar korrekt på alla plattformar inklusive Windows

const SIZES = {
  sm: { width: 20, height: 15, radius: 2 },
  md: { width: 28, height: 21, radius: 3 },
  lg: { width: 40, height: 30, radius: 4 },
  xl: { width: 56, height: 42, radius: 5 },
}

export default function Flag({ iso2, size = 'md', className = '' }) {
  const s = SIZES[size] ?? SIZES.md
  return (
    <span
      className={`fi fi-${iso2} ${className}`}
      style={{
        width:        s.width,
        height:       s.height,
        borderRadius: s.radius,
        display:      'inline-block',
        flexShrink:   0,
        boxShadow:    '0 1px 3px rgba(0,0,0,0.35)',
        backgroundSize: 'cover',
      }}
      aria-label={iso2}
    />
  )
}

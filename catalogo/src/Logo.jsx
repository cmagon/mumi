// Marca genérica (placeholder de logo) — emblema abstracto, neutro y brandable.
// Se usa cuando la tienda aún no ha subido su propio logo.
export default function Logo({ size = 32, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none"
      xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, display: 'inline-block' }} {...rest}>
      <rect x="2" y="2" width="36" height="36" rx="11" fill="currentColor" fillOpacity="0.16" />
      <rect x="2.75" y="2.75" width="34.5" height="34.5" rx="10.25" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="16" cy="17" r="6.5" fill="currentColor" />
      <path d="M22 25c0-4.5 3.4-8 7.5-8 1 0 1.9.2 2.7.5C31 21 27 24.5 22.6 25.4c-.4.1-.6-.1-.6-.4Z" fill="currentColor" fillOpacity="0.75" />
    </svg>
  )
}

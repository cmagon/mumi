export default function Badge({ children, variant = 'gris' }) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

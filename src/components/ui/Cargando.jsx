// Loader de "Cargando datos…" para mostrar SOBRE una tabla mientras llegan los datos.
export default function Cargando({ texto = 'Cargando datos…' }) {
  return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--texto-suave)' }}>
      <div style={{ width: 38, height: 38, border: '4px solid var(--crema-oscuro)', borderTopColor: 'var(--selva)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span>{texto}</span>
    </div>
  )
}

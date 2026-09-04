// Página completa "Sin conexión": se muestra cuando la app arranca (o se recarga) sin internet.
// La app trabaja en línea sí o sí, así que en vez de un spinner infinito o datos viejos, se
// muestra esta pantalla con un botón de reintento.
export default function SinConexion({ onReintentar }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 18, padding: 24, textAlign: 'center',
      background: 'var(--crema, #f7f3ea)', color: 'var(--selva, #2d5a3d)',
    }}>
      <div style={{ fontSize: '4rem', lineHeight: 1 }}>📡</div>
      <h1 style={{
        margin: 0, fontSize: '1.8rem', fontWeight: 800,
        fontFamily: "var(--fuente-titulos, 'Playfair Display'), serif",
      }}>
        Sin conexión a internet
      </h1>
      <p style={{ margin: 0, maxWidth: 420, fontSize: '1rem', lineHeight: 1.5, color: '#4b5563' }}>
        MUMI Amazonia necesita conexión para funcionar. Conéctate a una red e inténtalo de nuevo.
      </p>
      <button
        onClick={() => (onReintentar ? onReintentar() : window.location.reload())}
        style={{
          marginTop: 6, background: 'var(--selva, #2d5a3d)', color: '#fff', border: 'none',
          borderRadius: 10, padding: '12px 26px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
        }}
      >
        Reintentar
      </button>
    </div>
  )
}

import { useState, useEffect } from 'react'

// Modal global y cerrable que aparece cuando una escritura falla por falta de conexión.
// Lo dispara la instrumentación de escrituras (supabase.js) con el evento 'mumi-conn-error'.
// La app trabaja en línea sí o sí: si esto aparece, el cambio NO se guardó.
export default function ConnErrorModal() {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const abrir = () => setAbierto(true)
    window.addEventListener('mumi-conn-error', abrir)
    // Si vuelve la conexión, se puede cerrar solo (el usuario reintenta su acción).
    const online = () => setAbierto(false)
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('mumi-conn-error', abrir)
      window.removeEventListener('online', online)
    }
  }, [])

  if (!abierto) return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="conn-error-title"
      onClick={() => setAbierto(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 6000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', color: '#1f2937', borderRadius: 14, maxWidth: 420, width: '100%',
          padding: '22px 22px 18px', boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
          borderTop: '6px solid #9a3b3b',
        }}
      >
        <div style={{ fontSize: '2.2rem', lineHeight: 1, marginBottom: 8 }}>📡</div>
        <h2 id="conn-error-title" style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 800, color: '#9a3b3b' }}>
          No se pudo guardar — sin conexión
        </h2>
        <p style={{ margin: '0 0 6px', fontSize: '0.92rem', lineHeight: 1.5 }}>
          Tu cambio <strong>no se guardó</strong> porque se perdió la conexión a internet.
        </p>
        <p style={{ margin: '0 0 18px', fontSize: '0.88rem', lineHeight: 1.5, color: '#4b5563' }}>
          Revisa tu red y vuelve a intentar la acción. La aplicación trabaja siempre en línea.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={() => setAbierto(false)}
            style={{
              background: '#9a3b3b', color: '#fff', border: 'none', borderRadius: 9,
              padding: '9px 18px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}

import { useIsMutating } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

// Overlay global de "Guardando…": mientras haya una mutación en curso bloquea TODA la pantalla
// (evita doble clic o navegar y que la info no se sincronice). Aparece tras un breve retardo
// para no parpadear en operaciones instantáneas.
export default function SavingOverlay() {
  const mutating = useIsMutating()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (mutating > 0) {
      const t = setTimeout(() => setShow(true), 250)
      return () => clearTimeout(t)
    }
    setShow(false)
  }, [mutating])

  if (!show) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      background: 'rgba(26,58,42,0.35)', backdropFilter: 'blur(1px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ background: 'var(--blanco, #fff)', borderRadius: 14, padding: '26px 30px', textAlign: 'center', maxWidth: 340, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ width: 42, height: 42, margin: '0 auto 14px', border: '4px solid var(--crema-oscuro)', borderTopColor: 'var(--selva)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontWeight: 700, color: 'var(--selva)', marginBottom: 6 }}>Guardando…</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>
          No cierres ni recargues esta ventana hasta que termine — la información podría no guardarse.
        </div>
      </div>
    </div>
  )
}

import { useIsMutating, useMutationState } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { subscribeBusy, getBusy, getBusyLabel } from '../../lib/busy'

// Overlay global de "Guardando…": mientras haya una mutación (o un guardado manual marcado con
// setBusy) en curso, bloquea TODA la pantalla. Aparece tras un breve retardo para no parpadear.
// El texto se adapta a la acción real: si la mutación trae `meta: { label: '...' }` se usa ese
// texto (ej. "Eliminando…", "Buscando en Alegra…"); si no, se infiere de la escritura Supabase
// (insert/update → "Guardando…", delete → "Eliminando…") vía lib/busy.js.
export default function SavingOverlay() {
  const mutating = useIsMutating()
  const [busy, setBusyState] = useState(getBusy())
  const [busyLabel, setBusyLabel] = useState(getBusyLabel())
  const [show, setShow] = useState(false)

  // Etiquetas de las mutaciones de React Query actualmente "pending" (más reciente primero)
  const mutationLabels = useMutationState({
    filters: { status: 'pending' },
    select: (m) => m.options?.meta?.label,
  }).filter(Boolean)

  useEffect(() => subscribeBusy((count, label) => { setBusyState(count); setBusyLabel(label) }), [])

  useEffect(() => {
    if (mutating > 0 || busy > 0) {
      const t = setTimeout(() => setShow(true), 250)
      return () => clearTimeout(t)
    }
    setShow(false)
  }, [mutating, busy])

  if (!show) return null
  const label = mutationLabels[mutationLabels.length - 1] || busyLabel || 'Guardando…'
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      background: 'rgba(26,58,42,0.35)', backdropFilter: 'blur(1px)', WebkitBackdropFilter: 'blur(1px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ background: 'var(--blanco, #fff)', borderRadius: 14, padding: '26px 30px', textAlign: 'center', maxWidth: 340, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ width: 42, height: 42, margin: '0 auto 14px', border: '4px solid var(--crema-oscuro)', borderTopColor: 'var(--selva)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ fontWeight: 700, color: 'var(--selva)', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>
          No cierres ni recargues esta ventana hasta que termine — la información podría no guardarse.
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { FileText, X } from 'lucide-react'
import { subscribeDownload, getDownload, requestCancelDownload } from '../../lib/downloadProgress'

// Widget FIJO de progreso de descarga (ej. PDF de todas las órdenes). Va montado en la raíz de la app,
// así permanece visible aunque el usuario cambie de módulo. No bloquea la vista (esquina, opacidad 85%).
export default function DownloadProgress() {
  const [st, setSt] = useState(getDownload())
  useEffect(() => subscribeDownload(setSt), [])

  // Mientras una descarga está activa, avisa antes de recargar/cerrar la pestaña (podría interrumpirse).
  useEffect(() => {
    if (!st.active) return
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; return '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [st.active])

  if (!st.active) return null
  const pct = st.total > 0 ? Math.min(100, Math.round((st.current / st.total) * 100)) : 0
  return (
    <div style={{
      position: 'fixed', right: 18, top: 88, zIndex: 6000,
      background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      border: '1px solid var(--crema-oscuro, #e0d8c8)', borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: '12px 14px', width: 260, maxWidth: 'calc(100vw - 36px)',
      color: 'var(--selva, #1a3a2a)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <FileText size={22} aria-hidden="true" style={{ color: 'var(--rojo, #c0392b)', flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{st.canceled ? 'Cancelando…' : st.label}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave, #6b7280)' }}>
            {st.total > 0 ? `${st.current} de ${st.total} · ${pct}%` : 'Preparando…'}
          </div>
        </div>
        {!st.canceled && (
          <button type="button" title="Cancelar descarga" onClick={requestCancelDownload}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--texto-suave, #6b7280)', padding: 2, lineHeight: 0 }}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'var(--crema, #f3efe6)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: st.canceled ? 'var(--rojo, #c0392b)' : 'var(--selva, #2d5a3d)', transition: 'width 0.25s ease' }} />
      </div>
    </div>
  )
}

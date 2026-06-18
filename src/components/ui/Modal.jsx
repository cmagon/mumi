import { useEffect, useRef, useState } from 'react'

// Modal con guardia anti-cierre accidental:
//  - Detecta automáticamente si el usuario ingresó información (cualquier input/select/textarea).
//  - Al intentar cerrar (clic fuera, ✕ o Escape) con datos sin guardar, pide confirmación.
//  - Si se pasa `onSave`, ofrece el botón "Guardar"; siempre ofrece "Descartar" y "Seguir editando".
//  - `guard={false}` desactiva la guardia (para modales con flujo de botones propio).
export default function Modal({ open, onClose, title, children, footer, size = '', onSave, guard = true }) {
  const [confirming, setConfirming] = useState(false)
  const dirtyRef = useRef(false)

  // Reinicia el estado cada vez que se abre
  useEffect(() => {
    if (open) { dirtyRef.current = false; setConfirming(false) }
  }, [open])

  const requestClose = () => {
    if (guard && dirtyRef.current) setConfirming(true)
    else onClose()
  }

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') requestClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guard])

  if (!open) return null

  return (
    <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget) requestClose() }}>
      <div className={`modal ${size}`}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={requestClose}>×</button>
        </div>
        <div className="modal-body"
          onInput={() => { dirtyRef.current = true }}
          onChange={() => { dirtyRef.current = true }}>
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}

        {confirming && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'inherit', zIndex: 5 }}>
            <div style={{ background: 'var(--blanco, #fff)', borderRadius: 12, padding: 20, maxWidth: 360, width: '90%', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
              <p style={{ margin: '0 0 16px', fontWeight: 600, color: 'var(--texto, #333)' }}>
                Tienes información sin guardar. ¿Deseas guardarla?
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => setConfirming(false)}>Seguir editando</button>
                <button className="btn btn-danger" onClick={() => { setConfirming(false); onClose() }}>Descartar</button>
                {onSave && <button className="btn btn-primary" onClick={async () => { setConfirming(false); await onSave() }}>Guardar</button>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

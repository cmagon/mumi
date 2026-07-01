import { useEffect, useId, useRef, useState } from 'react'

// Modal con guardia anti-cierre accidental:
//  - Detecta automáticamente si el usuario ingresó información (cualquier input/select/textarea).
//  - Al intentar cerrar (clic fuera, ✕ o Escape) con datos sin guardar, pide confirmación.
//  - Si se pasa `onSave`, ofrece el botón "Guardar"; siempre ofrece "Descartar" y "Seguir editando".
//  - `guard={false}` desactiva la guardia (para modales con flujo de botones propio).
export default function Modal({ open, onClose, title, children, footer, size = '', onSave, guard = true }) {
  const [confirming, setConfirming] = useState(false)
  const dirtyRef = useRef(false)
  const dialogRef = useRef(null)
  const prevFocusRef = useRef(null)
  const titleId = useId()

  // Reinicia el estado cada vez que se abre
  useEffect(() => {
    if (open) { dirtyRef.current = false; setConfirming(false) }
  }, [open])

  const requestClose = () => {
    if (guard && dirtyRef.current) setConfirming(true)
    else onClose()
  }

  // Escape + focus-trap (Tab/Shift+Tab circulan dentro del diálogo)
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); requestClose(); return }
      if (e.key === 'Tab') {
        const foco = dialogRef.current?.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
        if (!foco || !foco.length) return
        const visibles = [...foco].filter(el => el.offsetParent !== null || el === document.activeElement)
        if (!visibles.length) return
        const primero = visibles[0], ultimo = visibles[visibles.length - 1]
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guard])

  // Bloquea el scroll del fondo, mueve el foco al abrir y lo restaura al cerrar
  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Enfoca el primer control del diálogo (o el propio contenedor)
    const t = setTimeout(() => {
      const el = dialogRef.current?.querySelector(
        'input:not([type="hidden"]), textarea, select, button, [tabindex]:not([tabindex="-1"])'
      )
      ;(el || dialogRef.current)?.focus()
    }, 0)
    return () => {
      clearTimeout(t)
      document.body.style.overflow = prevOverflow
      if (prevFocusRef.current && prevFocusRef.current.focus) prevFocusRef.current.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget) requestClose() }}>
      <div
        className={`modal ${size}`}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <span className="modal-title" id={titleId}>{title}</span>
          <button className="modal-close" onClick={requestClose} aria-label="Cerrar" title="Cerrar">×</button>
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

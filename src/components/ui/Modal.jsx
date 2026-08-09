import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical } from 'lucide-react'
import { lockBodyScroll, unlockBodyScroll } from '../../lib/bodyScrollLock'

// Modal con guardia anti-cierre accidental.
// `movable`: panel flotante sin overlay a pantalla completa (no tapa la vista previa).
export default function Modal({ open, onClose, title, children, footer, size = '', onSave, guard = true, movable = false }) {
  const [confirming, setConfirming] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dirtyRef = useRef(false)
  const dialogRef = useRef(null)
  const prevFocusRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (open) {
      dirtyRef.current = false
      setConfirming(false)
      setPos({ x: 0, y: 0 })
    }
  }, [open])

  const requestClose = () => {
    if (guard && dirtyRef.current) setConfirming(true)
    else onClose()
  }

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

  // Contador global: varios modales (proceso + confirmar envío) no pueden dejarse
  // overflow:hidden al cerrarse juntos — en tablets eso congela toda la UI.
  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement
    if (!movable) lockBodyScroll()
    const t = setTimeout(() => {
      // En táctil no forzar foco a inputs: el teclado virtual tapa botones y deja
      // sensación de pantalla bloqueada. Solo enfocamos el diálogo.
      try {
        const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
        if (coarse) dialogRef.current?.focus?.({ preventScroll: true })
        else {
          const el = dialogRef.current?.querySelector(
            'input:not([type="hidden"]), textarea, select, button, [tabindex]:not([tabindex="-1"])'
          )
          ;(el || dialogRef.current)?.focus?.({ preventScroll: true })
        }
      } catch { /* noop */ }
    }, 0)
    return () => {
      clearTimeout(t)
      if (!movable) unlockBodyScroll()
      try { prevFocusRef.current?.focus?.({ preventScroll: true }) } catch { /* noop */ }
    }
  }, [open, movable])

  const onDragStart = (e) => {
    if (!movable || e.button !== 0) return
    if (e.target.closest('.modal-close')) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const origin = { ...pos }
    const onMove = (ev) => {
      setPos({
        x: origin.x + (ev.clientX - startX),
        y: origin.y + (ev.clientY - startY),
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  if (!open) return null

  const dialog = (
    <div
      className={`modal ${size}${movable ? ' modal-movable' : ''}`.trim()}
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={movable ? { transform: `translate(${pos.x}px, ${pos.y}px)` } : undefined}
    >
      <div
        className={`modal-header${movable ? ' modal-header-drag' : ''}`}
        onPointerDown={movable ? onDragStart : undefined}
        title={movable ? 'Arrastra para mover' : undefined}
      >
        {movable ? <GripVertical size={16} className="modal-drag-grip" aria-hidden /> : null}
        <span className="modal-title" id={titleId}>{title}</span>
        <button type="button" className="modal-close" onClick={requestClose} aria-label="Cerrar" title="Cerrar">×</button>
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
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>Seguir editando</button>
              <button type="button" className="btn btn-danger" onClick={() => { setConfirming(false); onClose() }}>Descartar</button>
              {onSave && <button type="button" className="btn btn-primary" onClick={async () => { setConfirming(false); await onSave() }}>Guardar</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // Portal a body: evita que modales anidados (p. ej. recorte dentro de editar banner) queden
  // recortados y con los botones fuera de la pantalla.
  const node = movable
    ? <div className="modal-float-root">{dialog}</div>
    : (
      <div
        className="modal-overlay active"
        onClick={(e) => { if (e.target === e.currentTarget) requestClose() }}
      >
        {dialog}
      </div>
    )

  return createPortal(node, document.body)
}

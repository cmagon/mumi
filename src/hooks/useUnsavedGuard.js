import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConfirm } from '../context/ConfirmContext'

const MSG_DEFAULT = 'Hay cambios sin guardar. Si sales ahora, se perderán.'

/**
 * Avisa al salir con cambios pendientes (compatible con BrowserRouter):
 * - clic en enlaces internos (menú lateral, pestañas NavLink)
 * - cerrar/recargar pestaña (aviso nativo del navegador)
 */
export function useUnsavedGuard(dirty, {
  message = MSG_DEFAULT,
  title = 'Cambios sin guardar',
  confirmText = 'Salir sin guardar',
  cancelText = 'Seguir editando',
} = {}) {
  const confirmar = useConfirm()
  const navigate = useNavigate()
  const dirtyRef = useRef(dirty)
  const asking = useRef(false)
  dirtyRef.current = !!dirty

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = message
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, message])

  useEffect(() => {
    if (!dirty) return

    const pedirSalida = async () => {
      if (asking.current) return false
      asking.current = true
      try {
        return !!(await confirmar(message, { title, confirmText, cancelText, danger: true }))
      } finally {
        asking.current = false
      }
    }

    const onClick = async (e) => {
      if (!dirtyRef.current) return
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target?.closest?.('a[href]')
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      let url
      try { url = new URL(href, window.location.origin) } catch { return }
      if (url.origin !== window.location.origin) return
      const next = url.pathname + url.search + url.hash
      const here = window.location.pathname + window.location.search + window.location.hash
      if (next === here) return

      e.preventDefault()
      e.stopPropagation()
      const ok = await pedirSalida()
      if (!ok) return
      dirtyRef.current = false
      navigate(next)
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty, confirmar, navigate, message, title, confirmText, cancelText])
}

/** Snapshot estable para comparar formularios (ignora updated_at). */
export function snapConfig(obj) {
  const seen = new WeakSet()
  const norm = (v) => {
    if (v === undefined || v === '') return null
    if (v == null) return null
    if (typeof v !== 'object') return v
    if (seen.has(v)) return null
    seen.add(v)
    if (Array.isArray(v)) return v.map(norm)
    const out = {}
    for (const k of Object.keys(v).sort()) {
      if (k === 'updated_at') continue
      out[k] = norm(v[k])
    }
    return out
  }
  try { return JSON.stringify(norm(obj)) } catch { return String(Date.now()) }
}

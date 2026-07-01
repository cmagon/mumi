import { useCallback } from 'react'

// Toast imperativo — no necesita estado React
// El contenedor #toast-container vive en el DOM directamente
export function useToast() {
  const toast = useCallback((msg, type = '') => {
    const container = document.getElementById('toast-container')
    if (!container) return
    const el = document.createElement('div')
    el.className = 'toast' + (type ? ' ' + type : '')
    // Los errores se anuncian con más urgencia; el resto de forma cortés (vía el contenedor aria-live)
    el.setAttribute('role', type === 'error' ? 'alert' : 'status')
    el.textContent = msg
    container.appendChild(el)
    setTimeout(() => el.remove(), 3500)
  }, [])

  return toast
}

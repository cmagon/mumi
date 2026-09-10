import { useEffect, useRef } from 'react'

// Carga perezosa del script de Cloudflare Turnstile (una sola vez).
let scriptP = null
function cargarScript() {
  if (typeof window === 'undefined') return Promise.reject()
  if (window.turnstile) return Promise.resolve()
  if (scriptP) return scriptP
  scriptP = new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => res()
    s.onerror = rej
    document.head.appendChild(s)
  })
  return scriptP
}

/**
 * Widget de Turnstile. Renderiza el reto y devuelve el token por onToken.
 * Si no hay siteKey, no renderiza nada (los formularios siguen sin captcha).
 */
export function Turnstile({ siteKey, onToken }) {
  const ref = useRef(null)
  const widgetId = useRef(null)

  useEffect(() => {
    if (!siteKey) return
    let cancelado = false
    cargarScript().then(() => {
      if (cancelado || !ref.current || !window.turnstile) return
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (t) => onToken(t),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      })
    }).catch(() => { /* sin captcha si el script no carga */ })
    return () => {
      cancelado = true
      try { if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current) } catch { /* noop */ }
    }
  }, [siteKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!siteKey) return null
  return <div ref={ref} style={{ margin: '8px 0' }} />
}

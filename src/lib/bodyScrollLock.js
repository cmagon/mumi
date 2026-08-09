/**
 * Bloqueo de scroll del body con contador.
 * Varios modales abiertos a la vez no pueden dejarse overflow:hidden al cerrarse
 * en orden incorrecto (bug típico en tablets: la UI queda “congelada”).
 */
let _locks = 0
let _prevOverflow = ''
let _prevTouchAction = ''
let _prevPaddingRight = ''

function _apply() {
  if (typeof document === 'undefined') return
  const body = document.body
  if (_locks === 1) {
    _prevOverflow = body.style.overflow
    _prevTouchAction = body.style.touchAction
    _prevPaddingRight = body.style.paddingRight
    // Compensa la barra de scroll para evitar “salto” de layout al bloquear
    const sb = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
    if (sb > 0) body.style.paddingRight = `${sb}px`
  }
}

function _release() {
  if (typeof document === 'undefined') return
  if (_locks > 0) return
  const body = document.body
  body.style.overflow = _prevOverflow || ''
  body.style.touchAction = _prevTouchAction || ''
  body.style.paddingRight = _prevPaddingRight || ''
  _prevOverflow = ''
  _prevTouchAction = ''
  _prevPaddingRight = ''
}

export function lockBodyScroll() {
  _locks += 1
  _apply()
}

export function unlockBodyScroll() {
  _locks = Math.max(0, _locks - 1)
  _release()
}

/** Emergencia: limpia cualquier bloqueo residual (p. ej. tras error en cierre de orden). */
export function forceUnlockBodyScroll() {
  _locks = 0
  _release()
}

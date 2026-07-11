// Progreso global de descargas largas (ej. PDF de todas las órdenes). Se muestra en un widget FIJO
// (DownloadProgress) montado en la raíz de la app, así sobrevive a cambios de módulo y no bloquea la vista.
let _state = { active: false, label: 'Descargando…', current: 0, total: 0, canceled: false }
const _subs = new Set()
const notify = () => _subs.forEach(fn => { try { fn(_state) } catch { /* noop */ } })

export function getDownload() { return _state }
export function subscribeDownload(fn) { _subs.add(fn); return () => _subs.delete(fn) }

export function startDownload(label, total) { _state = { active: true, label: label || 'Descargando…', current: 0, total: total || 0, canceled: false }; notify() }
export function updateDownload(current, total) { _state = { ..._state, current, ...(total != null ? { total } : {}) }; notify() }
export function endDownload() { _state = { ..._state, active: false }; notify() }
// Cancelación: el usuario pide cancelar; la operación en curso revisa isCanceled() y aborta.
export function requestCancelDownload() { _state = { ..._state, canceled: true }; notify() }
export function isDownloadCanceled() { return _state.canceled }

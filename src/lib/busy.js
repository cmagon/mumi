// Señal global de "guardando/ocupado" para flujos que NO son mutaciones de React Query
// (funciones async sueltas como confirmar y enviar una orden). El SavingOverlay también
// la escucha, además de useIsMutating.
let _count = 0
const _subs = new Set()
const notify = () => _subs.forEach(fn => { try { fn(_count) } catch { /* noop */ } })

export function setBusy(on) {
  _count = Math.max(0, _count + (on ? 1 : -1))
  notify()
}
export function getBusy() { return _count }
export function subscribeBusy(fn) { _subs.add(fn); return () => _subs.delete(fn) }

// Envuelve una promesa marcando ocupado mientras corre
export async function withBusy(promise) {
  setBusy(true)
  try { return await promise } finally { setBusy(false) }
}

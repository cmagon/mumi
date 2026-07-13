// Señal global de "guardando/ocupado" para flujos que NO son mutaciones de React Query
// (funciones async sueltas como confirmar y enviar una orden). El SavingOverlay también
// la escucha, además de useIsMutating.
//
// Además de contar cuántas operaciones están en curso, mantiene una PILA de etiquetas
// ("Guardando…", "Eliminando…", "Enviando a Alegra…", etc.) para que el overlay muestre
// el texto correcto según la acción real, en vez de siempre decir "Guardando…".
let _count = 0
let _labels = []   // pila: la última etiqueta activa es la que se muestra
const _subs = new Set()
const notify = () => _subs.forEach(fn => { try { fn(_count, _labels[_labels.length - 1] || null) } catch { /* noop */ } })

export function setBusy(on, label) {
  _count = Math.max(0, _count + (on ? 1 : -1))
  if (on) { if (label) _labels.push(label) }
  else if (label) { const i = _labels.lastIndexOf(label); if (i !== -1) _labels.splice(i, 1) }
  else { _labels.pop() }   // sin label explícito al apagar: retira la última empujada
  notify()
}
export function getBusy() { return _count }
export function getBusyLabel() { return _labels[_labels.length - 1] || null }
export function subscribeBusy(fn) { _subs.add(fn); return () => _subs.delete(fn) }

// Envuelve una promesa marcando ocupado mientras corre
export async function withBusy(promise, label) {
  setBusy(true, label)
  try { return await promise } finally { setBusy(false, label) }
}

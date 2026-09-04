// Escritura SIEMPRE en línea (el modo offline fue retirado a propósito).
//
// La app trabaja en línea sí o sí: si al guardar no hay conexión, la escritura NO se hace y se
// lanza el error. La instrumentación de `supabase.from` (ver supabase.js) detecta la caída de
// conexión y muestra un modal global cerrable; cada llamador además captura el error y avisa.
//
// Se conserva la firma `writeOrQueue({ table, action, payload, match, onConflict })` y las
// funciones de cola como no-ops para no tener que tocar cada punto de llamada. `queued` siempre
// es `false`.

import { supabase } from './supabase'

// Ejecuta una operación contra Supabase
async function exec(op) {
  const t = supabase.from(op.table)
  if (op.action === 'insert') return t.insert(op.payload)
  if (op.action === 'upsert') return t.upsert(op.payload, op.onConflict ? { onConflict: op.onConflict } : undefined)
  if (op.action === 'update') {
    let b = t.update(op.payload)
    for (const k in (op.match || {})) b = b.eq(k, op.match[k])
    return b
  }
  if (op.action === 'delete') {
    let b = t.delete()
    for (const k in (op.match || {})) b = b.eq(k, op.match[k])
    return b
  }
  throw new Error('Acción no soportada: ' + op.action)
}

// Ejecuta de inmediato. Si no hay conexión o el servidor falla, lanza (no se guarda nada).
// Devuelve { queued: false, data } por compatibilidad con el código existente.
export async function writeOrQueue(op) {
  if (!navigator.onLine) {
    const err = new Error('Sin conexión: no se pudo guardar. Revisa tu internet e inténtalo de nuevo.')
    err.esConexion = true
    throw err
  }
  const { data, error } = await exec(op)
  if (error) throw error
  return { queued: false, data }
}

// --- No-ops de compatibilidad (ya no hay cola offline) ---
export function onQueueChange() { return () => {} }
export async function queueCount() { return 0 }
export async function flushQueue() { return { done: 0, left: 0 } }

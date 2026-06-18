import { get, set } from 'idb-keyval'
import { supabase } from './supabase'

// Cola de escrituras pendientes (cuando no hay conexión) persistida en IndexedDB.
// Cada operación: { table, action: 'insert'|'update'|'upsert'|'delete', payload, match, onConflict }
const KEY = 'mumi-write-queue'
const listeners = new Set()

async function getQueue() { return (await get(KEY)) || [] }
async function saveQueue(q) { await set(KEY, q) }
function notify() { listeners.forEach(f => { try { f() } catch { /* noop */ } }) }

export function onQueueChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }
export async function queueCount() { return (await getQueue()).length }

async function enqueue(op) {
  const q = await getQueue()
  // Fusiona actualizaciones repetidas de la MISMA fila (p. ej. autoguardado) para no inflar la cola
  if (op.action === 'update' && op.match) {
    const i = q.findIndex(e => e.action === 'update' && e.table === op.table && JSON.stringify(e.match) === JSON.stringify(op.match))
    if (i >= 0) {
      q[i] = { ...q[i], payload: { ...q[i].payload, ...op.payload }, _ts: Date.now() }
      await saveQueue(q); notify(); return
    }
  }
  q.push({ ...op, _id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), _ts: Date.now() })
  await saveQueue(q)
  notify()
}

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

// Vacía la cola en orden. Se detiene en el primer error para no romper el orden.
export async function flushQueue() {
  if (!navigator.onLine) return { done: 0, left: (await getQueue()).length }
  let q = await getQueue()
  let done = 0
  while (q.length) {
    const op = q[0]
    try {
      const { error } = await exec(op)
      if (error) throw error
      q.shift(); await saveQueue(q); done++
    } catch {
      break
    }
  }
  notify()
  return { done, left: q.length }
}

// Para los módulos: ejecuta de inmediato si hay conexión; si no, encola y avisa.
// Devuelve { queued: boolean, data }
export async function writeOrQueue(op) {
  if (navigator.onLine) {
    const { data, error } = await exec(op)
    if (error) throw error
    return { queued: false, data }
  }
  await enqueue(op)
  return { queued: true, data: null }
}

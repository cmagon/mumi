import { createClient } from '@supabase/supabase-js'
import { setBusy } from './busy'
import { motivoBloqueoEscritura } from './devMode'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Loader/bloqueo global automático en TODA escritura ──────────────────────────
// Instrumenta el query builder para que cualquier insert/update/upsert/delete marque
// "guardando…" (SavingOverlay) mientras la operación está en curso, sin tener que
// envolver manualmente cada guardado en las páginas. Las lecturas (select) no se marcan.
// Escrituras "silenciosas": autoguardados de fondo que NO deben mostrar el overlay "Guardando…"
// (para no interrumpir la escritura del usuario). Se activan con beginSilentWrites/endSilentWrites.
let _silentDepth = 0
export const beginSilentWrites = () => { _silentDepth++ }
export const endSilentWrites = () => { _silentDepth = Math.max(0, _silentDepth - 1) }

function _trackWrite(builder, silent) {
  if (!builder || typeof builder.then !== 'function') return builder
  const origThen = builder.then.bind(builder)
  let started = false, ended = false
  const start = () => { if (!started) { started = true; if (!silent) setBusy(true) } }
  const end = () => { if (started && !ended) { ended = true; if (!silent) setBusy(false) } }
  builder.then = (onF, onR) => {
    start()
    return origThen(
      (v) => { end(); return onF ? onF(v) : v },
      (e) => { end(); if (onR) return onR(e); throw e },
    )
  }
  return builder
}
// Constructor "bloqueado": emula un builder de Supabase que, al await, devuelve { error }.
// Cualquier método de filtro (.eq, .select, .single, .match, …) devuelve el mismo objeto para
// permitir el encadenamiento; then/catch/finally resuelven al resultado de error.
function _bloqueado(mensaje) {
  const resultado = { data: null, error: { message: mensaje, code: 'DEV_READONLY' } }
  const p = Promise.resolve(resultado)
  const handler = { get(t, prop) {
    if (prop === 'then' || prop === 'catch' || prop === 'finally') return t[prop].bind(t)
    return () => proxy
  } }
  const proxy = new Proxy(p, handler)
  return proxy
}

const _origFrom = supabase.from.bind(supabase)
supabase.from = (table) => {
  const qb = _origFrom(table)
  for (const m of ['insert', 'update', 'upsert', 'delete']) {
    if (typeof qb[m] !== 'function') continue
    const orig = qb[m].bind(qb)
    qb[m] = (...args) => {
      // Modo desarrollador: vista de rol (solo lectura) o impersonación sin edición → bloquear.
      const motivo = motivoBloqueoEscritura(table)
      if (motivo) { try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dev-bloqueo', { detail: motivo })) } catch { /* noop */ } return _bloqueado(motivo) }
      return _trackWrite(orig(...args), _silentDepth > 0)
    }
  }
  return qb
}

// Cliente SOLO para crear usuarios (signUp): no persiste sesión, así no reemplaza
// la sesión del admin que está creando el usuario.
export const supabaseSignup = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Helper: subir archivo a Storage y retornar URL pública
export async function uploadFile(bucket, path, file) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw error
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
  return urlData.publicUrl
}

// Helper: subir base64 a Storage
export async function uploadBase64(bucket, path, base64String, contentType = 'image/jpeg') {
  const res = await fetch(base64String)
  const blob = await res.blob()
  return uploadFile(bucket, path, blob)
}

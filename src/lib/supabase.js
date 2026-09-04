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

// Etiqueta legible según el tipo de escritura, para que el overlay diga lo correcto
// ("Eliminando…" en vez de "Guardando…" cuando se borra, etc.)
const _labelDeMetodo = (m) => (m === 'delete' ? 'Eliminando…' : 'Guardando…')

// ¿El fallo es por falta de conexión (no un error de datos del servidor)?
// Los errores de PostgREST traen `code` (p. ej. '23505'); una caída de red no.
const _esFalloConexion = (err) => {
  if (!err) return false
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = String(err.message || err).toLowerCase()
  if (err.code && !/^(pgrst|fetch)/i.test(String(err.code))) return false   // error real del servidor
  return /failed to fetch|networkerror|network error|fetch failed|load failed|err_internet|err_network|err_connection|timeout|no se pudo guardar|sin conexión/.test(msg)
}

// Avisa a la app (modal global) que una escritura falló por conexión. Se dispara una sola vez
// por ráfaga para no apilar modales cuando varias escrituras caen a la vez.
let _avisoConexionTs = 0
const _avisarFalloConexion = () => {
  if (typeof window === 'undefined') return
  const ahora = Date.now()
  if (ahora - _avisoConexionTs < 1500) return
  _avisoConexionTs = ahora
  try { window.dispatchEvent(new CustomEvent('mumi-conn-error')) } catch { /* noop */ }
}

function _trackWrite(builder, silent, label) {
  if (!builder || typeof builder.then !== 'function') return builder
  const origThen = builder.then.bind(builder)
  let started = false, ended = false
  const start = () => { if (!started) { started = true; if (!silent) setBusy(true, label) } }
  const end = () => { if (started && !ended) { ended = true; if (!silent) setBusy(false, label) } }
  builder.then = (onF, onR) => {
    start()
    return origThen(
      (v) => { end(); if (v && v.error && _esFalloConexion(v.error)) _avisarFalloConexion(); return onF ? onF(v) : v },
      (e) => { end(); if (_esFalloConexion(e)) _avisarFalloConexion(); if (onR) return onR(e); throw e },
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
      return _trackWrite(orig(...args), _silentDepth > 0, _labelDeMetodo(m))
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
  const contentType = file?.type || undefined
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
    ...(contentType ? { contentType } : {}),
  })
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

// Cuenta del cliente del catálogo: login sin contraseña (código/enlace al correo) con
// Supabase Auth, perfil (clientes_catalogo), historial de pedidos y baja de cuenta.
import { supabase } from './supabase'
import { emailValido } from './utils'

// ---- Sesión / OTP ----

/** Envía un código de 6 dígitos (y enlace mágico) al correo. Crea la cuenta si no existe. */
export async function solicitarCodigo(email) {
  const e = (email || '').trim().toLowerCase()
  if (!emailValido(e)) throw new Error('Ingresa un correo válido.')
  const { error } = await supabase.auth.signInWithOtp({
    email: e,
    options: { shouldCreateUser: true },
  })
  if (error) throw new Error(traducirError(error.message))
  return true
}

/** Verifica el código de 6 dígitos y abre la sesión. */
export async function verificarCodigo(email, codigo) {
  const e = (email || '').trim().toLowerCase()
  const token = (codigo || '').trim()
  if (!emailValido(e)) throw new Error('Correo inválido.')
  if (!/^\d{6}$/.test(token)) throw new Error('El código son 6 dígitos.')
  const { data, error } = await supabase.auth.verifyOtp({ email: e, token, type: 'email' })
  if (error) throw new Error(traducirError(error.message))
  return data?.user || null
}

export async function cerrarSesion() {
  // scope 'local' limpia la sesión del navegador sin depender de la red (más fiable);
  // se ignora cualquier error para que "Salir" siempre limpie el estado local.
  try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* noop */ }
  try { localStorage.removeItem('mumi-catalogo-auth') } catch { /* noop */ }
}

export async function sesionActual() {
  const { data } = await supabase.auth.getSession()
  return data?.session || null
}

/** Suscribe a cambios de sesión. Devuelve función para cancelar. */
export function onCambioSesion(cb) {
  const { data } = supabase.auth.onAuthStateChange((_evt, session) => cb(session?.user || null))
  return () => data?.subscription?.unsubscribe?.()
}

// ---- Perfil (clientes_catalogo) ----

export async function cargarPerfil(userId) {
  if (!userId) return null
  const { data, error } = await supabase.from('clientes_catalogo').select('*').eq('id', userId).maybeSingle()
  if (error) return null
  return data
}

export async function guardarPerfil(user, campos) {
  if (!user?.id) throw new Error('Sesión no válida.')
  const fila = {
    id: user.id,
    email: (user.email || '').toLowerCase(),
    ...campos,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('clientes_catalogo').upsert(fila).select().maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/** Pedidos del propio cliente (RLS los limita a su correo verificado). */
export async function misPedidos() {
  const { data, error } = await supabase.from('pedidos_catalogo')
    .select('id, codigo, total, estado, estado_envio, productos, guia, transportadora, created_at, despachado_at, entregado_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return []
  return (data || []).filter(p => p.codigo)
}

/** Elimina la cuenta del cliente (borra usuario Auth + datos personales). */
export async function eliminarCuenta() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No hay sesión activa.')
  const { data, error } = await supabase.functions.invoke('catalogo-eliminar-cuenta', { body: {} })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  await supabase.auth.signOut()
  return true
}

function traducirError(msg) {
  const m = (msg || '').toLowerCase()
  if (m.includes('token has expired') || m.includes('expired')) return 'El código expiró. Pide uno nuevo.'
  if (m.includes('invalid') && m.includes('otp')) return 'Código incorrecto. Verifícalo o pide uno nuevo.'
  if (m.includes('rate') || m.includes('too many')) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
  if (m.includes('signups not allowed')) return 'El registro está deshabilitado en este momento.'
  return msg || 'No se pudo completar la operación.'
}

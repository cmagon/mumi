// Estado del "modo desarrollador", compartido y persistido (localStorage).
// Dos modos excluyentes:
//  - rol:        "vista de rol X" → toda la app se ve como ese rol y es SOLO LECTURA.
//  - imperson:   "entrar como usuario" (re-login real) → bloqueado para escribir hasta
//                que el desarrollador active 'permiteEdicion' (con alerta previa).
const KEY = 'mumi_dev'
const cargar = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {} } catch { return {} } }
let _st = { rol: null, imperson: null, permiteEdicion: false, origen: null, ...cargar() }
const subs = new Set()
const persistir = () => { try { localStorage.setItem(KEY, JSON.stringify(_st)) } catch { /* noop */ } }
const emitir = () => { persistir(); subs.forEach(f => { try { f(_st) } catch { /* noop */ } }) }

export function estadoDev() { return _st }
export function subscribeDev(fn) { subs.add(fn); return () => subs.delete(fn) }

// Vista de rol (solo lectura). Excluyente con impersonar.
export function setPreviewRol(rol) { _st = { ..._st, rol: rol || null, imperson: null, permiteEdicion: false }; emitir() }
// Impersonar un usuario real. Nunca se guardan credenciales en el navegador.
export function setImpersonando(nombre) { _st = { ..._st, imperson: nombre || null, rol: null, permiteEdicion: false, origen: null }; emitir() }
export function setPermiteEdicion(v) { _st = { ..._st, permiteEdicion: !!v }; emitir() }
export function limpiarDev() { _st = { rol: null, imperson: null, permiteEdicion: false, origen: null }; emitir() }

// ¿Está bloqueada una escritura sobre 'tabla'? Devuelve el motivo (string) o null si se permite.
const ALLOW_PREVIEW = new Set(['role_permissions'])   // guardar la vista por rol sí se permite en modo vista
export function motivoBloqueoEscritura(tabla) {
  if (_st.rol) return ALLOW_PREVIEW.has(tabla) ? null : 'Modo vista de rol: es solo lectura. No puedes modificar datos.'
  if (_st.imperson && !_st.permiteEdicion) return 'Estás como otro usuario (modo desarrollador). Activa “Permitir edición” en la barra superior para modificar datos.'
  return null
}

// ----- Compatibilidad con el uso anterior (vista de rol) -----
export function getDevRole() { return _st.rol }
export function setDevRole(rol) { setPreviewRol(rol) }
export function subscribeDevRole(fn) { return subscribeDev(st => fn(st.rol)) }

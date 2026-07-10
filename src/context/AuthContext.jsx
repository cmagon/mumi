import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, supabaseSignup } from '../lib/supabase'
import { setPermisosOverride, setRolPreview } from '../lib/permisos'
import { setRolLabels } from '../lib/businessLogic'
import { getDevRole, subscribeDevRole, limpiarDev } from '../lib/devMode'

const AuthContext = createContext(null)

// Convierte el "login" a un email sintético válido (sin espacios ni caracteres no permitidos)
const loginAEmail = (login) =>
  `${String(login || '').toLowerCase().trim().replace(/\s+/g, '').replace(/[^a-z0-9._-]/g, '')}@mumi.internal`

// La sesión se cierra automáticamente a las 48 horas del inicio de sesión
const SESION_MAX_MS = 48 * 60 * 60 * 1000
const LOGIN_KEY = 'mumi_login_at'
const PROFILE_KEY = 'mumi_profile'   // último perfil conocido (para ver datos offline)
const PERMS_KEY = 'mumi_perms'       // últimos permisos/labels conocidos (offline)
const getLoginAt   = () => { const v = localStorage.getItem(LOGIN_KEY); return v ? parseInt(v) : null }
const setLoginAt   = (ts) => localStorage.setItem(LOGIN_KEY, String(ts))
const clearLoginAt = () => localStorage.removeItem(LOGIN_KEY)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [permisos, setPermisos] = useState(null)
  const [devRole, setDevRole] = useState(getDevRole())
  useEffect(() => subscribeDevRole(setDevRole), [])

  // Carga la configuración de permisos por rol (tabla role_permissions) y la aplica
  async function recargarPermisos() {
    try {
      const { data, error } = await supabase.from('role_permissions').select('rol, permisos, label')
      if (error) throw error
      const map = {}
      const labels = {}
      ;(data || []).forEach(r => { map[r.rol] = r.permisos; if (r.label) labels[r.rol] = r.label })
      setPermisosOverride(map)
      setRolLabels(labels)
      setPermisos(map)
      localStorage.setItem(PERMS_KEY, JSON.stringify({ map, labels }))
    } catch {
      // Sin conexión: usa los últimos permisos conocidos (para que el menú funcione offline)
      try {
        const cached = JSON.parse(localStorage.getItem(PERMS_KEY) || 'null')
        if (cached?.map) { setPermisosOverride(cached.map); setRolLabels(cached.labels || {}); setPermisos(cached.map); return }
      } catch { /* noop */ }
      setPermisosOverride(null)
    }
  }

  async function fetchProfile(uid) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', uid)
        .single()
      if (error) throw error
      // Seguridad: si el usuario quedó INACTIVO, se cierra la sesión (no puede seguir en el sistema).
      if (data && data.estado && data.estado !== 'activo') { cerrarSesionAuto(); return null }
      if (data) { setProfile(data); localStorage.setItem(PROFILE_KEY, JSON.stringify(data)) }
      return data
    } catch {
      // Sin conexión / error: usa el último perfil conocido para poder ver los datos offline
      try {
        const cached = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
        if (cached && cached.id === uid) { setProfile(cached); return cached }
      } catch { /* noop */ }
      return null
    }
  }

  async function cerrarSesionAuto() {
    clearLoginAt(); localStorage.removeItem(PROFILE_KEY)
    await supabase.auth.signOut()
    setUser(null); setProfile(null)
  }

  useEffect(() => { recargarPermisos() }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Si no hay marca de inicio (sesión previa), la fijamos ahora
        const loginAt = getLoginAt() ?? (setLoginAt(Date.now()), Date.now())
        if (Date.now() - loginAt >= SESION_MAX_MS) { cerrarSesionAuto().finally(() => setLoading(false)); return }
        setUser(session.user)
        fetchProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setUser(null); setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Temporizador de cierre automático a las 48h (sobrevive recargas vía localStorage)
  useEffect(() => {
    if (!user) return
    const programar = () => {
      const loginAt = getLoginAt() ?? Date.now()
      const restante = SESION_MAX_MS - (Date.now() - loginAt)
      if (restante <= 0) { cerrarSesionAuto(); return null }
      return setTimeout(() => cerrarSesionAuto(), restante)
    }
    let timer = programar()
    // Chequeo periódico (por si el equipo se suspende y el timeout se atrasa)
    const intervalo = setInterval(() => {
      const loginAt = getLoginAt()
      if (loginAt && Date.now() - loginAt >= SESION_MAX_MS) cerrarSesionAuto()
    }, 60000)
    return () => { if (timer) clearTimeout(timer); clearInterval(intervalo) }
  }, [user])

  // Login con nombre de usuario (se convierte a email sintético internamente)
  async function signIn(login, password) {
    const email = loginAEmail(login)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Seguridad: un usuario INACTIVO no puede ingresar (se corta la sesión y se avisa)
    try {
      const { data: perfil } = await supabase.from('user_profiles').select('estado').eq('id', data.user.id).single()
      if (perfil && perfil.estado && perfil.estado !== 'activo') {
        await supabase.auth.signOut()
        setUser(null); setProfile(null); clearLoginAt(); localStorage.removeItem(PROFILE_KEY)
        throw new Error('Tu usuario está inactivo. Contacta al administrador.')
      }
    } catch (e) { if (e.message?.includes('inactivo')) throw e /* si no se pudo verificar, no bloquea el login */ }
    setLoginAt(Date.now())   // marca de inicio para el cierre automático a las 48h
    // Actualizar último acceso
    if (data.user) {
      await supabase
        .from('user_profiles')
        .update({ ultimo_acceso: new Date().toISOString() })
        .eq('id', data.user.id)
    }
    return data
  }

  async function signOut() {
    clearLoginAt(); localStorage.removeItem(PROFILE_KEY)
    limpiarDev(); setRolPreview(null)   // salir de cualquier modo desarrollador
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  // Crear usuario desde el panel admin (solo admin)
  async function createUser(nombre, login, password, rol) {
    const loginLimpio = String(login || '').toLowerCase().trim().replace(/\s+/g, '').replace(/[^a-z0-9._-]/g, '')
    if (!loginLimpio) throw new Error('El usuario (login) solo puede tener letras, números, punto, guion o guion bajo')
    const email = loginAEmail(login)
    // signUp con el cliente separado → NO reemplaza la sesión del admin actual
    const { data, error } = await supabaseSignup.auth.signUp({ email, password })
    if (error) throw error
    if (data.user) {
      // El perfil se inserta con la sesión del admin (cliente principal)
      const { error: pErr } = await supabase.from('user_profiles').insert({
        id: data.user.id, nombre, login: loginLimpio, rol, estado: 'activo'
      })
      if (pErr) throw pErr
      // La clave visible se guarda aparte, en tabla protegida (solo admin la lee)
      await supabase.from('user_secrets').insert({ id: data.user.id, password_visible: password })
    }
    return data
  }

  // Cambio de contraseña del propio usuario autenticado
  async function changePassword(nuevaPassword) {
    if (!nuevaPassword || nuevaPassword.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres')
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword })
    if (error) throw error
    // Copia visible para que el admin pueda consultarla (tabla protegida, solo admin)
    if (user?.id) await supabase.from('user_secrets').upsert({ id: user.id, password_visible: nuevaPassword, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  }

  // Restablecer la contraseña de OTRO usuario (solo admin) — requiere la Edge Function
  // 'admin-set-password' desplegada con la service_role key (ver supabase/functions/).
  async function adminResetPassword(userId, nuevaPassword) {
    const { data, error } = await supabase.functions.invoke('admin-set-password', {
      body: { user_id: userId, password: nuevaPassword },
    })
    if (error) throw new Error('No se pudo restablecer la contraseña. Verifica que la función admin-set-password esté desplegada en Supabase.')
    await supabase.from('user_secrets').upsert({ id: userId, password_visible: nuevaPassword, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    return data
  }

  // Rol EFECTIVO: si el desarrollador está "editando la vista de un rol", toda la app
  // (menú y accesos) se ve como ese rol. Para el resto de usuarios, es su rol real.
  // La "vista de rol" se aplica siempre que haya un devRole activo (solo se puede activar desde
  // la herramienta de desarrollador, que ya valida es_desarrollador). Así el menú/pestañas se
  // filtran de forma fiable sin depender de que el flag ya esté cargado en el perfil.
  const esDevPreview = !!devRole
  const rolEfectivo = esDevPreview ? devRole : profile?.rol
  // Aplica (o quita) el rol de previsualización a la capa de permisos DURANTE el render,
  // para que menú, módulos y secciones/pestañas se vean tal cual ese rol sin desfase.
  setRolPreview(esDevPreview ? devRole : null)
  // Durante la vista de rol, TODA la app (incluidas las páginas que leen profile.rol para decidir
  // sus pestañas/botones) recibe el rol previsualizado. Se conserva el resto del perfil real
  // (id, nombre, es_desarrollador…) para que las herramientas de desarrollador sigan funcionando.
  // Como la vista de rol es de solo lectura, cambiar el rol expuesto no afecta escrituras.
  const profileExpuesto = (profile && esDevPreview)
    ? { ...profile, rol: rolEfectivo, _rolReal: profile.rol }
    : profile
  const value = { user, profile: profileExpuesto, loading, permisos, rolEfectivo, esDevPreview, recargarPermisos, signIn, signOut, createUser, changePassword, adminResetPassword }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

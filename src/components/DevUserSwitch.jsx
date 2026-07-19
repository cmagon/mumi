import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { getRolLabel } from '../lib/businessLogic'
import { ROLES } from '../lib/permisos'
import { getDevRole, setDevRole, subscribeDevRole, setImpersonando, limpiarDev } from '../lib/devMode'
import { Wrench, X, LayoutDashboard, LogIn } from 'lucide-react'

// Herramienta de DESARROLLADOR (solo para usuarios con es_desarrollador = true).
// 1) Editar la vista del Tablero por ROL → se guarda en la nube y aplica a todos los usuarios del rol.
// 2) Entrar como cualquier usuario (re-login real) para probar datos/permisos de ese rol.
export default function DevUserSwitch({ variant = 'header' }) {
  const { profile, signIn } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('rol')       // 'rol' | 'usuario'
  const [cambiando, setCambiando] = useState(false)
  const [devRole, setDevRoleState] = useState(getDevRole())

  useEffect(() => subscribeDevRole(setDevRoleState), [])

  const esDev = profile?.es_desarrollador === true

  const { data: usuarios = [] } = useQuery({
    queryKey: ['dev_user_switch'],
    queryFn: async () => {
      const { data } = await supabase.from('user_profiles')
        .select('id, nombre, login, rol, estado')
        .order('rol').order('nombre')
      return data || []
    },
    enabled: esDev && open,
  })

  if (!esDev) return null

  // Roles del sistema: base + los que existan en los usuarios
  const rolesBase = Object.keys(ROLES)
  const roles = [...new Set([...rolesBase, ...usuarios.map(u => u.rol).filter(Boolean)])]
  const usuariosDeRol = (rol) => usuarios.filter(u => u.rol === rol)

  const editarVistaRol = (rol) => {
    setDevRole(rol)
    setOpen(false)
    toast(`Editando la vista del rol "${getRolLabel(rol)}". Los cambios se guardan para todos los usuarios de ese rol.`)
    navigate('/dashboard')
  }
  const salirEdicionRol = () => { setDevRole(null); setOpen(false); toast('Saliste de la edición de vista por rol'); navigate('/dashboard') }

  const entrarComoUsuario = async (u) => {
    if (u.id === profile?.id) { setOpen(false); return }
    // Las contraseñas nunca se almacenan ni se recuperan desde la aplicación.
    const pass = window.prompt(`Escribe la contraseña de "${u.nombre}" (${u.login}) para iniciar la sesión de prueba:`)
    if (!pass) return
    setCambiando(true)
    try {
      // Marca la sesión de prueba antes del re-login. Para volver se inicia sesión de nuevo.
      setImpersonando(u.nombre)
      await signIn(u.login, pass)   // re-login real → sesión, datos y permisos del usuario
      setOpen(false)
      toast(`Ahora estás como ${u.nombre} (${getRolLabel(u.rol)}) — edición bloqueada`)
      navigate('/dashboard')
    } catch (e) {
      limpiarDev()   // el login falló → no dejar el estado de impersonación colgado
      toast('No se pudo entrar como ' + u.nombre + ': ' + (e.message || 'contraseña incorrecta'), 'error')
    } finally { setCambiando(false) }
  }

  return (
    <>
      {variant === 'menu' ? (
        <button className="nav-item" onClick={() => setOpen(o => !o)} style={{ width: '100%', position: 'relative' }}>
          <span className="nav-icon"><Wrench size={18} aria-hidden="true" /></span>
          Modo desarrollador
          {devRole && <span style={{ marginLeft: 'auto', fontSize: '0.62rem', background: 'var(--dorado)', color: '#fff', padding: '1px 6px', borderRadius: 6 }}>vista de rol</span>}
        </button>
      ) : (
        <button
          onClick={() => setOpen(o => !o)}
          title="Herramientas de desarrollador"
          aria-label="Herramientas de desarrollador"
          style={{
            position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'var(--header-fg-strong, #fff)',
          }}
        >
          <Wrench size={19} aria-hidden="true" />
          {devRole && <span style={{ position: 'absolute', top: 2, right: 2, width: 9, height: 9, borderRadius: '50%', background: 'var(--dorado)' }} />}
        </button>
      )}

      {open && (
        <div className="dev-pop-overlay" onClick={() => setOpen(false)}>
        <div className="dev-pop" onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--crema-oscuro)', position: 'sticky', top: 0, background: 'var(--blanco, #fff)' }}>
            <strong style={{ color: 'var(--selva)', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Wrench size={15} aria-hidden="true" /> Desarrollador</strong>
            <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--texto-suave)' }}><X size={16} aria-hidden="true" /></button>
          </div>

          {devRole && (
            <div style={{ padding: '8px 12px', background: 'rgba(200,169,74,0.12)', borderBottom: '1px solid var(--crema-oscuro)', fontSize: '0.8rem' }}>
              Editando vista del rol <strong>{getRolLabel(devRole)}</strong>.
              <button className="btn btn-xs btn-secondary" style={{ marginLeft: 8 }} onClick={salirEdicionRol}>Salir</button>
            </div>
          )}

          {/* Pestañas */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--crema-oscuro)' }}>
            <button onClick={() => setTab('rol')} style={{ flex: 1, padding: '8px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: tab === 'rol' ? 'rgba(45,90,61,0.08)' : 'none', color: 'var(--selva)' }}><LayoutDashboard size={14} style={{ verticalAlign: '-2px' }} aria-hidden="true" /> Vista por rol</button>
            <button onClick={() => setTab('usuario')} style={{ flex: 1, padding: '8px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: tab === 'usuario' ? 'rgba(45,90,61,0.08)' : 'none', color: 'var(--selva)' }}><LogIn size={14} style={{ verticalAlign: '-2px' }} aria-hidden="true" /> Entrar como…</button>
          </div>

          <div style={{ padding: 8 }}>
            {tab === 'rol' ? (
              <>
                <p style={{ fontSize: '0.76rem', color: 'var(--texto-suave)', margin: '4px 6px 8px' }}>
                  Edita la disposición del Tablero para un rol. Se guarda en la nube y aplica a todos los usuarios de ese rol.
                </p>
                {roles.map(r => (
                  <button key={r} onClick={() => editarVistaRol(r)}
                    style={{ display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left', padding: '9px 10px', marginBottom: 2, border: 'none', borderRadius: 8, cursor: 'pointer', background: devRole === r ? 'rgba(45,90,61,0.10)' : 'none' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--selva)' }}>{getRolLabel(r)}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--texto-suave)' }}>{usuariosDeRol(r).length} usuario(s)</span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <p style={{ fontSize: '0.76rem', color: 'var(--texto-suave)', margin: '4px 6px 8px' }}>
                  Entra como un usuario real (re-login) para probar sus datos y permisos.
                </p>
                {usuarios.length === 0
                  ? <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', padding: 10 }}>Cargando usuarios…</p>
                  : usuarios.map(u => {
                    const actual = u.id === profile?.id
                    return (
                      <button key={u.id} disabled={cambiando || actual} onClick={() => entrarComoUsuario(u)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 2, border: 'none', borderRadius: 8, cursor: actual ? 'default' : 'pointer', background: actual ? 'rgba(45,90,61,0.10)' : 'none' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--selva)' }}>{u.nombre} {actual && <span style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>(actual)</span>}</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--texto-suave)' }}>{getRolLabel(u.rol)} · {u.login}{u.estado && u.estado !== 'activo' ? ` · ${u.estado}` : ''}</div>
                      </button>
                    )
                  })}
              </>
            )}
          </div>
        </div>
        </div>
      )}
    </>
  )
}

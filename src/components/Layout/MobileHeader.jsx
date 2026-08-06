import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, Settings, User, ShieldCheck, LogOut, ChevronDown, Users, RefreshCw } from 'lucide-react'
import NotificationBell from '../NotificationBell'
import DevUserSwitch from '../DevUserSwitch'
import ProfileModal from '../ProfileModal'
import { useAuth } from '../../context/AuthContext'
import { getRolLabel } from '../../lib/businessLogic'
import { puedeVer } from '../../lib/permisos'
import { getConfig, loadConfig } from '../../lib/appConfig'
import { purgarCacheYRecargar } from '../../lib/purgarCache'

export default function MobileHeader({ onMenuClick, onLogout }) {
  const [cfg, setCfg] = useState(getConfig())
  const { profile, rolEfectivo, esDevPreview } = useAuth()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [perfil, setPerfil] = useState(null)   // null | 'datos' | 'password'
  useEffect(() => { loadConfig().then(setCfg).catch(() => {}) }, [])

  const puedeConfig = puedeVer(rolEfectivo, 'configuracion')
  const puedeUsuarios = puedeVer(rolEfectivo, 'usuarios')
  const cerrar = () => setMenu(false)
  const ir = (ruta) => { cerrar(); navigate(ruta) }

  const nombre = profile?.nombre || '—'
  const inicial = nombre.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="mobile-header">
      <button className="hamburger" onClick={onMenuClick} aria-label="Abrir menú"><Menu size={24} /></button>
      <Link to="/dashboard" className="mobile-brand" title="Ir al Tablero Principal" aria-label="Ir al Tablero Principal" style={{ textDecoration: 'none' }}>
        {cfg.logo_url
          ? <img src={cfg.logo_url} alt="logo" style={{ maxWidth: 26, maxHeight: 26, objectFit: 'contain' }} />
          : null}
        <span>{cfg.empresa || 'Mumi Amazonia'}</span>
      </Link>

      <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span className="solo-desktop" style={{ display: 'inline-flex' }}><DevUserSwitch /></span>
        <NotificationBell variant="header" />

        {/* Usuario: avatar + nombre + engranaje que despliega el menú */}
        <div className="user-menu-wrap">
          <button
            type="button" className="user-chip"
            onClick={() => setMenu(o => !o)}
            aria-haspopup="menu" aria-expanded={menu}
            title={`${nombre} · ${getRolLabel(profile?.rol)}${esDevPreview ? ' · vista de rol' : ''}`}
          >
            <span className="user-chip-av">
              {inicial}
              {esDevPreview && <span className="user-chip-dot" aria-hidden="true" />}
            </span>
            <span className="user-chip-name">{nombre}</span>
            <ChevronDown size={15} aria-hidden="true" className="user-chip-chev" style={{ transform: menu ? 'rotate(180deg)' : 'none' }} />
          </button>

          {menu && (
            <>
              <div className="user-menu-overlay" onClick={cerrar} />
              <div className="user-menu" role="menu">
                <div className="user-menu-head">
                  <div className="user-menu-name">{nombre}</div>
                  <div className="user-menu-role">{getRolLabel(profile?.rol)}</div>
                </div>
                <button className="user-menu-item" role="menuitem" onClick={() => { cerrar(); setPerfil('datos') }}>
                  <User size={15} aria-hidden="true" /> Mi perfil
                </button>
                <button className="user-menu-item" role="menuitem" onClick={() => { cerrar(); setPerfil('password') }}>
                  <ShieldCheck size={15} aria-hidden="true" /> Seguridad
                </button>

                {/* Admin: acceso directo a Configuración y Usuarios (Usuarios ya incluye roles y permisos) */}
                {puedeConfig && (
                  <button className="user-menu-item" role="menuitem" onClick={() => ir('/configuracion')}>
                    <Settings size={15} aria-hidden="true" /> Configuración
                  </button>
                )}
                {puedeUsuarios && (
                  <button className="user-menu-item" role="menuitem" onClick={() => ir('/usuarios')}>
                    <Users size={15} aria-hidden="true" /> Usuarios
                  </button>
                )}

                <button className="user-menu-item" role="menuitem" onClick={() => { cerrar(); purgarCacheYRecargar() }}>
                  <RefreshCw size={15} aria-hidden="true" /> Recargar aplicación
                </button>
                <button className="user-menu-item user-menu-item-danger" role="menuitem" onClick={() => { cerrar(); onLogout?.() }}>
                  <LogOut size={15} aria-hidden="true" /> Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <ProfileModal open={!!perfil} modo={perfil || 'todo'} onClose={() => setPerfil(null)} />
    </div>
  )
}

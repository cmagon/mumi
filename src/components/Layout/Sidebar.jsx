import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getRolLabel } from '../../lib/businessLogic'
import { puedeVer, RUTA_MODULO } from '../../lib/permisos'
import { getConfig, loadConfig } from '../../lib/appConfig'
import ChangePasswordModal from '../ChangePasswordModal'

const NAV_ITEMS = [
  { section: 'Principal' },
  { to: '/dashboard',  icon: '📊', label: 'Tablero Principal' },
  { section: 'Producción' },
  { to: '/costos',     icon: '🧮', label: 'Calculadora de Costos' },
  { to: '/inventario', icon: '📦', label: 'Inventario MP' },
  { to: '/terminados', icon: '🏷️', label: 'Producto Terminado' },
  { to: '/ordenes',    icon: '📝', label: 'Órdenes de Producción' },
  { to: '/produccion', icon: '🏭', label: 'Registro de Producción' },
  { section: 'Personal' },
  { to: '/nomina',     icon: '👥', label: 'Asistencia & Nómina' },
  { section: 'Comercial' },
  { to: '/clientes',   icon: '🤝', label: 'Clientes' },
  { section: 'Registros' },
  { to: '/galeria',    icon: '📷', label: 'Galería Fotográfica' },
  { to: '/documentos', icon: '📁', label: 'Gestión Documental' },
  { to: '/registros',  icon: '📒', label: 'Libros de Registro' },
  { to: '/calidad',    icon: '⚠️', label: 'No Conformidades' },
  { to: '/capacitacion', icon: '🎓', label: 'Capacitación' },
  { to: '/configuracion', icon: '⚙️', label: 'Configuración', adminOnly: true },
  { to: '/usuarios',   icon: '🔐', label: 'Usuarios & Permisos', adminOnly: true },
]

export default function Sidebar({ open, onClose, onLogout, puedeFichar, onRegistrarAsistencia }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [pwdModal, setPwdModal] = useState(false)
  const [cfg, setCfg] = useState(getConfig())
  useEffect(() => { loadConfig().then(setCfg).catch(() => {}) }, [])

  // Si el layout maneja el cierre (modal de asistencia), lo delegamos; si no, cerramos directo
  const handleLogout = async () => {
    if (onLogout) { onLogout(); return }
    await signOut()
    navigate('/login')
  }

  return (
    <>
      <div
        className={`sidebar-overlay ${open ? 'active' : ''}`}
        onClick={onClose}
      />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {cfg.logo_url
              ? <img src={cfg.logo_url} alt="logo" style={{ maxWidth: 32, maxHeight: 32, objectFit: 'contain' }} />
              : <span>🌿</span>}
            <span>{cfg.empresa || 'Mumi Amazonia'}</span>
          </div>
          <div className="brand-tagline">{cfg.eslogan || 'Gestión Empresarial'}</div>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">👤</div>
          <div className="user-meta">
            <div className="user-greeting">Hola,</div>
            <div className="user-name">{profile?.nombre || '—'}</div>
            <div className="user-role">{getRolLabel(profile?.rol)}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {puedeFichar && (
            <button className="nav-item nav-fichar" onClick={onRegistrarAsistencia}>
              <span className="nav-icon">🕒</span>
              Registrar asistencia
            </button>
          )}
          {(() => {
            const out = []
            let seccionPend = null
            NAV_ITEMS.forEach((item, i) => {
              if (item.section) { seccionPend = item.section; return }
              if (!puedeVer(profile?.rol, RUTA_MODULO[item.to])) return
              if (seccionPend) { out.push(<div key={`s${i}`} className="nav-section-title">{seccionPend}</div>); seccionPend = null }
              out.push(
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                  onClick={onClose}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              )
            })
            return out
          })()}
        </nav>

        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn-sidebar" onClick={() => setPwdModal(true)}>
            🔑 Cambiar contraseña
          </button>
          <button className="btn-logout" onClick={handleLogout}>
            ⬡ Cerrar Sesión
          </button>
        </div>
      </aside>
      <ChangePasswordModal open={pwdModal} onClose={() => setPwdModal(false)} />
    </>
  )
}

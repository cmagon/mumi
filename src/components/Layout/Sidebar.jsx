import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Calculator, Package, Tags, ClipboardList, Factory, Users, Handshake,
  Camera, FolderOpen, NotebookText, AlertTriangle, GraduationCap, Settings, KeyRound,
  Clock, Leaf, LogOut, User,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getRolLabel } from '../../lib/businessLogic'
import { puedeVer, RUTA_MODULO } from '../../lib/permisos'
import { getConfig, loadConfig } from '../../lib/appConfig'
import ChangePasswordModal from '../ChangePasswordModal'

const NAV_ITEMS = [
  { section: 'Principal' },
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Tablero Principal' },
  { section: 'Producción' },
  { to: '/costos',     icon: Calculator, label: 'Calculadora de Costos' },
  { to: '/inventario', icon: Package, label: 'Inventario MP' },
  { to: '/terminados', icon: Tags, label: 'Producto Terminado' },
  { to: '/ordenes',    icon: ClipboardList, label: 'Órdenes de Producción' },
  { to: '/produccion', icon: Factory, label: 'Registro de Producción' },
  { section: 'Personal' },
  { to: '/nomina',     icon: Users, label: 'Asistencia & Nómina' },
  { section: 'Comercial' },
  { to: '/clientes',   icon: Handshake, label: 'Clientes' },
  { section: 'Registros' },
  { to: '/galeria',    icon: Camera, label: 'Galería Fotográfica' },
  { to: '/documentos', icon: FolderOpen, label: 'Gestión Documental' },
  { to: '/registros',  icon: NotebookText, label: 'Libros de Registro' },
  { to: '/calidad',    icon: AlertTriangle, label: 'No Conformidades' },
  { to: '/capacitacion', icon: GraduationCap, label: 'Capacitación' },
  { to: '/configuracion', icon: Settings, label: 'Configuración', adminOnly: true },
  { to: '/usuarios',   icon: KeyRound, label: 'Usuarios & Permisos', adminOnly: true },
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
          <NavLink
            to="/dashboard"
            onClick={onClose}
            className="brand-name"
            title="Ir al Tablero Principal"
            aria-label="Ir al Tablero Principal"
            style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', cursor: 'pointer' }}
          >
            {cfg.logo_url
              ? <img src={cfg.logo_url} alt={`Logo de ${cfg.empresa || 'Mumi Amazonia'}`} style={{ maxWidth: 32, maxHeight: 32, objectFit: 'contain' }} />
              : <Leaf size={22} aria-hidden="true" />}
            <span>{cfg.empresa || 'Mumi Amazonia'}</span>
          </NavLink>
          <div className="brand-tagline">{cfg.eslogan || 'Gestión Empresarial'}</div>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar"><User size={20} aria-hidden="true" /></div>
          <div className="user-meta">
            <div className="user-greeting">Hola,</div>
            <div className="user-name">{profile?.nombre || '—'}</div>
            <div className="user-role">{getRolLabel(profile?.rol)}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {puedeFichar && (
            <button className="nav-item nav-fichar" onClick={onRegistrarAsistencia}>
              <span className="nav-icon"><Clock size={18} aria-hidden="true" /></span>
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
                  <span className="nav-icon"><item.icon size={18} aria-hidden="true" /></span>
                  {item.label}
                </NavLink>
              )
            })
            return out
          })()}
        </nav>

        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn-sidebar" onClick={() => setPwdModal(true)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <KeyRound size={16} aria-hidden="true" /> Cambiar contraseña
          </button>
          <button className="btn-logout" onClick={handleLogout} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <LogOut size={16} aria-hidden="true" /> Cerrar Sesión
          </button>
        </div>
      </aside>
      <ChangePasswordModal open={pwdModal} onClose={() => setPwdModal(false)} />
    </>
  )
}

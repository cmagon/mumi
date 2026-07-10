import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Calculator, Package, Tags, ClipboardList, Factory, Users, Handshake,
  Camera, FolderOpen, NotebookText, AlertTriangle, GraduationCap, Settings,
  Clock, Leaf, KeyRound, Recycle,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { puedeVer, RUTA_MODULO } from '../../lib/permisos'
import { getConfig, loadConfig } from '../../lib/appConfig'
import DevUserSwitch from '../DevUserSwitch'

const NAV_ITEMS = [
  { section: 'Principal' },
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Tablero Principal' },
  { section: 'Producción' },
  { to: '/costos',     icon: Calculator, label: 'Calculadora de Costos' },
  { to: '/inventario', icon: Package, label: 'Inventario MP' },
  { to: '/terminados', icon: Tags, label: 'Producto Terminado' },
  { to: '/ordenes',    icon: ClipboardList, label: 'Órdenes de Producción' },
  { to: '/produccion', icon: Factory, label: 'Registro de Producción' },
  { to: '/porempacar', icon: Recycle, label: 'Productos por Empacar' },
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

export default function Sidebar({ open, onClose, puedeFichar, onRegistrarAsistencia }) {
  const { rolEfectivo } = useAuth()
  const [cfg, setCfg] = useState(getConfig())
  useEffect(() => { loadConfig().then(setCfg).catch(() => {}) }, [])

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
              if (!puedeVer(rolEfectivo, RUTA_MODULO[item.to])) return
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
          {/* Modo desarrollador: en móvil va aquí (en escritorio está en el encabezado) */}
          <div className="solo-movil"><DevUserSwitch variant="menu" /></div>
        </nav>
      </aside>
    </>
  )
}

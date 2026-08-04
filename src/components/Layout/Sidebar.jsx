import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Calculator, Package, Tags, ClipboardList, Factory, Users, Handshake,
  Camera, FolderOpen, NotebookText, AlertTriangle, GraduationCap,
  Clock, Leaf, Recycle, ChevronDown, Store,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { puedeVer, RUTA_MODULO } from '../../lib/permisos'
import { getConfig, loadConfig } from '../../lib/appConfig'
import DevUserSwitch from '../DevUserSwitch'

// (Configuración y Usuarios & Permisos ya no van aquí: se acceden desde el menú del usuario en el header)
const NAV_ITEMS = [
  { section: 'Principal' },
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Tablero Principal' },
  { section: 'Producción' },
  { to: '/productos',   icon: Package, label: 'Productos' },
  { to: '/costos-gastos', icon: Calculator, label: 'Costos y Gastos' },
  { to: '/inventario', icon: Package, label: 'Inventario MP' },
  { to: '/ordenes',    icon: ClipboardList, label: 'Órdenes de Producción' },
  { to: '/produccion', icon: Factory, label: 'Registro de Producción' },
  { to: '/porempacar', icon: Recycle, label: 'Productos por Empacar' },
  { section: 'Utilidades' },
  { to: '/utilidades', icon: Tags, label: 'Recetas rápidas' },
  { section: 'Personal' },
  { to: '/nomina',     icon: Users, label: 'Asistencia & Nómina' },
  { section: 'Comercial' },
  { to: '/clientes',   icon: Handshake, label: 'Clientes' },
  { to: '/catalogo',   icon: Store, label: 'Catálogo público' },
  { section: 'Registros' },
  { to: '/galeria',    icon: Camera, label: 'Galería Fotográfica' },
  { to: '/documentos', icon: FolderOpen, label: 'Gestión Documental' },
  { to: '/registros',  icon: NotebookText, label: 'Libros de Registro' },
  { to: '/calidad',    icon: AlertTriangle, label: 'No Conformidades' },
  { to: '/capacitacion', icon: GraduationCap, label: 'Capacitación' },
]

export default function Sidebar({ open, onClose, puedeFichar, onRegistrarAsistencia }) {
  const { rolEfectivo } = useAuth()
  const location = useLocation()
  const [cfg, setCfg] = useState(getConfig())
  const [secAbierta, setSecAbierta] = useState({})   // { [seccion]: bool } — overrides del usuario
  useEffect(() => { loadConfig().then(setCfg).catch(() => {}) }, [])

  // Agrupa los ítems por sección, filtrando por permiso
  const grupos = []
  let actual = null
  NAV_ITEMS.forEach(item => {
    if (item.section) { actual = { section: item.section, items: [] }; grupos.push(actual); return }
    if (!puedeVer(rolEfectivo, RUTA_MODULO[item.to])) return
    if (actual) actual.items.push(item)
  })
  const visibles = grupos.filter(g => g.items.length)

  const renderItem = (item) => (
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

          {visibles.map(g => {
            // Solo la sección "Registros" se agrupa en acordeón (+/−); el resto va plano
            if (g.section !== 'Registros') {
              return (
                <div key={g.section}>
                  <div className="nav-section-title">{g.section}</div>
                  {g.items.map(renderItem)}
                </div>
              )
            }
            const activa = g.items.some(it => it.to === location.pathname)
            const abierto = secAbierta[g.section] ?? activa
            return (
              <div key={g.section}>
                <button
                  type="button"
                  className="nav-section-toggle"
                  aria-expanded={abierto}
                  onClick={() => setSecAbierta(s => ({ ...s, [g.section]: !(s[g.section] ?? activa) }))}
                >
                  {g.section}
                  <ChevronDown size={15} aria-hidden="true" style={{ transition: 'transform 0.18s ease', transform: abierto ? 'rotate(180deg)' : 'none' }} />
                </button>
                {abierto && g.items.map(renderItem)}
              </div>
            )
          })}

          {/* Modo desarrollador: en móvil va aquí (en escritorio está en el encabezado) */}
          <div className="solo-movil"><DevUserSwitch variant="menu" /></div>
        </nav>
      </aside>
    </>
  )
}

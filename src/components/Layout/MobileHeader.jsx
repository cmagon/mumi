import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Leaf, Menu } from 'lucide-react'
import NotificationBell from '../NotificationBell'
import DevUserSwitch from '../DevUserSwitch'
import { getConfig, loadConfig } from '../../lib/appConfig'

export default function MobileHeader({ onMenuClick }) {
  const [cfg, setCfg] = useState(getConfig())
  useEffect(() => { loadConfig().then(setCfg).catch(() => {}) }, [])
  return (
    <div className="mobile-header">
      <button className="hamburger" onClick={onMenuClick} aria-label="Abrir menú" style={{ display: 'inline-flex', alignItems: 'center' }}><Menu size={24} /></button>
      <Link to="/dashboard" className="mobile-brand" title="Ir al Tablero Principal" aria-label="Ir al Tablero Principal" style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
        {cfg.logo_url
          ? <img src={cfg.logo_url} alt="logo" style={{ maxWidth: 26, maxHeight: 26, objectFit: 'contain' }} />
          : <Leaf size={20} aria-hidden="true" />}
        <span>{cfg.empresa || 'Mumi Amazonia'}</span>
      </Link>
      <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <DevUserSwitch />
        <NotificationBell variant="header" />
      </div>
    </div>
  )
}

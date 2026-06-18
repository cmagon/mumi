import { useState, useEffect } from 'react'
import NotificationBell from '../NotificationBell'
import { getConfig, loadConfig } from '../../lib/appConfig'

export default function MobileHeader({ onMenuClick }) {
  const [cfg, setCfg] = useState(getConfig())
  useEffect(() => { loadConfig().then(setCfg).catch(() => {}) }, [])
  return (
    <div className="mobile-header">
      <button className="hamburger" onClick={onMenuClick}>☰</button>
      <span className="mobile-brand" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {cfg.logo_url
          ? <img src={cfg.logo_url} alt="logo" style={{ maxWidth: 26, maxHeight: 26, objectFit: 'contain' }} />
          : <span>🌿</span>}
        <span>{cfg.empresa || 'Mumi Amazonia'}</span>
      </span>
      <div style={{ marginLeft: 'auto' }}>
        <NotificationBell variant="header" />
      </div>
    </div>
  )
}

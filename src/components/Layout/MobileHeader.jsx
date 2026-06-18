import NotificationBell from '../NotificationBell'

export default function MobileHeader({ onMenuClick }) {
  return (
    <div className="mobile-header">
      <button className="hamburger" onClick={onMenuClick}>☰</button>
      <span className="mobile-brand">🌿 Mumi Amazonia</span>
      <div style={{ marginLeft: 'auto' }}>
        <NotificationBell variant="header" />
      </div>
    </div>
  )
}

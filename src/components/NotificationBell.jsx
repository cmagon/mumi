import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Modal from './ui/Modal'

const tiempoRelativo = (ts) => {
  const d = (Date.now() - new Date(ts).getTime()) / 1000
  if (d < 60) return 'hace un momento'
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`
  return `hace ${Math.floor(d / 86400)} d`
}

export default function NotificationBell({ variant = 'sidebar' }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)

  // El usuario recibe las dirigidas a su nombre y, si es admin, las dirigidas a 'admin'
  const destinatarios = [profile?.nombre, profile?.rol === 'admin' ? 'admin' : null].filter(Boolean)

  const { data: notifs = [] } = useQuery({
    queryKey: ['notifications', profile?.nombre, profile?.rol],
    queryFn: async () => {
      if (!destinatarios.length) return []
      const { data } = await supabase.from('notifications').select('*')
        .in('destinatario', destinatarios).order('created_at', { ascending: false }).limit(40)
      return data || []
    },
    enabled: !!profile,
    refetchInterval: 30000,   // refresca cada 30s
  })

  const noLeidas = notifs.filter(n => !n.leido).length

  const marcarLeida = async (n) => {
    if (!n.leido) { await supabase.from('notifications').update({ leido: true }).eq('id', n.id); qc.invalidateQueries({ queryKey: ['notifications'] }) }
  }
  const marcarTodas = async () => {
    const ids = notifs.filter(n => !n.leido).map(n => n.id)
    if (ids.length) { await supabase.from('notifications').update({ leido: true }).in('id', ids); qc.invalidateQueries({ queryKey: ['notifications'] }) }
  }
  const abrir = (n) => { marcarLeida(n); if (n.link) { navigate(n.link); setAbierto(false) } }

  const panel = (
    <Modal open={abierto} onClose={() => setAbierto(false)} title="🔔 Notificaciones"
      footer={<button className="btn btn-secondary" onClick={() => setAbierto(false)}>Cerrar</button>}
    >
      {noLeidas > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button className="btn btn-sm btn-secondary" onClick={marcarTodas}>✓ Marcar todas leídas</button>
        </div>
      )}
      {notifs.length === 0
        ? <p className="empty-table">No tienes notificaciones</p>
        : notifs.map(n => (
          <div key={n.id} onClick={() => abrir(n)}
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 8, borderRadius: 'var(--radio)', cursor: n.link ? 'pointer' : 'default', background: n.leido ? 'transparent' : 'rgba(124,179,66,0.08)', border: `1px solid ${n.leido ? 'var(--crema-oscuro)' : 'rgba(124,179,66,0.25)'}` }}>
            {!n.leido && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--lima)', marginTop: 6, flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.88rem', color: 'var(--texto)' }}>{n.mensaje}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)', marginTop: 2 }}>{tiempoRelativo(n.created_at)}{n.link && ' · toca para ver'}</div>
            </div>
            {!n.leido && (
              <button className="btn btn-xs btn-secondary" title="Marcar como leída"
                onClick={(e) => { e.stopPropagation(); marcarLeida(n) }} style={{ flexShrink: 0 }}>✓</button>
            )}
          </div>
        ))}
    </Modal>
  )

  const botonEstilo = variant === 'header'
    ? { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crema)', fontSize: '1.3rem', position: 'relative', padding: 4 }
    : variant === 'nav'
    ? { background: 'none', border: 'none', borderLeft: '3px solid transparent', cursor: 'pointer', font: 'inherit', position: 'relative', textAlign: 'left' }
    : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--radio)', cursor: 'pointer', color: 'var(--crema)', fontSize: '0.95rem', position: 'relative', padding: '8px 10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }

  if (variant === 'nav') {
    return (
      <>
        <button className="nav-item" style={botonEstilo} onClick={() => setAbierto(true)} title="Notificaciones">
          <span className="nav-icon">🔔</span>
          Notificaciones
          {noLeidas > 0 && (
            <span style={{ marginLeft: 'auto', background: 'var(--rojo, #d9534f)', color: '#fff', borderRadius: 10, fontSize: '0.62rem', fontWeight: 700, minWidth: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
              {noLeidas > 9 ? '9+' : noLeidas}
            </span>
          )}
        </button>
        {panel}
      </>
    )
  }

  return (
    <>
      <button style={botonEstilo} onClick={() => setAbierto(true)} title="Notificaciones">
        🔔{variant === 'sidebar' && <span style={{ fontSize: '0.82rem' }}>Notificaciones</span>}
        {noLeidas > 0 && (
          <span style={{ position: 'absolute', top: variant === 'header' ? 0 : 4, right: variant === 'header' ? 0 : 8, background: 'var(--rojo)', color: '#fff', borderRadius: 10, fontSize: '0.62rem', fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>
      {panel}
    </>
  )
}

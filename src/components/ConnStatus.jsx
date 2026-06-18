import { useState, useEffect } from 'react'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { flushQueue, queueCount, onQueueChange } from '../lib/offlineQueue'

// Indicador de conexión + pendientes por sincronizar + botón sincronizar.
export default function ConnStatus() {
  const qc = useQueryClient()
  const fetching = useIsFetching()
  const [online, setOnline] = useState(navigator.onLine)
  const [pend, setPend] = useState(0)
  const [msg, setMsg] = useState('')

  const refrescarPend = () => queueCount().then(setPend)

  const sincronizar = async () => {
    setMsg('Sincronizando…')
    const r = await flushQueue()
    await refrescarPend()
    await qc.invalidateQueries()
    setMsg(r.left > 0 ? `Quedan ${r.left} pendientes` : (r.done > 0 ? `✓ ${r.done} sincronizados` : ''))
    setTimeout(() => setMsg(''), 2500)
  }

  useEffect(() => {
    refrescarPend()
    const unsub = onQueueChange(refrescarPend)
    const on = async () => { setOnline(true); await sincronizar() }
    const off = () => { setOnline(false); setMsg('') }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    // Intento de vaciado al iniciar (por si quedaron pendientes de una sesión previa)
    if (navigator.onLine) flushQueue().then(refrescarPend)
    return () => { unsub(); window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])  // eslint-disable-line

  const bg = !online ? '#9a3b3b' : (pend > 0 ? '#b07d18' : '#1e7d4f')
  const texto = !online
    ? (pend > 0 ? `Sin conexión · ${pend} sin guardar` : 'Sin conexión')
    : (msg || (pend > 0 ? `${pend} por sincronizar` : 'En línea'))

  return (
    <div style={{
      position: 'fixed', bottom: 14, right: 14, zIndex: 3000,
      display: 'flex', alignItems: 'center', gap: 8,
      background: bg, color: '#fff',
      borderRadius: 22, padding: '7px 12px', fontSize: '0.8rem', fontWeight: 600,
      boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
    }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: online ? '#7CFFB0' : '#ffb3b3', display: 'inline-block' }} />
      {texto}
      {online && (pend > 0 || msg) && (
        <button onClick={sincronizar} disabled={!!fetching} title="Sincronizar ahora" style={{
          background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
          borderRadius: 14, padding: '3px 9px', cursor: fetching ? 'wait' : 'pointer',
          fontSize: '0.78rem', fontWeight: 700,
        }}>
          {fetching ? '⟳…' : '⟳ Sincronizar'}
        </button>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'

// Indicador discreto de conexión. La app trabaja siempre en línea; cuando se pierde la red,
// App muestra la página "Sin conexión" completa, así que aquí solo se marca una caída breve.
export default function ConnStatus() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // En línea → no estorbar (la barra de "Sin conexión" la cubre App a pantalla completa).
  if (online) return null

  return (
    <div role="alert" style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 4000,
      background: '#9a3b3b', color: '#fff', textAlign: 'center',
      padding: '8px 14px', fontSize: '0.85rem', fontWeight: 600,
      boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
    }}>
      📡 SIN CONEXIÓN — no podrás guardar cambios hasta que vuelva el internet.
    </div>
  )
}

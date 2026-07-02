import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { estadoDev, subscribeDev, setPreviewRol, setImpersonando, setPermiteEdicion, limpiarDev } from '../lib/devMode'
import { getRolLabel } from '../lib/businessLogic'
import { Eye, ShieldAlert, Pencil, LogIn, X } from 'lucide-react'

// Barra fija superior que indica que hay un modo desarrollador activo.
// - Vista de rol: solo lectura, con salida.
// - Impersonando: bloqueado para editar hasta que se active "Permitir edición" (con alerta).
export default function DevModeBanner() {
  const { signIn, profile, esDevPreview } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [st, setSt] = useState(estadoDev())
  useEffect(() => subscribeDev(setSt), [])
  // Avisos cuando una escritura es bloqueada por el modo dev
  useEffect(() => {
    const h = (e) => toast(e.detail || 'Acción bloqueada en modo desarrollador', 'warning')
    window.addEventListener('dev-bloqueo', h)
    return () => window.removeEventListener('dev-bloqueo', h)
  }, [toast])

  if (!st.rol && !st.imperson) return null

  const salirRol = () => { setPreviewRol(null); toast('Saliste de la vista de rol'); navigate('/dashboard') }
  const permitirEdicion = () => {
    const ok = window.confirm('⚠ MODIFICACIÓN DE DATOS REALES\n\nEstás dentro de otro usuario en modo desarrollador. Si continúas, cualquier cambio afectará la base de datos original.\n\n¿Permitir edición durante esta sesión?')
    if (ok) { setPermiteEdicion(true); toast('Edición habilitada — los cambios afectan datos reales', 'warning') }
  }
  const volverDev = async () => {
    const o = st.origen
    if (!o?.login || !o?.password) { toast('No se guardaron tus credenciales para volver. Cierra sesión e ingresa de nuevo.', 'warning'); limpiarDev(); return }
    try { await signIn(o.login, o.password); limpiarDev(); toast('Volviste a tu usuario de desarrollador ✓'); navigate('/dashboard') }
    catch (e) { toast('No se pudo volver: ' + (e.message || e), 'error') }
  }

  const fondo = st.rol ? 'var(--dorado, #C8A94A)' : (st.permiteEdicion ? 'var(--rojo, #c0392b)' : '#334155')

  return (
    <div style={{
      width: '100%', marginBottom: 14, borderRadius: 8,
      background: fondo, color: '#fff', padding: '8px 12px',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: '0.82rem', fontWeight: 600,
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    }}>
      {st.rol ? (
        <>
          <Eye size={16} aria-hidden="true" />
          <span>MODO VISTA DE ROL: <strong>{getRolLabel(st.rol)}</strong> — solo lectura (no puedes modificar datos)</span>
          {!esDevPreview && (
            <span style={{ background: 'rgba(192,57,43,0.9)', padding: '2px 8px', borderRadius: 6 }}>
              ⚠ La vista NO se está aplicando: tu usuario {profile?.es_desarrollador === undefined ? 'no tiene la columna es_desarrollador (falta correr la migración v81)' : 'no tiene es_desarrollador = true'}.
            </span>
          )}
          <button onClick={salirRol} style={btn}><X size={13} aria-hidden="true" /> Salir</button>
        </>
      ) : (
        <>
          <ShieldAlert size={16} aria-hidden="true" />
          <span>MODO DESARROLLADOR — estás como <strong>{st.imperson}</strong>. {st.permiteEdicion ? 'Edición HABILITADA (afecta datos reales).' : 'Edición bloqueada.'}</span>
          {!st.permiteEdicion
            ? <button onClick={permitirEdicion} style={btn}><Pencil size={13} aria-hidden="true" /> Permitir edición</button>
            : <button onClick={() => setPermiteEdicion(false)} style={btn}>Bloquear edición</button>}
          <button onClick={volverDev} style={btn}><LogIn size={13} aria-hidden="true" /> Volver a mi usuario</button>
        </>
      )}
    </div>
  )
}

const btn = {
  marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 4,
  background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.5)',
  borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600,
}

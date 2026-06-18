import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [login, setLogin]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [recuperando, setRecuperando] = useState(false)
  const [msgRec, setMsgRec]     = useState('')
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const recuperarPassword = async () => {
    if (!login.trim()) { setError('Escribe tu usuario y pulsa "Recuperar contraseña"'); return }
    setError('')
    try {
      await supabase.from('password_requests').insert({ usuario: login.trim(), mensaje: 'Solicitud de recuperación de contraseña desde el login' })
      setMsgRec('✓ Tu solicitud fue enviada al administrador. Él te asignará una nueva contraseña.')
    } catch {
      setMsgRec('No se pudo enviar la solicitud. Contacta al administrador.')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!login || !password) { setError('Ingresa usuario y contraseña'); return }
    setLoading(true); setError('')
    try {
      await signIn(login, password)
      navigate('/dashboard')
    } catch {
      setError('Usuario o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div id="login-screen" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #1a3a2a 0%, #2d5a3d 50%, #0d2218 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="login-box" style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(200,169,74,0.3)',
        borderRadius: 12, padding: '48px 40px',
        width: 'min(420px, 90vw)', textAlign: 'center',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🌿</div>
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '2.2rem', color: 'var(--dorado)',
          marginBottom: 4, letterSpacing: 2
        }}>
          Mumi Amazonia
        </div>
        <div style={{
          color: 'rgba(245,240,232,0.6)', fontSize: '0.85rem',
          letterSpacing: 3, textTransform: 'uppercase', marginBottom: 36
        }}>
          Sistema de Gestión Empresarial
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Usuario"
            value={login}
            onChange={e => setLogin(e.target.value)}
            autoComplete="username"
            style={{
              width: '100%', padding: '12px 16px', marginBottom: 12,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(200,169,74,0.35)',
              borderRadius: 'var(--radio)',
              color: '#ffffff', fontFamily: "'Source Sans 3', sans-serif",
              fontSize: '0.95rem'
            }}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={e => e.key === 'Enter' && handleSubmit(e)}
            style={{
              width: '100%', padding: '12px 16px', marginBottom: 20,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(200,169,74,0.35)',
              borderRadius: 'var(--radio)',
              color: '#ffffff', fontFamily: "'Source Sans 3', sans-serif",
              fontSize: '0.95rem'
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: 13,
              background: 'linear-gradient(135deg, var(--dorado), var(--tierra-claro))',
              color: 'var(--selva)', border: 'none', borderRadius: 'var(--radio)',
              fontFamily: "'Source Sans 3', sans-serif",
              fontWeight: 600, fontSize: '1rem',
              letterSpacing: 1, textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        {error && (
          <div style={{ color: '#ff7675', fontSize: '0.85rem', marginTop: 10 }}>
            {error}
          </div>
        )}

        <button type="button" onClick={recuperarPassword} style={{
          marginTop: 16, background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(200,169,74,0.85)', fontSize: '0.82rem', textDecoration: 'underline'
        }}>
          ¿Olvidaste tu contraseña? Recuperar contraseña
        </button>

        {msgRec && (
          <div style={{ color: 'rgba(245,240,232,0.85)', fontSize: '0.8rem', marginTop: 10, background: 'rgba(124,179,66,0.15)', borderRadius: 6, padding: 8 }}>
            {msgRec}
          </div>
        )}
      </div>
    </div>
  )
}

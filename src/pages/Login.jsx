import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getConfig, loadConfig } from '../lib/appConfig'
import { limpiarDev } from '../lib/devMode'

// Íconos SVG (en vez de emoji) — regla "no emoji como ícono"
const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
// Avatar de usuario por defecto (se muestra cuando NO se ha subido un logo en Configuración)
const IconoUsuario = (props) => (
  <svg {...svgProps} {...props}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)
const IconoUsuarioCampo = (props) => (
  <svg {...svgProps} {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
)
const IconoCandado = (props) => (
  <svg {...svgProps} {...props}><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
)
const IconoOjo = (props) => (
  <svg {...svgProps} {...props}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
)
const IconoOjoOff = (props) => (
  <svg {...svgProps} {...props}><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
)

export default function Login() {
  const [login, setLogin]       = useState('')
  const [password, setPassword] = useState('')
  const [verPass, setVerPass]   = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [msgRec, setMsgRec]     = useState('')
  const [recStep, setRecStep]   = useState('')      // '' | 'solicitar' | 'codigo'
  const [recEmail, setRecEmail] = useState('')
  const [recCodigo, setRecCodigo] = useState('')
  const [recP1, setRecP1]       = useState('')
  const [recLoading, setRecLoading] = useState(false)
  const [cfg, setCfg]           = useState(getConfig())
  const { signIn } = useAuth()
  const navigate = useNavigate()

  // Carga la marca personalizable (logo, nombre, eslogan) aunque no haya sesión
  useEffect(() => { loadConfig().then(setCfg).catch(() => {}) }, [])

  // Paso 0: abrir el formulario de recuperación (pide correo de recuperación).
  const abrirRecuperar = () => {
    if (!login.trim()) { setError('Escribe tu usuario y pulsa "Recuperar contraseña"'); return }
    setError(''); setMsgRec(''); setRecStep('solicitar')
  }

  // Paso 1: validar usuario+correo y, si aplica, pedirle a Supabase que envíe el código OTP.
  const enviarCodigo = async () => {
    if (!recEmail.trim()) { setError('Escribe tu correo de recuperación'); return }
    setError(''); setMsgRec(''); setRecLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('password-reset-request', {
        body: { login: login.trim(), email: recEmail.trim() },
      })
      if (error || data?.error) throw new Error(data?.error || 'No se pudo procesar')
      if (data?.modo === 'codigo') {
        const { error: otpErr } = await supabase.auth.signInWithOtp({ email: recEmail.trim() })
        if (otpErr) throw otpErr
        setRecStep('codigo')
        setMsgRec(`Te enviamos un código a ${recEmail.trim()}. Revísalo e ingrésalo abajo.`)
      } else {
        setRecStep(''); setMsgRec('✓ Tu solicitud fue enviada al administrador. Él te asignará una nueva contraseña.')
      }
    } catch {
      setMsgRec('No se pudo enviar la solicitud. Verifica tus datos o contacta al administrador.')
    } finally { setRecLoading(false) }
  }

  // Paso 2: verificar el código (OTP) y cambiar la contraseña vía Edge Function.
  const confirmarRecuperacion = async () => {
    if (recCodigo.trim().length < 6) { setError('Ingresa el código de 6 dígitos'); return }
    if (recP1.length < 8) { setError('La nueva contraseña debe tener al menos 8 caracteres'); return }
    setError(''); setRecLoading(true)
    try {
      const { error: vErr } = await supabase.auth.verifyOtp({ email: recEmail.trim(), token: recCodigo.trim(), type: 'email' })
      if (vErr) throw new Error('Código incorrecto o expirado')
      const { data, error } = await supabase.functions.invoke('password-reset-confirm', {
        body: { login: login.trim(), password: recP1 },
      })
      await supabase.auth.signOut()   // cierra la sesión temporal del correo de recuperación
      if (error || data?.error) throw new Error(data?.error || 'No se pudo restablecer')
      setRecStep(''); setRecCodigo(''); setRecP1(''); setRecEmail('')
      setPassword(recP1); setError('')
      setMsgRec('✓ Contraseña actualizada. Ya puedes iniciar sesión.')
    } catch (e) {
      setError(e.message || 'Código incorrecto o expirado')
    } finally { setRecLoading(false) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!login || !password) { setError('Ingresa usuario y contraseña'); return }
    setLoading(true); setError('')
    try {
      limpiarDev()   // un inicio de sesión normal nunca queda en modo desarrollador
      await signIn(login, password)
      navigate('/dashboard')
    } catch {
      setError('Usuario o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  const empresa = cfg.empresa || 'Mumi Amazonia'
  const eslogan = cfg.eslogan || 'Sistema de Gestión Empresarial'

  return (
    <div id="login-screen" style={{
      position: 'fixed', inset: 0, zIndex: 9999, overflow: 'hidden',
      background: 'radial-gradient(1200px 800px at 15% 10%, #21503a 0%, transparent 55%), radial-gradient(1000px 700px at 90% 90%, #143024 0%, transparent 50%), linear-gradient(135deg, #12281d 0%, #1f4531 50%, #0a1c13 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <style>{`
        @keyframes login-rise { from { opacity: 0; transform: translateY(18px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes login-float { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-16px) rotate(6deg); } }
        @keyframes login-spin { to { transform: rotate(360deg); } }
        #login-screen .login-box { animation: login-rise 520ms cubic-bezier(.16,.84,.44,1) both; }
        #login-screen input:focus-visible,
        #login-screen button:focus-visible { outline: 2px solid var(--dorado, #C8A94A); outline-offset: 2px; }
        #login-screen .login-field { transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease; }
        #login-screen .login-field:focus-within { border-color: rgba(200,169,74,0.85); background: rgba(255,255,255,0.16); box-shadow: 0 0 0 4px rgba(200,169,74,0.10); }
        #login-screen .login-field input::placeholder { color: rgba(245,240,232,0.55); }
        #login-screen .login-submit { transition: filter 160ms ease, transform 120ms ease, box-shadow 160ms ease; }
        #login-screen .login-submit:hover:not(:disabled) { filter: brightness(1.07); transform: translateY(-1px); box-shadow: 0 10px 26px rgba(0,0,0,0.35); }
        #login-screen .login-submit:active:not(:disabled) { transform: translateY(0); }
        #login-screen .login-link:hover { color: var(--dorado, #C8A94A); }
        #login-screen input[type=password]::-ms-reveal { display: none; }
        #login-screen .login-eye:hover { background: rgba(255,255,255,0.12); }
        #login-screen .login-orb { position: absolute; border-radius: 50%; filter: blur(2px); pointer-events: none; }
        #login-screen .login-spinner { width: 18px; height: 18px; border: 2px solid rgba(45,90,61,0.35); border-top-color: var(--selva, #2d5a3d); border-radius: 50%; animation: login-spin 700ms linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          #login-screen .login-box, #login-screen .login-orb, #login-screen .login-spinner { animation: none !important; }
        }
      `}</style>

      {/* Adornos de fondo (decorativos) */}
      <div className="login-orb" style={{ width: 120, height: 120, top: '14%', left: '12%', background: 'radial-gradient(circle, rgba(200,169,74,0.22), transparent 70%)', animation: 'login-float 9s ease-in-out infinite' }} aria-hidden="true" />
      <div className="login-orb" style={{ width: 180, height: 180, bottom: '10%', right: '10%', background: 'radial-gradient(circle, rgba(124,179,66,0.18), transparent 70%)', animation: 'login-float 12s ease-in-out infinite reverse' }} aria-hidden="true" />

      <div className="login-box" style={{
        position: 'relative',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.045))',
        border: '1px solid rgba(200,169,74,0.28)',
        borderRadius: 20, padding: '40px 40px 34px',
        width: 'min(410px, 92vw)', textAlign: 'center',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 30px 70px -20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)'
      }}>
        {/* Logo o avatar de usuario por defecto */}
        {cfg.logo_url
          ? <img src={cfg.logo_url} alt={`Logo de ${empresa}`} style={{ maxWidth: 150, maxHeight: 96, objectFit: 'contain', marginBottom: 18 }} />
          : (
            <div aria-hidden="true" style={{
              width: 82, height: 82, margin: '0 auto 18px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(200,169,74,0.22), rgba(124,179,66,0.14))',
              border: '1px solid rgba(200,169,74,0.45)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 22px rgba(0,0,0,0.3)'
            }}>
              <IconoUsuario style={{ width: 40, height: 40, color: 'var(--dorado, #C8A94A)' }} />
            </div>
          )}

        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '2.1rem', color: 'var(--dorado, #C8A94A)', marginBottom: 4, letterSpacing: 1.5, lineHeight: 1.1 }}>
          {empresa}
        </div>
        <div style={{ color: 'rgba(245,240,232,0.6)', fontSize: '0.78rem', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 30 }}>
          {eslogan}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Usuario */}
          <label htmlFor="login-usuario" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Usuario</label>
          <div className="login-field" style={fieldWrap}>
            <IconoUsuarioCampo style={fieldIcon} aria-hidden="true" />
            <input
              id="login-usuario" type="text" placeholder="Usuario" value={login}
              onChange={e => setLogin(e.target.value)} autoComplete="username"
              aria-label="Usuario" spellCheck={false} autoFocus style={fieldInput}
            />
          </div>

          {/* Contraseña */}
          <label htmlFor="login-password" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Contraseña</label>
          <div className="login-field" style={{ ...fieldWrap, marginBottom: 22 }}>
            <IconoCandado style={fieldIcon} aria-hidden="true" />
            <input
              id="login-password" type={verPass ? 'text' : 'password'} placeholder="Contraseña" value={password}
              onChange={e => setPassword(e.target.value)} autoComplete="current-password"
              aria-label="Contraseña" onKeyDown={e => e.key === 'Enter' && handleSubmit(e)}
              style={{ ...fieldInput, paddingRight: 44 }}
            />
            <button
              type="button" className="login-eye" onClick={() => setVerPass(v => !v)}
              aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={verPass}
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, border: 'none', background: 'transparent',
                color: 'var(--dorado, #C8A94A)', cursor: 'pointer', borderRadius: 8, transition: 'background 150ms ease'
              }}
            >
              {verPass ? <IconoOjoOff style={{ width: 20, height: 20 }} /> : <IconoOjo style={{ width: 20, height: 20 }} />}
            </button>
          </div>

          <button
            type="submit" className="login-submit" disabled={loading}
            style={{
              width: '100%', padding: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: 'linear-gradient(135deg, var(--dorado, #C8A94A), var(--tierra-claro, #a87450))',
              color: 'var(--selva, #2d5a3d)', border: 'none', borderRadius: 12,
              fontFamily: "'Source Sans 3', sans-serif", fontWeight: 700, fontSize: '0.98rem',
              letterSpacing: 1, textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.85 : 1
            }}
          >
            {loading && <span className="login-spinner" aria-hidden="true" />}
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        {error && (
          <div role="alert" style={{ color: '#ffb4ab', fontSize: '0.85rem', marginTop: 12, background: 'rgba(192,57,43,0.16)', border: '1px solid rgba(231,76,60,0.35)', borderRadius: 8, padding: '8px 10px' }}>
            {error}
          </div>
        )}

        <button type="button" onClick={abrirRecuperar} className="login-link" style={{
          marginTop: 16, background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(200,169,74,0.85)', fontSize: '0.82rem', textDecoration: 'underline',
          transition: 'color 150ms ease'
        }}>
          ¿Olvidaste tu contraseña? Recuperar contraseña
        </button>

        <div aria-live="polite">
          {msgRec && (
            <div style={{ color: 'rgba(245,240,232,0.85)', fontSize: '0.8rem', marginTop: 10, background: 'rgba(124,179,66,0.15)', border: '1px solid rgba(124,179,66,0.3)', borderRadius: 8, padding: 8 }}>
              {msgRec}
            </div>
          )}
        </div>

        {recStep === 'solicitar' && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(200,169,74,0.25)', textAlign: 'left' }}>
            <div style={{ color: 'rgba(245,240,232,0.7)', fontSize: '0.78rem', marginBottom: 8 }}>
              Escribe tu correo de recuperación. Te enviaremos un código para restablecer la contraseña.
            </div>
            <div className="login-field" style={fieldWrap}>
              <IconoUsuarioCampo style={fieldIcon} aria-hidden="true" />
              <input type="email" placeholder="Correo de recuperación" value={recEmail}
                onChange={e => setRecEmail(e.target.value)} autoComplete="email"
                aria-label="Correo de recuperación" style={fieldInput} />
            </div>
            <button type="button" onClick={enviarCodigo} disabled={recLoading}
              style={{
                width: '100%', padding: 12, marginTop: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: 'linear-gradient(135deg, var(--dorado, #C8A94A), var(--tierra-claro, #a87450))',
                color: 'var(--selva, #2d5a3d)', border: 'none', borderRadius: 12,
                fontWeight: 700, fontSize: '0.9rem', letterSpacing: 0.5, textTransform: 'uppercase',
                cursor: recLoading ? 'not-allowed' : 'pointer', opacity: recLoading ? 0.85 : 1
              }}>
              {recLoading && <span className="login-spinner" aria-hidden="true" />}
              {recLoading ? 'Enviando…' : 'Enviar código'}
            </button>
            <button type="button" onClick={() => { setRecStep(''); setRecEmail(''); setMsgRec('') }}
              className="login-link" style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,240,232,0.6)', fontSize: '0.78rem' }}>
              Cancelar
            </button>
          </div>
        )}

        {recStep === 'codigo' && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(200,169,74,0.25)', textAlign: 'left' }}>
            <div className="login-field" style={fieldWrap}>
              <IconoCandado style={fieldIcon} aria-hidden="true" />
              <input type="text" inputMode="numeric" maxLength={6} placeholder="Código de 6 dígitos"
                value={recCodigo} onChange={e => setRecCodigo(e.target.value.replace(/\D/g, ''))}
                aria-label="Código de recuperación" style={{ ...fieldInput, letterSpacing: 4 }} />
            </div>
            <div className="login-field" style={fieldWrap}>
              <IconoCandado style={fieldIcon} aria-hidden="true" />
              <input type={verPass ? 'text' : 'password'} placeholder="Nueva contraseña (mín. 8)"
                value={recP1} onChange={e => setRecP1(e.target.value)} autoComplete="new-password"
                aria-label="Nueva contraseña" style={fieldInput} />
            </div>
            <button type="button" onClick={confirmarRecuperacion} disabled={recLoading}
              style={{
                width: '100%', padding: 12, marginTop: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: 'linear-gradient(135deg, var(--dorado, #C8A94A), var(--tierra-claro, #a87450))',
                color: 'var(--selva, #2d5a3d)', border: 'none', borderRadius: 12,
                fontWeight: 700, fontSize: '0.9rem', letterSpacing: 0.5, textTransform: 'uppercase',
                cursor: recLoading ? 'not-allowed' : 'pointer', opacity: recLoading ? 0.85 : 1
              }}>
              {recLoading && <span className="login-spinner" aria-hidden="true" />}
              {recLoading ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
            <button type="button" onClick={() => { setRecStep(''); setRecCodigo(''); setRecP1(''); setMsgRec('') }}
              className="login-link" style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,240,232,0.6)', fontSize: '0.78rem' }}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Estilos compartidos de los campos (icono + input)
const fieldWrap = {
  position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 12,
  background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(200,169,74,0.32)', borderRadius: 12,
}
const fieldIcon = { position: 'absolute', left: 13, width: 19, height: 19, color: 'rgba(200,169,74,0.75)', pointerEvents: 'none' }
const fieldInput = {
  width: '100%', padding: '13px 16px 13px 42px', background: 'transparent', border: 'none', outline: 'none',
  color: '#ffffff', fontFamily: "'Source Sans 3', sans-serif", fontSize: '0.95rem', borderRadius: 12,
}

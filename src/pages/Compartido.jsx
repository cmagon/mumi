import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getConfig, loadConfig } from '../lib/appConfig'

// Fila de documento EDITABLE (solo para el invitado verificado): nombre y descripción
function ItemEditable({ it, onGuardar }) {
  const [nombre, setNombre] = useState(it.nombre || '')
  const [descripcion, setDescripcion] = useState(it.descripcion || '')
  const [guardando, setGuardando] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid #cde0b8', borderRadius: 8, background: 'rgba(124,179,66,0.05)', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '1.2rem' }}>📝</span>
      <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <input className="form-control" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" style={{ fontSize: '0.85rem' }} />
        <input className="form-control" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción" style={{ fontSize: '0.8rem' }} />
      </div>
      <a className="btn btn-sm btn-secondary" href={it.url} target="_blank" rel="noreferrer">⬇</a>
      <button className="btn btn-sm btn-primary" disabled={guardando} onClick={async () => { setGuardando(true); await onGuardar(it, { nombre, descripcion }); setGuardando(false) }}>{guardando ? '…' : '💾'}</button>
    </div>
  )
}

// Vista pública de SOLO LECTURA para quien recibe un enlace compartido de carpeta/documentos.
export default function Compartido() {
  const { token } = useParams()
  const [cfg, setCfg] = useState(getConfig())
  useEffect(() => { loadConfig().then(setCfg).catch(() => {}) }, [])

  const { data: share, isLoading } = useQuery({
    queryKey: ['share', token],
    queryFn: async () => { const { data } = await supabase.from('document_shares').select('*').eq('token', token).maybeSingle(); return data },
  })

  const expirado = share?.expira_at && new Date(share.expira_at) < new Date()
  const items = Array.isArray(share?.items) ? share.items : []
  const grupos = Array.isArray(share?.grupos) ? share.grupos : null
  const [abierta, setAbierta] = useState(null)   // carpeta abierta en la vista pública

  // --- Acceso con edición por código (OTP) para el correo invitado ---
  const [sesionEmail, setSesionEmail] = useState('')
  const [emailOtp, setEmailOtp] = useState('')
  const [codigo, setCodigo] = useState('')
  const [paso, setPaso] = useState('idle')   // 'idle' | 'codigo'
  const [otpMsg, setOtpMsg] = useState('')
  const permiteEdicion = share?.permiso === 'edicion' && !!share?.email_invitado
  const esEditor = permiteEdicion && sesionEmail && sesionEmail.toLowerCase() === String(share.email_invitado).toLowerCase()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesionEmail(data?.session?.user?.email || ''))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesionEmail(s?.user?.email || ''))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (permiteEdicion && !emailOtp) setEmailOtp(share.email_invitado) }, [permiteEdicion, share, emailOtp])

  const enviarCodigo = async () => {
    const email = emailOtp.trim().toLowerCase()
    if (email !== String(share.email_invitado).toLowerCase()) { setOtpMsg('Este enlace de edición es solo para el correo invitado.'); return }
    setOtpMsg('Enviando código…')
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) { setOtpMsg('No se pudo enviar el código: ' + error.message); return }
    setPaso('codigo'); setOtpMsg('Te enviamos un código a tu correo. Ingrésalo aquí.')
  }
  const verificarCodigo = async () => {
    const email = emailOtp.trim().toLowerCase()
    setOtpMsg('Verificando…')
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo.trim(), type: 'email' })
    if (error) { setOtpMsg('Código inválido o vencido: ' + error.message); return }
    setOtpMsg(''); setPaso('idle')
  }
  const salirEdicion = async () => { await supabase.auth.signOut(); setSesionEmail('') }

  // Guardar edición de metadatos de un documento (solo editor verificado)
  const guardarDoc = async (it, campos) => {
    const { error } = await supabase.from('documentos').update(campos).eq('id', it.id)
    if (error) { setOtpMsg('No se pudo guardar: ' + error.message); return false }
    setOtpMsg('Cambios guardados ✓'); setTimeout(() => setOtpMsg(''), 2000); return true
  }

  const box = { minHeight: '100vh', background: 'var(--crema, #f5f0e8)', padding: '24px 16px' }
  const card = { maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }

  return (
    <div style={box}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          {cfg.logo_url ? <img src={cfg.logo_url} alt="logo" style={{ maxWidth: 44, maxHeight: 44, objectFit: 'contain' }} /> : <span style={{ fontSize: '1.8rem' }}>🌿</span>}
          <div>
            <div style={{ fontWeight: 700, color: 'var(--selva, #2d5a3d)' }}>{cfg.empresa || 'Mumi Amazonia'}</div>
            <div style={{ fontSize: '0.78rem', color: '#888' }}>Documentos compartidos · solo lectura</div>
          </div>
        </div>

        {isLoading
          ? <p>Cargando…</p>
          : !share
          ? <p style={{ color: '#c0392b' }}>⛔ Enlace no válido o eliminado.</p>
          : expirado
          ? <p style={{ color: '#c0392b' }}>⏳ Este enlace expiró y ya no está disponible.</p>
          : (
            <>
              <h2 style={{ color: 'var(--selva, #2d5a3d)', fontSize: '1.2rem', marginBottom: 4 }}>📂 {share.titulo || 'Documentos'}</h2>
              <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: 16 }}>
                {share.expira_at && <>Válido hasta {new Date(share.expira_at).toLocaleString('es-CO')}</>}
              </p>

              {/* Acceso de edición por código (OTP) para el correo invitado */}
              {permiteEdicion && (
                esEditor
                  ? <div style={{ background: 'rgba(124,179,66,0.12)', border: '1px solid var(--lima,#7CB342)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      ✏ <strong>Modo edición activo</strong> como {sesionEmail}. Puedes editar nombre y descripción de los documentos.
                      <button className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={salirEdicion}>Salir</button>
                    </div>
                  : <div style={{ background: '#fff8e8', border: '1px solid var(--dorado,#C8A94A)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>✏ Este enlace permite edición para <strong>{share.email_invitado}</strong></div>
                      {paso === 'idle'
                        ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <input type="email" className="form-control" value={emailOtp} onChange={e => setEmailOtp(e.target.value)} placeholder="tu correo" style={{ maxWidth: 240 }} />
                            <button className="btn btn-sm btn-primary" onClick={enviarCodigo}>Solicitar edición</button>
                          </div>
                        : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <input className="form-control" value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Código del correo" style={{ maxWidth: 180 }} />
                            <button className="btn btn-sm btn-primary" onClick={verificarCodigo}>Verificar</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => setPaso('idle')}>↩</button>
                          </div>}
                      {otpMsg && <div style={{ fontSize: '0.78rem', color: '#666', marginTop: 6 }}>{otpMsg}</div>}
                    </div>
              )}
              {otpMsg && esEditor && <div style={{ fontSize: '0.78rem', color: 'var(--selva,#2d5a3d)', marginBottom: 10 }}>{otpMsg}</div>}
              {grupos
                ? (abierta
                  ? (() => {
                      const g = grupos.find(x => x.proceso === abierta) || { items: [] }
                      return (
                        <>
                          <button className="btn btn-sm btn-secondary" onClick={() => setAbierta(null)} style={{ marginBottom: 12 }}>← Carpetas</button>
                          <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>📂 {abierta}</h3>
                          {(g.items || []).length === 0
                            ? <p style={{ color: '#888' }}>Esta carpeta no tiene documentos.</p>
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {g.items.map((it, i) => esEditor && it.id
                                  ? <ItemEditable key={i} it={it} onGuardar={guardarDoc} />
                                  : (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #eee', borderRadius: 8 }}>
                                    <span style={{ fontSize: '1.3rem' }}>📄</span>
                                    <div style={{ flex: 1, minWidth: 0, fontSize: '0.9rem', fontWeight: 600 }}>{it.codigo ? it.codigo + ' — ' : ''}{it.nombre}</div>
                                    <a className="btn btn-sm btn-primary" href={it.url} target="_blank" rel="noreferrer">⬇ Ver / Descargar</a>
                                  </div>
                                ))}
                              </div>}
                        </>
                      )
                    })()
                  : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                      {grupos.map((g, i) => (
                        <div key={i} onClick={() => setAbierta(g.proceso)} style={{ cursor: 'pointer', textAlign: 'center', padding: 16, border: '1px solid #eee', borderRadius: 10 }}>
                          <div style={{ fontSize: '2.4rem', lineHeight: 1 }}>📁</div>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', marginTop: 6 }}>{g.proceso}</div>
                          <div style={{ fontSize: '0.72rem', color: '#888' }}>{(g.items || []).length} doc(s)</div>
                        </div>
                      ))}
                    </div>)
                : items.length === 0
                ? <p style={{ color: '#888' }}>No hay archivos en este enlace.</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((it, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid #eee', borderRadius: 8 }}>
                        <span style={{ fontSize: '1.3rem' }}>📄</span>
                        <div style={{ flex: 1, minWidth: 0, fontSize: '0.9rem', fontWeight: 600 }}>{it.codigo ? it.codigo + ' — ' : ''}{it.nombre}</div>
                        <a className="btn btn-sm btn-primary" href={it.url} target="_blank" rel="noreferrer">⬇ Ver / Descargar</a>
                      </div>
                    ))}
                  </div>}
              <p style={{ fontSize: '0.72rem', color: '#aaa', marginTop: 18 }}>Estos documentos son de solo lectura. No se pueden editar.</p>
            </>
          )}
      </div>
    </div>
  )
}

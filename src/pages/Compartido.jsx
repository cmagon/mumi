import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase, uploadFile } from '../lib/supabase'
import { getConfig, loadConfig } from '../lib/appConfig'

const BUCKET = 'documentos'

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

// Fila de documento en modo EDICIÓN completa (nombre, descripción, reemplazar archivo)
function LiveDocRow({ d, onGuardar, onReemplazar }) {
  const [nombre, setNombre] = useState(d.nombre || '')
  const [descripcion, setDescripcion] = useState(d.descripcion || '')
  const [g, setG] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid #cde0b8', borderRadius: 8, background: 'rgba(124,179,66,0.05)', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '1.2rem' }}>📝</span>
      <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <input className="form-control" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" style={{ fontSize: '0.85rem' }} />
        <input className="form-control" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción" style={{ fontSize: '0.8rem' }} />
      </div>
      {d.storage_url && <a className="btn btn-sm btn-secondary" href={d.storage_url} target="_blank" rel="noreferrer">⬇</a>}
      <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer' }}>📎<input type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) onReemplazar(d, e.target.files[0]) }} /></label>
      <button className="btn btn-sm btn-primary" disabled={g} onClick={async () => { setG(true); await onGuardar(d, { nombre, descripcion }); setG(false) }}>{g ? '…' : '💾'}</button>
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
    queryFn: async () => {
      let { data, error } = await supabase.from('document_shares').select('*').eq('token', token).maybeSingle()
      if (error) {
        // Sesión OTP vencida puede romper la lectura → limpiar y reintentar como anónimo
        await supabase.auth.signOut().catch(() => {})
        const r = await supabase.from('document_shares').select('*').eq('token', token).maybeSingle()
        data = r.data
      }
      return data
    },
    retry: 1,
  })

  const expirado = share?.expira_at && new Date(share.expira_at) < new Date()
  const items = Array.isArray(share?.items) ? share.items : []
  const grupos = Array.isArray(share?.grupos) ? share.grupos : null
  const [abierta, setAbierta] = useState(null)   // carpeta abierta en la vista pública

  // --- Acceso con edición por código (OTP) para el correo invitado ---
  const [sesionEmail, setSesionEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [paso, setPaso] = useState('idle')   // 'idle' | 'codigo'
  const [otpMsg, setOtpMsg] = useState('')
  const [vencido, setVencido] = useState(false)   // el enlace expiró durante la sesión
  const [solicitado, setSolicitado] = useState(false)
  const [nuevaSub, setNuevaSub] = useState('')
  const permiteEdicion = share?.permiso === 'edicion' && !!share?.email_invitado
  const yaExpirado = expirado || vencido
  const esEditor = permiteEdicion && !yaExpirado && sesionEmail && sesionEmail.toLowerCase() === String(share.email_invitado).toLowerCase()

  // Cierra la edición automáticamente cuando el enlace expira (según el tiempo que dio el admin)
  useEffect(() => {
    if (!share?.expira_at) return
    const ms = new Date(share.expira_at).getTime() - Date.now()
    if (ms <= 0) { setVencido(true); return }
    const t = setTimeout(() => setVencido(true), Math.min(ms, 2147483647))
    return () => clearTimeout(t)
  }, [share])
  useEffect(() => { if (vencido && sesionEmail) supabase.auth.signOut().catch(() => {}) }, [vencido, sesionEmail])

  const volverASolicitar = async () => {
    try {
      await supabase.from('share_solicitudes').insert({ token, email: share?.email_invitado || '' })
      setSolicitado(true)
    } catch { setSolicitado(true) }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesionEmail(data?.session?.user?.email || ''))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesionEmail(s?.user?.email || ''))
    return () => sub.subscription.unsubscribe()
  }, [])

  const enviarCodigo = async () => {
    const email = String(share?.email_invitado || '').trim().toLowerCase()
    if (!email) return
    setOtpMsg('Enviando código…')
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) { setOtpMsg('No se pudo enviar el código: ' + error.message); return }
    setPaso('codigo'); setOtpMsg('Te enviamos un código al correo invitado. Ingrésalo aquí.')
  }
  const verificarCodigo = async () => {
    const email = String(share?.email_invitado || '').trim().toLowerCase()
    if (!codigo.trim()) { setOtpMsg('Ingresa el código que llegó al correo.'); return }
    setOtpMsg('Verificando…')
    const { data, error } = await supabase.auth.verifyOtp({ email, token: codigo.trim(), type: 'email' })
    if (error) { setOtpMsg('Código inválido o vencido: ' + error.message); return }
    const correo = data?.session?.user?.email || data?.user?.email || email
    setSesionEmail(correo); setCodigo(''); setPaso('idle'); setOtpMsg('✓ Acceso de edición activado')
  }
  const salirEdicion = async () => { await supabase.auth.signOut(); setSesionEmail('') }

  // Guardar edición de metadatos de un documento (solo editor verificado)
  const guardarDoc = async (it, campos) => {
    const { error } = await supabase.from('documentos').update(campos).eq('id', it.id)
    if (error) { setOtpMsg('No se pudo guardar: ' + error.message); return false }
    setOtpMsg('Cambios guardados ✓'); setTimeout(() => setOtpMsg(''), 2000); return true
  }

  // --- Edición real (como el admin) dentro de la carpeta compartida ---
  const carpetaScope = share?.carpeta || ''
  const [rutaEdit, setRutaEdit] = useState('')
  useEffect(() => { setRutaEdit(carpetaScope) }, [carpetaScope])
  const { data: liveDocs = [], refetch: refetchLive } = useQuery({
    queryKey: ['share_live_docs', token, carpetaScope],
    enabled: esEditor,
    queryFn: async () => {
      let q = supabase.from('documentos').select('*').is('eliminado_at', null)
      if (carpetaScope) q = q.or(`proceso.eq.${carpetaScope},proceso.like.${carpetaScope}/%`)
      const { data } = await q.order('proceso').order('codigo')
      return data || []
    },
  })
  const { data: ordenPaths = [] } = useQuery({
    queryKey: ['share_orden_paths'],
    enabled: esEditor,
    queryFn: async () => { const { data } = await supabase.from('app_settings').select('data').eq('id', 2).maybeSingle(); return Array.isArray(data?.data?.orden) ? data.data.orden : [] },
  })
  // Navegación por carpetas dentro del alcance compartido
  const prefijoEdit = rutaEdit ? rutaEdit + '/' : ''
  const enScope = (p) => !carpetaScope || p === carpetaScope || p.startsWith(carpetaScope + '/')
  const subEdit = (() => {
    const all = [...new Set([...ordenPaths, ...liveDocs.map(d => d.proceso).filter(Boolean)])]
    const segs = []
    all.forEach(p => {
      if (!enScope(p)) return
      if (rutaEdit && !p.startsWith(prefijoEdit)) return
      const resto = rutaEdit ? p.slice(prefijoEdit.length) : p
      const seg = resto.split('/')[0]
      if (seg) { const full = prefijoEdit + seg; if (!segs.includes(full)) segs.push(full) }
    })
    return segs
  })()
  const docsEdit = liveDocs.filter(d => (d.proceso || '') === rutaEdit)
  const segName = (p) => p.split('/').pop()
  // Migas desde la carpeta compartida hasta la ruta actual (no se puede subir más allá del alcance)
  const migas = (() => {
    if (!rutaEdit) return []
    const parts = rutaEdit.split('/')
    const out = []
    for (let i = 0; i < parts.length; i++) {
      const full = parts.slice(0, i + 1).join('/')
      if (carpetaScope && !enScope(full)) continue
      out.push({ nombre: parts[i], full })
    }
    return out
  })()
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoFile, setNuevoFile] = useState(null)
  const [creando, setCreando] = useState(false)

  const crearDocInvitado = async () => {
    if (!nuevoNombre.trim()) { setOtpMsg('Escribe el nombre del documento'); return }
    setCreando(true)
    try {
      let storage_path = null, storage_url = null, archivo_nombre = null
      if (nuevoFile) {
        const ext = nuevoFile.name.split('.').pop()
        storage_path = `docs/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
        storage_url = await uploadFile(BUCKET, storage_path, nuevoFile)
        archivo_nombre = nuevoFile.name
      }
      const { error } = await supabase.from('documentos').insert({
        nombre: nuevoNombre.trim(), proceso: rutaEdit, tipo: 'procedimiento', version: '1', vigente: true,
        storage_path, storage_url, archivo_nombre, creado_por: sesionEmail,
      })
      if (error) throw error
      setNuevoNombre(''); setNuevoFile(null); setOtpMsg('Documento creado ✓'); refetchLive()
    } catch (e) { setOtpMsg('No se pudo crear: ' + e.message) } finally { setCreando(false) }
  }
  const reemplazarArchivo = async (doc, file) => {
    if (!file) return
    try {
      // Historial: archiva la versión anterior para que el admin la pueda recuperar
      if (doc.storage_path) {
        await supabase.from('documento_versiones').insert({
          documento_id: doc.id, version: doc.version, storage_path: doc.storage_path,
          storage_url: doc.storage_url, archivo_nombre: doc.archivo_nombre,
          nota: `Reemplazado por invitado ${sesionEmail}`, creado_por: sesionEmail,
        })
      }
      const ext = file.name.split('.').pop()
      const path = `docs/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
      const url = await uploadFile(BUCKET, path, file)
      const { error } = await supabase.from('documentos').update({ storage_path: path, storage_url: url, archivo_nombre: file.name }).eq('id', doc.id)
      if (error) throw error
      setOtpMsg('Archivo actualizado ✓'); refetchLive()
    } catch (e) { setOtpMsg('No se pudo subir: ' + e.message) }
  }
  // Crear subcarpeta dentro de la carpeta compartida (acotada)
  const crearSubcarpeta = async () => {
    const n = nuevaSub.trim().replace(/\//g, '-'); if (!n) return
    const full = rutaEdit ? `${rutaEdit}/${n}` : n
    try {
      const { data } = await supabase.from('app_settings').select('data').eq('id', 2).maybeSingle()
      const orden = Array.isArray(data?.data?.orden) ? data.data.orden : []
      if (!orden.includes(full)) await supabase.from('app_settings').upsert({ id: 2, data: { orden: [...orden, full] }, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      setNuevaSub(''); setOtpMsg(`Subcarpeta "${n}" creada ✓`)
    } catch (e) { setOtpMsg('No se pudo crear la subcarpeta: ' + e.message) }
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
          : yaExpirado
          ? <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div style={{ fontSize: '2rem' }}>⏳</div>
              <p style={{ color: '#c0392b', fontWeight: 600 }}>La sesión ha expirado.</p>
              <p style={{ color: '#888', fontSize: '0.85rem' }}>El tiempo de acceso que asignó el administrador finalizó.</p>
              {solicitado
                ? <p style={{ color: 'var(--selva,#2d5a3d)', fontSize: '0.85rem' }}>✓ Solicitud enviada. El administrador podrá ampliarte el acceso con este mismo enlace.</p>
                : <button className="btn btn-primary" onClick={volverASolicitar}>🔄 Volver a solicitar acceso</button>}
            </div>
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
                      ✏ <strong>Modo edición activo</strong> como {sesionEmail}. Puedes crear documentos, subir/reemplazar archivos y editar los existentes.
                      <button className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={salirEdicion}>Salir</button>
                    </div>
                  : <div style={{ background: '#fff8e8', border: '1px solid var(--dorado,#C8A94A)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.9rem' }}>✏ Este enlace permite edición para <strong>{share.email_invitado}</strong></div>
                      {paso === 'idle'
                        ? <div>
                            <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 8px' }}>Para editar, solicita un código que llegará al correo invitado.</p>
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
              {esEditor
                ? (
                  <div>
                    {/* Migas de navegación dentro del alcance compartido */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      <button className="btn btn-xs btn-secondary" onClick={() => setRutaEdit(carpetaScope)}>🏠 {carpetaScope ? segName(carpetaScope) : 'Inicio'}</button>
                      {migas.filter(m => m.full !== carpetaScope).map(m => (
                        <span key={m.full} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#aaa' }}>/</span>
                          <button className="btn btn-xs btn-secondary" onClick={() => setRutaEdit(m.full)}>{m.nombre}</button>
                        </span>
                      ))}
                    </div>
                    {/* Subcarpetas navegables */}
                    {subEdit.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                        {subEdit.map(full => (
                          <div key={full} onClick={() => setRutaEdit(full)} style={{ cursor: 'pointer', textAlign: 'center', padding: 12, border: '1px solid #cde0b8', borderRadius: 10, background: 'rgba(124,179,66,0.05)' }}>
                            <div style={{ fontSize: '2rem' }}>📁</div>
                            <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{segName(full)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ border: '1px dashed #cde0b8', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>+ Nuevo documento en {rutaEdit ? segName(rutaEdit) : 'la raíz'}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input className="form-control" placeholder="Nombre del documento" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} style={{ maxWidth: 240 }} />
                        <input type="file" onChange={e => setNuevoFile(e.target.files[0] || null)} />
                        <button className="btn btn-sm btn-primary" disabled={creando} onClick={crearDocInvitado}>{creando ? 'Subiendo…' : 'Crear'}</button>
                      </div>
                    </div>
                    <div style={{ border: '1px dashed #cde0b8', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>📁 Nueva subcarpeta (dentro de {carpetaScope || 'la raíz'})</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input className="form-control" placeholder="Nombre de la subcarpeta" value={nuevaSub} onChange={e => setNuevaSub(e.target.value)} style={{ maxWidth: 240 }} />
                        <button className="btn btn-sm btn-secondary" onClick={crearSubcarpeta}>Crear subcarpeta</button>
                      </div>
                    </div>
                    {docsEdit.length === 0
                      ? <p style={{ color: '#888' }}>Sin documentos en esta carpeta. {subEdit.length > 0 ? 'Entra a una subcarpeta o crea uno aquí.' : 'Crea el primero arriba.'}</p>
                      : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {docsEdit.map(d => <LiveDocRow key={d.id} d={d} onGuardar={guardarDoc} onReemplazar={reemplazarArchivo} />)}
                        </div>}
                  </div>
                )
                : grupos
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

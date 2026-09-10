import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Send, LogOut, User, Package, MapPin, FileText, Trash2, ChevronRight, ArrowLeft } from 'lucide-react'
import { useStore } from './store'
import { fCOP, emailValido, telefonoValido } from './utils'
import { solicitarCodigo, verificarCodigo, guardarPerfil, misPedidos, eliminarCuenta } from './auth'
import COLOMBIA from './data/colombia.json'

const DEPARTAMENTOS = COLOMBIA.map(d => d.departamento)
const ciudadesDe = (dep) => (COLOMBIA.find(d => d.departamento === dep)?.ciudades) || []

// ---------- /ingresar ----------
export function IngresarPage() {
  const { usuario } = useStore()
  const nav = useNavigate()
  const [paso, setPaso] = useState('correo')   // 'correo' | 'codigo'
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { if (usuario) nav('/cuenta', { replace: true }) }, [usuario, nav])

  const pedir = async (e) => {
    e.preventDefault(); setErr(''); setCargando(true)
    try { await solicitarCodigo(email); setPaso('codigo') }
    catch (ex) { setErr(ex.message) }
    finally { setCargando(false) }
  }
  const verificar = async (e) => {
    e.preventDefault(); setErr(''); setCargando(true)
    try { await verificarCodigo(email, codigo); nav('/cuenta', { replace: true }) }
    catch (ex) { setErr(ex.message) }
    finally { setCargando(false) }
  }

  return (
    <div className="page" style={{ padding: '0 0 40px', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ padding: '16px' }}>
        <h1 className="serif" style={{ fontSize: '1.7rem', color: 'var(--selva)' }}>Mi cuenta</h1>
        <p style={{ color: 'var(--texto-suave)', margin: '6px 0 18px' }}>
          Ingresa con tu correo. Te enviaremos un código de 6 dígitos, sin contraseñas.
        </p>
        {paso === 'correo'
          ? <form onSubmit={pedir} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="cf" type="email" placeholder="tu@correo.com" value={email} autoFocus
                onChange={e => { setEmail(e.target.value); setErr('') }} required />
              <button className="btn btn-selva" type="submit" disabled={cargando || !emailValido(email)}
                style={(cargando || !emailValido(email)) ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
                <Send size={17} /> {cargando ? 'Enviando…' : 'Enviarme el código'}
              </button>
            </form>
          : <form onSubmit={verificar} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)', margin: 0 }}>
                Revisa <strong>{email}</strong> y escribe el código (o abre el enlace del correo).
              </p>
              <input className="cf" inputMode="numeric" maxLength={6} placeholder="000000" value={codigo} autoFocus
                onChange={e => { setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr('') }}
                style={{ letterSpacing: 6, fontSize: '1.2rem', textAlign: 'center' }} />
              <button className="btn btn-selva" type="submit" disabled={cargando || codigo.length !== 6}
                style={(cargando || codigo.length !== 6) ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
                {cargando ? 'Verificando…' : 'Entrar'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setPaso('correo'); setCodigo(''); setErr('') }}>
                Cambiar correo o reenviar
              </button>
            </form>}
        {err && <div className="news-err" style={{ color: 'var(--rojo)', marginTop: 12 }}>{err}</div>}
      </div>
      <div className="footer-space" />
    </div>
  )
}

// ---------- guardia: exige sesión ----------
function ConSesion({ children }) {
  const { usuario, sesionLista } = useStore()
  const nav = useNavigate()
  if (!sesionLista) {
    return <div className="page" style={{ padding: 40, textAlign: 'center', color: 'var(--texto-suave)' }}>Cargando…</div>
  }
  if (!usuario) {
    return (
      <div className="page" style={{ padding: 24, maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: 'var(--texto-suave)' }}>Inicia sesión para ver esta página.</p>
        <button className="btn btn-selva" onClick={() => nav('/ingresar')}>Ingresar</button>
      </div>
    )
  }
  return children
}

// ---------- /cuenta ----------
const VACIO = {
  nombre_completo: '', telefono: '', departamento: '', ciudad: '', barrio: '', direccion: '',
  referencia: '', factura_electronica: false, doc_tipo: 'CC', doc_numero: '', email_factura: '',
}

export function CuentaPage() {
  return <ConSesion><CuentaInner /></ConSesion>
}

function CuentaInner() {
  const { usuario, perfil, recargarPerfil, salir } = useStore()
  const nav = useNavigate()
  const [f, setF] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [borrando, setBorrando] = useState(false)

  useEffect(() => {
    if (perfil) setF({ ...VACIO, ...Object.fromEntries(Object.keys(VACIO).map(k => [k, perfil[k] ?? VACIO[k]])) })
  }, [perfil])

  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setMsg(''); setErr('') }
  const ciudades = useMemo(() => ciudadesDe(f.departamento), [f.departamento])

  const faltan = []
  if (!f.nombre_completo.trim()) faltan.push('nombre completo')
  if (!telefonoValido(f.telefono)) faltan.push('teléfono válido')
  if (!f.departamento) faltan.push('departamento')
  if (!f.ciudad) faltan.push('ciudad')
  if (!f.direccion.trim()) faltan.push('dirección')
  if (f.factura_electronica) {
    if (!f.doc_numero.trim()) faltan.push('número de documento')
    if (!emailValido(f.email_factura)) faltan.push('correo de facturación')
  }

  const guardar = async (e) => {
    e.preventDefault(); setErr(''); setMsg('')
    if (faltan.length) { setErr('Completa: ' + faltan.join(', ') + '.'); return }
    setGuardando(true)
    try {
      await guardarPerfil(usuario, {
        ...f,
        doc_tipo: f.factura_electronica ? f.doc_tipo : null,
        doc_numero: f.factura_electronica ? f.doc_numero.trim() : null,
        email_factura: f.factura_electronica ? f.email_factura.trim().toLowerCase() : null,
      })
      await recargarPerfil()
      setMsg('Datos guardados. 💚')
    } catch (ex) { setErr(ex.message) }
    finally { setGuardando(false) }
  }

  const borrar = async () => {
    if (!window.confirm('¿Eliminar tu cuenta? Se borrarán tus datos y favoritos. Esta acción no se puede deshacer.')) return
    setBorrando(true); setErr('')
    try { await eliminarCuenta(); nav('/', { replace: true }) }
    catch (ex) { setErr('No se pudo eliminar: ' + ex.message); setBorrando(false) }
  }

  const lbl = { fontSize: '0.8rem', fontWeight: 700, color: 'var(--selva)', marginTop: 4 }
  return (
    <div className="page" style={{ padding: '0 0 40px', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h1 className="serif" style={{ fontSize: '1.6rem', color: 'var(--selva)', margin: 0 }}><User size={22} style={{ verticalAlign: '-4px' }} /> Mi cuenta</h1>
          <button className="btn btn-ghost btn-sm" onClick={salir}><LogOut size={15} /> Salir</button>
        </div>
        <p style={{ color: 'var(--texto-suave)', margin: '4px 0 14px', fontSize: '0.9rem' }}>{usuario?.email}</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <Link to="/cuenta/pedidos" className="btn btn-selva btn-sm"><Package size={15} /> Mis pedidos</Link>
          <Link to="/favoritos" className="btn btn-ghost btn-sm">Favoritos</Link>
        </div>

        <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 700, color: 'var(--tierra)', display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={16} /> Datos de envío</div>
          <label style={lbl}>Nombre completo *</label>
          <input className="cf" value={f.nombre_completo} onChange={e => set('nombre_completo', e.target.value)} placeholder="Nombre y apellidos" />
          <label style={lbl}>Teléfono / WhatsApp *</label>
          <input className="cf" type="tel" inputMode="tel" value={f.telefono} onChange={e => set('telefono', e.target.value)} placeholder="Ej: 300 123 4567" />
          <label style={lbl}>Departamento *</label>
          <select className="cf" value={f.departamento} onChange={e => { set('departamento', e.target.value); set('ciudad', '') }}>
            <option value="">Selecciona…</option>
            {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <label style={lbl}>Ciudad / Municipio *</label>
          <select className="cf" value={f.ciudad} onChange={e => set('ciudad', e.target.value)} disabled={!f.departamento}>
            <option value="">{f.departamento ? 'Selecciona…' : 'Elige un departamento primero'}</option>
            {ciudades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={lbl}>Dirección *</label>
          <input className="cf" value={f.direccion} onChange={e => set('direccion', e.target.value)} placeholder="Calle 00 # 00-00" />
          <label style={lbl}>Barrio</label>
          <input className="cf" value={f.barrio} onChange={e => set('barrio', e.target.value)} placeholder="Opcional" />
          <label style={lbl}>Otra referencia</label>
          <input className="cf" value={f.referencia} onChange={e => set('referencia', e.target.value)} placeholder="Punto de referencia, indicaciones… (opcional)" />

          <div style={{ fontWeight: 700, color: 'var(--tierra)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}><FileText size={16} /> Facturación</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={f.factura_electronica} onChange={e => set('factura_electronica', e.target.checked)} />
            Quiero factura electrónica
          </label>
          {f.factura_electronica && (
            <>
              <label style={lbl}>Tipo de documento *</label>
              <select className="cf" value={f.doc_tipo} onChange={e => set('doc_tipo', e.target.value)}>
                <option value="CC">Cédula (CC)</option>
                <option value="NIT">NIT</option>
              </select>
              <label style={lbl}>Número de documento *</label>
              <input className="cf" value={f.doc_numero} onChange={e => set('doc_numero', e.target.value)} placeholder={f.doc_tipo === 'NIT' ? 'NIT' : 'Número de cédula'} />
              <label style={lbl}>Correo de facturación *</label>
              <input className="cf" type="email" value={f.email_factura} onChange={e => set('email_factura', e.target.value)} placeholder="factura@correo.com" />
            </>
          )}

          <button className="btn btn-selva" type="submit" disabled={guardando} style={{ marginTop: 12 }}>
            <Send size={16} /> {guardando ? 'Guardando…' : 'Guardar datos'}
          </button>
          {msg && <div className="news-ok" style={{ color: 'var(--selva)', background: 'rgba(124,179,66,0.15)' }}>{msg}</div>}
          {err && <div className="news-err" style={{ color: 'var(--rojo)' }}>{err}</div>}
        </form>

        <hr style={{ margin: '22px 0', border: 0, borderTop: '1px solid var(--crema-oscuro, #e5ddcf)' }} />
        <button className="btn btn-ghost btn-sm" onClick={borrar} disabled={borrando} style={{ color: 'var(--rojo, #c0392b)' }}>
          <Trash2 size={15} /> {borrando ? 'Eliminando…' : 'Eliminar mi cuenta'}
        </button>
      </div>
      <div className="footer-space" />
    </div>
  )
}

// ---------- /cuenta/pedidos ----------
const ESTADO_LBL = {
  pendiente: 'En preparación', despachado: 'Despachado', entregado: 'Entregado', cancelado: 'Cancelado',
}

export function MisPedidosPage() {
  return <ConSesion><MisPedidosInner /></ConSesion>
}

function MisPedidosInner() {
  const [pedidos, setPedidos] = useState(null)
  useEffect(() => { let vivo = true; misPedidos().then(p => { if (vivo) setPedidos(p) }); return () => { vivo = false } }, [])

  const fecha = (iso) => { try { return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) } catch { return '' } }

  return (
    <div className="page" style={{ padding: '0 0 40px', maxWidth: 620, margin: '0 auto' }}>
      <div style={{ padding: '16px' }}>
        <Link to="/cuenta" className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }}><ArrowLeft size={15} /> Mi cuenta</Link>
        <h1 className="serif" style={{ fontSize: '1.6rem', color: 'var(--selva)' }}><Package size={20} style={{ verticalAlign: '-3px' }} /> Mis pedidos</h1>
        {pedidos === null ? <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>
          : pedidos.length === 0 ? <p style={{ color: 'var(--texto-suave)' }}>Aún no tienes pedidos registrados.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {pedidos.map(p => {
                const items = Array.isArray(p.productos) ? p.productos : []
                const est = p.estado_envio || 'pendiente'
                return (
                  <div key={p.id} style={{ border: '1px solid var(--crema-oscuro, #e5ddcf)', borderRadius: 10, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <strong style={{ color: 'var(--selva)' }}>Pedido #{p.codigo}</strong>
                      <span className="chip-estado" style={{ fontSize: '0.75rem', background: 'var(--crema, #f5f0e8)', padding: '2px 8px', borderRadius: 20 }}>{ESTADO_LBL[est] || est}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', margin: '2px 0 8px' }}>{fecha(p.created_at)}</div>
                    <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: '0.86rem' }}>
                      {items.map((i, k) => <li key={k}>{i.cantidad || 1}× {i.nombre}</li>)}
                    </ul>
                    {p.guia && <div style={{ fontSize: '0.8rem', color: 'var(--texto-suave)' }}>Guía: <strong>{p.guia}</strong>{p.transportadora ? ` · ${p.transportadora}` : ''}</div>}
                    <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--tierra)' }}>{fCOP(p.total)}</div>
                  </div>
                )
              })}
            </div>}
      </div>
      <div className="footer-space" />
    </div>
  )
}

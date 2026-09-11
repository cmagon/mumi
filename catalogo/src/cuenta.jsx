import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Send, LogOut, User, Package, MapPin, FileText, Trash2, ChevronRight, ArrowLeft, X } from 'lucide-react'
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

// Modal con el formulario de datos de envío + facturación y su botón Guardar.
function ModalDatosEnvio({ usuario, perfil, onClose, onSaved }) {
  const [f, setF] = useState({ ...VACIO, ...(perfil ? Object.fromEntries(Object.keys(VACIO).map(k => [k, perfil[k] ?? VACIO[k]])) : {}) })
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const [intentado, setIntentado] = useState(false)   // ¿ya intentó guardar? → resalta faltantes
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setErr('') }
  const ciudades = useMemo(() => ciudadesDe(f.departamento), [f.departamento])

  // Invalidez por campo (para resaltar en rojo).
  const inv = {
    nombre_completo: !f.nombre_completo.trim(),
    telefono: !telefonoValido(f.telefono),
    departamento: !f.departamento,
    ciudad: !f.ciudad,
    direccion: !f.direccion.trim(),
    doc_numero: f.factura_electronica && !f.doc_numero.trim(),
    email_factura: f.factura_electronica && !emailValido(f.email_factura),
  }
  const hayFaltantes = Object.values(inv).some(Boolean)

  const guardar = async (e) => {
    e.preventDefault()
    setErr(''); setIntentado(true)
    if (hayFaltantes) { setErr('Faltan campos obligatorios (resaltados en rojo).'); return }
    setGuardando(true)
    try {
      await guardarPerfil(usuario, {
        ...f,
        doc_tipo: f.factura_electronica ? f.doc_tipo : null,
        doc_numero: f.factura_electronica ? f.doc_numero.trim() : null,
        email_factura: f.factura_electronica ? f.email_factura.trim().toLowerCase() : null,
      })
      await onSaved()
      onClose()
    } catch (ex) {
      const m = (ex?.message || '').toLowerCase()
      if (m.includes('jwt') || m.includes('sesi') || m.includes('token') || m.includes('401') || m.includes('row-level') || m.includes('permission')) {
        setErr('No se pudo guardar: tu sesión pudo expirar. Cierra sesión e ingresa de nuevo.')
      } else {
        setErr('No se pudo guardar: ' + (ex?.message || 'inténtalo de nuevo.'))
      }
    }
    finally { setGuardando(false) }
  }

  const lbl = { fontSize: '0.8rem', fontWeight: 700, color: 'var(--selva)', marginTop: 4 }
  // Borde rojo + fondo tenue cuando el campo es obligatorio y está vacío (tras intentar guardar).
  const bord = (bad) => (intentado && bad) ? { borderColor: 'var(--rojo, #c0392b)', boxShadow: '0 0 0 2px rgba(192,57,43,0.15)' } : undefined
  return (
    <div className="overlay" style={{ alignItems: 'center' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="popup" style={{ textAlign: 'left', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="popup-x" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        <h2 className="serif" style={{ color: 'var(--selva)', fontSize: '1.2rem', marginBottom: 10 }}>Datos de envío y facturación</h2>
        {intentado && hayFaltantes && (
          <div className="news-err" style={{ color: 'var(--rojo)', background: 'rgba(192,57,43,0.10)', border: '1px solid var(--rojo, #c0392b)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: '0.85rem' }}>
            Completa los campos obligatorios resaltados en rojo.
          </div>
        )}
        <form onSubmit={guardar} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 700, color: 'var(--tierra)', display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={16} /> Datos de envío</div>
          <label style={lbl}>Nombre completo *</label>
          <input className="cf" style={bord(inv.nombre_completo)} value={f.nombre_completo} onChange={e => set('nombre_completo', e.target.value)} placeholder="Nombre y apellidos" />
          <label style={lbl}>Teléfono / WhatsApp *</label>
          <input className="cf" style={bord(inv.telefono)} type="tel" inputMode="tel" value={f.telefono} onChange={e => set('telefono', e.target.value)} placeholder="Ej: 300 123 4567" />
          <label style={lbl}>Departamento *</label>
          <select className="cf" style={bord(inv.departamento)} value={f.departamento} onChange={e => { set('departamento', e.target.value); set('ciudad', '') }}>
            <option value="">Selecciona…</option>
            {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <label style={lbl}>Ciudad / Municipio *</label>
          <select className="cf" style={bord(inv.ciudad)} value={f.ciudad} onChange={e => set('ciudad', e.target.value)} disabled={!f.departamento}>
            <option value="">{f.departamento ? 'Selecciona…' : 'Elige un departamento primero'}</option>
            {ciudades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={lbl}>Dirección *</label>
          <input className="cf" style={bord(inv.direccion)} value={f.direccion} onChange={e => set('direccion', e.target.value)} placeholder="Calle 00 # 00-00" />
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
              <input className="cf" style={bord(inv.doc_numero)} value={f.doc_numero} onChange={e => set('doc_numero', e.target.value)} placeholder={f.doc_tipo === 'NIT' ? 'NIT' : 'Número de cédula'} />
              <label style={lbl}>Correo de facturación *</label>
              <input className="cf" style={bord(inv.email_factura)} type="email" value={f.email_factura} onChange={e => set('email_factura', e.target.value)} placeholder="factura@correo.com" />
            </>
          )}
          <button className="btn btn-selva" type="submit" disabled={guardando} style={{ marginTop: 12 }}>
            <Send size={16} /> {guardando ? 'Guardando…' : 'Guardar datos'}
          </button>
          {err && <div className="news-err" style={{ color: 'var(--rojo)' }}>{err}</div>}
        </form>
      </div>
    </div>
  )
}

function CuentaInner() {
  const { usuario, perfil, recargarPerfil, salir } = useStore()
  const nav = useNavigate()
  const [modal, setModal] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [err, setErr] = useState('')

  const borrar = async () => {
    if (!window.confirm('¿Eliminar tu cuenta? Se borrarán tus datos y favoritos. Esta acción no se puede deshacer.')) return
    setBorrando(true); setErr('')
    try { await eliminarCuenta(); nav('/', { replace: true }) }
    catch (ex) { setErr('No se pudo eliminar: ' + ex.message); setBorrando(false) }
  }

  const tieneDatos = !!(perfil && (perfil.nombre_completo || perfil.direccion))
  const fila = (etq, val) => val ? <div style={{ display: 'flex', gap: 8, fontSize: '0.88rem', padding: '2px 0' }}><span style={{ color: 'var(--texto-suave)', minWidth: 110 }}>{etq}</span><span>{val}</span></div> : null

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

        <div style={{ border: '1px solid var(--crema-oscuro, #e5ddcf)', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <strong style={{ color: 'var(--tierra)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><MapPin size={16} /> Datos de envío</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setModal(true)}>{tieneDatos ? 'Editar' : 'Agregar datos'}</button>
          </div>
          {tieneDatos ? (
            <div>
              {fila('Nombre', perfil.nombre_completo)}
              {fila('Teléfono', perfil.telefono)}
              {fila('Ciudad', [perfil.ciudad, perfil.departamento].filter(Boolean).join(', '))}
              {fila('Dirección', perfil.direccion)}
              {fila('Barrio', perfil.barrio)}
              {fila('Referencia', perfil.referencia)}
              {fila('Factura electrónica', perfil.factura_electronica ? `Sí — ${perfil.doc_tipo || 'CC'} ${perfil.doc_numero || ''}${perfil.email_factura ? ` · ${perfil.email_factura}` : ''}` : 'No')}
            </div>
          ) : (
            <p style={{ color: 'var(--texto-suave)', fontSize: '0.88rem', margin: 0 }}>Aún no has guardado tus datos de envío. Agrégalos para agilizar tus pedidos.</p>
          )}
        </div>

        <hr style={{ margin: '22px 0', border: 0, borderTop: '1px solid var(--crema-oscuro, #e5ddcf)' }} />
        <button className="btn btn-ghost btn-sm" onClick={borrar} disabled={borrando} style={{ color: 'var(--rojo, #c0392b)' }}>
          <Trash2 size={15} /> {borrando ? 'Eliminando…' : 'Eliminar mi cuenta'}
        </button>
        {err && <div className="news-err" style={{ color: 'var(--rojo)', marginTop: 8 }}>{err}</div>}
      </div>

      {modal && <ModalDatosEnvio usuario={usuario} perfil={perfil} onClose={() => setModal(false)} onSaved={recargarPerfil} />}
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

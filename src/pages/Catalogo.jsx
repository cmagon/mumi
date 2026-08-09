import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { NavLink, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { pathImgProducto, conAltProducto } from '../lib/imgNombre'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../context/AuthContext'
import { puedeVerSeccion } from '../lib/permisos'
import { fNum } from '../lib/businessLogic'
import { Store, Eye, EyeOff, Star, Save, Settings, BarChart3, ExternalLink, Pencil, X, Plus, Upload, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Palette, Image as ImageIcon, Layout, Users, RefreshCw, Monitor, Tablet, Smartphone, Mail } from 'lucide-react'
import { Truck, ShieldCheck, MessageCircle, Package, CreditCard, Heart, Clock, Gift, Award, Sprout, BadgeCheck, Sparkles, MapPin, Phone, Percent, ThumbsUp, Recycle, HandCoins, Leaf } from 'lucide-react'
import { Banknote, Wallet, QrCode, Landmark, Coins, Receipt, PiggyBank, BadgeDollarSign, Megaphone } from 'lucide-react'

// Iconos disponibles para la barra de beneficios (deben coincidir con catalogo/src/BenefitIcon.jsx)
const BENEFIT_ICONS = [
  { n: 'Truck', l: 'Camión / envío' }, { n: 'Package', l: 'Paquete' }, { n: 'ShieldCheck', l: 'Escudo / seguro' },
  { n: 'BadgeCheck', l: 'Verificado' }, { n: 'Leaf', l: 'Hoja / natural' }, { n: 'Sprout', l: 'Brote' },
  { n: 'Recycle', l: 'Reciclable' }, { n: 'MessageCircle', l: 'WhatsApp / mensaje' }, { n: 'Phone', l: 'Teléfono' },
  { n: 'CreditCard', l: 'Pago / tarjeta' }, { n: 'HandCoins', l: 'Precio / dinero' }, { n: 'Percent', l: 'Descuento' },
  { n: 'Heart', l: 'Corazón' }, { n: 'Star', l: 'Estrella' }, { n: 'Award', l: 'Premio' },
  { n: 'ThumbsUp', l: 'Me gusta' }, { n: 'Gift', l: 'Regalo' }, { n: 'Sparkles', l: 'Destello' },
  { n: 'Clock', l: 'Reloj / rapidez' }, { n: 'MapPin', l: 'Ubicación' },
]
const BENEFIT_MAP = { Truck, Leaf, ShieldCheck, MessageCircle, Package, CreditCard, Heart, Star, Clock, Gift, Award, Sprout, BadgeCheck, Sparkles, MapPin, Phone, Percent, ThumbsUp, Recycle, HandCoins }
const BIcon = ({ name, size = 16 }) => { const C = name && BENEFIT_MAP[name]; return C ? <C size={size} /> : <span style={{ fontWeight: 800 }}>•</span> }
import Modal from '../components/ui/Modal'
import ImageCropper from '../components/ui/ImageCropper'
import RichEditor from '../components/ui/RichEditor'
import FrutoIcon, { ICONOS_FRUTO } from '../components/ui/FrutoIcon'
import MoneyInput from '../components/ui/MoneyInput'
import { getConfig } from '../lib/appConfig'
import Select from '../components/ui/Select'
import { useUnsavedGuard, snapConfig } from '../hooks/useUnsavedGuard'
import { useConfirm } from '../context/ConfirmContext'
import { TabClientes, TabMetricasCrm } from './catalogoCrm'

// Fuentes de Google disponibles para el catálogo (títulos, subtítulos, párrafos)
const FUENTES = [
  'Playfair Display', 'Libre Caslon Text', 'Cormorant Garamond', 'DM Serif Display', 'Lora', 'Merriweather', 'Libre Baskerville',
  'Source Sans 3', 'Poppins', 'Montserrat', 'Nunito', 'Raleway', 'Work Sans', 'Quicksand',
  'Josefin Sans', 'Roboto', 'Open Sans', 'Inter', 'DM Sans', 'Rubik', 'Mulish',
]

// Tamaños de imagen de producto (web + móvil) — hero Atelier ~780px móvil
const IMG_PROD_WEB = { key: 'web', w: 1200, h: 1200 }
const IMG_PROD_MOBILE = { key: 'mobile', w: 780, h: 780 }
const normalizeImgAdmin = (x) => {
  if (!x) return null
  if (typeof x === 'string') return { url: x, url_mobile: x, alt: '' }
  const url = x.url || ''
  if (!url) return null
  return { url, url_mobile: x.url_mobile || url, alt: (x.alt || '').trim() }
}
const thumbUrl = (x) => normalizeImgAdmin(x)?.url_mobile || normalizeImgAdmin(x)?.url || ''

const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />
const fCOP = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')

/** Solo dígitos → evita Number("30.000")===30 y cruces raros de montos. */
const montoCOP = (v) => {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
  const digits = String(v).replace(/[^\d]/g, '')
  if (!digits) return 0
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : 0
}

function previewBarraProgreso(meta, total, labels) {
  const m = montoCOP(meta)
  if (!(m > 0)) return null
  const t = montoCOP(total)
  const falta = Math.max(0, m - t)
  const ok = falta <= 0
  return { meta: m, total: t, falta, pct: Math.min(100, Math.round((t / m) * 100)), ok, label: ok ? labels.ok : labels.falta(fCOP(falta)) }
}

function previewBarraPedido(cfg, total = 0, mayorista = false) {
  if (!cfg?.envio_umbral_activo) return null
  const meta = mayorista ? cfg.mayorista_pedido_minimo : cfg.pedido_minimo
  const mayo = mayorista ? ' mayorista' : ''
  return previewBarraProgreso(meta, total, {
    falta: (f) => `Te faltan ${f} para el pedido mínimo sugerido${mayo}`,
    ok: `¡Llegaste al pedido mínimo sugerido${mayo}!`,
  })
}

function previewBarraGratis(cfg, total = 0, mayorista = false) {
  if (!cfg?.envio_gratis_barra_activo) return null
  const meta = mayorista ? cfg.envio_gratis_mayorista : cfg.envio_gratis_desde
  return previewBarraProgreso(meta, total, {
    falta: (f) => `Te faltan ${f} para envío gratis nacional`,
    ok: '¡Envío gratis nacional en tu pedido!',
  })
}

function PrevBarraMini({ estado, titulo, tono, formula }) {
  if (!estado) return null
  return (
    <div style={{
      background: tono === 'gratis' ? 'color-mix(in srgb, var(--dorado) 12%, #fff)' : 'color-mix(in srgb, var(--selva) 8%, #fff)',
      border: `1px solid ${tono === 'gratis' ? 'color-mix(in srgb, var(--dorado) 35%, transparent)' : 'color-mix(in srgb, var(--selva) 18%, transparent)'}`,
      borderRadius: 12, padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--texto-suave)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{titulo}</div>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--selva)', marginBottom: 4 }}>{estado.label}</div>
      {formula && <div style={{ fontSize: '0.68rem', color: 'var(--texto-suave)', marginBottom: 6, fontFamily: 'ui-monospace, monospace' }}>{formula}</div>}
      <div style={{ height: 6, borderRadius: 999, background: 'color-mix(in srgb, var(--selva) 14%, #fff)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${estado.pct}%`, borderRadius: 999, background: estado.ok ? 'var(--selva)' : 'var(--dorado)', transition: 'width .2s ease' }} />
      </div>
    </div>
  )
}

/** Maqueta: las barras solo aparecen dentro del carrito. */
function PrevUbicacionBarras({ barras }) {
  const hay = barras.filter(Boolean)
  if (!hay.length) return null
  const Mini = ({ estado, tono }) => !estado ? null : (
    <div style={{
      background: tono === 'gratis' ? 'rgba(200,169,74,0.2)' : 'rgba(26,58,42,0.08)',
      borderRadius: 8, padding: '6px 8px', marginBottom: 4, border: '1px solid rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--selva)', lineHeight: 1.25 }}>{estado.label}</div>
      <div style={{ height: 4, borderRadius: 99, background: 'rgba(0,0,0,0.08)', marginTop: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${estado.pct}%`, background: estado.ok ? 'var(--selva)' : 'var(--dorado)' }} />
      </div>
    </div>
  )
  return (
    <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--selva)' }}>Dónde las ve el cliente</div>
      <div style={{ border: '1px dashed var(--crema-oscuro)', borderRadius: 12, padding: 10, background: '#fff' }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--texto-suave)', marginBottom: 6 }}>Solo dentro de «Tu pedido»</div>
        <div style={{ fontSize: '0.65rem', color: 'var(--texto-suave)', marginBottom: 8 }}>
          Debajo del total, antes de WhatsApp. Debajo hay «Seguir comprando» para cerrar y seguir viendo productos. La barra flotante «Ver pedido» ya no muestra umbrales.
        </div>
        <div style={{ background: 'var(--crema, #F5F0E8)', borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--selva)', marginBottom: 8 }}>Tu pedido</div>
          <div style={{ height: 28, borderRadius: 6, background: 'rgba(0,0,0,0.04)', marginBottom: 6 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.78rem', color: 'var(--selva)', marginBottom: 8 }}>
            <span>Total</span><span>{fCOP(hay[0]?.estado?.total || 0)}</span>
          </div>
          {hay.map((b, i) => <Mini key={i} estado={b.estado} tono={b.tono} />)}
          <div style={{ marginTop: 8, background: '#25D366', color: '#fff', borderRadius: 10, padding: '8px 10px', textAlign: 'center', fontSize: '0.72rem', fontWeight: 700 }}>Confirmar por WhatsApp</div>
          <div style={{ marginTop: 6, border: '1px solid var(--crema-oscuro)', borderRadius: 10, padding: '7px 10px', textAlign: 'center', fontSize: '0.7rem', fontWeight: 600, color: 'var(--selva)' }}>Seguir comprando</div>
        </div>
      </div>
    </div>
  )
}

const capital = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
const imgsDe = (p) => {
  try {
    const a = Array.isArray(p.imagenes) ? p.imagenes : JSON.parse(p.imagenes || '[]')
    const list = (a.length ? a : (p.imagen_url ? [p.imagen_url] : [])).map(normalizeImgAdmin).filter(Boolean)
    return list
  } catch { return p.imagen_url ? [normalizeImgAdmin(p.imagen_url)].filter(Boolean) : [] }
}

// Detecta los frutos relacionados a partir del NOMBRE del producto (sin tildes).
const sinTildes = (s) => (s || '').toLowerCase().normalize('NFD').replace(new RegExp('[\u0300-\u036f]','g'), '')
// Detecta los frutos relacionados a partir del NOMBRE, usando los ALIAS de cada fruto (tabla frutos_catalogo).
const detectarFrutos = (nombre, frutosCat) => {
  const n = sinTildes(nombre)
  return (frutosCat || []).filter(f => {
    const alias = (f.aliases?.length ? f.aliases : [f.id]).map(sinTildes)
    return alias.some(a => a && n.includes(a))
  }).map(f => f.id)
}
const labelFrutoCat = (id, frutosCat) => (frutosCat || []).find(f => f.id === id)?.nombre || id

const CATALOGO_TABS = ['productos', 'personalizar', 'config', 'correos', 'clientes', 'mensajes', 'metricas']

export default function Catalogo() {
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { tab: tabParam } = useParams()
  const { profile } = useAuth()
  const rol = profile?.rol
  const puedeProductos = puedeVerSeccion(rol, 'catalogo', 'productos')
  const puedeConfig    = puedeVerSeccion(rol, 'catalogo', 'config')
  const puedeMetricas  = puedeVerSeccion(rol, 'catalogo', 'metricas')
  const tabInicialCat = puedeProductos ? 'productos' : (puedeConfig ? 'personalizar' : (puedeMetricas ? 'metricas' : 'productos'))
  const okTab = {
    productos: puedeProductos,
    personalizar: puedeConfig,
    config: puedeConfig,
    mensajes: puedeConfig,
    correos: puedeMetricas || puedeConfig,
    clientes: puedeMetricas || puedeConfig, // alias → redirige a correos
    metricas: puedeMetricas,
  }
  const tabRaw = CATALOGO_TABS.includes(tabParam) && okTab[tabParam] ? tabParam : null
  const tab = tabRaw === 'clientes' ? 'correos' : tabRaw

  const [dirtyMap, setDirtyMap] = useState({})
  const reportDirty = useCallback((key, v) => {
    setDirtyMap(m => (m[key] === !!v ? m : { ...m, [key]: !!v }))
  }, [])
  const dirty = Object.values(dirtyMap).some(Boolean)
  useUnsavedGuard(dirty, {
    message: 'Hay cambios sin guardar en el catálogo. Si sales ahora, se perderán.',
    title: 'Cambios sin guardar',
    confirmText: 'Salir sin guardar',
    cancelText: 'Seguir editando',
  })

  useEffect(() => {
    if (tabParam === 'clientes') navigate('/catalogo/correos', { replace: true })
    else if (!tab) navigate(`/catalogo/${tabInicialCat}`, { replace: true })
  }, [tab, tabParam, tabInicialCat, navigate])

  const { data: cfgUrl } = useQuery({
    queryKey: ['catalogo_url'],
    queryFn: async () => { const { data } = await supabase.from('config_catalogo').select('url_publica').eq('id', 1).maybeSingle(); return data?.url_publica || '' },
  })

  if (!tab) return <Navigate to={`/catalogo/${tabInicialCat}`} replace />

  const tabCls = ({ isActive }) => `tab-btn${isActive ? ' active' : ''}`

  return (
    <div className={`catalogo-page${tab === 'personalizar' || tab === 'config' ? ' catalogo-page--split' : ''}`}>
      <div className="page-header">
        <h1 className="page-title"><Ico as={Store} size={16} />Catálogo público</h1>
        <div className="page-actions">
          {dirty && <span className="badge badge-dorado" style={{ fontWeight: 700 }}>● Sin guardar</span>}
          {cfgUrl
            ? <a className="btn btn-secondary btn-sm" href={cfgUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ExternalLink size={14} /> Ver catálogo
              </a>
            : <span style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>Define la URL en <strong>Configuración</strong></span>}
        </div>
      </div>

      <div className="tabs">
        {puedeProductos && <NavLink to="/catalogo/productos" className={tabCls} end><Ico as={Store} size={14} />Productos</NavLink>}
        {puedeConfig && <NavLink to="/catalogo/personalizar" className={tabCls} end><Ico as={Palette} size={14} />Personalizar</NavLink>}
        {puedeConfig && <NavLink to="/catalogo/config" className={tabCls} end><Ico as={Settings} size={14} />Configuración</NavLink>}
        {(puedeMetricas || puedeConfig) && <NavLink to="/catalogo/correos" className={tabCls} end><Ico as={Mail} size={14} />Correos</NavLink>}
        {puedeConfig && <NavLink to="/catalogo/mensajes" className={tabCls} end title="Formularios del catálogo (página Contacto)">✉️ Mensajes</NavLink>}
        {puedeMetricas && <NavLink to="/catalogo/metricas" className={tabCls} end><Ico as={BarChart3} size={14} />Métricas</NavLink>}
      </div>

      {tab === 'productos' && puedeProductos && <TabProductos toast={toast} qc={qc} onDirtyChange={v => reportDirty('productos', v)} />}
      {tab === 'personalizar' && puedeConfig && <TabPersonalizar toast={toast} qc={qc} cfgUrl={cfgUrl} onDirtyChange={v => reportDirty('personalizar', v)} />}
      {tab === 'config' && puedeConfig && <TabConfig toast={toast} onDirtyChange={v => reportDirty('config', v)} />}
      {tab === 'correos' && (puedeMetricas || puedeConfig) && <TabClientes />}
      {tab === 'mensajes' && puedeConfig && <TabMensajes />}
      {tab === 'metricas' && puedeMetricas && <TabMetricasCrm />}
    </div>
  )
}

// ==================== PRODUCTOS ====================
function TabProductos({ toast, qc, onDirtyChange }) {
  const [editar, setEditar] = useState(null)   // producto en edición
  const [gestFrutos, setGestFrutos] = useState(false)
  const [dirtyExtra, setDirtyExtra] = useState(false)
  const [dirtyEditor, setDirtyEditor] = useState(false)
  useEffect(() => { onDirtyChange?.(!!(dirtyExtra || dirtyEditor)) }, [dirtyExtra, dirtyEditor, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  const { data: frutosCat = [] } = useQuery({
    queryKey: ['frutos_catalogo'],
    queryFn: async () => { const { data } = await supabase.from('frutos_catalogo').select('*').order('orden'); return data || [] },
  })
  const { data: productos = [], isLoading } = useQuery({
    queryKey: ['catalogo_admin_productos'],
    queryFn: async () => {
      // Packs (grupo/label/orden) solo existen tras migration_v154; si faltan, reintentamos sin ellas
      const colsBase = 'id, nombre, product_id, precio_detal, precio_mayor, imagen_url, imagenes, descripcion, catalogo_descripcion, categoria_alegra_nombre, catalogo_visible, catalogo_frutos, catalogo_beneficios, catalogo_destacado, catalogo_novedad, catalogo_precio_oferta, catalogo_seo_titulo, catalogo_seo_desc, catalogo_contenido, catalogo_origen, stock, activo'
      let { data, error } = await supabase.from('finished_products')
        .select(`${colsBase}, catalogo_grupo, catalogo_pack_label, catalogo_pack_orden`)
        .order('nombre')
      if (error) {
        ({ data, error } = await supabase.from('finished_products').select(colsBase).order('nombre'))
        if (error) throw error
      }
      const prods = (data || []).filter(p => p.activo !== false)
      // Categoría = la de Alegra; si no, el tipo de la ficha (products_costing)
      const ids = [...new Set(prods.map(p => p.product_id).filter(Boolean))]
      let tipos = {}
      if (ids.length) {
        const { data: fichas } = await supabase.from('products_costing').select('id, tipo').in('id', ids)
        tipos = Object.fromEntries((fichas || []).map(f => [f.id, f.tipo]))
      }
      return prods.map(p => ({ ...p, categoria: p.categoria_alegra_nombre || tipos[p.product_id] || 'otros' }))
    },
  })

  const toggleVisible = async (p) => {
    try {
      const { error } = await supabase.from('finished_products').update({ catalogo_visible: !p.catalogo_visible }).eq('id', p.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['catalogo_admin_productos'] })
    } catch (e) { toast(e.message, 'error') }
  }

  if (isLoading) return <div className="card"><p className="empty-table">Cargando productos…</p></div>

  return (
    <>
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)', margin: 0, flex: 1 }}>
          La <strong>categoría</strong> se toma automáticamente del tipo de la ficha. Precio, descripción e imágenes provienen del producto terminado (aquí también las puedes editar). Marca <strong>Visible</strong> para publicar.
        </p>
        <button className="btn btn-sm btn-secondary" style={{ flexShrink: 0 }} onClick={() => setGestFrutos(true)}><Ico as={Pencil} size={13} />Gestionar frutos</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Publicado</th><th>Producto</th><th className="col-opcional">Categoría</th><th className="td-number movil-hide">Precio</th><th className="movil-hide">Frutos</th><th className="td-center">Destacado</th><th></th></tr></thead>
          <tbody>
            {productos.length === 0
              ? <tr><td colSpan={7} className="empty-table">No hay productos terminados.</td></tr>
              : productos.map(p => (
                <tr key={p.id} style={{ opacity: p.catalogo_visible ? 1 : 0.55 }}>
                  <td>
                    <button className={`btn btn-xs ${p.catalogo_visible ? 'btn-success' : 'btn-secondary'}`} onClick={() => toggleVisible(p)} title={p.catalogo_visible ? 'Ocultar del catálogo' : 'Publicar en el catálogo'}>
                      {p.catalogo_visible ? <><Eye size={13} /> Visible</> : <><EyeOff size={13} /> Oculto</>}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {imgsDe(p)[0] ? <img src={thumbUrl(imgsDe(p)[0])} alt={p.nombre || ''} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} /> : <span style={{ fontSize: '1.3rem' }}>🌿</span>}
                      <strong>{p.nombre}</strong>
                    </div>
                  </td>
                  <td className="col-opcional"><span className="badge badge-verde">{capital(p.categoria)}</span></td>
                  <td className="td-number movil-hide">{fCOP(p.precio_detal)}</td>
                  <td className="movil-hide" style={{ fontSize: '0.8rem', color: 'var(--texto-suave)' }}>{(p.catalogo_frutos || []).map(f => labelFrutoCat(f, frutosCat)).join(', ') || '—'}</td>
                  <td className="td-center">{p.catalogo_destacado ? <Star size={16} color="var(--dorado)" fill="var(--dorado)" /> : ''}</td>
                  <td><button className="btn btn-xs btn-secondary" onClick={() => setEditar(p)}><Pencil size={13} /> Editar</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {editar && <EditorProducto producto={editar} frutosCat={frutosCat} toast={toast} qc={qc} onDirtyChange={setDirtyEditor} onClose={() => { setDirtyEditor(false); setEditar(null) }} />}
      {gestFrutos && <GestionFrutos frutos={frutosCat} toast={toast} qc={qc} onClose={() => setGestFrutos(false)} />}
    </div>
    <ProductosExtra toast={toast} baseProductos={productos} onDirtyChange={setDirtyExtra} />
    </>
  )
}

// ---- Productos y combos adicionales (no vienen de Productos Terminados) ----
const EXTRA_VACIO = (tipo) => ({ id: 'x' + Date.now() + Math.random().toString(36).slice(2, 5), tipo, nombre: '', categoria: '', descripcion: '', imagenes: [], precio_detal: '', precio_oferta: '', precio_mayor: '', stock: '', componentes: [], destacado: false, novedad: false, visible: true, grupo: '', pack_label: '', pack_orden: 0 })
function ProductosExtra({ toast, baseProductos = [], onDirtyChange }) {
  const [items, setItems] = useState(null)
  const [cats, setCats] = useState([])            // categorías creadas por el usuario
  const [catInput, setCatInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [comp, setComp] = useState({})   // borrador de componente por combo
  const [savedSnap, setSavedSnap] = useState(null)
  useEffect(() => {
    supabase.from('config_catalogo').select('productos_extra, categorias_extra').eq('id', 1).maybeSingle().then(({ data }) => {
      const it = Array.isArray(data?.productos_extra) ? data.productos_extra : []
      const ct = Array.isArray(data?.categorias_extra) ? data.categorias_extra : []
      setItems(it); setCats(ct)
      setSavedSnap(snapConfig({ items: it, cats: ct }))
    })
  }, [])
  useEffect(() => {
    if (items == null || savedSnap == null) { onDirtyChange?.(false); return }
    onDirtyChange?.(snapConfig({ items, cats }) !== savedSnap)
  }, [items, cats, savedSnap, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  const catsConocidas = [...new Set([...baseProductos.map(p => p.categoria).filter(Boolean), ...cats, ...(items || []).map(x => x.categoria).filter(Boolean)])]
  const addCat = () => { const v = catInput.trim(); if (v && !cats.includes(v)) setCats(c => [...c, v]); setCatInput('') }
  const delCat = (c) => setCats(cs => cs.filter(x => x !== c))
  const upd = (i, campo, val) => setItems(a => a.map((x, k) => k === i ? { ...x, [campo]: val } : x))
  const add = (tipo) => setItems(a => [...(a || []), EXTRA_VACIO(tipo)])
  const del = (i) => setItems(a => a.filter((_, k) => k !== i))
  const subir = async (i, files) => {
    setSubiendo(true)
    try {
      const nombre = (items[i]?.nombre || '').trim() || 'producto'
      const nuevos = []
      for (const f of files) {
        const ext = (f.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
        const path = pathImgProducto(nombre, { carpeta: 'productos', ext })
        const { error } = await supabase.storage.from('product-images').upload(path, f, { upsert: true, contentType: f.type || 'image/jpeg' })
        if (error) throw error
        const { data } = supabase.storage.from('product-images').getPublicUrl(path)
        nuevos.push({ url: data.publicUrl, url_mobile: data.publicUrl, alt: nombre })
      }
      upd(i, 'imagenes', [...(items[i].imagenes || []), ...nuevos])
    } catch (e) { toast('No se pudieron subir: ' + e.message, 'error') } finally { setSubiendo(false) }
  }
  const addComp = (i) => { const c = comp[i]; if (!c?.id) return; upd(i, 'componentes', [...(items[i].componentes || []), { id: c.id, cantidad: Number(c.cantidad) || 1 }]); setComp(s => ({ ...s, [i]: { id: '', cantidad: 1 } })) }
  const guardar = async () => {
    setSaving(true)
    try {
      const limpio = (items || []).filter(x => x.nombre?.trim()).map(x => ({
        ...x, precio_detal: Number(x.precio_detal) || 0, precio_oferta: Number(x.precio_oferta) || null,
        precio_mayor: Number(x.precio_mayor) || 0, stock: Number(x.stock) || 0,
        imagenes: conAltProducto(x.imagenes, x.nombre),
      }))
      const { error } = await supabase.from('config_catalogo').upsert({ id: 1, productos_extra: limpio, categorias_extra: cats, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      if (error) throw error
      setItems(limpio)
      setSavedSnap(snapConfig({ items: limpio, cats }))
      toast('Productos adicionales guardados ✓')
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }
  const nombreDe = (id) => baseProductos.find(p => String(p.id) === String(id))?.nombre || id
  if (items === null) return null
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title"><Ico as={Plus} size={16} />Productos y combos adicionales</div>
      <p style={{ fontSize: '0.8rem', color: 'var(--texto-suave)', marginTop: 0 }}>Productos que no están en Productos Terminados, o <strong>combos</strong> de productos existentes. Configura fotos, precios, oferta y stock. El stock de un combo se calcula automáticamente según sus componentes.</p>

      {/* Gestión de categorías */}
      <div style={{ background: 'var(--crema)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
        <label className="form-label">Categorías <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(crea las que necesites; se usan aquí y en las secciones del inicio)</small></label>
        <div style={{ display: 'flex', gap: 6, marginBottom: cats.length ? 8 : 0 }}>
          <input className="form-control" value={catInput} onChange={e => setCatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCat() } }} placeholder="Nueva categoría + Enter" />
          <button type="button" className="btn btn-secondary" onClick={addCat}><Plus size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {cats.map(c => <span key={c} className="badge badge-verde" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{c} <button type="button" onClick={() => delCat(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rojo)', display: 'inline-flex' }}><X size={12} /></button></span>)}
        </div>
      </div>
      <datalist id="cats-extra">{catsConocidas.map(c => <option key={c} value={c} />)}</datalist>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className="btn btn-sm btn-secondary" onClick={() => add('producto')}><Plus size={13} /> Producto</button>
        <button className="btn btn-sm btn-secondary" onClick={() => add('combo')}><Plus size={13} /> Combo</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.length === 0 && <small style={{ color: 'var(--texto-suave)' }}>Aún no hay productos adicionales.</small>}
        {items.map((x, i) => (
          <div key={x.id} style={{ border: '1px solid var(--crema-oscuro)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className={`badge ${x.tipo === 'combo' ? 'badge-dorado' : 'badge-verde'}`}>{x.tipo === 'combo' ? 'Combo' : 'Producto'}</span>
              <button className={`btn btn-xs ${x.visible === false ? 'btn-secondary' : 'btn-success'}`} onClick={() => upd(i, 'visible', x.visible === false)}>{x.visible === false ? <><EyeOff size={12} /> Oculto</> : <><Eye size={12} /> Visible</>}</button>
              <label style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><input type="checkbox" checked={!!x.destacado} onChange={e => upd(i, 'destacado', e.target.checked)} /> Destacado</label>
              <label style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><input type="checkbox" checked={!!x.novedad} onChange={e => upd(i, 'novedad', e.target.checked)} /> Novedad</label>
              <button className="btn btn-xs btn-danger" style={{ marginLeft: 'auto' }} onClick={() => del(i)}><Trash2 size={12} /></button>
            </div>
            <div className="form-grid-2">
              <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Nombre</label><input className="form-control" value={x.nombre} onChange={e => upd(i, 'nombre', e.target.value)} /></div>
              <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Categoría</label><input className="form-control" list="cats-extra" value={x.categoria} onChange={e => upd(i, 'categoria', e.target.value)} placeholder="Elige o escribe una categoría" /></div>
            </div>
            <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Descripción</label><textarea className="form-control" rows={2} value={x.descripcion} onChange={e => upd(i, 'descripcion', e.target.value)} /></div>
            <div className="form-grid-2">
              <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Precio</label><MoneyInput value={x.precio_detal} onChange={v => upd(i, 'precio_detal', v)} /></div>
              <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Precio de oferta</label><MoneyInput value={x.precio_oferta} onChange={v => upd(i, 'precio_oferta', v)} /></div>
              <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Precio mayorista</label><MoneyInput value={x.precio_mayor} onChange={v => upd(i, 'precio_mayor', v)} /></div>
              {x.tipo === 'producto'
                ? <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Stock</label><input type="number" className="form-control" value={x.stock} onChange={e => upd(i, 'stock', e.target.value)} /></div>
                : <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Stock</label><input className="form-control" value="Automático (según componentes)" disabled /></div>}
            </div>
            {x.tipo === 'producto' && (
              <div className="form-grid-2" style={{ marginBottom: 6 }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Grupo pack</label><input className="form-control" value={x.grupo || ''} onChange={e => upd(i, 'grupo', e.target.value)} placeholder="ej. galletas-asai" /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Etiqueta chip</label><input className="form-control" value={x.pack_label || ''} onChange={e => upd(i, 'pack_label', e.target.value)} placeholder="x6 · x12" /></div>
                <div className="form-group" style={{ marginBottom: 0, maxWidth: 120 }}><label className="form-label">Orden</label><input type="number" className="form-control" value={x.pack_orden ?? 0} onChange={e => upd(i, 'pack_orden', parseInt(e.target.value, 10) || 0)} /></div>
              </div>
            )}
            {x.tipo === 'combo' && (
              <div style={{ marginBottom: 8 }}>
                <label className="form-label">Componentes (de productos existentes)</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  <Select className="form-control" style={{ flex: 1, minWidth: 160 }} value={comp[i]?.id || ''} onChange={e => setComp(s => ({ ...s, [i]: { ...(s[i] || {}), id: e.target.value } }))}>
                    <option value="">Elegir producto…</option>
                    {baseProductos.map(p => <option key={p.id} value={p.id}>{p.nombre} (stock {p.stock ?? 0})</option>)}
                  </Select>
                  <input type="number" min="1" className="form-control" style={{ width: 80 }} value={comp[i]?.cantidad || 1} onChange={e => setComp(s => ({ ...s, [i]: { ...(s[i] || {}), cantidad: e.target.value } }))} />
                  <button className="btn btn-sm btn-secondary" onClick={() => addComp(i)}><Plus size={13} /></button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(x.componentes || []).map((c, k) => (
                    <span key={k} className="badge badge-verde" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{c.cantidad}× {nombreDe(c.id)} <button onClick={() => upd(i, 'componentes', x.componentes.filter((_, z) => z !== k))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rojo)', display: 'inline-flex' }}><X size={12} /></button></span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="btn btn-xs btn-secondary" style={{ cursor: 'pointer' }}><Upload size={12} /> {subiendo ? 'Subiendo…' : 'Subir imágenes'}<input type="file" accept="image/*" multiple hidden onChange={e => { const fs = [...(e.target.files || [])]; if (fs.length) subir(i, fs); e.target.value = '' }} /></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {(x.imagenes || []).map((im, k) => (
                  <div key={k} style={{ position: 'relative', width: 62, height: 62 }}>
                    <img src={typeof im === 'string' ? im : (im?.url || '')} alt={x.nombre || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    <button onClick={() => upd(i, 'imagenes', x.imagenes.filter((_, z) => z !== k))} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '2px 4px' }}><X size={11} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={guardar} disabled={saving}><Ico as={Save} size={14} />{saving ? 'Guardando…' : 'Guardar productos adicionales'}</button>{savedSnap != null && items != null && snapConfig({ items, cats }) !== savedSnap && <span className="badge badge-dorado" style={{ marginLeft: 8 }}>Sin guardar</span>}
    </div>
  )
}

// ---- Reordenar categorías del catálogo público ----
function OrdenCategorias({ categorias, toast }) {
  const [orden, setOrden] = useState(null)   // array de categorías ordenadas
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    supabase.from('config_catalogo').select('categorias_orden').eq('id', 1).maybeSingle()
      .then(({ data }) => {
        const guardado = (data?.categorias_orden || []).filter(c => categorias.includes(c))
        const resto = categorias.filter(c => !guardado.includes(c))
        setOrden([...guardado, ...resto])
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorias.join('|')])

  const mover = (i, d) => setOrden(o => { const a = [...o]; const j = i + d; if (j < 0 || j >= a.length) return o;[a[i], a[j]] = [a[j], a[i]]; return a })
  const guardar = async () => {
    setSaving(true)
    try { await supabase.from('config_catalogo').update({ categorias_orden: orden }).eq('id', 1); toast('Orden de categorías guardado ✓') }
    catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }
  if (!orden || orden.length <= 1) return null
  return (
    <div className="card">
      <div className="card-title" style={{ fontSize: '0.95rem' }}><GripVertical size={15} style={{ verticalAlign: '-2px' }} /> Orden de las categorías en el catálogo</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420 }}>
        {orden.map((c, i) => (
          <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--crema)', borderRadius: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--texto-suave)', width: 20 }}>{i + 1}</span>
            <strong style={{ flex: 1, textTransform: 'capitalize' }}>{c}</strong>
            <button className="btn btn-xs btn-secondary" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp size={14} /></button>
            <button className="btn btn-xs btn-secondary" disabled={i === orden.length - 1} onClick={() => mover(i, 1)}><ChevronDown size={14} /></button>
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={guardar} disabled={saving}><Ico as={Save} size={13} />{saving ? 'Guardando…' : 'Guardar orden'}</button>
    </div>
  )
}

// ---- Editor de un producto del catálogo (modal) ----
function EditorProducto({ producto, frutosCat = [], toast, qc, onClose, onDirtyChange }) {
  // Frutos: si ya tiene, se respetan; si no, se autodetectan desde el nombre del producto
  const [frutos, setFrutos] = useState(producto.catalogo_frutos?.length ? producto.catalogo_frutos : detectarFrutos(producto.nombre, frutosCat))
  const [beneficios, setBeneficios] = useState(Array.isArray(producto.catalogo_beneficios) ? producto.catalogo_beneficios : [])
  const [beneInput, setBeneInput] = useState('')
  const [destacado, setDestacado] = useState(!!producto.catalogo_destacado)
  const [novedad, setNovedad] = useState(!!producto.catalogo_novedad)
  const [descripcion, setDescripcion] = useState(producto.catalogo_descripcion || '')   // HTML enriquecido del catálogo
  const [precioOferta, setPrecioOferta] = useState(producto.catalogo_precio_oferta ?? '')
  const [seoTitulo, setSeoTitulo] = useState(producto.catalogo_seo_titulo || '')
  const [seoDesc, setSeoDesc] = useState(producto.catalogo_seo_desc || '')
  const [contenido, setContenido] = useState(producto.catalogo_contenido || '')
  const [origen, setOrigen] = useState(producto.catalogo_origen || '')
  const [grupo, setGrupo] = useState(producto.catalogo_grupo || '')
  const [packLabel, setPackLabel] = useState(producto.catalogo_pack_label || '')
  const [packOrden, setPackOrden] = useState(producto.catalogo_pack_orden ?? 0)
  const [imgs, setImgs] = useState(imgsDe(producto))
  const [subiendo, setSubiendo] = useState(false)
  const [cropFile, setCropFile] = useState(null)   // archivo pendiente de recortar
  const [nuevoFruto, setNuevoFruto] = useState(null)  // abre EditorFruto inline
  const [gestionFrutos, setGestionFrutos] = useState(false)  // abre gestor de frutos
  const [saving, setSaving] = useState(false)
  const confirmar = useConfirm()
  const formSnap = () => snapConfig({
    frutos, beneficios, destacado, novedad, descripcion, precioOferta, seoTitulo, seoDesc, contenido, origen, grupo, packLabel, packOrden, imgs,
  })
  const savedEditor = useRef(null)
  useEffect(() => { savedEditor.current = formSnap() }, [producto.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const editorDirty = savedEditor.current != null && formSnap() !== savedEditor.current
  useEffect(() => { onDirtyChange?.(editorDirty) }, [editorDirty, onDirtyChange])
  const forzarCerrar = () => { onDirtyChange?.(false); onClose() }
  const cerrar = async () => {
    if (editorDirty) {
      const ok = await confirmar('Hay cambios sin guardar en este producto. ¿Cerrar sin guardar?', {
        title: 'Cambios sin guardar', confirmText: 'Cerrar sin guardar', cancelText: 'Seguir editando', danger: true,
      })
      if (!ok) return
    }
    forzarCerrar()
  }

  const toggleFruto = (id) => setFrutos(fs => fs.includes(id) ? fs.filter(x => x !== id) : [...fs, id])
  const moverImg = (i, d) => setImgs(a => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a;[b[i], b[j]] = [b[j], b[i]]; return b })
  const addBene = () => { const v = beneInput.trim(); if (v && !beneficios.includes(v)) setBeneficios(b => [...b, v]); setBeneInput('') }
  const quitarBene = (b) => setBeneficios(bs => bs.filter(x => x !== b))

  // Sube versión web (1200) + móvil (780); el archivo lleva el nombre del producto (SEO)
  const subirBlobPar = async (blobs) => {
    setSubiendo(true)
    try {
      const nombre = (producto.nombre || '').trim() || 'producto'
      const subirUno = async (blob, suf) => {
        const path = pathImgProducto(nombre, { carpeta: 'productos', sufijo: suf })
        const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
        if (error) throw error
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
      }
      const url = await subirUno(blobs.web || blobs.main, 'web')
      const url_mobile = blobs.mobile ? await subirUno(blobs.mobile, 'mob') : url
      setImgs(a => [...a, { url, url_mobile, alt: nombre }])
    } catch (e) { toast('No se pudo subir la imagen: ' + e.message, 'error') } finally { setSubiendo(false) }
  }
  const quitarImg = (i) => setImgs(a => a.filter((_, k) => k !== i))

  const guardar = async () => {
    setSaving(true)
    try {
      const imagenes = conAltProducto(imgs.map(normalizeImgAdmin).filter(Boolean), producto.nombre)
      const imagen_url = imagenes[0]?.url || null
      const baseUpd = {
        catalogo_frutos: frutos, catalogo_beneficios: beneficios, catalogo_destacado: destacado, catalogo_novedad: novedad,
        catalogo_descripcion: descripcion || null, catalogo_precio_oferta: (precioOferta === '' || Number(precioOferta) <= 0) ? null : Number(precioOferta),
        catalogo_seo_titulo: seoTitulo.trim() || null, catalogo_seo_desc: seoDesc.trim() || null,
        catalogo_contenido: contenido.trim() || null, catalogo_origen: origen.trim() || null,
        imagen_url, imagenes,
      }
      const packUpd = {
        catalogo_grupo: grupo.trim() || null,
        catalogo_pack_label: packLabel.trim() || null,
        catalogo_pack_orden: Number(packOrden) || 0,
      }
      let packSinMigracion = false
      let { error } = await supabase.from('finished_products').update({ ...baseUpd, ...packUpd }).eq('id', producto.id)
      // Sin v154 las columnas de packs no existen: guardar el resto igual
      if (error && /catalogo_grupo|catalogo_pack/i.test(error.message || '')) {
        ({ error } = await supabase.from('finished_products').update(baseUpd).eq('id', producto.id))
        packSinMigracion = !!(grupo.trim() || packLabel.trim())
      }
      if (error) throw error
      if (producto.product_id) {
        try { await supabase.from('products_costing').update({ imagen_url, imagenes }).eq('id', producto.product_id) } catch { /* opcional */ }
      }
      qc.invalidateQueries({ queryKey: ['catalogo_admin_productos'] })
      savedEditor.current = formSnap()
      onDirtyChange?.(false)
      toast(packSinMigracion
        ? 'Guardado sin packs: aplica migration_v154 en Supabase'
        : 'Producto actualizado ✓')
      onClose()
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={forzarCerrar} size="modal-lg"
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Store size={18} /> {producto.nombre}</span>}
      footer={<>
        <button className="btn btn-secondary" onClick={cerrar}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={saving || subiendo}><Ico as={Save} size={14} />{saving ? 'Guardando…' : 'Guardar'}</button>
      </>}
    >
      {/* Datos jalados de la ficha (solo lectura) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, fontSize: '0.85rem' }}>
        <span className="badge badge-verde">Categoría: {capital(producto.categoria)}</span>
        <span className="badge badge-dorado">Precio: {fCOP(producto.precio_detal)}</span>
        <span className={`badge ${(producto.stock ?? 0) > 0 ? 'badge-azul' : 'badge-rojo'}`}>Stock: {producto.stock ?? 0}</span>
        <span style={{ fontSize: '0.76rem', color: 'var(--texto-suave)' }}>(de la ficha de producto terminado)</span>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600, color: 'var(--selva)' }}>
          <input type="checkbox" checked={destacado} onChange={e => setDestacado(e.target.checked)} /> <Star size={15} /> Destacado (slider)
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600, color: 'var(--selva)' }}>
          <input type="checkbox" checked={novedad} onChange={e => setNovedad(e.target.checked)} /> ✨ Novedad
        </label>
      </div>

      {/* Precio de oferta */}
      <div className="card-title" style={{ fontSize: '0.95rem' }}>🏷️ Oferta</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 200 }}><label className="form-label">Precio de oferta (opcional)</label><MoneyInput value={precioOferta} onChange={v => setPrecioOferta(v)} /></div>
        {Number(precioOferta) > 0 && Number(precioOferta) < producto.precio_detal
          ? <span className="badge badge-rojo" style={{ marginBottom: 6 }}>-{Math.round((1 - Number(precioOferta) / producto.precio_detal) * 100)}% · antes {fCOP(producto.precio_detal)}</span>
          : <span style={{ fontSize: '0.76rem', color: 'var(--texto-suave)', marginBottom: 8 }}>Debe ser menor al precio ({fCOP(producto.precio_detal)}). Vacío = sin oferta.</span>}
      </div>

      {/* SEO del producto */}
      <div className="card-title" style={{ fontSize: '0.95rem' }}>🔎 SEO del producto (Google / WhatsApp)</div>
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">Título SEO <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>({seoTitulo.length}/60)</small></label>
          <input className="form-control" value={seoTitulo} maxLength={70} onChange={e => setSeoTitulo(e.target.value)} placeholder={producto.nombre} />
        </div>
        <div className="form-group">
          <label className="form-label">Descripción SEO <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>({seoDesc.length}/155)</small></label>
          <input className="form-control" value={seoDesc} maxLength={200} onChange={e => setSeoDesc(e.target.value)} placeholder="Se toma de la descripción del producto" />
        </div>
      </div>
      <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginBottom: 12 }}>
        URL pública: <code>/producto/{(producto.nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 70) || '…'}</code>.
        Si los dejas vacíos se usan el <strong>nombre</strong> y la <strong>descripción</strong>. Incluye datos estructurados (precio y disponibilidad).
      </small>

      {/* Specs ficha Atelier */}
      <div className="card-title" style={{ fontSize: '0.95rem' }}>📦 Specs de ficha <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--texto-suave)' }}>(diseño Atelier)</span></div>
      <div className="form-grid-2">
        <div className="form-group"><label className="form-label">Contenido</label><input className="form-control" value={contenido} onChange={e => setContenido(e.target.value)} placeholder="24 gr / 12 Unid." /></div>
        <div className="form-group"><label className="form-label">Origen</label><input className="form-control" value={origen} onChange={e => setOrigen(e.target.value)} placeholder="Guaviare, Colombia" /></div>
      </div>

      {/* Packs / presentaciones en tarjeta */}
      <div className="card-title" style={{ fontSize: '0.95rem' }}>🎁 Packs / presentaciones en la tarjeta</div>
      <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', margin: '0 0 8px' }}>
        Productos con el <strong>mismo grupo</strong> se muestran como chips (ej. x6 · x12) en <strong>una sola tarjeta</strong>. Cada presentación sigue siendo un producto con su precio y stock.
      </p>
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">Grupo (clave compartida)</label>
          <input className="form-control" value={grupo} onChange={e => setGrupo(e.target.value)} placeholder="ej. infusion-cocona" />
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.7rem' }}>Copia la misma clave en las otras presentaciones. Vacío = sin packs.</small>
        </div>
        <div className="form-group">
          <label className="form-label">Etiqueta del chip</label>
          <input className="form-control" value={packLabel} onChange={e => setPackLabel(e.target.value)} placeholder="x6 · x12 · 75 g · Caja" />
        </div>
        <div className="form-group" style={{ maxWidth: 160 }}>
          <label className="form-label">Orden del chip</label>
          <input type="number" className="form-control" value={packOrden} onChange={e => setPackOrden(parseInt(e.target.value, 10) || 0)} />
        </div>
      </div>
      {grupo.trim() && (
        <div style={{ marginBottom: 12, padding: '8px 10px', background: 'var(--crema)', borderRadius: 8, fontSize: '0.78rem' }}>
          Vista chip: <span className="badge badge-verde" style={{ marginLeft: 6 }}>{packLabel.trim() || contenido.trim() || '…'}</span>
          <span style={{ color: 'var(--texto-suave)', marginLeft: 8 }}>grupo «{grupo.trim()}»</span>
        </div>
      )}

      {/* Imágenes web + móvil */}
      <div className="card-title" style={{ fontSize: '0.95rem' }}>🖼️ Imágenes <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--texto-suave)' }}>(web 1200×1200 + móvil 780×780)</span></div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        {imgs.map((im, i) => {
          const n = normalizeImgAdmin(im)
          return (
            <div key={n.url + i} style={{ position: 'relative', width: 84, height: 84 }}>
              <img src={thumbUrl(n)} alt={producto.nombre || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: i === 0 ? '2px solid var(--selva)' : '1px solid var(--crema-oscuro)' }} />
              {i === 0 && <span style={{ position: 'absolute', top: -8, left: -6, fontSize: '0.6rem', background: 'var(--selva)', color: '#fff', padding: '1px 5px', borderRadius: 6 }}>Principal</span>}
              {n.url_mobile && n.url_mobile !== n.url && <span style={{ position: 'absolute', bottom: 22, left: 2, fontSize: '0.55rem', background: 'rgba(0,0,0,0.55)', color: '#fff', padding: '0 4px', borderRadius: 4 }}>web+mób</span>}
              <button type="button" className="btn btn-xs btn-danger" style={{ position: 'absolute', top: -8, right: -8, padding: 3 }} onClick={() => quitarImg(i)}><X size={12} /></button>
              <div style={{ position: 'absolute', bottom: 2, left: 2, right: 2, display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" className="btn btn-xs btn-secondary" style={{ padding: '1px 4px' }} disabled={i === 0} onClick={() => moverImg(i, -1)}><ChevronLeft size={12} /></button>
                <button type="button" className="btn btn-xs btn-secondary" style={{ padding: '1px 4px' }} disabled={i === imgs.length - 1} onClick={() => moverImg(i, 1)}><ChevronRight size={12} /></button>
              </div>
            </div>
          )
        })}
        <label className="btn btn-secondary btn-sm" style={{ width: 84, height: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 4 }}>
          {subiendo ? '…' : <><Upload size={18} /><span style={{ fontSize: '0.66rem' }}>Subir</span></>}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = '' }} />
        </label>
      </div>
      <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Cuadrada 1:1. Al recortar se generan <strong>web 1200×1200</strong> y <strong>móvil 780×780</strong> (hero Atelier). La 1ª es la principal.</small>
      {cropFile && (
        <ImageCropper file={cropFile} aspect={1} variantes={[IMG_PROD_WEB, IMG_PROD_MOBILE]}
          onCancel={() => setCropFile(null)}
          onCropped={(blobs) => { setCropFile(null); subirBlobPar(blobs) }} />
      )}

      {/* Descripción del catálogo (texto enriquecido, independiente de la ficha técnica) */}
      <div className="form-group"><label className="form-label">Descripción del catálogo <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(texto enriquecido; distinta a la descripción técnica de la ficha)</small></label>
        <RichEditor value={descripcion} onChange={setDescripcion} />
      </div>

      {/* Frutos (múltiples) */}
      <div className="form-group">
        <label className="form-label">Frutos relacionados <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(autoseleccionados según el nombre; puedes ajustar)</small></label>
        <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-xs btn-secondary" onClick={() => setFrutos(detectarFrutos(producto.nombre, frutosCat))}>↻ Detectar según el nombre</button>
          <button type="button" className="btn btn-xs btn-primary" onClick={() => setNuevoFruto({ ...FRUTO_VACIO, _nuevo: true })}><Plus size={12} /> Nuevo fruto</button>
          <button type="button" className="btn btn-xs btn-secondary" onClick={() => setGestionFrutos(true)}><Ico as={Pencil} size={12} /> Gestionar frutos</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {frutosCat.length === 0 ? <span style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>Aún no hay frutos. Usa “＋ Nuevo fruto”.</span> : frutosCat.map(f => {
            const on = frutos.includes(f.id)
            return <button key={f.id} type="button" onClick={() => toggleFruto(f.id)}
              style={{ padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                border: on ? '1.5px solid var(--selva)' : '1.5px solid var(--crema-oscuro)',
                background: on ? 'var(--selva)' : '#fff', color: on ? 'var(--crema)' : 'var(--texto)' }}>
              {on ? '✓ ' : ''}<FrutoIcon name={f.icono} size={15} style={{ verticalAlign: '-3px', marginRight: 4 }} />{f.nombre}
            </button>
          })}
        </div>
        {nuevoFruto && <EditorFruto fruto={nuevoFruto} toast={toast} qc={qc} onClose={() => setNuevoFruto(null)} onCreado={(id) => { setFrutos(fs => fs.includes(id) ? fs : [...fs, id]) }} />}
        {gestionFrutos && <GestionFrutos frutos={frutosCat} toast={toast} qc={qc} onClose={() => setGestionFrutos(false)} />}
      </div>

      {/* Beneficios (chips) */}
      <div className="form-group">
        <label className="form-label">Beneficios</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: beneficios.length ? 8 : 0 }}>
          <input className="form-control" value={beneInput} onChange={e => setBeneInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBene() } }} placeholder="Escribe un beneficio y pulsa Enter" />
          <button type="button" className="btn btn-secondary" onClick={addBene}><Plus size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {beneficios.map(b => (
            <span key={b} className="badge badge-verde" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '5px 10px' }}>
              {b} <button type="button" onClick={() => quitarBene(b)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rojo)', display: 'inline-flex' }}><X size={13} /></button>
            </span>
          ))}
        </div>
      </div>
    </Modal>
  )
}

// ==================== FRUTOS ====================
const FRUTO_VACIO = { id: '', nombre: '', cientifico: '', emoji: '🌿', icono: 'fruto', foto_url: '', color: '#2d5a3d', descripcion: '', beneficios: [], aliases: [], orden: 0, link: '' }

// Selector de icono SVG con buscador en español
function IconPicker({ value, onChange }) {
  const [q, setQ] = useState('')
  const nq = sinTildes(q)
  const lista = nq ? ICONOS_FRUTO.filter(i => sinTildes(i.l + ' ' + i.k).includes(nq)) : ICONOS_FRUTO
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--crema)', border: '1px solid var(--crema-oscuro)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--selva)' }}>
          <FrutoIcon name={value} size={24} />
        </span>
        <input className="form-control" style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar icono (ej: hoja, palmera, cereza, flor…)" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6, maxHeight: 190, overflowY: 'auto', padding: 4, border: '1px solid var(--crema-oscuro)', borderRadius: 8 }}>
        {lista.map(ic => (
          <button key={ic.n} type="button" title={ic.l} onClick={() => onChange(ic.n)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
              border: value === ic.n ? '2px solid var(--selva)' : '1px solid var(--crema-oscuro)', background: value === ic.n ? 'rgba(45,90,61,0.08)' : '#fff' }}>
            <FrutoIcon name={ic.n} size={22} />
            <span style={{ fontSize: '0.6rem', color: 'var(--texto-suave)' }}>{ic.l}</span>
          </button>
        ))}
        {lista.length === 0 && <span style={{ gridColumn: '1 / -1', fontSize: '0.82rem', color: 'var(--texto-suave)', padding: 8 }}>Sin resultados.</span>}
      </div>
    </div>
  )
}

function TabFrutos({ toast, qc }) {
  const [edit, setEdit] = useState(null)   // fruto en edición (o {..._nuevo:true})
  const { data: frutos = [], isLoading } = useQuery({
    queryKey: ['frutos_catalogo'],
    queryFn: async () => { const { data } = await supabase.from('frutos_catalogo').select('*').order('orden'); return data || [] },
  })
  const eliminar = async (f) => {
    if (!window.confirm(`¿Eliminar el fruto "${f.nombre}"?`)) return
    try { await supabase.from('frutos_catalogo').delete().eq('id', f.id); qc.invalidateQueries({ queryKey: ['frutos_catalogo'] }); toast('Fruto eliminado') }
    catch (e) { toast(e.message, 'error') }
  }
  if (isLoading) return <div className="card"><p className="empty-table">Cargando…</p></div>
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)', margin: 0 }}>Crea los frutos amazónicos. Los <strong>alias</strong> se usan para autodetectar el fruto según el nombre del producto.</p>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEdit({ ...FRUTO_VACIO, _nuevo: true })}><Plus size={14} /> Nuevo fruto</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th></th><th>Fruto</th><th className="movil-hide">Científico</th><th className="movil-hide">Alias</th><th>Orden</th><th></th></tr></thead>
          <tbody>
            {frutos.length === 0 ? <tr><td colSpan={6} className="empty-table">Aún no hay frutos.</td></tr>
              : frutos.map(f => (
                <tr key={f.id}>
                  <td style={{ color: f.color || 'var(--selva)' }}><FrutoIcon name={f.icono} size={22} /></td>
                  <td><strong>{f.nombre}</strong></td>
                  <td className="movil-hide" style={{ fontStyle: 'italic', color: 'var(--texto-suave)' }}>{f.cientifico || '—'}</td>
                  <td className="movil-hide" style={{ fontSize: '0.8rem', color: 'var(--texto-suave)' }}>{(f.aliases || []).join(', ') || '—'}</td>
                  <td>{f.orden}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-xs btn-secondary" onClick={() => setEdit(f)}><Pencil size={13} /></button>
                      <button className="btn btn-xs btn-danger" onClick={() => eliminar(f)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {edit && <EditorFruto fruto={edit} toast={toast} qc={qc} onClose={() => setEdit(null)} />}
    </div>
  )
}

// Gestor de frutos en modal (crear / editar icono, color, etc. / eliminar) — accesible desde el editor de producto
function GestionFrutos({ frutos: frutosProp = [], toast, qc, onClose }) {
  const [edit, setEdit] = useState(null)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const [guardandoOrden, setGuardandoOrden] = useState(false)
  const { data: frutos = frutosProp } = useQuery({
    queryKey: ['frutos_catalogo'],
    queryFn: async () => { const { data } = await supabase.from('frutos_catalogo').select('*').order('orden'); return data || [] },
    initialData: frutosProp,
  })
  const eliminar = async (f) => {
    if (!window.confirm(`¿Eliminar el fruto "${f.nombre}"?`)) return
    try { await supabase.from('frutos_catalogo').delete().eq('id', f.id); qc.invalidateQueries({ queryKey: ['frutos_catalogo'] }); toast('Fruto eliminado') }
    catch (e) { toast(e.message, 'error') }
  }
  // Reordena y guarda la posición (campo `orden`) de todos los frutos
  const reordenar = async (desde, hasta) => {
    if (desde == null || desde === hasta) return
    const arr = [...frutos]; const [m] = arr.splice(desde, 1); arr.splice(hasta, 0, m)
    qc.setQueryData(['frutos_catalogo'], arr.map((f, k) => ({ ...f, orden: k })))   // respuesta inmediata
    setGuardandoOrden(true)
    try {
      await Promise.all(arr.map((f, k) => supabase.from('frutos_catalogo').update({ orden: k }).eq('id', f.id)))
      qc.invalidateQueries({ queryKey: ['frutos_catalogo'] })
    } catch (e) { toast('No se pudo guardar el orden: ' + e.message, 'error') } finally { setGuardandoOrden(false) }
  }
  return (
    <Modal open onClose={onClose} title="Gestionar frutos"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={() => setEdit({ ...FRUTO_VACIO, orden: frutos.length, _nuevo: true })}><Ico as={Plus} size={14} />Nuevo fruto</button>
      </>}>
      <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', marginTop: 0 }}>
        Edita el icono, color, descripción y alias de cada fruto. <strong>Arrastra ⠿ para reordenarlos</strong>; el orden se guarda solo.
        {guardandoOrden && <span style={{ color: 'var(--selva)', fontWeight: 700 }}> Guardando orden…</span>}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {frutos.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>Aún no hay frutos.</span>}
        {frutos.map((f, i) => (
          <div key={f.id}
            onDragOver={(e) => { if (dragIdx != null) { e.preventDefault(); if (overIdx !== i) setOverIdx(i) } }}
            onDrop={(e) => { e.preventDefault(); reordenar(dragIdx, i); setDragIdx(null); setOverIdx(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
              border: overIdx === i && dragIdx != null ? '2px dashed var(--selva)' : '1px solid var(--crema-oscuro)',
              borderLeft: `4px solid ${f.color || 'var(--selva)'}`, opacity: dragIdx === i ? 0.45 : 1, background: '#fff',
            }}>
            <span draggable
              onDragStart={(e) => { try { e.dataTransfer.setData('text/plain', ''); e.dataTransfer.effectAllowed = 'move' } catch { /* noop */ } setDragIdx(i) }}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
              title="Arrastra para reordenar"
              style={{ cursor: 'grab', color: 'var(--texto-suave)', display: 'inline-flex', userSelect: 'none' }}><GripVertical size={16} /></span>
            <span style={{ color: f.color || 'var(--selva)', display: 'inline-flex' }}><FrutoIcon name={f.icono} size={26} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{f.nombre}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)', fontStyle: 'italic' }}>{f.cientifico || (f.aliases || []).join(', ') || '—'}</div>
            </div>
            <button className="btn btn-xs btn-secondary" title="Subir" disabled={i === 0} onClick={() => reordenar(i, i - 1)}><ChevronUp size={13} /></button>
            <button className="btn btn-xs btn-secondary" title="Bajar" disabled={i === frutos.length - 1} onClick={() => reordenar(i, i + 1)}><ChevronDown size={13} /></button>
            <button className="btn btn-xs btn-secondary" onClick={() => setEdit(f)}><Ico as={Pencil} size={13} /></button>
            <button className="btn btn-xs btn-danger" onClick={() => eliminar(f)}><Ico as={Trash2} size={13} /></button>
          </div>
        ))}
      </div>
      {edit && <EditorFruto fruto={edit} toast={toast} qc={qc} onClose={() => setEdit(null)} />}
    </Modal>
  )
}

function EditorFruto({ fruto, toast, qc, onClose, onCreado }) {
  const nuevo = !!fruto._nuevo
  const [f, setF] = useState({ ...FRUTO_VACIO, ...fruto })
  const [beneInput, setBeneInput] = useState('')
  const [aliasInput, setAliasInput] = useState('')
  const [cropFoto, setCropFoto] = useState(null)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const subirFoto = async (blob) => {
    setSubiendoFoto(true)
    try {
      const path = `catalogo/fruto_${Date.now()}.jpg`
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      set('foto_url', data.publicUrl)
    } catch (e) { toast('No se pudo subir la foto: ' + e.message, 'error') } finally { setSubiendoFoto(false) }
  }
  const addChip = (campo, val, setInput) => { const v = (val || '').trim(); if (v && !(f[campo] || []).includes(v)) set(campo, [...(f[campo] || []), v]); setInput('') }
  const delChip = (campo, v) => set(campo, (f[campo] || []).filter(x => x !== v))

  const slug = (s) => s.toLowerCase().normalize('NFD').replace(new RegExp('[̀-ͯ]', 'g'), '').replace(/[^a-z0-9]+/g, '').slice(0, 24)

  const guardar = async () => {
    const id = (f.id || slug(f.nombre)).trim()
    if (!id) { toast('Escribe un nombre', 'warning'); return }
    if (!f.nombre.trim()) { toast('Escribe un nombre', 'warning'); return }
    try {
      const payload = { id, nombre: f.nombre.trim(), cientifico: f.cientifico || null, icono: f.icono || 'fruto', foto_url: f.foto_url || null, emoji: f.emoji || '🌿', color: f.color || '#2d5a3d', descripcion: f.descripcion || null, beneficios: f.beneficios || [], aliases: (f.aliases?.length ? f.aliases : [id]), orden: parseInt(f.orden) || 0, link: f.link || null }
      const { error } = await supabase.from('frutos_catalogo').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['frutos_catalogo'] }); toast('Fruto guardado ✓'); onCreado?.(id); onClose()
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <Modal open onClose={onClose} title={nuevo ? 'Nuevo fruto' : `Editar ${f.nombre}`}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar}><Ico as={Save} size={14} />Guardar</button>
      </>}>
      <div className="form-grid-2">
        <div className="form-group"><label className="form-label">Nombre</label><input className="form-control" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej: Moriche" /></div>
        <div className="form-group"><label className="form-label">Nombre científico</label><input className="form-control" value={f.cientifico} onChange={e => set('cientifico', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Color</label><input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={f.color} onChange={e => set('color', e.target.value)} /></div>
      </div>
      <div className="form-group"><label className="form-label">Icono</label><IconPicker value={f.icono} onChange={(n) => set('icono', n)} /></div>
      <div className="form-group">
        <label className="form-label">Foto del fruto <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(opcional; si la subes, reemplaza al icono en el catálogo)</small></label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', overflow: 'hidden', background: 'var(--crema)', border: '1px solid var(--crema-oscuro)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {f.foto_url ? <img src={f.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <FrutoIcon name={f.icono} size={26} />}
          </div>
          <label className="btn btn-xs btn-secondary" style={{ cursor: 'pointer' }}><Upload size={12} /> {subiendoFoto ? '…' : 'Subir foto'}<input type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; if (file) setCropFoto(file); e.target.value = '' }} /></label>
          {f.foto_url && <button type="button" className="btn btn-xs btn-danger" onClick={() => set('foto_url', '')}>Quitar</button>}
        </div>
      </div>
      {cropFoto && <ImageCropper file={cropFoto} aspect={1} salidaW={500} salidaH={500} onCancel={() => setCropFoto(null)} onCropped={(blob) => { setCropFoto(null); subirFoto(blob) }} />}
      <div className="form-group"><label className="form-label">Descripción</label><textarea className="form-control" rows={2} value={f.descripcion} onChange={e => set('descripcion', e.target.value)} /></div>
      <ChipEditor label="Beneficios" chips={f.beneficios} input={beneInput} setInput={setBeneInput} onAdd={() => addChip('beneficios', beneInput, setBeneInput)} onDel={(v) => delChip('beneficios', v)} placeholder="Beneficio + Enter" />
      <ChipEditor label="Alias (para autodetectar por nombre)" chips={f.aliases} input={aliasInput} setInput={setAliasInput} onAdd={() => addChip('aliases', aliasInput, setAliasInput)} onDel={(v) => delChip('aliases', v)} placeholder="Ej: moriche, aguaje + Enter" />
      <div className="form-group"><label className="form-label">Enlace <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(para el mosaico "Mis frutos")</small></label><input className="form-control" value={f.link || ''} onChange={e => set('link', e.target.value)} placeholder="/galeria/ID, /p/slug o https://…" /></div>
      <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>El orden se cambia arrastrando ⠿ en la lista de frutos.</small>
    </Modal>
  )
}

function ChipEditor({ label, chips = [], input, setInput, onAdd, onDel, placeholder }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: chips.length ? 8 : 0 }}>
        <input className="form-control" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }} placeholder={placeholder} />
        <button type="button" className="btn btn-secondary" onClick={onAdd}><Plus size={16} /></button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chips.map(c => <span key={c} className="badge badge-verde" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '5px 10px' }}>{c} <button type="button" onClick={() => onDel(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rojo)', display: 'inline-flex' }}><X size={13} /></button></span>)}
      </div>
    </div>
  )
}

// ---- Campo de plantilla de WhatsApp con fichas insertables ----
const TOKENS_WA = [
  { t: 'saludo', d: 'Saludo' }, { t: 'cliente', d: 'Nombre del cliente' },
  { t: 'pedido', d: 'Detalle del pedido' },
  { t: 'codigo', d: 'Nº de pedido (Pedido #…)' }, { t: 'total', d: 'Total' }, { t: 'envio', d: 'Envío' },
  { t: 'nota', d: 'Nota del cliente' }, { t: 'cierre', d: 'Frase de cierre' }, { t: 'tienda', d: 'Nombre de la tienda' },
]
function CampoPlantillaWA({ label, ayuda, value, onChange, tokens = TOKENS_WA, placeholder, rows = 5 }) {
  const ref = useRef(null)
  const insertar = (tok) => {
    const el = ref.current; const ficha = `{${tok}}`
    if (!el) return onChange((value || '') + ficha)
    const ini = el.selectionStart ?? (value || '').length
    const fin = el.selectionEnd ?? ini
    const nuevo = (value || '').slice(0, ini) + ficha + (value || '').slice(fin)
    onChange(nuevo)
    requestAnimationFrame(() => { el.focus(); const p = ini + ficha.length; el.setSelectionRange(p, p) })
  }
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
        {tokens.map(k => (
          <button key={k.t} type="button" onClick={() => insertar(k.t)} title={`Insertar ${k.d}`}
            style={{ background: 'var(--crema)', border: '1px solid var(--crema-oscuro)', borderRadius: 999, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--selva)', cursor: 'pointer' }}>
            + {k.d}
          </button>
        ))}
      </div>
      <textarea ref={ref} className="form-control" rows={rows} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ fontFamily: 'monospace', fontSize: '0.82rem' }} />
      {ayuda && <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>{ayuda}</small>}
    </div>
  )
}

// ---- Aviso superior: hasta 3 mensajes cortos ----
function ColorPick({ label, value, fallback, onChange, onClear }) {
  const v = value || fallback || '#C8A94A'
  return (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="color" className="form-control" style={{ height: 36, padding: 2, flex: 1 }} value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#C8A94A'} onChange={e => onChange(e.target.value)} />
        {value ? <button type="button" className="btn btn-xs btn-secondary" title="Usar color de la paleta" onClick={onClear}>Auto</button> : null}
      </div>
    </div>
  )
}

function AvisosEditor({ avisos = [], onChange, colorBg, colorTexto, onColorBg, onColorTexto }) {
  const lista = avisos.map(a => (typeof a === 'string' ? a : a?.texto || ''))
  const upd = (i, v) => onChange(lista.map((t, k) => k === i ? v : t))
  const add = () => lista.length < 3 && onChange([...lista, ''])
  const del = (i) => onChange(lista.filter((_, k) => k !== i))
  const mover = (i, d) => { const a = [...lista]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  const bg = colorBg || '#C8A94A'
  const fg = colorTexto || '#1a3a2a'
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <ColorPick label="Fondo del aviso" value={colorBg} fallback="#C8A94A" onChange={onColorBg} onClear={() => onColorBg('')} />
        <ColorPick label="Texto del aviso" value={colorTexto} fallback="#1a3a2a" onChange={onColorTexto} onClear={() => onColorTexto('')} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {lista.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input className="form-control" style={{ flex: 1 }} maxLength={90} value={t} onChange={e => upd(i, e.target.value)} placeholder="🎉 10% de descuento por temporada" />
            <button type="button" className="btn btn-xs btn-secondary" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp size={12} /></button>
            <button type="button" className="btn btn-xs btn-secondary" disabled={i === lista.length - 1} onClick={() => mover(i, 1)}><ChevronDown size={12} /></button>
            <button type="button" className="btn btn-xs btn-danger" onClick={() => del(i)}><X size={12} /></button>
          </div>
        ))}
      </div>
      {lista.length < 3 && <button type="button" className="btn btn-xs btn-secondary" style={{ marginTop: 8 }} onClick={add}><Plus size={12} /> Agregar aviso ({lista.length}/3)</button>}
      {lista.filter(t => t.trim()).length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--texto-suave)', marginBottom: 4 }}>Vista previa:</div>
          <div style={{ background: bg, color: fg, fontSize: '0.78rem', fontWeight: 700, padding: '6px 12px', textAlign: 'center', borderRadius: 6 }}>{lista.find(t => t.trim())}</div>
        </div>
      )}
    </div>
  )
}

// ---- Métodos de pago: icono + nombre (se muestran en el carrito) ----
const PAGO_ICONOS = [
  { n: 'CreditCard', l: 'Tarjeta' }, { n: 'Banknote', l: 'Efectivo' }, { n: 'Wallet', l: 'Billetera' },
  { n: 'Smartphone', l: 'Pago móvil' }, { n: 'QrCode', l: 'Código QR' }, { n: 'Landmark', l: 'Banco' },
  { n: 'HandCoins', l: 'Contra entrega' }, { n: 'Coins', l: 'Monedas' }, { n: 'Receipt', l: 'Recibo' },
  { n: 'ShieldCheck', l: 'Pago seguro' }, { n: 'Truck', l: 'Al recibir' }, { n: 'Gift', l: 'Bono' },
  { n: 'PiggyBank', l: 'Ahorro' }, { n: 'BadgeDollarSign', l: 'Transferencia' },
]
const PAGO_MAP = { CreditCard, Banknote, Wallet, Smartphone, QrCode, Landmark, HandCoins, Coins, Receipt, ShieldCheck, Truck, Gift, PiggyBank, BadgeDollarSign }
const PagoIco = ({ name, size = 16 }) => { const C = PAGO_MAP[name] || CreditCard; return <C size={size} /> }

function PagosEditor({ pagos = [], onChange }) {
  const upd = (i, campo, val) => onChange(pagos.map((p, k) => k === i ? { ...p, [campo]: val } : p))
  const add = () => onChange([...pagos, { icono: 'CreditCard', nombre: '' }])
  const del = (i) => onChange(pagos.filter((_, k) => k !== i))
  const mover = (i, d) => { const a = [...pagos]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pagos.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 30, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--selva)', flexShrink: 0 }}><PagoIco name={p.icono} /></span>
            <Select className="form-control" style={{ width: 150, flexShrink: 0 }} value={p.icono || 'CreditCard'} onChange={e => upd(i, 'icono', e.target.value)}>
              {PAGO_ICONOS.map(o => <option key={o.n} value={o.n}>{o.l}</option>)}
            </Select>
            <input className="form-control" style={{ flex: 1 }} value={p.nombre || ''} onChange={e => upd(i, 'nombre', e.target.value)} placeholder="Ej: Nequi, Bancolombia, Efectivo…" />
            <button type="button" className="btn btn-xs btn-secondary" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp size={12} /></button>
            <button type="button" className="btn btn-xs btn-secondary" disabled={i === pagos.length - 1} onClick={() => mover(i, 1)}><ChevronDown size={12} /></button>
            <button type="button" className="btn btn-xs btn-danger" onClick={() => del(i)}><X size={12} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-xs btn-secondary" style={{ marginTop: 8 }} onClick={add}><Plus size={12} /> Agregar método</button>
    </div>
  )
}

// ---- Vista previa de los mensajes de WhatsApp (usa un pedido de ejemplo) ----
const EJ_OK = '🍵 *2x Infusión Cocona y Limonaria caja x 12 Unid*\n   $22.000 c/u → $44.000'
const EJ_AGO = '🍵 *Infusión Cocona y Limonaria caja x 12 Unid*\n   $22.000 c/u  (agotado — sobre pedido)'
const tieneFichas = (s) => /\{\s*(saludo|cliente|pedido|total|envio|nota|cierre|tienda)\s*\}/i.test(s || '')
function aplicarFichas(tpl, vars) {
  let s = String(tpl || '')
  Object.entries(vars).forEach(([k, v]) => { s = s.replace(new RegExp(`\\{\\s*${k}\\s*\\}`, 'gi'), v ?? '') })
  return s.split('\n').filter((l, i, a) => !(l.trim() === '' && a[i - 1]?.trim() === '')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
const WA_TIPOS = [
  { id: 'stock', label: 'Pedido' }, { id: 'sinstock', label: 'Agotado' },
  { id: 'mayorista', label: 'Mayorista' }, { id: 'solicitud', label: 'Solicitud' },
]
function mensajeEjemplo(tipo, cfg) {
  const esAgo = tipo === 'sinstock'
  const vars = {
    saludo: '¡Hola! 🌿', cliente: esAgo ? '' : 'Ana Gómez',
    pedido: esAgo ? EJ_AGO : EJ_OK, total: '$44.000',
    envio: esAgo ? '' : ((cfg.envio_mensaje || '').trim() || cfg.envio_tarifa
      ? `🚚 ${[(cfg.envio_mensaje || '').trim(), Number(cfg.envio_tarifa) ? `(${fCOP(cfg.envio_tarifa)})` : ''].filter(Boolean).join(' ')}`.trim()
      : ''),
    nota: '📝 *Nota:* Entregar en la tarde',
    cierre: tipo === 'solicitud' ? '¡Quedo atento(a) a su respuesta! 😊' : '¡Quedo atento(a) a la confirmación! 😊',
    tienda: cfg.nombre_tienda || 'Mumi Amazonia',
  }
  const tpl = (tipo === 'stock' ? cfg.wa_texto_stock : esAgo ? cfg.wa_texto_sin_stock : tipo === 'mayorista' ? cfg.wa_texto_mayorista : cfg.mayorista_wa_texto) || ''
  if (tieneFichas(tpl)) return aplicarFichas(tpl, vars)
  if (tipo === 'solicitud') {
    const soy = vars.cliente ? `Soy *${vars.cliente}* y ` : ''
    return `${vars.saludo}\n${soy}estoy interesado(a) en ser mayorista. ¿Me comparten los precios al por mayor?${tpl ? `\n\n${tpl}` : ''}`
  }
  const saludo = tpl || (esAgo ? '¡Hola! 🌿 Quisiera consultar la disponibilidad de:'
    : tipo === 'mayorista' ? '¡Hola! 🌿 Soy mayorista y quiero hacer este pedido:' : '¡Hola! 🌿 Me gustaría hacer este pedido:')
  const titulo = esAgo ? '📋 *CONSULTA DE DISPONIBILIDAD*' : `🛒 *MI PEDIDO${tipo === 'mayorista' ? ' (MAYORISTA)' : ''}*`
  let m = saludo
  if (vars.cliente) m += `\nSoy *${vars.cliente}*`
  m += `\n\n${titulo}\n\n${vars.pedido}\n\n━━━━━━━━━━━━━━\n`
  m += esAgo ? '💬 *¿Cuándo estará disponible?*' : `💰 *Total: ${vars.total}*`
  // El envío no va por defecto: solo si se inserta la ficha {envio}
  m += `\n\n${vars.cierre}`
  return m
}
// Burbuja de chat estilo WhatsApp (interpreta *negrita* y _cursiva_)
function BurbujaWA({ texto }) {
  const html = (texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>').replace(/_([^_\n]+)_/g, '<em>$1</em>')
  return (
    <div className="wa-chat">
      <div className="wa-bubble"><div dangerouslySetInnerHTML={{ __html: html }} /><span className="wa-hora">12:30 ✓✓</span></div>
    </div>
  )
}

// ==================== CONFIGURACIÓN ====================
const SEO_PLACEHOLDER = {
  titulo: 'Mumi Amazonia — Productos naturales de la selva del Guaviare',
  desc: 'Catálogo de productos amazónicos: alimentos, snacks, bebidas e ingredientes del Guaviare. Origen sostenible y pedidos por WhatsApp en Colombia.',
  keywords: 'Mumi Amazonia, productos amazónicos, Guaviare, alimentos naturales, snacks amazónicos, bebidas naturales, frutas amazónicas',
}
const SEO_PAGINAS_FIJAS = [
  { key: 'tienda', label: 'Tienda / Inicio', hint: 'Si lo dejas vacío se usa el SEO principal de arriba.' },
  { key: 'nosotros', label: 'Nosotros', hint: 'Aparece en /nosotros' },
  { key: 'contacto', label: 'Contacto', hint: 'Aparece en /contacto' },
  { key: 'galeria', label: 'Galería', hint: 'Aparece en /galeria' },
]

function TabConfig({ toast, onDirtyChange }) {
  const qc = useQueryClient()
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [sec, setSec] = useState('general')     // sección abierta del acordeón
  const [waSel, setWaSel] = useState('stock')   // mensaje que se previsualiza
  const [umbralPrevMayo, setUmbralPrevMayo] = useState(false) // vista previa: detal vs mayorista
  const [umbralPrevTotal, setUmbralPrevTotal] = useState(null) // total simulado (null = auto ~40%)
  const [cropOg, setCropOg] = useState(null)
  const [subiendoOg, setSubiendoOg] = useState(false)
  const [savedSnap, setSavedSnap] = useState(null)
  useEffect(() => {
    supabase.from('config_catalogo').select('*').eq('id', 1).maybeSingle()
      .then(({ data }) => {
        const c = data || { id: 1 }
        setCfg(c)
        setSavedSnap(snapConfig(c))
      })
  }, [])
  useEffect(() => {
    if (!cfg || savedSnap == null) { onDirtyChange?.(false); return }
    onDirtyChange?.(snapConfig(cfg) !== savedSnap)
  }, [cfg, savedSnap, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))
  const setSeoPagina = (key, campo, val) => setCfg(c => ({
    ...c,
    seo_paginas: { ...(c.seo_paginas || {}), [key]: { ...((c.seo_paginas || {})[key] || {}), [campo]: val } },
  }))
  const subirOg = async (blob) => {
    setSubiendoOg(true)
    try {
      const path = `catalogo/og_${Date.now()}.jpg`
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      set('seo_imagen', data.publicUrl)
      toast('Imagen Open Graph actualizada ✓')
    } catch (e) { toast('No se pudo subir la imagen: ' + e.message, 'error') }
    finally { setSubiendoOg(false) }
  }
  const guardar = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('config_catalogo').upsert({ ...cfg, id: 1, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      if (error) throw error
      setSavedSnap(snapConfig(cfg))
      toast('Configuración del catálogo guardada ✓')
      qc.invalidateQueries({ queryKey: ['catalogo_url'] })
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }
  if (!cfg) return <div className="card"><p className="empty-table">Cargando…</p></div>
  const base = (cfg.url_publica || '').replace(/\/+$/, '')
  return (
    <div className="pz-layout">
      {/* Panel de ajustes en acordeón */}
      <div className="pz-panel">
        <div className="pz-panel-toolbar">
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={saving}><Ico as={Save} size={13} />{saving ? 'Guardando…' : 'Guardar configuración'}</button>{savedSnap != null && snapConfig(cfg) !== savedSnap && <span className="badge badge-dorado" style={{ marginLeft: 8 }}>Sin guardar</span>}
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>La apariencia se edita en <strong>Personalizar</strong>.</small>
        </div>

        <PzSec abierto={sec} setAbierto={setSec} id="general" titulo={<><Ico as={Settings} size={14} />Datos generales</>}>
          <div className="form-group"><label className="form-label">URL pública del catálogo</label><input className="form-control" value={cfg.url_publica || ''} onChange={e => set('url_publica', e.target.value)} placeholder="https://catalogo.tu-cuenta.workers.dev" /><small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>La que te dé Cloudflare al desplegar (o tu dominio propio).</small></div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">WhatsApp (con indicativo)</label><input className="form-control" value={cfg.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} placeholder="+573157702180" /></div>
            <div className="form-group"><label className="form-label">País <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(para el copyright)</small></label><input className="form-control" value={cfg.pais || ''} onChange={e => set('pais', e.target.value)} placeholder="Colombia" /></div>
          </div>
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="envio" titulo={<>🚚 Envío</>}>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Tarifa fija de envío (opcional)</label><MoneyInput value={cfg.envio_tarifa ?? ''} onChange={v => set('envio_tarifa', v || null)} /></div>
            <div className="form-group"><label className="form-label">Mensaje de envío (opcional)</label><input className="form-control" value={cfg.envio_mensaje || ''} onChange={e => set('envio_mensaje', e.target.value)} placeholder="Envío a todo el país en 2–4 días" /></div>
          </div>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Si dejas ambos vacíos, el envío <strong>no se muestra</strong> en ningún lado. Se muestra en el <strong>carrito</strong>, pero <strong>no se envía por WhatsApp</strong> salvo que insertes la ficha <strong>{'{envio}'}</strong> en una plantilla.</small>

          {/* —— 1) Pedido mínimo sugerido (barra propia) —— */}
          <div style={{ marginTop: 14, borderTop: '1px solid var(--crema-oscuro)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ flex: '1 1 200px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>1) Pedido mínimo sugerido</div>
                <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 2 }}>
                  Sugerencia de monto de pedido. <strong>No bloquea</strong> WhatsApp. Tiene su propia barra.
                </small>
              </div>
              <button type="button" role="switch" aria-checked={!!cfg.envio_umbral_activo}
                onClick={() => set('envio_umbral_activo', !cfg.envio_umbral_activo)}
                className={`btn btn-sm ${cfg.envio_umbral_activo ? 'btn-success' : 'btn-secondary'}`}
                style={{ minWidth: 110, fontWeight: 700 }}>
                {cfg.envio_umbral_activo ? 'Barra on' : 'Barra off'}
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Detal (COP)</label>
                <MoneyInput value={cfg.pedido_minimo ?? 0} onChange={v => set('pedido_minimo', v || 0)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Mayorista (COP)</label>
                <MoneyInput value={cfg.mayorista_pedido_minimo ?? 0} onChange={v => set('mayorista_pedido_minimo', v || 0)} />
              </div>
            </div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.7rem', display: 'block', marginTop: 6 }}>0 = sin sugerencia en ese canal</small>
          </div>

          {/* —— 2) Envío gratis (barra propia) —— */}
          <div style={{ marginTop: 14, borderTop: '1px solid var(--crema-oscuro)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ flex: '1 1 200px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>2) Envío gratis nacional</div>
                <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 2 }}>
                  Monto <strong>absoluto</strong> del pedido a partir del cual el envío es gratis (ej. $200.000). <strong>No se suma</strong> al pedido mínimo: cada barra calcula sola: meta − total del carrito.
                </small>
              </div>
              <button type="button" role="switch" aria-checked={!!cfg.envio_gratis_barra_activo}
                onClick={() => set('envio_gratis_barra_activo', !cfg.envio_gratis_barra_activo)}
                className={`btn btn-sm ${cfg.envio_gratis_barra_activo ? 'btn-success' : 'btn-secondary'}`}
                style={{ minWidth: 110, fontWeight: 700 }}>
                {cfg.envio_gratis_barra_activo ? 'Barra on' : 'Barra off'}
              </button>
            </div>
            <div className="form-grid-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Pedido total desde — detal (COP)</label>
                <MoneyInput value={cfg.envio_gratis_desde ?? 0} onChange={v => set('envio_gratis_desde', v || 0)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Pedido total desde — mayorista (COP)</label>
                <MoneyInput value={cfg.envio_gratis_mayorista ?? 0} onChange={v => set('envio_gratis_mayorista', v || 0)} />
              </div>
            </div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.7rem', display: 'block', marginTop: 6 }}>Ej.: $200.000 = envío gratis si el carrito llega a ese total. 0 = sin barra. No sumar el pedido mínimo encima.</small>
          </div>
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="pagos" titulo={<>💳 Métodos de pago</>}>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Se muestran en el <strong>carrito</strong> (no se envían por WhatsApp).</small>
          <PagosEditor pagos={Array.isArray(cfg.pagos) ? cfg.pagos : []} onChange={v => set('pagos', v)} />
        </PzSec>

                <PzSec abierto={sec} setAbierto={setSec} id="seo" titulo={<>🔎 SEO del sitio (Google / redes)</>}>
          <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', margin: '0 0 10px' }}>
            Define cómo aparece el catálogo en Google y al compartir enlaces. Habla de la <strong>marca y todo el catálogo</strong> (no solo una categoría). Con la <strong>URL pública</strong> el sitio genera{' '}
            {base ? <><a href={`${base}/sitemap.xml`} target="_blank" rel="noreferrer">sitemap.xml</a>, <a href={`${base}/robots.txt`} target="_blank" rel="noreferrer">robots.txt</a> y feed <a href={`${base}/feeds/google-merchant.txt`} target="_blank" rel="noreferrer">Google Shopping</a></> : <><code>sitemap.xml</code>, <code>robots.txt</code> y feed Shopping</>}.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer', marginBottom: 10 }}>
            <input type="checkbox" checked={cfg.seo_indexar !== false} onChange={e => set('seo_indexar', e.target.checked)} />
            Permitir que Google y otros buscadores indexen el catálogo
          </label>
          <div className="form-group">
            <label className="form-label">Título SEO <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>({(cfg.seo_titulo || '').length}/60)</small></label>
            <input className="form-control" value={cfg.seo_titulo || ''} maxLength={70} onChange={e => set('seo_titulo', e.target.value)} placeholder={SEO_PLACEHOLDER.titulo} />
          </div>
          <div className="form-group">
            <label className="form-label">Meta descripción <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>({(cfg.seo_descripcion || '').length}/155)</small></label>
            <textarea className="form-control" rows={3} value={cfg.seo_descripcion || ''} maxLength={200} onChange={e => set('seo_descripcion', e.target.value)} placeholder={SEO_PLACEHOLDER.desc} />
          </div>
          <div className="form-group">
            <label className="form-label">Palabras clave <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(separadas por coma)</small></label>
            <input className="form-control" value={cfg.seo_keywords || ''} onChange={e => set('seo_keywords', e.target.value)} placeholder={SEO_PLACEHOLDER.keywords} />
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Incluye marca, origen (Guaviare), categorías amplias y canal (WhatsApp). No centres todo en una sola línea de producto.</small>
          </div>
          <div className="form-group">
            <label className="form-label">Imagen Open Graph (WhatsApp / redes)</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {cfg.seo_imagen ? <img src={cfg.seo_imagen} alt="" style={{ width: 160, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--crema-oscuro)' }} /> : (
                <div style={{ width: 160, height: 84, borderRadius: 8, border: '1px dashed var(--crema-oscuro)', display: 'grid', placeItems: 'center', fontSize: '0.7rem', color: 'var(--texto-suave)' }}>1200×630</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer' }}>
                  <Upload size={14} /> {subiendoOg ? 'Subiendo…' : 'Subir y recortar'}
                  <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setCropOg(f); e.target.value = '' }} />
                </label>
                {cfg.seo_imagen ? <button type="button" className="btn btn-xs btn-danger" onClick={() => set('seo_imagen', '')}>Quitar imagen</button> : null}
              </div>
            </div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 6 }}>
              Sube una foto y recórtala a <strong>1200×630</strong> (formato recomendado). Si está vacío se usa el logo. Favicon → Personalizar → Marca.
            </small>
          </div>
          <div className="form-group">
            <label className="form-label">Verificación Google Search Console</label>
            <input className="form-control" value={cfg.seo_verificacion || ''} onChange={e => set('seo_verificacion', e.target.value)} placeholder="ej. AbCdEf123… (solo el valor content)" />
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 4 }}>
              <strong>¿Qué es?</strong> Google te pide demostrar que el sitio es tuyo. En Search Console eliges verificación por etiqueta HTML y te dan algo como{' '}
              <code>&lt;meta name=&quot;google-site-verification&quot; content=&quot;ESTE_CÓDIGO&quot; /&gt;</code>.
              Aquí pegas <strong>solo ESTE_CÓDIGO</strong> (sin la etiqueta). El catálogo lo publica en todas las páginas. Luego pulsa Verificar en Google y envía el sitemap.
            </small>
          </div>
          <div style={{ background: 'var(--crema)', borderRadius: 10, padding: 12, marginTop: 4 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--texto-suave)', marginBottom: 6 }}>Vista previa en Google</div>
            <div style={{ fontSize: '1.05rem', color: '#1a0dab', lineHeight: 1.25 }}>{(cfg.seo_titulo || SEO_PLACEHOLDER.titulo).slice(0, 60)}</div>
            <div style={{ fontSize: '0.78rem', color: '#006621' }}>{base || 'https://tu-catalogo…'}/</div>
            <div style={{ fontSize: '0.82rem', color: '#545454', marginTop: 2 }}>{(cfg.seo_descripcion || SEO_PLACEHOLDER.desc).slice(0, 155)}</div>
          </div>

          <div style={{ marginTop: 16, borderTop: '1px solid var(--crema-oscuro)', paddingTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>SEO por página</div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginBottom: 10 }}>
              Título y descripción propios para cada ruta fija. Las páginas personalizadas se editan en <strong>Personalizar → Páginas</strong>. Productos → pestaña Productos.
            </small>
            {SEO_PAGINAS_FIJAS.map(pg => {
              const sp = (cfg.seo_paginas || {})[pg.key] || {}
              return (
                <div key={pg.key} style={{ border: '1px solid var(--crema-oscuro)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 6 }}>{pg.label} <small style={{ fontWeight: 400, color: 'var(--texto-suave)' }}>{pg.hint}</small></div>
                  <div className="form-group" style={{ marginBottom: 6 }}>
                    <label className="form-label">Título</label>
                    <input className="form-control" value={sp.titulo || ''} maxLength={70} onChange={e => setSeoPagina(pg.key, 'titulo', e.target.value)} placeholder={pg.key === 'tienda' ? SEO_PLACEHOLDER.titulo : pg.label} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Descripción</label>
                    <textarea className="form-control" rows={2} value={sp.desc || ''} maxLength={200} onChange={e => setSeoPagina(pg.key, 'desc', e.target.value)} placeholder={`Descripción SEO de ${pg.label.toLowerCase()}…`} />
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ background: 'color-mix(in srgb, var(--selva) 8%, #fff)', border: '1px solid color-mix(in srgb, var(--selva) 25%, #fff)', borderRadius: 10, padding: 12, marginTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--selva)', marginBottom: 4 }}>Google Shopping / Merchant Center</div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', lineHeight: 1.45 }}>
              1) Crea una cuenta en <strong>Google Merchant Center</strong>. 2) Vincula tu dominio (URL pública). 3) Añade un feed de productos con esta URL:{' '}
              {base ? <a href={`${base}/feeds/google-merchant.txt`} target="_blank" rel="noreferrer"><code>{base}/feeds/google-merchant.txt</code></a> : <code>…/feeds/google-merchant.txt</code>}
              {' '}(se actualiza con tus productos del catálogo). 4) Completa políticas, envío e impuestos en Merchant Center. El JSON-LD de producto ayuda al SEO web; Shopping usa el feed + Merchant Center.
            </small>
          </div>

          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 8 }}>Guarda esta sección y, tras desplegar el catálogo, envía el sitemap en Search Console.</small>
          {cropOg && <ImageCropper file={cropOg} aspect={1200 / 630} salidaW={1200} salidaH={630} onCancel={() => setCropOg(null)} onCropped={(blob) => { setCropOg(null); void subirOg(blob) }} />}
        </PzSec>

<PzSec abierto={sec} setAbierto={setSec} id="terminos" titulo={<>📄 Términos y política de datos</>}>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Si escribes algo, aparece un enlace en el footer que abre este texto en un modal.</small>
          <div style={{ marginTop: 8 }}><RichEditor value={cfg.terminos_texto || ''} onChange={(html) => set('terminos_texto', html)} /></div>
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="mantenimiento" titulo={<>🛠️ Modo mantenimiento</>}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', margin: '2px 0 10px' }}>
            <input type="checkbox" checked={!!cfg.mantenimiento_activo} onChange={e => set('mantenimiento_activo', e.target.checked)} /> Activar modo mantenimiento (oculta el catálogo)
          </label>
          <div className="form-group"><label className="form-label">Mensaje</label><textarea className="form-control" rows={2} value={cfg.mantenimiento_mensaje || ''} onChange={e => set('mantenimiento_mensaje', e.target.value)} placeholder="Estamos haciendo mejoras en la tienda. Volvemos muy pronto 🌿" /></div>
          {cfg.mantenimiento_activo && <div style={{ background: 'rgba(192,57,43,0.1)', border: '1px solid var(--rojo)', color: 'var(--rojo)', borderRadius: 8, padding: '8px 10px', fontSize: '0.78rem', fontWeight: 700 }}>⚠️ El catálogo está oculto para los visitantes.</div>}
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="whatsapp" titulo={<>💬 Mensajes de WhatsApp</>}>
          <p style={{ fontSize: '0.75rem', color: 'var(--texto-suave)', marginTop: 0 }}>
            Arma el mensaje con las <strong>fichas</strong>: haz clic en una y se inserta donde tengas el cursor. Mira el resultado en la vista previa ➡
            Si dejas un campo vacío se usa el orden por defecto.
          </p>
          <div onFocus={() => setWaSel('stock')}>
            <CampoPlantillaWA label="1) Pedido al detal (con stock)" value={cfg.wa_texto_stock} onChange={v => set('wa_texto_stock', v)}
              placeholder={'{saludo}\nSoy *{cliente}*\n\n🛒 *MI PEDIDO*\n🔖 *{codigo}*\n\n{pedido}\n━━━━━━━━━━━━━━\n💰 *Total: {total}*\n\n{nota}\n\n{cierre}'}
              ayuda="El Nº de pedido ({codigo}) siempre se incluye. El teléfono del cliente no va en WhatsApp (solo se guarda en Correos)." />
          </div>
          <div onFocus={() => setWaSel('sinstock')}>
            <CampoPlantillaWA label="2) Consulta de disponibilidad (agotado)" value={cfg.wa_texto_sin_stock} onChange={v => set('wa_texto_sin_stock', v)}
              tokens={TOKENS_WA.filter(k => k.t !== 'cliente' && k.t !== 'total')}
              placeholder={'{saludo} Quisiera consultar la disponibilidad de:\n\n{pedido}\n\n💬 *¿Cuándo estará disponible?*\n\n{cierre}'}
              ayuda="No incluye nombre del cliente ni total (es una consulta)." />
          </div>
          <div onFocus={() => setWaSel('mayorista')}>
            <CampoPlantillaWA label="3) Pedido mayorista" value={cfg.wa_texto_mayorista} onChange={v => set('wa_texto_mayorista', v)}
              placeholder={'{saludo}\nSoy *{cliente}*, mayorista, y quiero hacer este pedido:\n\n🔖 *{codigo}*\n\n{pedido}\n━━━━━━━━━━━━━━\n💰 *Total: {total}*\n\n{cierre}'}
              ayuda="Se usa cuando el cliente pide desde la zona mayorista. Incluye {codigo}." />
          </div>
          <div onFocus={() => setWaSel('solicitud')}>
            <CampoPlantillaWA label="4) Solicitud para ser mayorista" value={cfg.mayorista_wa_texto} onChange={v => set('mayorista_wa_texto', v)}
              tokens={TOKENS_WA.filter(k => ['saludo', 'cliente', 'tienda', 'cierre'].includes(k.t))} rows={4}
              placeholder={'{saludo}\nSoy *{cliente}* y estoy interesado(a) en ser mayorista. ¿Me comparten los precios al por mayor?'}
              ayuda="Antes de abrir WhatsApp se le pide el nombre al cliente." />
          </div>
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="mayorista" titulo={<>🏷️ Zona mayorista</>}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', margin: '2px 0 10px' }}>
            <input type="checkbox" checked={cfg.mayorista_activo !== false} onChange={e => set('mayorista_activo', e.target.checked)} /> Mostrar invitación a mayoristas
          </label>
          <div className="form-group"><label className="form-label">Mensaje de la barra de invitación</label><input className="form-control" value={cfg.mayorista_mensaje || ''} onChange={e => set('mayorista_mensaje', e.target.value)} placeholder="¿Eres mayorista? Accede a precios especiales por volumen." /></div>
          <div className="form-group" style={{ maxWidth: 320 }}>
            <label className="form-label">Clave de acceso <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(vacío = sin clave)</small></label>
            <input className="form-control" value={cfg.mayorista_clave || ''} onChange={e => set('mayorista_clave', e.target.value)} placeholder="Ej: Mum1Mayor2026" />
          </div>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', margin: '4px 0 10px' }}>
            Pedido mínimo sugerido y envío gratis (mayorista) se configuran por separado en <strong>Envío</strong>.
          </small>

          <div style={{ marginTop: 14, borderTop: '1px solid var(--crema-oscuro)', paddingTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Diseño de la barra de invitación</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <ColorPick label="Fondo de la barra" value={cfg.mayo_invita_color_bg || ''} fallback="#C8A94A" onChange={v => set('mayo_invita_color_bg', v)} onClear={() => set('mayo_invita_color_bg', null)} />
              <ColorPick label="Color del texto" value={cfg.mayo_invita_color_texto || ''} fallback="#1a3a2a" onChange={v => set('mayo_invita_color_texto', v)} onClear={() => set('mayo_invita_color_texto', null)} />
              <ColorPick label="Fondo del botón" value={cfg.mayo_invita_color_btn || ''} fallback="#1a3a2a" onChange={v => set('mayo_invita_color_btn', v)} onClear={() => set('mayo_invita_color_btn', null)} />
              <ColorPick label="Texto del botón" value={cfg.mayo_invita_color_btn_texto || ''} fallback="#F5F0E6" onChange={v => set('mayo_invita_color_btn_texto', v)} onClear={() => set('mayo_invita_color_btn_texto', null)} />
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Tamaño del texto</label>
              <select className="form-control" value={cfg.mayo_invita_tamano || 'sm'} onChange={e => set('mayo_invita_tamano', e.target.value)}>
                <option value="sm">Pequeño</option>
                <option value="md">Mediano</option>
                <option value="lg">Grande</option>
              </select>
            </div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginBottom: 12 }}>Con <strong>Auto</strong> usa la paleta del tema. La tipografía es la fuente de texto del catálogo (Personalizar → Tipografías).</small>

            <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Barra “precios de mayorista” (modo activo)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <ColorPick label="Fondo" value={cfg.mayo_banner_color_bg || ''} fallback="#1a3a2a" onChange={v => set('mayo_banner_color_bg', v)} onClear={() => set('mayo_banner_color_bg', null)} />
              <ColorPick label="Texto" value={cfg.mayo_banner_color_texto || ''} fallback="#F5F0E6" onChange={v => set('mayo_banner_color_texto', v)} onClear={() => set('mayo_banner_color_texto', null)} />
              <ColorPick label="Resalte (palabra clave)" value={cfg.mayo_banner_color_acento || ''} fallback="#C8A94A" onChange={v => set('mayo_banner_color_acento', v)} onClear={() => set('mayo_banner_color_acento', null)} />
            </div>
          </div>

          {base && <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 10 }}>Enlace para mayoristas: <strong>{base}/mayorista</strong></small>}
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 6 }}>El mensaje que se envía por WhatsApp se edita en <strong>Mensajes de WhatsApp → 4)</strong>.</small>
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="ficha" titulo={<>🛒 Ficha de producto</>}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', margin: '2px 0 8px' }}>
            <input type="checkbox" checked={!!cfg.mostrar_mayor} onChange={e => set('mostrar_mayor', e.target.checked)} /> Mostrar precio mayorista en la ficha (modo detal)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', margin: '2px 0 8px' }}>
            <input type="checkbox" checked={cfg.ficha_cta_fijo !== false} onChange={e => set('ficha_cta_fijo', e.target.checked)} /> CTA fijo abajo (diseño Atelier)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', margin: '2px 0 10px' }}>
            <input type="checkbox" checked={cfg.ficha_mostrar_envio !== false} onChange={e => set('ficha_mostrar_envio', e.target.checked)} /> Mostrar bloque de envío en la ficha Atelier
          </label>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Título de relacionados</label>
            <input className="form-control" value={cfg.ficha_titulo_relacionados || ''} onChange={e => set('ficha_titulo_relacionados', e.target.value)} placeholder="Combina bien con" />
          </div>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 8 }}>El estilo visual de la ficha (Clásico / Atelier) se elige en <strong>Personalizar → Colores y diseño</strong>.</small>
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="stock" titulo={<>📦 Avisos de stock</>}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', margin: '2px 0 10px' }}>
            <input type="checkbox" checked={cfg.mostrar_stock !== false} onChange={e => set('mostrar_stock', e.target.checked)} /> Mostrar avisos de urgencia por stock
          </label>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">"Quedan menos de…" si el stock es ≤</label><input type="number" className="form-control" value={cfg.umbral_pocas ?? 10} onChange={e => set('umbral_pocas', parseInt(e.target.value) || 0)} /></div>
            <div className="form-group"><label className="form-label">"¡Solo N disponibles!" si el stock es ≤</label><input type="number" className="form-control" value={cfg.umbral_ultimas ?? 3} onChange={e => set('umbral_ultimas', parseInt(e.target.value) || 0)} /></div>
          </div>
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="popup" titulo={<>🎁 Popup de bienvenida</>}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer', margin: '2px 0 10px' }}>
            <input type="checkbox" checked={!!cfg.popup_activo} onChange={e => set('popup_activo', e.target.checked)} /> Mostrar popup (captura de correo)
          </label>
          <div className="form-group"><label className="form-label">Título</label><input className="form-control" value={cfg.popup_titulo || ''} onChange={e => set('popup_titulo', e.target.value)} placeholder="¡Bienvenido a Mumi!" /></div>
          <div className="form-group"><label className="form-label">Texto</label><input className="form-control" value={cfg.popup_texto || ''} onChange={e => set('popup_texto', e.target.value)} placeholder="Suscríbete y recibe una sorpresa en tu primer pedido." /></div>
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="redes" titulo={<>🔗 Redes sociales</>}>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Instagram</label><input className="form-control" value={cfg.instagram_url || ''} onChange={e => set('instagram_url', e.target.value)} placeholder="https://instagram.com/…" /></div>
            <div className="form-group"><label className="form-label">Facebook</label><input className="form-control" value={cfg.facebook_url || ''} onChange={e => set('facebook_url', e.target.value)} placeholder="https://facebook.com/…" /></div>
            <div className="form-group"><label className="form-label">TikTok</label><input className="form-control" value={cfg.tiktok_url || ''} onChange={e => set('tiktok_url', e.target.value)} placeholder="https://tiktok.com/@…" /></div>
            <div className="form-group"><label className="form-label">YouTube</label><input className="form-control" value={cfg.youtube_url || ''} onChange={e => set('youtube_url', e.target.value)} placeholder="https://youtube.com/@…" /></div>
            <div className="form-group"><label className="form-label">X (Twitter)</label><input className="form-control" value={cfg.x_url || ''} onChange={e => set('x_url', e.target.value)} placeholder="https://x.com/…" /></div>
          </div>
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="contacto" titulo={<>📍 Página de Contacto</>}>
          <div className="form-group"><label className="form-label">Mapa (src del iframe de Google Maps)</label><input className="form-control" value={cfg.contacto_mapa || ''} onChange={e => set('contacto_mapa', e.target.value)} placeholder="https://www.google.com/maps/embed?pb=…" /><small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>En Google Maps → Compartir → Insertar un mapa → copia el valor de <strong>src</strong>.</small></div>
        </PzSec>
      </div>

      {/* Vista previa contextual */}
      <div className="pz-preview">
        <div className="pz-preview-bar"><span><Eye size={14} style={{ verticalAlign: '-2px' }} /> Vista previa</span></div>
        <div className="cfg-preview">
          {sec === 'whatsapp' && <>
            <div className="cfg-tabs">
              {WA_TIPOS.map(t => <button key={t.id} className={waSel === t.id ? 'on' : ''} onClick={() => setWaSel(t.id)}>{t.label}</button>)}
            </div>
            <BurbujaWA texto={mensajeEjemplo(waSel, cfg)} />
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Ejemplo con un pedido de muestra. Así lo verá el cliente en WhatsApp.</small>
          </>}

          {sec === 'popup' && (cfg.popup_activo
            ? <div className="cfg-popup">
                <div style={{ fontSize: '2.4rem' }}>🌿</div>
                <h3 style={{ color: 'var(--selva)', fontSize: '1.25rem', margin: '4px 0' }}>{cfg.popup_titulo || '¡Bienvenido a Mumi!'}</h3>
                <p style={{ color: 'var(--texto-suave)', fontSize: '0.85rem', margin: '0 0 12px' }}>{cfg.popup_texto || 'Suscríbete y recibe una sorpresa en tu primer pedido.'}</p>
                <input className="form-control" placeholder="Tu correo" readOnly />
                <button className="btn btn-primary btn-sm" style={{ marginTop: 8, width: '100%' }}>Quiero mi descuento</button>
                <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)', marginTop: 8, textDecoration: 'underline' }}>No, gracias</div>
              </div>
            : <p className="empty-table">El popup está desactivado.</p>)}

          {sec === 'mayorista' && (cfg.mayorista_activo !== false
            ? <div>
                <div className="cfg-mayo-barra" style={{
                  background: cfg.mayo_invita_color_bg || undefined,
                  color: cfg.mayo_invita_color_texto || undefined,
                  fontSize: cfg.mayo_invita_tamano === 'sm' ? '0.74rem' : cfg.mayo_invita_tamano === 'lg' ? '0.95rem' : '0.8rem',
                }}>
                  <span style={{ flex: 1 }}>{cfg.mayorista_mensaje || '¿Eres mayorista? Accede a precios especiales por volumen.'}</span>
                  <span className="cfg-mayo-btn" style={{
                    background: cfg.mayo_invita_color_btn || undefined,
                    color: cfg.mayo_invita_color_btn_texto || undefined,
                  }}>Quiero ser mayorista</span>
                </div>
                <div className="cfg-mayo-activa" style={{
                  marginTop: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '8px 12px', borderRadius: 8,
                  background: cfg.mayo_banner_color_bg || 'var(--selva)',
                  color: cfg.mayo_banner_color_texto || '#F5F0E6',
                  fontSize: '0.78rem',
                }}>
                  <span>Estás viendo <strong style={{ color: cfg.mayo_banner_color_acento || 'var(--dorado)' }}>precios de mayorista</strong></span>
                  <span style={{ opacity: 0.85, fontWeight: 700 }}>Salir</span>
                </div>
                <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 8 }}>Arriba: invitación. Abajo: barra cuando ya entró como mayorista. {cfg.mayorista_clave ? 'El acceso pedirá clave.' : 'El acceso no pedirá clave.'}</small>
              </div>
            : <p className="empty-table">La invitación a mayoristas está desactivada.</p>)}

          {sec === 'stock' && (cfg.mostrar_stock !== false
            ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div><span className="cfg-badge rojo">🔥 ¡Solo {cfg.umbral_ultimas ?? 3} disponibles!</span> <small style={{ color: 'var(--texto-suave)' }}>stock ≤ {cfg.umbral_ultimas ?? 3}</small></div>
                <div><span className="cfg-badge ambar">🔥 Quedan menos de {cfg.umbral_pocas ?? 10}</span> <small style={{ color: 'var(--texto-suave)' }}>stock ≤ {cfg.umbral_pocas ?? 10}</small></div>
                <div><span className="cfg-badge gris">Agotado</span> <small style={{ color: 'var(--texto-suave)' }}>stock 0</small></div>
              </div>
            : <p className="empty-table">Los avisos de stock están ocultos.</p>)}

          {sec === 'redes' && (() => {
            const redes = [['Instagram', cfg.instagram_url], ['Facebook', cfg.facebook_url], ['TikTok', cfg.tiktok_url], ['YouTube', cfg.youtube_url], ['X', cfg.x_url]].filter(([, u]) => u)
            return redes.length
              ? <div><div className="cfg-footer-demo">{redes.map(([n]) => <span key={n}>{n}</span>)}</div><small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Solo se muestran las redes con enlace.</small></div>
              : <p className="empty-table">Aún no has agregado redes sociales.</p>
          })()}

          {sec === 'contacto' && (cfg.contacto_mapa
            ? <div style={{ aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden' }}><iframe src={cfg.contacto_mapa} title="Mapa" style={{ width: '100%', height: '100%', border: 0 }} /></div>
            : <p className="empty-table">Sin mapa configurado.</p>)}

          {sec === 'envio' && (() => {
            const pedidoOn = !!cfg.envio_umbral_activo
            const gratisOn = !!cfg.envio_gratis_barra_activo
            if (!pedidoOn && !gratisOn) {
              return <p className="empty-table">Enciende la barra de <strong>pedido mínimo</strong> y/o la de <strong>envío gratis</strong> para previsualizarlas (son independientes).</p>
            }
            const pedidoMin = montoCOP(umbralPrevMayo ? cfg.mayorista_pedido_minimo : cfg.pedido_minimo)
            const envioGratis = montoCOP(umbralPrevMayo ? cfg.envio_gratis_mayorista : cfg.envio_gratis_desde)
            // Escala del slider = la meta MÁS ALTA (no la suma). Cada barra usa su propia meta.
            const metaMax = Math.max(pedidoOn ? pedidoMin : 0, gratisOn ? envioGratis : 0, 1)
            const totalSim = umbralPrevTotal != null ? montoCOP(umbralPrevTotal) : Math.round(metaMax * 0.4)
            const barPedido = previewBarraPedido(cfg, totalSim, umbralPrevMayo)
            const barGratis = previewBarraGratis(cfg, totalSim, umbralPrevMayo)
            const barrasUbi = [
              barPedido && { estado: barPedido, tono: 'pedido' },
              barGratis && { estado: barGratis, tono: 'gratis' },
            ].filter(Boolean)
            return (
              <div>
                <div className="cfg-tabs" style={{ marginBottom: 10 }}>
                  <button type="button" className={!umbralPrevMayo ? 'on' : ''} onClick={() => { setUmbralPrevMayo(false); setUmbralPrevTotal(null) }}>Detal</button>
                  <button type="button" className={umbralPrevMayo ? 'on' : ''} onClick={() => { setUmbralPrevMayo(true); setUmbralPrevTotal(null) }}>Mayorista</button>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label className="form-label">Total del carrito (simulado): {fCOP(totalSim)}</label>
                  <input
                    type="range" min={0} max={Math.max(metaMax, 1000)} step={1000}
                    value={Math.min(totalSim, Math.max(metaMax, 1000))}
                    onChange={e => setUmbralPrevTotal(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <small style={{ color: 'var(--texto-suave)', fontSize: '0.7rem', display: 'block', marginTop: 4 }}>
                    Cada barra resta por su cuenta: <em>su meta − este total</em>. No se suman las metas entre sí.
                  </small>
                </div>
                {pedidoOn && !barPedido && <p className="empty-table" style={{ marginBottom: 8 }}>Pedido mínimo: define un monto &gt; 0 para {umbralPrevMayo ? 'mayorista' : 'detal'}.</p>}
                {gratisOn && !barGratis && <p className="empty-table" style={{ marginBottom: 8 }}>Envío gratis: define un monto &gt; 0 para {umbralPrevMayo ? 'mayorista' : 'detal'}.</p>}
                <PrevBarraMini
                  estado={barPedido}
                  titulo="Cálculo · Pedido mínimo"
                  tono="pedido"
                  formula={barPedido ? `${fCOP(barPedido.meta)} − ${fCOP(barPedido.total)} = faltan ${fCOP(barPedido.falta)}` : null}
                />
                <PrevBarraMini
                  estado={barGratis}
                  titulo="Cálculo · Envío gratis"
                  tono="gratis"
                  formula={barGratis ? `${fCOP(barGratis.meta)} − ${fCOP(barGratis.total)} = faltan ${fCOP(barGratis.falta)}` : null}
                />
                <PrevUbicacionBarras barras={barrasUbi} />
              </div>
            )
          })()}

          {(sec === 'general' || !sec) && (
            <div style={{ fontSize: '0.85rem', color: 'var(--texto-suave)', lineHeight: 1.7 }}>
              <div><strong>Catálogo:</strong> {base || '— sin URL —'}</div>
              <div><strong>WhatsApp:</strong> {cfg.whatsapp || '—'}</div>
              <div><strong>País:</strong> {cfg.pais || '—'}</div>
              <p style={{ marginTop: 10 }}>Abre una sección para ver su vista previa. Pedido mínimo y envío gratis se configuran en <strong>Envío</strong> (por separado).</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ==================== PERSONALIZAR ====================
const SECCIONES_DEFAULT = [
  { id: 'hero', on: true }, { id: 'novedades', on: true }, { id: 'categorias', on: true },
  { id: 'frutos', on: true }, { id: 'newsletter', on: true },
]
const SECCION_LABEL = { hero: '🖼️ Banner principal (hero)', novedades: '✨ Novedades', categorias: '🛍️ Productos por categoría', frutos: '🌿 Frutos que nos inspiran', newsletter: '✉️ Suscripción (newsletter)' }
// Familia web: atelier = layout completo; todo lo demás = catálogo clásico
const familiaWeb = (diseno) => ((diseno || 'selva') === 'atelier' ? 'atelier' : 'clasico')

// Formas del catálogo clásico (bordes/botones). No aplica cuando la plantilla web es Atelier.
const ESTILOS_FORMA = [
  { id: 'selva', nombre: 'Selva', desc: 'Redondeado suave (clásico)', radio: 12, radioMini: 4 },
  { id: 'editorial', nombre: 'Editorial', desc: 'Elegante, esquinas rectas, líneas finas', radio: 0, radioMini: 0 },
  { id: 'organico', nombre: 'Orgánico', desc: 'Muy redondeado, botones píldora, suave', radio: 20, radioMini: 8 },
]

// Las 2 plantillas web (estructura del sitio: inicio, ficha, menú). Independientes del color.
const PLANTILLAS_WEB = [
  {
    id: 'clasico',
    nombre: 'Clásico Mumi',
    desc: 'Catálogo clásico: hero, categorías y ficha tradicional',
    payload: {
      diseno: 'selva', plantilla: 'amazonia', color_primario: '#1a3a2a', color_secundario: '#C8A94A', color_fondo: '#F5F0E8',
      fuente_titulos: 'Playfair Display', fuente_subtitulos: 'Source Sans 3', fuente_texto: 'Source Sans 3',
      ficha_cta_fijo: false, ficha_mostrar_envio: true, ficha_titulo_relacionados: 'También te puede gustar',
    },
  },
  {
    id: 'atelier',
    nombre: 'Atelier Amazonía',
    desc: 'Layout completo: hero de marca, cosecha, impacto y ficha Atelier',
    payload: {
      diseno: 'atelier', plantilla: 'amazonia', color_primario: '#1A3A2A', color_secundario: '#CFB360', color_fondo: '#FAF9F6',
      fuente_titulos: 'Libre Caslon Text', fuente_subtitulos: 'Source Sans 3', fuente_texto: 'Source Sans 3',
      ficha_cta_fijo: true, ficha_mostrar_envio: true, ficha_titulo_relacionados: 'Combina bien con',
      mostrar_filtro_frutos: true, barra_activa: false,
      titulo_banner: 'Sabiduría de la selva, en cada sorbo.',
      subtitulo: 'Infusiones y superalimentos amazónicos, con respeto por la tierra y las comunidades.',
      hero_cta_texto: 'Explorar catálogo', hero_cta_link: '/tienda',
      hero_cta2_texto: 'Nuestra historia', hero_mostrar_cta2: true,
      impacto_activo: true, impacto_titulo: 'Impacto que florece',
      impacto_texto: 'Cada producto apoya a comunidades recolectoras de la Amazonía colombiana: comercio justo y conservación de la biodiversidad.',
      impacto_stat1_n: '45+', impacto_stat1_l: 'Productores', impacto_stat2_n: '10', impacto_stat2_l: 'Departamentos',
      impacto_link_texto: 'Conoce más',
      cosecha_eyebrow: 'Productos destacados', cosecha_titulo: 'Nuestra cosecha',
      frutos_filtro_titulo: 'Explora por ingrediente',
    },
  },
]

// Campos que se guardan al crear un “diseño guardado” (combinación plantilla + color + fuentes…)
const CAMPOS_DISENO_GUARDADO = [
  'diseno', 'plantilla', 'color_primario', 'color_secundario', 'color_fondo',
  'fuente_titulos', 'fuente_subtitulos', 'fuente_texto',
  'ficha_cta_fijo', 'ficha_mostrar_envio', 'ficha_titulo_relacionados', 'mostrar_mayor',
]

// Máx. 6 paletas. Roles UX: primario (marca) + acento + fondo de página (no triada decorativa).
const PALETAS_COLOR = [
  { id: 'amazonia', nombre: 'Amazonia', primario: '#1a3a2a', secundario: '#C8A94A', fondo: '#F5F0E8' },
  { id: 'noche', nombre: 'Noche selva', primario: '#0f261b', secundario: '#d9bd63', fondo: '#F5F0E8' },
  { id: 'tierra', nombre: 'Tierra', primario: '#5c3d2e', secundario: '#d99a4e', fondo: '#F7F1E8' },
  { id: 'oceano', nombre: 'Océano', primario: '#0e5a6e', secundario: '#3fb8c0', fondo: '#F2F7F8' },
  { id: 'nieve', nombre: 'Nieve & oro', primario: '#faf9f7', secundario: '#a67c2a', fondo: '#faf9f7' },
  { id: 'papel', nombre: 'Papel & tinta', primario: '#ffffff', secundario: '#3d4a54', fondo: '#ffffff' },
]

// Editor de chips de texto simples (para la barra de beneficios)
function ChipsTexto({ valores = [], onChange, placeholder }) {
  const [input, setInput] = useState('')
  const add = () => { const v = input.trim(); if (v) onChange([...valores, v]); setInput('') }
  const del = (i) => onChange(valores.filter((_, k) => k !== i))
  const mover = (i, d) => { const a = [...valores]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: valores.length ? 8 : 0 }}>
        <input className="form-control" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder={placeholder} />
        <button type="button" className="btn btn-secondary" onClick={add}><Plus size={16} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {valores.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'var(--crema)', borderRadius: 8, fontSize: '0.84rem' }}>
            <span style={{ flex: 1 }}>{v}</span>
            <button type="button" className="btn btn-xs btn-secondary" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp size={12} /></button>
            <button type="button" className="btn btn-xs btn-secondary" disabled={i === valores.length - 1} onClick={() => mover(i, 1)}><ChevronDown size={12} /></button>
            <button type="button" className="btn btn-xs btn-danger" onClick={() => del(i)}><X size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

// Editor de la barra de beneficios: cada ítem tiene texto + icono opcional (o punto)
function BarraItemsEditor({ items = [], onChange }) {
  const norm = items.map(it => typeof it === 'string' ? { texto: it, icono: '' } : it)
  const upd = (i, campo, val) => onChange(norm.map((it, k) => k === i ? { ...it, [campo]: val } : it))
  const add = () => onChange([...norm, { texto: '', icono: '' }])
  const del = (i) => onChange(norm.filter((_, k) => k !== i))
  const mover = (i, d) => { const a = [...norm]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {norm.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 30, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--selva)', flexShrink: 0 }}><BIcon name={it.icono} /></span>
            <Select className="form-control" style={{ width: 130, flexShrink: 0 }} value={it.icono || ''} onChange={e => upd(i, 'icono', e.target.value)}>
              <option value="">• (punto)</option>
              {BENEFIT_ICONS.map(o => <option key={o.n} value={o.n}>{o.l}</option>)}
            </Select>
            <input className="form-control" style={{ flex: 1 }} value={it.texto} onChange={e => upd(i, 'texto', e.target.value)} placeholder="Texto del beneficio" />
            <button type="button" className="btn btn-xs btn-secondary" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp size={12} /></button>
            <button type="button" className="btn btn-xs btn-secondary" disabled={i === norm.length - 1} onClick={() => mover(i, 1)}><ChevronDown size={12} /></button>
            <button type="button" className="btn btn-xs btn-danger" onClick={() => del(i)}><X size={12} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-xs btn-secondary" style={{ marginTop: 8 }} onClick={add}><Plus size={12} /> Agregar beneficio</button>
    </div>
  )
}

// ---- Navegación por rutas del árbol de bloques (usado por el editor en el lienzo) ----
// ruta: [i] | [i,'caja',j] | [i,{col:ci},j]
function walkParentCat(tree, ruta) {
  let arr = tree, p = 0
  while (p < ruta.length - 1) {
    const el = arr[ruta[p]]; const key = ruta[p + 1]
    if (key === 'caja') arr = el.bloques || (el.bloques = [])
    else if (key && key.col != null) arr = el.columnas[key.col].bloques || (el.columnas[key.col].bloques = [])
    else break
    p += 2
  }
  return { arr, idx: ruta[ruta.length - 1] }
}
const bloqueEnRuta = (tree, ruta) => { try { const { arr, idx } = walkParentCat(tree, ruta); return arr[idx] } catch { return null } }
const setBloqueEnRuta = (tree, ruta, nb) => { const t = JSON.parse(JSON.stringify(tree)); const { arr, idx } = walkParentCat(t, ruta); arr[idx] = nb; return t }

// Bloque nuevo por tipo (usado por el editor de bloques y por el editor en el lienzo)
function nuevoBloque(tipo) {
  const N = {
    titulo: { tipo: 'titulo', texto: 'Nuevo título' }, parrafo: { tipo: 'parrafo', html: 'Escribe aquí…' }, imagen: { tipo: 'imagen', url: '', pie: '' },
    boton: { tipo: 'boton', texto: 'Botón', destino: '' }, galeria: { tipo: 'galeria', titulo: '', subtitulo: '', imagenes: [] },
    video: { tipo: 'video', url: '', titulo: '' }, fila: { tipo: 'fila', columnas: [{ ancho: 'auto', bloques: [] }, { ancho: 'auto', bloques: [] }] },
  }
  return JSON.parse(JSON.stringify(N[tipo] || N.parrafo))
}

// Constructor de bloques (título, párrafo, imagen, botón, galería/álbum, video, fila/columnas)
function EditorNosotros({ bloques = [], onChange, toast, paginas = [], sinFila = false }) {
  const [cropTarget, setCropTarget] = useState(null)   // { i } imagen suelta | { i, gi } imagen de galería
  const [cropFile, setCropFile] = useState(null)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const [estIdx, setEstIdx] = useState(null)           // bloque con panel de estilo abierto
  const [abierto, setAbierto] = useState(null)         // bloque expandido (acordeón); null = todos comprimidos
  // Resumen corto de cada bloque para verlo comprimido
  const resumen = (b) => {
    const t = (s) => { const x = String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); return x.length > 46 ? x.slice(0, 46) + '…' : x }
    if (b.tipo === 'titulo') return t(b.texto) || '(sin texto)'
    if (b.tipo === 'parrafo') return t(b.html || b.texto) || '(vacío)'
    if (b.tipo === 'imagen') return b.url ? (t(b.pie) || 'con imagen') : 'sin imagen'
    if (b.tipo === 'boton') return `${t(b.texto) || '(sin texto)'} → ${b.destino || '—'}`
    if (b.tipo === 'video') return b.url ? `${b.red || 'auto'} · ${t(b.url)}` : 'sin enlace'
    if (b.tipo === 'galeria') return `${(b.imagenes || []).length} foto(s)${b.titulo ? ` · ${t(b.titulo)}` : ''}`
    if (b.tipo === 'caja') return `${(b.bloques || []).length} elemento(s)`
    if (b.tipo === 'fila') return `${(b.columnas || []).length} columna(s)`
    return ''
  }
  const upd = (i, campo, val) => onChange(bloques.map((b, k) => k === i ? { ...b, [campo]: val } : b))
  const updEst = (i, campo, val) => onChange(bloques.map((b, k) => k === i ? { ...b, estilo: { ...(b.estilo || {}), [campo]: val } } : b))
  const NUEVO = {
    titulo: { tipo: 'titulo', texto: '' }, parrafo: { tipo: 'parrafo', html: '' }, imagen: { tipo: 'imagen', url: '', pie: '' },
    boton: { tipo: 'boton', texto: '', destino: '' }, galeria: { tipo: 'galeria', titulo: '', subtitulo: '', imagenes: [] },
    video: { tipo: 'video', url: '', titulo: '' }, fila: { tipo: 'fila', columnas: [{ ancho: 'auto', bloques: [] }, { ancho: 'auto', bloques: [] }] },
    caja: { tipo: 'caja', bloques: [], estilo: {} },
  }
  const add = (tipo) => { onChange([...bloques, JSON.parse(JSON.stringify(NUEVO[tipo]))]); setAbierto(bloques.length) }
  // Columnas de una fila
  const colUpd = (i, ci, campo, val) => upd(i, 'columnas', (bloques[i].columnas || []).map((c, k) => k === ci ? { ...c, [campo]: val } : c))
  const colAdd = (i) => (bloques[i].columnas || []).length < 4 && upd(i, 'columnas', [...(bloques[i].columnas || []), { ancho: 'auto', bloques: [] }])
  const colDel = (i, ci) => upd(i, 'columnas', (bloques[i].columnas || []).filter((_, k) => k !== ci))
  const del = (i) => onChange(bloques.filter((_, k) => k !== i))
  const mover = (i, d) => { const a = [...bloques]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  const soltar = (to) => {
    if (dragIdx === null || dragIdx === to) { setDragIdx(null); setOverIdx(null); return }
    const a = [...bloques]; const [m] = a.splice(dragIdx, 1); a.splice(to, 0, m)
    onChange(a); setDragIdx(null); setOverIdx(null)
  }
  // Galería: helpers
  const galAdd = (i) => upd(i, 'imagenes', [...(bloques[i].imagenes || []), { url: '', titulo: '', subtitulo: '' }])
  const galUpd = (i, gi, campo, val) => upd(i, 'imagenes', (bloques[i].imagenes || []).map((im, k) => k === gi ? { ...im, [campo]: val } : im))
  const galDel = (i, gi) => upd(i, 'imagenes', (bloques[i].imagenes || []).filter((_, k) => k !== gi))
  const subir = async (blob) => {
    try {
      const path = `catalogo/pagina_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      const url = data.publicUrl
      if (cropTarget.gi != null) galUpd(cropTarget.i, cropTarget.gi, 'url', url)
      else upd(cropTarget.i, 'url', url)
    } catch (e) { toast('No se pudo subir: ' + e.message, 'error') }
  }
  const pedirImagen = (target, file) => { setCropTarget(target); setCropFile(file) }
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {['titulo', 'parrafo', 'imagen', 'boton', 'galeria', 'video', 'caja', ...(sinFila ? [] : ['fila'])].map(t =>
          <button key={t} type="button" className="btn btn-xs btn-secondary" onClick={() => add(t)}><Plus size={12} /> {t === 'galeria' ? 'Galería' : t === 'fila' ? 'Fila/columnas' : t === 'caja' ? 'Caja' : t.charAt(0).toUpperCase() + t.slice(1)}</button>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bloques.length === 0 && <small style={{ color: 'var(--texto-suave)' }}>Aún no hay bloques. Usa los botones de arriba.</small>}
        {bloques.map((b, i) => (
          <div key={i}
            onDragOver={(e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i) }}
            onDrop={() => soltar(i)}
            style={{ border: overIdx === i && dragIdx !== null ? '2px dashed var(--selva)' : '1px solid var(--crema-oscuro)', borderRadius: 10, padding: 10, opacity: dragIdx === i ? 0.5 : 1, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span draggable onDragStart={() => setDragIdx(i)} onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                title="Arrastra para reordenar" style={{ cursor: 'grab', color: 'var(--texto-suave)', display: 'inline-flex' }}><GripVertical size={16} /></span>
              <button type="button" onClick={() => setAbierto(abierto === i ? null : i)}
                style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
                <ChevronDown size={13} style={{ flexShrink: 0, color: 'var(--texto-suave)', transform: abierto === i ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                <strong style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--texto-suave)', flexShrink: 0 }}>{b.tipo}</strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--texto)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumen(b)}</span>
              </button>
              <button type="button" className={`btn btn-xs ${estIdx === i ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setEstIdx(estIdx === i ? null : i)} title="Estilo">⚙</button>
              <button type="button" className="btn btn-xs btn-secondary" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp size={12} /></button>
              <button type="button" className="btn btn-xs btn-secondary" disabled={i === bloques.length - 1} onClick={() => mover(i, 1)}><ChevronDown size={12} /></button>
              <button type="button" className="btn btn-xs btn-danger" onClick={() => del(i)}><Trash2 size={12} /></button>
            </div>
            {abierto === i && <>
            {estIdx === i && (() => { const es = b.estilo || {}; return (
              <div style={{ background: 'var(--crema)', borderRadius: 8, padding: 8, marginBottom: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: '0.78rem' }}>
                <label>Fondo<input type="color" style={{ width: '100%', height: 28 }} value={es.bg || '#ffffff'} onChange={e => updEst(i, 'bg', e.target.value)} /></label>
                <label>Texto<input type="color" style={{ width: '100%', height: 28 }} value={es.color || '#1a1a1a'} onChange={e => updEst(i, 'color', e.target.value)} /></label>
                <label>Radio<input type="number" className="form-control" style={{ padding: '3px 6px' }} value={es.radio ?? ''} onChange={e => updEst(i, 'radio', e.target.value)} placeholder="px" /></label>
                <label>Esp. vert.<input type="number" className="form-control" style={{ padding: '3px 6px' }} value={es.padY ?? ''} onChange={e => updEst(i, 'padY', e.target.value)} placeholder="px" /></label>
                <label>Esp. horiz.<input type="number" className="form-control" style={{ padding: '3px 6px' }} value={es.padX ?? ''} onChange={e => updEst(i, 'padX', e.target.value)} placeholder="px" /></label>
                <label>Fuente<input type="number" className="form-control" style={{ padding: '3px 6px' }} value={es.fontSize ?? ''} onChange={e => updEst(i, 'fontSize', e.target.value)} placeholder="px" /></label>
                <button type="button" className="btn btn-xs btn-secondary" style={{ gridColumn: '1 / -1' }} onClick={() => upd(i, 'estilo', {})}>Limpiar estilo</button>
              </div>
            ) })()}
            {b.tipo === 'fila' && (
              <div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(b.columnas || []).map((c, ci) => (
                    <div key={ci} style={{ flex: '1 1 220px', minWidth: 200, border: '1px dashed var(--crema-oscuro)', borderRadius: 8, padding: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <strong style={{ flex: 1, fontSize: '0.72rem', color: 'var(--texto-suave)' }}>Columna {ci + 1}</strong>
                        <Select className="form-control" style={{ width: 'auto', padding: '2px 6px', fontSize: '0.74rem' }} value={c.ancho || 'auto'} onChange={e => colUpd(i, ci, 'ancho', e.target.value)}>
                          <option value="auto">Auto</option><option value="3">1/4</option><option value="4">1/3</option><option value="6">1/2</option><option value="8">2/3</option><option value="9">3/4</option>
                        </Select>
                        {(b.columnas || []).length > 1 && <button type="button" className="btn btn-xs btn-danger" onClick={() => colDel(i, ci)}><X size={11} /></button>}
                      </div>
                      <EditorNosotros bloques={c.bloques || []} onChange={(bl) => colUpd(i, ci, 'bloques', bl)} toast={toast} paginas={paginas} sinFila />
                    </div>
                  ))}
                </div>
                {(b.columnas || []).length < 4 && <button type="button" className="btn btn-xs btn-secondary" style={{ marginTop: 8 }} onClick={() => colAdd(i)}><Plus size={12} /> Agregar columna</button>}
              </div>
            )}
            {b.tipo === 'caja' && (
              <div style={{ border: '1px dashed var(--crema-oscuro)', borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)', marginBottom: 4 }}>Contenido de la caja:</div>
                <EditorNosotros bloques={b.bloques || []} onChange={(bl) => upd(i, 'bloques', bl)} toast={toast} paginas={paginas} />
              </div>
            )}
            {b.tipo !== 'galeria' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', border: '1px solid var(--crema-oscuro)', borderRadius: 8, overflow: 'hidden' }}>
                  {[['left', '⯇', 'izquierda'], ['center', '≡', 'centro'], ['right', '⯈', 'derecha'], ...(b.tipo === 'parrafo' ? [['justify', '☰', 'justificado']] : [])].map(([a, ic, lbl]) => {
                    const act = (b.align || (b.tipo === 'titulo' ? 'center' : 'left')) === a
                    return <button key={a} type="button" onClick={() => upd(i, 'align', a)} title={`Alinear ${lbl}`}
                      style={{ border: 'none', padding: '4px 10px', cursor: 'pointer', background: act ? 'var(--selva)' : '#fff', color: act ? '#fff' : 'var(--texto)' }}>{ic}</button>
                  })}
                </div>
                <Select className="form-control" style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }} value={b.ancho || 'full'} onChange={e => upd(i, 'ancho', e.target.value)}>
                  <option value="narrow">Ancho: estrecho</option>
                  <option value="medio">Ancho: medio</option>
                  <option value="full">Ancho: completo</option>
                </Select>
                {b.tipo === 'titulo' && <label style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}><input type="checkbox" checked={!!b.grande} onChange={e => upd(i, 'grande', e.target.checked)} /> Grande</label>}
              </div>
            )}
            {b.tipo === 'titulo' && <input className="form-control" value={b.texto || ''} onChange={e => upd(i, 'texto', e.target.value)} placeholder="Título de la sección" />}
            {b.tipo === 'parrafo' && <RichEditor value={b.html || ''} onChange={(html) => upd(i, 'html', html)} />}
            {b.tipo === 'imagen' && (
              <div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                  {b.url ? <img src={b.url} alt="" style={{ width: 90, height: 52, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 90, height: 52, borderRadius: 6, background: 'var(--crema)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--texto-suave)', fontSize: '0.7rem' }}>Sin imagen</div>}
                  <label className="btn btn-xs btn-secondary" style={{ cursor: 'pointer' }}><Upload size={12} /> Subir<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) pedirImagen({ i }, f); e.target.value = '' }} /></label>
                </div>
                <input className="form-control" value={b.pie || ''} onChange={e => upd(i, 'pie', e.target.value)} placeholder="Pie de foto (opcional)" />
              </div>
            )}
            {b.tipo === 'boton' && (
              <div className="form-grid-2">
                <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Texto del botón</label><input className="form-control" value={b.texto || ''} onChange={e => upd(i, 'texto', e.target.value)} placeholder="Ej: Conoce nuestra galería" /></div>
                <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Destino</label>
                  <Select className="form-control" value={(paginas.some(p => `/p/${p.slug}` === b.destino)) ? b.destino : '__url'} onChange={e => upd(i, 'destino', e.target.value === '__url' ? '' : e.target.value)}>
                    {paginas.map(p => <option key={p.slug} value={`/p/${p.slug}`}>Página: {p.titulo}</option>)}
                    <option value="__url">Enlace externo (URL)…</option>
                  </Select>
                  {!paginas.some(p => `/p/${p.slug}` === b.destino) && <input className="form-control" style={{ marginTop: 6 }} value={b.destino || ''} onChange={e => upd(i, 'destino', e.target.value)} placeholder="https://…" />}
                </div>
              </div>
            )}
            {b.tipo === 'video' && <CamposVideo b={b} set={(k, v) => upd(i, k, v)} />}
            {b.tipo === 'galeria' && (
              <div>
                <div className="form-grid-2">
                  <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Título del álbum</label><input className="form-control" value={b.titulo || ''} onChange={e => upd(i, 'titulo', e.target.value)} placeholder="Ej: Nuestra cosecha" /></div>
                  <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Subtítulo</label><input className="form-control" value={b.subtitulo || ''} onChange={e => upd(i, 'subtitulo', e.target.value)} /></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(b.imagenes || []).map((im, gi) => (
                    <div key={gi} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 6, background: 'var(--crema)', borderRadius: 8 }}>
                      {im.url ? <img src={im.url} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} /> : <div style={{ width: 46, height: 46, borderRadius: 6, background: '#fff', flexShrink: 0 }} />}
                      <label className="btn btn-xs btn-secondary" style={{ cursor: 'pointer', flexShrink: 0 }}><Upload size={12} /><input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) pedirImagen({ i, gi }, f); e.target.value = '' }} /></label>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input className="form-control" style={{ padding: '4px 8px' }} value={im.titulo || ''} onChange={e => galUpd(i, gi, 'titulo', e.target.value)} placeholder="Título" />
                        <input className="form-control" style={{ padding: '4px 8px' }} value={im.subtitulo || ''} onChange={e => galUpd(i, gi, 'subtitulo', e.target.value)} placeholder="Subtítulo" />
                      </div>
                      <button type="button" className="btn btn-xs btn-danger" onClick={() => galDel(i, gi)}><X size={12} /></button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-xs btn-secondary" style={{ marginTop: 6 }} onClick={() => galAdd(i)}><Plus size={12} /> Agregar foto</button>
              </div>
            )}
            </>}
          </div>
        ))}
      </div>
      {cropFile && <ImageCropper file={cropFile} aspect={cropTarget?.gi != null ? 1 : 16 / 9} salidaW={cropTarget?.gi != null ? 900 : 1200} salidaH={cropTarget?.gi != null ? 900 : 675} onCancel={() => { setCropFile(null); setCropTarget(null) }} onCropped={(blob) => { subir(blob); setCropFile(null); setCropTarget(null) }} />}
    </div>
  )
}

// Gestor de páginas personalizadas (galería, etc.). Cada página tiene sus propios bloques.
const slugCat = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
function PaginasEditor({ paginas = [], onChange, toast, lienzo, onLienzo }) {
  const [edit, setEdit] = useState(null)   // índice en edición
  const upd = (i, campo, val) => onChange(paginas.map((p, k) => k === i ? { ...p, [campo]: val } : p))
  const add = () => { onChange([...paginas, { id: 'p' + Date.now(), titulo: 'Nueva página', slug: 'pagina-' + (paginas.length + 1), oculta: false, bloques: [] }]); setEdit(paginas.length) }
  const del = (i) => { if (!window.confirm('¿Eliminar esta página?')) return; onChange(paginas.filter((_, k) => k !== i)); setEdit(null) }
  return (
    <div>
      <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Crea páginas como una <strong>galería</strong>. Quedan <strong>ocultas</strong> del menú hasta que las marques como visibles (aun ocultas se puede llegar con un botón/enlace).</small>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0' }}>
        {paginas.length === 0 && <small style={{ color: 'var(--texto-suave)' }}>Aún no hay páginas.</small>}
        {paginas.map((p, i) => (
          <div key={p.id || i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--crema-oscuro)', borderRadius: 10 }}>
              <strong style={{ flex: 1 }}>{p.titulo || '(sin título)'} <small style={{ fontWeight: 400, color: 'var(--texto-suave)' }}>/p/{p.slug}</small></strong>
              <button type="button" className={`btn btn-xs ${p.oculta ? 'btn-secondary' : 'btn-success'}`} onClick={() => upd(i, 'oculta', !p.oculta)} title={p.oculta ? 'Oculta (clic para mostrar en el menú)' : 'Visible en el menú'}>{p.oculta ? <><EyeOff size={12} /> Oculta</> : <><Eye size={12} /> Visible</>}</button>
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => setEdit(edit === i ? null : i)}><Pencil size={12} /></button>
              <button type="button" className="btn btn-xs btn-danger" onClick={() => del(i)}><Trash2 size={12} /></button>
            </div>
            {edit === i && (
              <div style={{ border: '1px solid var(--crema-oscuro)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: 10 }}>
                <div className="form-grid-2">
                  <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Título</label><input className="form-control" value={p.titulo || ''} onChange={e => { const t = e.target.value; upd(i, 'titulo', t) }} /></div>
                  <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Dirección (slug)</label><input className="form-control" value={p.slug || ''} onChange={e => upd(i, 'slug', slugCat(e.target.value))} placeholder="galeria" /></div>
                </div>
                <div className="form-group" style={{ marginBottom: 6 }}>
                  <label className="form-label">SEO — Título (opcional)</label>
                  <input className="form-control" value={p.seo_titulo || ''} maxLength={70} onChange={e => upd(i, 'seo_titulo', e.target.value)} placeholder={p.titulo || 'Título en Google'} />
                </div>
                <div className="form-group" style={{ marginBottom: 6 }}>
                  <label className="form-label">SEO — Descripción</label>
                  <textarea className="form-control" rows={2} value={p.seo_desc || ''} maxLength={200} onChange={e => upd(i, 'seo_desc', e.target.value)} placeholder="Cómo aparece esta página en Google y al compartir…" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <label className="form-label" style={{ margin: 0, flex: 1 }}>Contenido</label>
                  {onLienzo && p.slug && <button type="button" className={`btn btn-xs pz-solo-pc ${lienzo === `pagina:${p.slug}` ? 'btn-danger' : 'btn-primary'}`} onClick={() => onLienzo(`pagina:${p.slug}`)}>{lienzo === `pagina:${p.slug}` ? '✕ Salir del lienzo' : <><Pencil size={12} /> Editar en el lienzo</>}</button>}
                  <small className="pz-aviso-movil">🖥️ Lienzo solo en escritorio.</small>
                </div>
                {lienzo === `pagina:${p.slug}`
                  ? <div style={{ background: 'color-mix(in srgb, var(--selva) 10%, #fff)', border: '1px solid var(--selva)', borderRadius: 8, padding: '10px 12px', fontSize: '0.82rem', color: 'var(--selva)' }}>✏️ <strong>Editando en el lienzo.</strong> Edita esta página directamente sobre la vista previa. Sal del lienzo para volver a la edición por panel.</div>
                  : <EditorNosotros bloques={p.bloques || []} onChange={(bl) => upd(i, 'bloques', bl)} toast={toast} paginas={paginas} />}
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm btn-primary" onClick={add}><Plus size={13} /> Nueva página</button>
    </div>
  )
}

// Editor de la galería: álbumes de imágenes (multi-subida, sin recorte) y videos
function GaleriaEditor({ albumes = [], onChange, toast }) {
  const [subiendo, setSubiendo] = useState(false)
  const [videoUrl, setVideoUrl] = useState({})   // borrador de URL de video por álbum
  const upd = (i, campo, val) => onChange(albumes.map((a, k) => k === i ? { ...a, [campo]: val } : a))
  const add = () => onChange([...albumes, { id: 'a' + Date.now(), titulo: 'Nuevo álbum', subtitulo: '', tamano: 'md', items: [] }])
  const del = (i) => { if (!window.confirm('¿Eliminar este álbum?')) return; onChange(albumes.filter((_, k) => k !== i)) }
  const moverAlbum = (i, d) => { const a = [...albumes]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  const itemsSet = (i, items) => upd(i, 'items', items)
  const delItem = (i, k) => itemsSet(i, (albumes[i].items || []).filter((_, x) => x !== k))
  const subirFotos = async (i, files) => {
    setSubiendo(true)
    try {
      const nuevos = []
      for (const f of files) {
        const path = `catalogo/galeria_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`
        const { error } = await supabase.storage.from('product-images').upload(path, f, { upsert: true, contentType: f.type || 'image/jpeg' })
        if (error) throw error
        const { data } = supabase.storage.from('product-images').getPublicUrl(path)
        nuevos.push({ tipo: 'imagen', url: data.publicUrl })
      }
      itemsSet(i, [...(albumes[i].items || []), ...nuevos])
    } catch (e) { toast('No se pudieron subir: ' + e.message, 'error') } finally { setSubiendo(false) }
  }
  const addVideo = (i) => { const u = (videoUrl[i] || '').trim(); if (!u) return; itemsSet(i, [...(albumes[i].items || []), { tipo: 'video', url: u }]); setVideoUrl(v => ({ ...v, [i]: '' })) }
  return (
    <div>
      <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Crea álbumes de fotos y videos. Selecciona varias imágenes a la vez (no se recortan). Los álbumes se muestran tipo Pinterest.</small>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '10px 0' }}>
        {albumes.length === 0 && <small style={{ color: 'var(--texto-suave)' }}>Aún no hay álbumes.</small>}
        {albumes.map((al, i) => (
          <div key={al.id || i} style={{ border: '1px solid var(--crema-oscuro)', borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <strong style={{ flex: 1, fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--texto-suave)' }}>Álbum · {(al.items || []).length}</strong>
              <button type="button" className="btn btn-xs btn-secondary" disabled={i === 0} onClick={() => moverAlbum(i, -1)}><ChevronUp size={12} /></button>
              <button type="button" className="btn btn-xs btn-secondary" disabled={i === albumes.length - 1} onClick={() => moverAlbum(i, 1)}><ChevronDown size={12} /></button>
              <button type="button" className="btn btn-xs btn-danger" onClick={() => del(i)}><Trash2 size={12} /></button>
            </div>
            <div className="form-grid-2">
              <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Título</label><input className="form-control" value={al.titulo || ''} onChange={e => upd(i, 'titulo', e.target.value)} /></div>
              <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Subtítulo</label><input className="form-control" value={al.subtitulo || ''} onChange={e => upd(i, 'subtitulo', e.target.value)} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}><label className="form-label">Tamaño en la galería</label>
              <Select className="form-control" value={al.tamano || 'md'} onChange={e => upd(i, 'tamano', e.target.value)}><option value="sm">Pequeño</option><option value="md">Mediano</option><option value="lg">Grande</option></Select>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <label className="btn btn-xs btn-secondary" style={{ cursor: 'pointer' }}><Upload size={12} /> {subiendo ? 'Subiendo…' : 'Subir fotos'}<input type="file" accept="image/*" multiple hidden onChange={e => { const fs = [...(e.target.files || [])]; if (fs.length) subirFotos(i, fs); e.target.value = '' }} /></label>
              <input className="form-control" style={{ flex: 1, minWidth: 160 }} value={videoUrl[i] || ''} onChange={e => setVideoUrl(v => ({ ...v, [i]: e.target.value }))} placeholder="Enlace de video (YouTube, etc.)" />
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => addVideo(i)}><Plus size={12} /> Video</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(al.items || []).map((it, k) => (
                <div key={k} style={{ position: 'relative', width: 62, height: 62, borderRadius: 8, overflow: 'hidden', background: '#1e1e1e' }}>
                  {it.tipo === 'video'
                    ? <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.62rem' }}>▶ video</div>
                    : <img src={it.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <button type="button" onClick={() => delItem(i, k)} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}><X size={11} /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm btn-primary" onClick={add}><Plus size={13} /> Nuevo álbum</button>
    </div>
  )
}

// Editor de ítems de un mosaico (icono/foto, título, subtítulo, color, enlace)
function MosaicoEditor({ items = [], onChange }) {
  const upd = (i, campo, val) => onChange(items.map((x, k) => k === i ? { ...x, [campo]: val } : x))
  const add = () => onChange([...items, { icono: 'fruto', titulo: '', subtitulo: '', color: '#2d5a3d', link: '' }])
  const del = (i) => onChange(items.filter((_, k) => k !== i))
  const mover = (i, d) => { const a = [...items]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  const [pick, setPick] = useState(null)   // índice con selector de icono abierto
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ border: '1px solid var(--crema-oscuro)', borderRadius: 8, padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={() => setPick(pick === i ? null : i)} title="Elegir icono" style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--crema-oscuro)', background: '#fff', cursor: 'pointer', color: it.color || 'var(--selva)', flexShrink: 0 }}><FrutoIcon name={it.icono} size={22} /></button>
              <input type="color" value={it.color || '#2d5a3d'} onChange={e => upd(i, 'color', e.target.value)} title="Color" style={{ width: 34, height: 34, padding: 2, flexShrink: 0 }} />
              <input className="form-control" style={{ flex: 1 }} value={it.titulo} onChange={e => upd(i, 'titulo', e.target.value)} placeholder="Título" />
              <button type="button" className="btn btn-xs btn-secondary" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp size={12} /></button>
              <button type="button" className="btn btn-xs btn-secondary" disabled={i === items.length - 1} onClick={() => mover(i, 1)}><ChevronDown size={12} /></button>
              <button type="button" className="btn btn-xs btn-danger" onClick={() => del(i)}><X size={12} /></button>
            </div>
            {pick === i && <div style={{ marginTop: 6 }}><IconPicker value={it.icono} onChange={(n) => { upd(i, 'icono', n); setPick(null) }} /></div>}
            <div className="form-grid-2" style={{ marginTop: 6 }}>
              <input className="form-control" value={it.subtitulo || ''} onChange={e => upd(i, 'subtitulo', e.target.value)} placeholder="Subtítulo (opcional)" />
              <input className="form-control" value={it.link || ''} onChange={e => upd(i, 'link', e.target.value)} placeholder="Enlace: /galeria, /p/slug o https://…" />
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-xs btn-secondary" style={{ marginTop: 8 }} onClick={add}><Plus size={12} /> Agregar tarjeta</button>
    </div>
  )
}

// Constructor de las secciones del inicio (categorías individuales, banners, combos, mosaicos…)
const SEC_TIPOS = [
  { tipo: 'categoria', label: 'Categoría (una)' }, { tipo: 'categorias', label: 'Todas las categorías' },
  { tipo: 'combos', label: 'Combos' }, { tipo: 'novedades', label: 'Novedades' },
  { tipo: 'mosaico', label: 'Mosaico (tarjetas personalizables)' }, { tipo: 'frutos', label: 'Mis frutos (mosaico especial)' },
  { tipo: 'banner', label: 'Banner' }, { tipo: 'impacto', label: 'Impacto (Atelier)' },
  { tipo: 'newsletter', label: 'Suscripción' },
]
function SeccionesEditor({ secciones = [], onChange, categorias = [], banners = [] }) {
  const [nuevo, setNuevo] = useState('categoria')
  const [abierto, setAbierto] = useState(null)   // índice de la sección expandida
  const norm = secciones.map((s, i) => ({ key: s.key || s.id || 'k' + i, tipo: s.tipo || s.id, on: s.on !== false, ...s }))
  const tieneConfig = (t) => ['categoria', 'banner', 'mosaico', 'frutos', 'novedades', 'combos'].includes(t)
  const upd = (i, campo, val) => onChange(norm.map((s, k) => k === i ? { ...s, [campo]: val } : s))
  const del = (i) => onChange(norm.filter((_, k) => k !== i))
  const mover = (i, d) => { const a = [...norm]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  const add = () => {
    const base = { key: 's' + Date.now(), tipo: nuevo, on: true }
    if (nuevo === 'categoria') base.categoria = categorias[0] || ''
    if (nuevo === 'mosaico') { base.titulo = 'Nueva sección'; base.items = [] }
    if (nuevo === 'banner') base.bannerId = banners[0]?.id || ''
    onChange([...norm, base])
  }
  const etiqueta = (s) => {
    if (s.tipo === 'hero') return '🖼️ Banner principal'
    if (s.tipo === 'categoria') return `🛍️ Categoría: ${s.categoria || '—'}`
    if (s.tipo === 'categorias') return '🛍️ Todas las categorías'
    if (s.tipo === 'combos') return '🎁 Combos'
    if (s.tipo === 'novedades') return '✨ Novedades'
    if (s.tipo === 'frutos') return `🌿 Mis frutos: ${s.titulo || 'Los frutos que nos inspiran'}`
    if (s.tipo === 'mosaico') return `🔷 Mosaico: ${s.titulo || 'sin título'}`
    if (s.tipo === 'banner') { const bb = banners.find(b => String(b.id) === String(s.bannerId)); return s.bannerId
      ? `🏞️ Banner: ${bb?.nombre || bb?.titulo || '—'}`
      : `🏞️ Grupo de banners: ${s.grupo || '—'}` }
    if (s.tipo === 'newsletter') return '✉️ Suscripción'
    return s.tipo
  }
  return (
    <div>
      <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Arma el inicio: pon cada categoría donde quieras, banners en cualquier posición, combos, y crea mosaicos de tarjetas personalizables (icono, título, color, enlace).</small>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0' }}>
        {norm.map((s, i) => (
          <div key={s.key} style={{ border: '1px solid var(--crema-oscuro)', borderRadius: 8, padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={s.on} onChange={e => upd(i, 'on', e.target.checked)} title="Mostrar" />
              <button type="button" onClick={() => tieneConfig(s.tipo) && setAbierto(abierto === i ? null : i)}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: tieneConfig(s.tipo) ? 'pointer' : 'default', fontWeight: 700, fontSize: '0.84rem', color: 'var(--texto)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ flex: 1 }}>{etiqueta(s)}</span>
                {tieneConfig(s.tipo) && <ChevronDown size={14} style={{ transform: abierto === i ? 'rotate(180deg)' : 'none', transition: 'transform .2s', color: 'var(--texto-suave)' }} />}
              </button>
              <button type="button" className="btn btn-xs btn-secondary" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp size={12} /></button>
              <button type="button" className="btn btn-xs btn-secondary" disabled={i === norm.length - 1} onClick={() => mover(i, 1)}><ChevronDown size={12} /></button>
              {s.tipo !== 'hero' && <button type="button" className="btn btn-xs btn-danger" onClick={() => del(i)}><X size={12} /></button>}
            </div>
            {abierto === i && <div style={{ marginTop: 8 }}>
            {s.tipo === 'categoria' && (
              <Select className="form-control" style={{ marginTop: 6 }} value={s.categoria || ''} onChange={e => upd(i, 'categoria', e.target.value)}>
                <option value="">Elegir categoría…</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            )}
            {s.tipo === 'banner' && (() => {
              const secundarios = banners.filter(b => b.es_secundario)
              const grupos = [...new Set(secundarios.map(b => (b.grupo || '').trim() || 'General'))]
              const valor = s.bannerId ? `b:${s.bannerId}` : (s.grupo ? `g:${s.grupo}` : '')
              const elegir = (v) => {
                const nb = { ...norm[i] }
                if (v.startsWith('b:')) { nb.bannerId = v.slice(2); nb.grupo = '' }
                else if (v.startsWith('g:')) { nb.grupo = v.slice(2); nb.bannerId = '' }
                else { nb.grupo = ''; nb.bannerId = '' }
                onChange(norm.map((x, k) => k === i ? nb : x))
              }
              return (
                <div>
                  <Select className="form-control" style={{ marginTop: 6 }} value={valor} onChange={e => elegir(e.target.value)}>
                    <option value="">Elegir qué mostrar aquí…</option>
                    <optgroup label="Un banner individual">
                      {secundarios.map(b => <option key={b.id} value={`b:${b.id}`}>{b.nombre || b.titulo || '(sin nombre)'}</option>)}
                    </optgroup>
                    <optgroup label="Un grupo completo (slide)">
                      {grupos.map(g => <option key={g} value={`g:${g}`}>{g}</option>)}
                    </optgroup>
                  </Select>
                  <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
                    {secundarios.length === 0
                      ? <>Crea banners <strong>secundarios</strong> en la sección "Banners".</>
                      : <>Elige <strong>un banner</strong> para mostrar solo ese, o <strong>un grupo</strong> para mostrar sus imágenes como slide. Los demás no se muestran aquí.</>}
                  </small>
                </div>
              )
            })()}
            {(s.tipo === 'mosaico' || s.tipo === 'frutos' || s.tipo === 'novedades' || s.tipo === 'combos') && (
              <div className="form-grid-2" style={{ marginTop: 6 }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Nombre de la sección</label><input className="form-control" value={s.titulo || ''} onChange={e => upd(i, 'titulo', e.target.value)} placeholder={s.tipo === 'novedades' ? 'Novedades' : s.tipo === 'combos' ? 'Combos' : 'Título de la sección'} /></div>
                {(s.tipo === 'mosaico' || s.tipo === 'frutos') && <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Subtítulo</label><input className="form-control" value={s.subtitulo || ''} onChange={e => upd(i, 'subtitulo', e.target.value)} placeholder="(opcional)" /></div>}
              </div>
            )}
            {s.tipo === 'mosaico' && (
              <MosaicoEditor items={Array.isArray(s.items) ? s.items : []} onChange={(it) => upd(i, 'items', it)} />
            )}
            {s.tipo === 'frutos' && <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 6 }}>Las tarjetas son tus frutos configurados en <strong>Productos → Gestionar frutos</strong> (cada uno con su enlace).</small>}
            </div>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Select className="form-control" style={{ maxWidth: 260 }} value={nuevo} onChange={e => setNuevo(e.target.value)}>
          {SEC_TIPOS.map(t => <option key={t.tipo} value={t.tipo}>{t.label}</option>)}
        </Select>
        <button type="button" className="btn btn-sm btn-primary" onClick={add}><Plus size={13} /> Agregar sección</button>
      </div>
    </div>
  )
}

// ---- Campos de un bloque de video: red social + enlace de la publicación + formato ----
const REDES_VIDEO = [
  { id: '', label: 'Detectar automáticamente' }, { id: 'youtube', label: 'YouTube' }, { id: 'vimeo', label: 'Vimeo' },
  { id: 'facebook', label: 'Facebook' }, { id: 'instagram', label: 'Instagram' }, { id: 'tiktok', label: 'TikTok' }, { id: 'x', label: 'X (Twitter)' },
]
const EJEMPLO_RED = {
  youtube: 'https://youtu.be/XXXXXXXXXXX', vimeo: 'https://vimeo.com/123456789',
  facebook: 'https://www.facebook.com/pagina/videos/123456789', instagram: 'https://www.instagram.com/reel/CodigoDelPost/',
  tiktok: 'https://www.tiktok.com/@usuario/video/1234567890', x: 'https://x.com/usuario/status/1234567890',
}
function CamposVideo({ b, set }) {
  return (
    <div>
      <div className="form-group"><label className="form-label">Red social</label>
        <Select className="form-control" value={b.red || ''} onChange={e => set('red', e.target.value)}>
          {REDES_VIDEO.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </Select>
      </div>
      <div className="form-group"><label className="form-label">Enlace de la publicación</label>
        <input className="form-control" autoFocus value={b.url || ''} onChange={e => set('url', e.target.value)} placeholder={EJEMPLO_RED[b.red] || 'Pega aquí el enlace de la publicación'} />
        <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Copia el enlace de la publicación (no el código de inserción). Se convierte automáticamente.</small>
      </div>
      <div className="form-grid-2">
        <div className="form-group"><label className="form-label">Formato</label>
          <Select className="form-control" value={b.formato || ''} onChange={e => set('formato', e.target.value)}>
            <option value="">Automático según la red</option>
            <option value="16 / 9">Horizontal (16:9)</option>
            <option value="1 / 1">Cuadrado (1:1)</option>
            <option value="4 / 5">Vertical (4:5)</option>
            <option value="9 / 16">Vertical completo (9:16)</option>
          </Select>
        </div>
        <div className="form-group"><label className="form-label">Título (opcional)</label><input className="form-control" value={b.titulo || ''} onChange={e => set('titulo', e.target.value)} /></div>
      </div>
    </div>
  )
}

// Modal para configurar un bloque desde el editor en el lienzo (imagen, video, botón, galería…)
const TITULO_BLOQUE = { imagen: '🖼️ Imagen', video: '► Video', boton: '⬛ Botón', galeria: '▦ Galería', caja: '▢ Caja', fila: '▥ Columnas', titulo: 'Título', parrafo: 'Párrafo' }
function ModalBloque({ bloque, paginas = [], toast, onGuardar, onClose }) {
  const [b, setB] = useState({ ...bloque })
  const [cropFile, setCropFile] = useState(null)
  const [cropGi, setCropGi] = useState(null)   // índice dentro de la galería
  const [subiendo, setSubiendo] = useState(false)
  const set = (k, v) => setB(x => ({ ...x, [k]: v }))
  const subir = async (blob) => {
    setSubiendo(true)
    try {
      const path = `catalogo/bloque_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      if (cropGi != null) setB(x => ({ ...x, imagenes: (x.imagenes || []).map((im, k) => k === cropGi ? { ...im, url: data.publicUrl } : im) }))
      else set('url', data.publicUrl)
    } catch (e) { toast('No se pudo subir: ' + e.message, 'error') } finally { setSubiendo(false); setCropGi(null) }
  }
  const galUpd = (gi, campo, val) => setB(x => ({ ...x, imagenes: (x.imagenes || []).map((im, k) => k === gi ? { ...im, [campo]: val } : im) }))
  return (
    <Modal open onClose={onClose} title={TITULO_BLOQUE[b.tipo] || 'Bloque'}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => onGuardar(b)} disabled={subiendo}><Ico as={Save} size={14} />Aplicar</button></>}>
      {b.tipo === 'imagen' && (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            {b.url ? <img src={b.url} alt="" style={{ width: 150, height: 86, objectFit: 'cover', borderRadius: 8 }} /> : <div style={{ width: 150, height: 86, borderRadius: 8, background: 'var(--crema)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--texto-suave)', fontSize: '0.78rem' }}>Sin imagen</div>}
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}><Upload size={14} /> {subiendo ? 'Subiendo…' : 'Subir imagen'}<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { setCropGi(null); setCropFile(f) } e.target.value = '' }} /></label>
          </div>
          <div className="form-group"><label className="form-label">Pie de foto (opcional)</label><input className="form-control" value={b.pie || ''} onChange={e => set('pie', e.target.value)} /></div>
        </div>
      )}
      {b.tipo === 'video' && <CamposVideo b={b} set={set} />}
      {b.tipo === 'boton' && (
        <div>
          <div className="form-group"><label className="form-label">Texto del botón</label><input className="form-control" autoFocus value={b.texto || ''} onChange={e => set('texto', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Destino</label>
            <Select className="form-control" value={paginas.some(p => `/p/${p.slug}` === b.destino) ? b.destino : '__url'} onChange={e => set('destino', e.target.value === '__url' ? '' : e.target.value)}>
              <option value="/galeria">Galería</option>
              {paginas.map(p => <option key={p.slug} value={`/p/${p.slug}`}>Página: {p.titulo}</option>)}
              <option value="__url">Enlace externo (URL)…</option>
            </Select>
            {!paginas.some(p => `/p/${p.slug}` === b.destino) && <input className="form-control" style={{ marginTop: 6 }} value={b.destino || ''} onChange={e => set('destino', e.target.value)} placeholder="/galeria, /p/slug o https://…" />}
          </div>
        </div>
      )}
      {b.tipo === 'galeria' && (
        <div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Título del álbum</label><input className="form-control" value={b.titulo || ''} onChange={e => set('titulo', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Subtítulo</label><input className="form-control" value={b.subtitulo || ''} onChange={e => set('subtitulo', e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(b.imagenes || []).map((im, gi) => (
              <div key={gi} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 6, background: 'var(--crema)', borderRadius: 8 }}>
                {im.url ? <img src={im.url} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 46, height: 46, borderRadius: 6, background: '#fff' }} />}
                <label className="btn btn-xs btn-secondary" style={{ cursor: 'pointer' }}><Upload size={12} /><input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { setCropGi(gi); setCropFile(f) } e.target.value = '' }} /></label>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input className="form-control" style={{ padding: '4px 8px' }} value={im.titulo || ''} onChange={e => galUpd(gi, 'titulo', e.target.value)} placeholder="Título" />
                  <input className="form-control" style={{ padding: '4px 8px' }} value={im.subtitulo || ''} onChange={e => galUpd(gi, 'subtitulo', e.target.value)} placeholder="Subtítulo" />
                </div>
                <button className="btn btn-xs btn-danger" onClick={() => setB(x => ({ ...x, imagenes: x.imagenes.filter((_, k) => k !== gi) }))}><X size={12} /></button>
              </div>
            ))}
          </div>
          <button className="btn btn-xs btn-secondary" style={{ marginTop: 6 }} onClick={() => setB(x => ({ ...x, imagenes: [...(x.imagenes || []), { url: '', titulo: '', subtitulo: '' }] }))}><Plus size={12} /> Agregar foto</button>
        </div>
      )}
      {(b.tipo === 'titulo' || b.tipo === 'parrafo' || b.tipo === 'caja' || b.tipo === 'fila') && (
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>Este bloque se edita directamente sobre el lienzo (texto, columnas y contenido).</p>
      )}
      {/* Estilo común */}
      <div className="card-title" style={{ fontSize: '0.9rem', marginTop: 10 }}>🎨 Estilo</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: '0.78rem' }}>
        <label>Fondo<input type="color" style={{ width: '100%', height: 28 }} value={b.estilo?.bg || '#ffffff'} onChange={e => set('estilo', { ...(b.estilo || {}), bg: e.target.value })} /></label>
        <label>Texto<input type="color" style={{ width: '100%', height: 28 }} value={b.estilo?.color || '#1a1a1a'} onChange={e => set('estilo', { ...(b.estilo || {}), color: e.target.value })} /></label>
        <label>Radio<input type="number" className="form-control" style={{ padding: '3px 6px' }} value={b.estilo?.radio ?? ''} onChange={e => set('estilo', { ...(b.estilo || {}), radio: e.target.value })} placeholder="px" /></label>
      </div>
      <button className="btn btn-xs btn-secondary" style={{ marginTop: 8 }} onClick={() => set('estilo', {})}>Limpiar estilo</button>
      {cropFile && <ImageCropper file={cropFile} aspect={cropGi != null ? 1 : 16 / 9} salidaW={cropGi != null ? 900 : 1200} salidaH={cropGi != null ? 900 : 675} onCancel={() => { setCropFile(null); setCropGi(null) }} onCropped={(blob) => { setCropFile(null); subir(blob) }} />}
    </Modal>
  )
}

// Sección de acordeón del panel Personalizar (a nivel de módulo para no perder el foco al escribir)
function PzSec({ id, titulo, abierto, setAbierto, children }) {
  const open = abierto === id
  return (
    <div className="pz-sec">
      <button type="button" className={`pz-sec-hd ${open ? 'open' : ''}`} onClick={() => setAbierto(open ? '' : id)}>
        <span>{titulo}</span><ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && <div className="pz-sec-body">{children}</div>}
    </div>
  )
}

function TabPersonalizar({ toast, qc, cfgUrl, onDirtyChange }) {
  // Recupera scroll si un modal anterior dejó el body bloqueado
  useEffect(() => {
    document.body.style.overflow = ''
  }, [])
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [iframeBroken, setIframeBroken] = useState(false)
  const [cropLogo, setCropLogo] = useState(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [cropFavicon, setCropFavicon] = useState(null)
  const [subiendoFavicon, setSubiendoFavicon] = useState(false)
  const [cropImpactoImg, setCropImpactoImg] = useState(null)
  const [subiendoImpactoImg, setSubiendoImpactoImg] = useState(false)
  const [abierto, setAbierto] = useState('marca')       // sección abierta del acordeón
  const [gestionFrutos, setGestionFrutos] = useState(false)
  const [previewMayorista, setPreviewMayorista] = useState(false)
  const [selPackId, setSelPackId] = useState(null)       // plantilla web / diseño guardado seleccionado (preview)
  const [dispositivo, setDispositivo] = useState('desktop')   // desktop | tablet | mobile
  const [iframeEl, setIframeEl] = useState(null)
  const [lienzo, setLienzo] = useState(false)   // objetivo en edición de lienzo ('nosotros' | 'pagina:slug')
  const [editCanvas, setEditCanvas] = useState(null)   // { target, ruta } bloque a configurar desde el lienzo
  // Árbol de bloques según el objetivo del lienzo
  const arbolDe = (target, c) => target === 'nosotros' ? (c.nosotros_bloques || []) : ((c.paginas || []).find(p => `pagina:${p.slug}` === target)?.bloques || [])
  const conArbol = (target, c, nuevo) => target === 'nosotros'
    ? { ...c, nosotros_bloques: nuevo }
    : { ...c, paginas: (c.paginas || []).map(p => `pagina:${p.slug}` === target ? { ...p, bloques: nuevo } : p) }
  const [stageEl, setStageEl] = useState(null)   // ref por callback: mide en cuanto el escenario existe
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const PC_W = 1150   // ancho lógico de escritorio para la vista previa de PC (menor = se ve más grande)
  const escala = dispositivo === 'desktop' ? (stage.w ? Math.min(1, Math.max(0.4, (stage.w - 8) / PC_W)) : 0.5) : 1

  const { data: frutosCat = [] } = useQuery({ queryKey: ['frutos_catalogo'], queryFn: async () => { const { data } = await supabase.from('frutos_catalogo').select('*').order('orden'); return data || [] } })
  const { data: categorias = [] } = useQuery({
    queryKey: ['catalogo_categorias'],
    queryFn: async () => { const { data } = await supabase.from('finished_products').select('categoria_alegra_nombre').eq('catalogo_visible', true); return [...new Set((data || []).map(p => p.categoria_alegra_nombre).filter(Boolean))] },
  })
  const { data: bannersLista = [] } = useQuery({ queryKey: ['banners_catalogo'], queryFn: async () => { const { data } = await supabase.from('banners_catalogo').select('id, nombre, titulo, es_secundario, grupo').order('orden'); return data || [] } })

  const diseñosGuardados = useMemo(() => (
    Array.isArray(cfg?.plantillas_guardadas)
      ? cfg.plantillas_guardadas.filter(p => p?.id && !PLANTILLAS_WEB.some(b => b.id === p.id))
      : []
  ), [cfg?.plantillas_guardadas])
  const paletasGuardadas = useMemo(() => (
    Array.isArray(cfg?.paletas_guardadas)
      ? cfg.paletas_guardadas.filter(p => p?.id && p?.primario && p?.secundario)
      : []
  ), [cfg?.paletas_guardadas])
  const paletasMostrar = useMemo(() => [...PALETAS_COLOR, ...paletasGuardadas], [paletasGuardadas])
  const packsPreview = useMemo(() => [...PLANTILLAS_WEB, ...diseñosGuardados], [diseñosGuardados])
  const selPack = packsPreview.find(p => p.id === selPackId) || null
  const familiaActiva = familiaWeb(cfg?.diseno)
  // Preview: mezcla payload solo al cambiar de plantilla web o al previsualizar un diseño guardado
  const previewOverlay = useMemo(() => {
    if (!cfg || !selPack?.payload) return null
    if (selPack.custom) return selPack.payload
    if (familiaWeb(selPack.payload.diseno) !== familiaWeb(cfg.diseno)) return selPack.payload
    return null
  }, [cfg, selPack])
  const packPendiente = !!previewOverlay
  const cfgEnVivo = useMemo(() => {
    if (!cfg) return null
    return previewOverlay ? { ...cfg, ...previewOverlay } : cfg
  }, [cfg, previewOverlay])
  const packTotalmenteAplicado = (pack) => {
    if (!cfg || !pack?.payload) return false
    return CAMPOS_DISENO_GUARDADO.every(k => {
      if (pack.payload[k] === undefined) return true
      return String(cfg[k] ?? '').toLowerCase() === String(pack.payload[k] ?? '').toLowerCase()
    })
  }

  const [savedSnap, setSavedSnap] = useState(null)
  useEffect(() => {
    supabase.from('config_catalogo').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      const base = data || { id: 1 }
      if (!Array.isArray(base.secciones) || !base.secciones.length) base.secciones = SECCIONES_DEFAULT
      // Por defecto: fuentes y logo de la app principal (si el catálogo no tiene los suyos)
      const app = getConfig()
      if (!base.fuente_titulos) base.fuente_titulos = app.fuente_titulos || 'Playfair Display'
      if (!base.fuente_subtitulos) base.fuente_subtitulos = app.fuente || 'Source Sans 3'
      if (!base.fuente_texto) base.fuente_texto = app.fuente || 'Source Sans 3'
      if (base.favicon_url == null) base.favicon_url = ''
      if (!(base.logo_url || '').trim() && (app.logo_url || '').trim()) base.logo_url = app.logo_url
      setCfg(base)
      setSavedSnap(snapConfig(base))
      // Selecciona la plantilla web según la familia activa (no por color)
      setSelPackId(familiaWeb(base.diseno) === 'atelier' ? 'atelier' : 'clasico')
    })
  }, [])
  useEffect(() => {
    if (!cfg || savedSnap == null) { onDirtyChange?.(false); return }
    onDirtyChange?.(snapConfig(cfg) !== savedSnap)
  }, [cfg, savedSnap, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const syncSelPackAFamilia = (diseno) => setSelPackId(familiaWeb(diseno) === 'atelier' ? 'atelier' : 'clasico')
  const set = (k, v) => {
    if (k === 'diseno') syncSelPackAFamilia(v)
    // Si ajustas color mientras previsualizas otra plantilla web, vuelve a la activa para ver el color
    else if (['color_primario', 'color_secundario', 'color_fondo', 'plantilla'].includes(k)) syncSelPackAFamilia(cfg?.diseno)
    setCfg(c => ({ ...c, [k]: v }))
  }

  // Envía la config al preview (iframe) para verlo en vivo
  const enviarPreview = () => { try { iframeEl?.contentWindow?.postMessage({ type: 'mumi-preview', cfg: cfgEnVivo }, '*') } catch { /* noop */ } }
  const enviarEdicion = () => { try { iframeEl?.contentWindow?.postMessage({ type: 'mumi-edit-mode', on: !!lienzo, target: lienzo }, '*') } catch { /* noop */ } }
  // Entra/sale del editor en el lienzo para un objetivo ('nosotros' o 'pagina:slug')
  const entrarLienzo = (target) => {
    const on = lienzo === target ? null : target
    setLienzo(on)
    if (iframeEl) {
      const publicada = ((cfg?.url_publica || cfgUrl || '') + '').trim().replace(/\/+$/, '')
      const base = (import.meta.env.DEV ? 'http://localhost:5174' : publicada) || publicada
      if (!base) return
      iframeEl.src = on === 'nosotros' ? `${base}/nosotros` : (on && on.startsWith('pagina:')) ? `${base}/p/${on.slice(7)}` : base
    }
  }
  useEffect(() => { if (iframeEl && cfgEnVivo) { const t = setTimeout(enviarPreview, 150); return () => clearTimeout(t) } }, [cfgEnVivo, iframeEl]) // eslint-disable-line
  useEffect(() => { enviarEdicion() }, [lienzo, iframeEl]) // eslint-disable-line
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data
      if (d?.type === 'mumi-preview-ready') { enviarPreview(); enviarEdicion() }
      // El lienzo pide configurar un bloque (imagen, video, botón, galería…) en un modal del panel
      if (d?.type === 'mumi-canvas-editar' && d.target && Array.isArray(d.ruta)) setEditCanvas({ target: d.target, ruta: d.ruta })
      // Ediciones hechas en el lienzo: el lienzo envía el árbol completo
      if (d?.type === 'mumi-canvas-set' && Array.isArray(d.bloques)) {
        if (d.target === 'nosotros') setCfg(c => ({ ...c, nosotros_bloques: d.bloques }))
        else if (typeof d.target === 'string' && d.target.startsWith('pagina:')) {
          const slug = d.target.slice(7)
          setCfg(c => ({ ...c, paginas: (c.paginas || []).map(p => p.slug === slug ? { ...p, bloques: d.bloques } : p) }))
        }
      }
    }
    window.addEventListener('message', onMsg); return () => window.removeEventListener('message', onMsg)
  }) // eslint-disable-line
  useEffect(() => { try { iframeEl?.contentWindow?.postMessage({ type: 'mumi-preview-mayorista', on: previewMayorista }, '*') } catch { /* noop */ } }, [previewMayorista, iframeEl])
  // Mide el escenario del preview para escalar la vista de PC de forma realista
  useEffect(() => {
    if (!stageEl || typeof ResizeObserver === 'undefined') return
    const medir = () => setStage({ w: stageEl.clientWidth, h: stageEl.clientHeight })
    const ro = new ResizeObserver(medir); ro.observe(stageEl); medir()
    return () => ro.disconnect()
  }, [stageEl, dispositivo])

  const esSvgLogo = (file) => !!file && (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || ''))
  const subirLogo = async (fileOrBlob, contentType = 'image/jpeg') => {
    setSubiendoLogo(true)
    try {
      const ext = contentType.includes('svg') ? 'svg' : contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
      const path = `catalogo/logo_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('product-images').upload(path, fileOrBlob, { upsert: true, contentType })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      set('logo_url', data.publicUrl)
    } catch (e) { toast('No se pudo subir el logo: ' + e.message, 'error') } finally { setSubiendoLogo(false) }
  }
  const onPickLogo = (file) => {
    if (!file) return
    if (esSvgLogo(file)) void subirLogo(file, 'image/svg+xml')
    else setCropLogo(file)
  }
  const subirFavicon = async (blob) => {
    setSubiendoFavicon(true)
    try {
      const path = `catalogo/favicon_${Date.now()}.jpg`
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      set('favicon_url', data.publicUrl)
    } catch (e) { toast('No se pudo subir el favicon: ' + e.message, 'error') } finally { setSubiendoFavicon(false) }
  }
  const subirImgCfg = async (blob, campo, setBusy) => {
    setBusy(true)
    try {
      const path = `catalogo/${campo}_${Date.now()}.jpg`
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      set(campo, data.publicUrl)
    } catch (e) { toast('No se pudo subir la imagen: ' + e.message, 'error') } finally { setBusy(false) }
  }
  // Solo colores: no cambia la plantilla web; si había preview de otra web, vuelve a la activa
  const aplicarPaleta = (p) => {
    syncSelPackAFamilia(cfg?.diseno)
    setCfg(c => ({
      ...c,
      plantilla: p.id,
      color_primario: p.primario,
      color_secundario: p.secundario,
      color_fondo: p.fondo || c.color_fondo || '#F5F0E8',
    }))
  }
  const guardarPaletaActual = () => {
    const nombre = window.prompt('Nombre de la paleta', 'Mi paleta')
    if (!nombre || !nombre.trim()) return
    const prim = cfg.color_primario || '#1a3a2a'
    const sec = cfg.color_secundario || '#C8A94A'
    const fondo = cfg.color_fondo || '#F5F0E8'
    const item = { id: `paleta_${Date.now()}`, nombre: nombre.trim(), primario: prim, secundario: sec, fondo, custom: true }
    setCfg(c => ({ ...c, paletas_guardadas: [...(Array.isArray(c.paletas_guardadas) ? c.paletas_guardadas : []), item] }))
    toast('Paleta guardada en el panel. Pulsa «Guardar cambios» para persistirla.')
  }
  const borrarPaletaGuardada = (id) => {
    if (!window.confirm('¿Eliminar esta paleta guardada?')) return
    setCfg(c => ({ ...c, paletas_guardadas: (c.paletas_guardadas || []).filter(p => p.id !== id) }))
  }
  // Seleccionar = solo preview en el iframe (no escribe cfg hasta Aplicar)
  const seleccionarPack = (pack) => setSelPackId(pack.id)
  const aplicarPack = (pack) => {
    setCfg(c => ({ ...c, ...pack.payload }))
    setSelPackId(pack.id)
    toast(`${pack.nombre} aplicada en el panel. Pulsa «Guardar cambios» para publicarla.`)
  }
  const guardarDiseñoActual = () => {
    const nombre = window.prompt('Nombre del diseño guardado', 'Mi combinación')
    if (!nombre || !nombre.trim()) return
    const payload = {}
    CAMPOS_DISENO_GUARDADO.forEach(k => { if (cfg[k] !== undefined) payload[k] = cfg[k] })
    const item = { id: `custom_${Date.now()}`, nombre: nombre.trim(), desc: 'Combinación guardada (plantilla + colores + fuentes)', payload, custom: true }
    setCfg(c => ({ ...c, plantillas_guardadas: [...(Array.isArray(c.plantillas_guardadas) ? c.plantillas_guardadas : []), item] }))
    toast('Diseño guardado en el panel. Pulsa «Guardar cambios» para persistirlo.')
  }
  const borrarDiseñoGuardado = (id) => {
    if (!window.confirm('¿Eliminar este diseño guardado?')) return
    setCfg(c => ({ ...c, plantillas_guardadas: (c.plantillas_guardadas || []).filter(p => p.id !== id) }))
    if (selPackId === id) setSelPackId(familiaActiva === 'atelier' ? 'atelier' : 'clasico')
  }
  const moverSeccion = (i, d) => setCfg(c => { const a = [...(c.secciones || SECCIONES_DEFAULT)]; const j = i + d; if (j < 0 || j >= a.length) return c;[a[i], a[j]] = [a[j], a[i]]; return { ...c, secciones: a } })
  const toggleSeccion = (id) => setCfg(c => ({ ...c, secciones: (c.secciones || SECCIONES_DEFAULT).map(s => s.id === id ? { ...s, on: !(s.on !== false) } : s) }))

  const guardar = async () => {
    setSaving(true)
    try {
      // No pisar url_publica si el estado local la perdió
      const payload = { ...cfg, id: 1, updated_at: new Date().toISOString() }
      if (!(payload.url_publica || '').trim() && (cfgUrl || '').trim()) payload.url_publica = cfgUrl
      const { error } = await supabase.from('config_catalogo').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSavedSnap(snapConfig(payload))
      toast('Personalización guardada ✓')
      qc.invalidateQueries({ queryKey: ['catalogo_url'] })
      if (iframeEl) iframeEl.src = iframeEl.src   // recarga el preview con datos guardados
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  if (!cfg) return <div className="card"><p className="empty-table">Cargando…</p></div>
  const secciones = cfg.secciones || SECCIONES_DEFAULT
  // En desarrollo local: preview del Vite del catálogo (npm run dev:catalogo → :5174).
  // En producción: URL pública desplegada. Sin esto el iframe sigue mostrando el Worker viejo.
  const previewUrlPublica = ((cfg.url_publica || cfgUrl || '') + '').trim().replace(/\/+$/, '')
  const previewUrl = (import.meta.env.DEV ? 'http://localhost:5174' : previewUrlPublica) || previewUrlPublica

  return (
    <div className="pz-layout">
      {/* Panel de controles */}
      <div className="pz-panel">
        <div className="pz-panel-toolbar">
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={saving}><Ico as={Save} size={13} />{saving ? 'Guardando…' : 'Guardar cambios'}</button>{savedSnap != null && cfg && snapConfig(cfg) !== savedSnap && <span className="badge badge-dorado" style={{ marginLeft: 8 }}>Sin guardar</span>}
        </div>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="marca" titulo={<><ImageIcon size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Marca (logo, favicon, nombre, slogan)</>}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden', background: 'var(--crema)', border: '1px solid var(--crema-oscuro)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {cfg.logo_url ? <img src={cfg.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '0.66rem', color: 'var(--texto-suave)' }}>Sin logo</span>}
              </div>
              <label className="btn btn-xs btn-secondary" style={{ marginTop: 6, cursor: 'pointer' }}><Upload size={12} /> {subiendoLogo ? '…' : 'Logo'}<input type="file" accept="image/*,.svg,image/svg+xml" hidden onChange={e => { const f = e.target.files?.[0]; onPickLogo(f); e.target.value = '' }} /></label>
              {cfg.logo_url && <button className="btn btn-xs btn-danger" style={{ marginTop: 4 }} onClick={() => set('logo_url', '')}>Quitar</button>}
              {!cfg.logo_url && (getConfig().logo_url || '').trim() ? (
                <button type="button" className="btn btn-xs btn-secondary" style={{ marginTop: 4 }} onClick={() => set('logo_url', getConfig().logo_url)}>Usar logo de la app</button>
              ) : null}
              <div style={{ fontSize: '0.66rem', color: 'var(--texto-suave)', marginTop: 4, maxWidth: 110, lineHeight: 1.3 }}>PNG, JPG o SVG. Sin logo no se muestra icono.</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', background: 'var(--crema)', border: '1px solid var(--crema-oscuro)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                {cfg.favicon_url ? <img src={cfg.favicon_url} alt="favicon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.58rem', color: 'var(--texto-suave)', padding: 4, lineHeight: 1.2 }}>Sin favicon</span>}
              </div>
              <label className="btn btn-xs btn-secondary" style={{ marginTop: 6, cursor: 'pointer' }}><Upload size={12} /> {subiendoFavicon ? '…' : 'Favicon'}<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setCropFavicon(f); e.target.value = '' }} /></label>
              {cfg.favicon_url && <button className="btn btn-xs btn-danger" style={{ marginTop: 4 }} onClick={() => set('favicon_url', '')}>Quitar</button>}
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div className="form-group"><label className="form-label">Nombre / imagotipo</label><input className="form-control" value={cfg.nombre_tienda || ''} onChange={e => set('nombre_tienda', e.target.value)} placeholder="Mumi Amazonia" /></div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Slogan
                  <button type="button" onClick={() => set('mostrar_slogan', cfg.mostrar_slogan === false)} title={cfg.mostrar_slogan === false ? 'Slogan oculto — clic para mostrar' : 'Slogan visible — clic para ocultar'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: cfg.mostrar_slogan === false ? 'var(--texto-suave)' : 'var(--selva)', display: 'inline-flex', padding: 0 }}>
                    {cfg.mostrar_slogan === false ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </label>
                <input className="form-control" value={cfg.slogan || ''} onChange={e => set('slogan', e.target.value)} placeholder="Sabores de la selva del Guaviare" disabled={cfg.mostrar_slogan === false} />
              </div>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer', margin: '10px 0 4px' }}>
            <input type="checkbox" checked={!!cfg.solo_logo} onChange={e => set('solo_logo', e.target.checked)} /> Mostrar solo el logo en pantallas pequeñas (ocultar nombre y slogan)
          </label>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Si dejas el nombre o el slogan vacíos, se usa el valor por defecto de la app. Logo 400×400; favicon cuadrado 192×192 (vacío hasta que lo subas).</small>
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="colores" titulo={<><Palette size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Plantilla web y colores</>}>
          <small style={{ display: 'block', color: 'var(--texto-suave)', fontSize: '0.72rem', marginBottom: 12 }}>
            La <strong>plantilla web</strong> define la estructura (inicio, ficha, menú). Los <strong>colores</strong> son independientes: puedes cambiar la paleta sin cambiar de plantilla.
          </small>

          <label className="form-label">1. Plantilla web <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(2 opciones · clic para previsualizar → Aplicar)</small></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {PLANTILLAS_WEB.map(pack => {
              const seleccionada = selPackId === pack.id
              const activa = familiaWeb(pack.payload?.diseno) === familiaActiva
              const completa = packTotalmenteAplicado(pack)
              return (
                <div key={pack.id} role="button" tabIndex={0}
                  onClick={() => seleccionarPack(pack)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionarPack(pack) } }}
                  style={{ flex: '1 1 180px', minWidth: 160, borderRadius: 12, border: seleccionada ? '2px solid var(--selva)' : '1px solid var(--crema-oscuro)', background: seleccionada ? 'color-mix(in srgb, var(--selva) 6%, #fff)' : '#fff', padding: 10, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--selva)' }}>{pack.nombre}</div>
                    {activa && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--selva)', opacity: 0.8 }}>Activa</span>}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--texto-suave)', margin: '4px 0 8px', minHeight: 28 }}>{pack.desc}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    <button type="button" className={`btn btn-xs ${packPendiente && seleccionada ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => aplicarPack(pack)} disabled={completa && seleccionada}
                      title={completa ? 'Ya tienes esta plantilla con sus valores recomendados' : 'Aplica plantilla y valores recomendados (colores/fuentes)'}>
                      {completa && seleccionada ? 'Aplicada' : (activa && !packPendiente ? 'Restaurar recomendada' : 'Aplicar')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {packPendiente && selPack && !selPack.custom && (
            <small style={{ display: 'block', marginBottom: 12, color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
              Vista previa de <strong>{selPack.nombre}</strong>. Pulsa <strong>Aplicar</strong> y luego <strong>Guardar cambios</strong> para publicarla.
            </small>
          )}

          {familiaActiva !== 'atelier' ? (
            <>
              <label className="form-label">2. Estilo de formas <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(solo plantilla Clásico · bordes y botones)</small></label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {ESTILOS_FORMA.map(d => (
                  <button key={d.id} type="button" onClick={() => set('diseno', d.id)} title={d.desc}
                    style={{ flex: '1 1 140px', textAlign: 'left', padding: 10, borderRadius: d.radio, cursor: 'pointer', background: '#fff', border: (cfg.diseno || 'selva') === d.id ? '2px solid var(--selva)' : '1px solid var(--crema-oscuro)' }}>
                    <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                      <span style={{ width: 26, height: 16, background: 'var(--selva)', borderRadius: d.radioMini }} />
                      <span style={{ width: 16, height: 16, background: 'var(--dorado)', borderRadius: d.radioMini }} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--selva)' }}>{d.nombre}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>{d.desc}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <small style={{ display: 'block', marginBottom: 14, color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
              2. Estilo de formas: Atelier define sus propios bordes y botones. Cambia a <strong>Clásico Mumi</strong> si quieres Selva / Editorial / Orgánico.
            </small>
          )}

          <label className="form-label">3. Paleta de colores <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(6 predefinidas + las tuyas)</small></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {paletasMostrar.map(p => (
              <div key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <button type="button" onClick={() => aplicarPaleta(p)} title={p.nombre}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                    border: cfg.plantilla === p.id ? '2px solid var(--selva)' : '1px solid var(--crema-oscuro)', background: '#fff' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: p.primario, border: '1px solid rgba(0,0,0,0.08)' }} />
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: p.secundario, border: '1px solid rgba(0,0,0,0.08)' }} />
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: p.fondo || '#F5F0E8', border: '1px solid rgba(0,0,0,0.08)' }} />
                  {p.nombre}
                  {p.custom ? <span style={{ fontSize: '0.62rem', opacity: 0.65, fontWeight: 600 }}>tuya</span> : null}
                </button>
                {p.custom ? (
                  <button type="button" className="btn btn-xs btn-danger" title="Borrar paleta" onClick={() => borrarPaletaGuardada(p.id)}><X size={12} /></button>
                ) : null}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 8 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Primario <small style={{ fontWeight: 400, textTransform: 'none' }}>(marca / header)</small></label>
              <input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={cfg.color_primario || '#1a3a2a'} onChange={e => set('color_primario', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Acento <small style={{ fontWeight: 400, textTransform: 'none' }}>(CTAs / banners)</small></label>
              <input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={cfg.color_secundario || '#C8A94A'} onChange={e => set('color_secundario', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Fondo <small style={{ fontWeight: 400, textTransform: 'none' }}>(página)</small></label>
              <input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={cfg.color_fondo || '#F5F0E8'} onChange={e => set('color_fondo', e.target.value)} />
            </div>
          </div>
          {/* Vista rápida de contraste: marca + acento sobre sus fondos reales */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ flex: '1 1 120px', borderRadius: 10, padding: '10px 12px', background: cfg.color_primario || '#1a3a2a', color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>
              Texto en primario
            </div>
            <div style={{ flex: '1 1 120px', borderRadius: 10, padding: '10px 12px', background: cfg.color_secundario || '#C8A94A', color: '#1a1a1a', fontSize: '0.72rem', fontWeight: 700 }}>
              Texto en acento
            </div>
            <div style={{ flex: '1 1 120px', borderRadius: 10, padding: '10px 12px', background: cfg.color_fondo || '#F5F0E8', color: '#1a1a1a', border: '1px solid var(--crema-oscuro)', fontSize: '0.72rem', fontWeight: 700 }}>
              Texto en fondo
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: 8 }} onClick={guardarPaletaActual}>💾 Guardar paleta actual</button>
          <small style={{ display: 'block', color: 'var(--texto-suave)', fontSize: '0.72rem', marginBottom: 14 }}>
            No hace falta una triada decorativa: con primario + acento + fondo alcanza. El catálogo calcula solo los textos (WCAG 4.5) para que siempre se lean bien.
          </small>

          <label className="form-label">4. Diseños guardados <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(tus combinaciones plantilla + color + fuentes)</small></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {diseñosGuardados.length === 0 && (
              <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Aún no hay diseños guardados.</small>
            )}
            {diseñosGuardados.map(pack => {
              const seleccionada = selPackId === pack.id
              const completa = packTotalmenteAplicado(pack)
              return (
                <div key={pack.id} role="button" tabIndex={0}
                  onClick={() => seleccionarPack(pack)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionarPack(pack) } }}
                  style={{ flex: '1 1 160px', minWidth: 140, borderRadius: 12, border: seleccionada ? '2px solid var(--selva)' : '1px solid var(--crema-oscuro)', background: seleccionada ? 'color-mix(in srgb, var(--selva) 6%, #fff)' : '#fff', padding: 10, cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--selva)' }}>{pack.nombre}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--texto-suave)', margin: '4px 0 8px' }}>{pack.desc || 'Combinación guardada'}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    <button type="button" className={`btn btn-xs ${seleccionada && !completa ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => aplicarPack(pack)} disabled={completa && seleccionada}>
                      {completa && seleccionada ? 'Aplicada' : 'Aplicar'}
                    </button>
                    <button type="button" className="btn btn-xs btn-danger" onClick={() => borrarDiseñoGuardado(pack.id)}>Borrar</button>
                  </div>
                </div>
              )
            })}
          </div>
          {packPendiente && selPack?.custom && (
            <small style={{ display: 'block', marginBottom: 8, color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
              Vista previa de <strong>{selPack.nombre}</strong>. Pulsa <strong>Aplicar</strong> para usarla en el panel.
            </small>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={guardarDiseñoActual}>💾 Guardar combinación actual</button>
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="fuentes" titulo={<>🔤 Tipografía (Google Fonts)</>}>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Por defecto se usan las mismas fuentes que configuraste en la app. Aquí puedes cambiarlas solo para el catálogo.</small>
          <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">Títulos</label>
            <Select className="form-control" value={cfg.fuente_titulos || ''} onChange={e => set('fuente_titulos', e.target.value)} style={{ fontFamily: `'${cfg.fuente_titulos}'` }}>
              {FUENTES.map(f => <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>{f}</option>)}
            </Select>
          </div>
          <div className="form-group"><label className="form-label">Subtítulos</label>
            <Select className="form-control" value={cfg.fuente_subtitulos || ''} onChange={e => set('fuente_subtitulos', e.target.value)} style={{ fontFamily: `'${cfg.fuente_subtitulos}'` }}>
              {FUENTES.map(f => <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>{f}</option>)}
            </Select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Párrafos / texto</label>
            <Select className="form-control" value={cfg.fuente_texto || ''} onChange={e => set('fuente_texto', e.target.value)} style={{ fontFamily: `'${cfg.fuente_texto}'` }}>
              {FUENTES.map(f => <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>{f}</option>)}
            </Select>
          </div>
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="secciones" titulo={<><Layout size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Secciones del inicio</>}>
          <SeccionesEditor secciones={Array.isArray(cfg.secciones) ? cfg.secciones : SECCIONES_DEFAULT} onChange={(sx) => set('secciones', sx)} categorias={[...new Set([...categorias, ...(cfg.categorias_extra || []), ...(cfg.productos_extra || []).map(p => p.categoria).filter(Boolean)])]} banners={bannersLista} />
          {familiaActiva !== 'atelier' && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: '1px solid var(--crema-oscuro)', background: '#fff' }}>
              <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Cómo mostrar los productos</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { id: 'scroll', titulo: 'Scroll horizontal', desc: 'Fila deslizable (carrusel)' },
                  { id: 'grid', titulo: 'Cuadrícula', desc: 'Sin scroll · todos visibles' },
                ].map(opt => {
                  const on = (cfg.productos_vista || 'scroll') === opt.id
                  return (
                    <button key={opt.id} type="button" onClick={() => set('productos_vista', opt.id)}
                      style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: on ? 'color-mix(in srgb, var(--selva) 10%, #fff)' : '#fff', border: on ? '2px solid var(--selva)' : '1px solid var(--crema-oscuro)' }}>
                      <strong style={{ display: 'block', fontSize: '0.84rem', color: 'var(--selva)' }}>{opt.titulo}</strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>{opt.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer', marginTop: 10 }}>
            <input type="checkbox" checked={!!cfg.mostrar_filtro_frutos} onChange={e => set('mostrar_filtro_frutos', e.target.checked)} /> Mostrar filtro por frutos en la tienda
          </label>
          {familiaActiva === 'atelier' && !!cfg.mostrar_filtro_frutos && (
            <div className="form-group" style={{ marginTop: 8, marginBottom: 0 }}>
              <label className="form-label">Título del filtro de frutos</label>
              <input className="form-control" value={cfg.frutos_filtro_titulo || ''} onChange={e => set('frutos_filtro_titulo', e.target.value)} placeholder="Explora por ingrediente" />
            </div>
          )}
        </PzSec>

        {familiaActiva === 'atelier' && (
          <PzSec abierto={abierto} setAbierto={setAbierto} id="impacto" titulo={<>🌍 Bloque Impacto (Atelier)</>}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" checked={cfg.impacto_activo !== false} onChange={e => set('impacto_activo', e.target.checked)} /> Mostrar bloque de impacto
            </label>
            <div className="form-group"><label className="form-label">Título</label>
              <input className="form-control" value={cfg.impacto_titulo || ''} onChange={e => set('impacto_titulo', e.target.value)} placeholder="Impacto que florece" />
            </div>
            <div className="form-group"><label className="form-label">Texto</label>
              <textarea className="form-control" rows={3} value={cfg.impacto_texto || ''} onChange={e => set('impacto_texto', e.target.value)} />
            </div>
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Dato 1 (número)</label>
                <input className="form-control" value={cfg.impacto_stat1_n || ''} onChange={e => set('impacto_stat1_n', e.target.value)} placeholder="45+" />
              </div>
              <div className="form-group"><label className="form-label">Dato 1 (etiqueta)</label>
                <input className="form-control" value={cfg.impacto_stat1_l || ''} onChange={e => set('impacto_stat1_l', e.target.value)} placeholder="Productores" />
              </div>
              <div className="form-group"><label className="form-label">Dato 2 (número)</label>
                <input className="form-control" value={cfg.impacto_stat2_n || ''} onChange={e => set('impacto_stat2_n', e.target.value)} placeholder="10" />
              </div>
              <div className="form-group"><label className="form-label">Dato 2 (etiqueta)</label>
                <input className="form-control" value={cfg.impacto_stat2_l || ''} onChange={e => set('impacto_stat2_l', e.target.value)} placeholder="Departamentos" />
              </div>
            </div>
            <div className="form-group"><label className="form-label">Texto del enlace (vacío = ocultar)</label>
              <input className="form-control" value={cfg.impacto_link_texto ?? 'Conoce más'} onChange={e => set('impacto_link_texto', e.target.value)} placeholder="Conoce más" />
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 120, height: 90, borderRadius: 10, overflow: 'hidden', background: 'var(--crema)', border: '1px solid var(--crema-oscuro)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {cfg.impacto_imagen
                    ? <img src={cfg.impacto_imagen} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '0.62rem', color: 'var(--texto-suave)' }}>Sin foto</span>}
                </div>
                <label className="btn btn-xs btn-secondary" style={{ marginTop: 6, cursor: 'pointer' }}>
                  <Upload size={12} /> {subiendoImpactoImg ? '…' : 'Foto'}
                  <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setCropImpactoImg(f); e.target.value = '' }} />
                </label>
                {cfg.impacto_imagen && <button type="button" className="btn btn-xs btn-danger" style={{ marginTop: 4 }} onClick={() => set('impacto_imagen', '')}>Quitar</button>}
              </div>
            </div>
          </PzSec>
        )}

        <PzSec abierto={abierto} setAbierto={setAbierto} id="aviso" titulo={<><Megaphone size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Aviso superior</>}>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
            Franja sobre el encabezado para anuncios breves (ej. <em>“🎉 10% de descuento por temporada”</em>). Puedes poner hasta <strong>3</strong> mensajes que van rotando. Si no configuras ninguno, no se muestra.
          </small>
          <AvisosEditor
            avisos={Array.isArray(cfg.avisos) ? cfg.avisos : []}
            onChange={v => set('avisos', v)}
            colorBg={cfg.aviso_color_bg || ''}
            colorTexto={cfg.aviso_color_texto || ''}
            onColorBg={v => set('aviso_color_bg', v || null)}
            onColorTexto={v => set('aviso_color_texto', v || null)}
          />
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="barra" titulo={<>📣 Barra de beneficios</>}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={cfg.barra_activa !== false} onChange={e => set('barra_activa', e.target.checked)} /> Mostrar la barra
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <ColorPick label="Fondo de la barra" value={cfg.barra_color_bg || ''} fallback="#2d5a3d" onChange={v => set('barra_color_bg', v)} onClear={() => set('barra_color_bg', null)} />
            <ColorPick label="Texto de la barra" value={cfg.barra_color_texto || ''} fallback="#F5F0E6" onChange={v => set('barra_color_texto', v)} onClear={() => set('barra_color_texto', null)} />
          </div>
          <BarraItemsEditor items={Array.isArray(cfg.barra_items) ? cfg.barra_items : []} onChange={(v) => set('barra_items', v)} />
          <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">Tamaño del texto</label>
            <Select className="form-control" value={cfg.barra_tamano || 'md'} onChange={e => set('barra_tamano', e.target.value)}><option value="sm">Pequeño</option><option value="md">Mediano</option><option value="lg">Grande</option></Select>
          </div>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Con <strong>Auto</strong> usa la paleta (primario). Personaliza fondo y texto si quieres otro contraste.</small>
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="footer" titulo={<>🔻 Pie de página (footer)</>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <ColorPick label="Fondo del footer" value={cfg.footer_color_bg || ''} fallback="#1a3a2a" onChange={v => set('footer_color_bg', v)} onClear={() => set('footer_color_bg', null)} />
            <ColorPick label="Texto del footer" value={cfg.footer_color_texto || ''} fallback="#F5F0E6" onChange={v => set('footer_color_texto', v)} onClear={() => set('footer_color_texto', null)} />
          </div>
          <div className="form-group"><label className="form-label">Texto del footer</label><textarea className="form-control" rows={2} value={cfg.footer_texto || ''} onChange={e => set('footer_texto', e.target.value)} placeholder="Sabores artesanales de la selva del Guaviare. 100% natural." /></div>
          <div className="form-group"><label className="form-label">Tamaño</label>
            <Select className="form-control" value={cfg.footer_tamano || 'md'} onChange={e => set('footer_tamano', e.target.value)}><option value="sm">Pequeño</option><option value="md">Mediano</option><option value="lg">Grande</option></Select>
          </div>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Las redes sociales del footer se toman de <strong>Configuración</strong>.</small>
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="categorias" titulo={<><GripVertical size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Orden de categorías</>}>
          {categorias.length > 1
            ? <OrdenCategorias categorias={categorias} toast={toast} />
            : <small style={{ color: 'var(--texto-suave)' }}>Necesitas al menos 2 categorías con productos publicados.</small>}
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="banners" titulo={<>🖼️ Banners</>}>
          <small style={{ display: 'block', color: 'var(--texto-suave)', fontSize: '0.72rem', marginBottom: 8 }}>
            {familiaActiva === 'atelier'
              ? <>En <strong>Atelier</strong>, el <strong>primer banner principal</strong> (por orden ↑↓) es la <strong>portada</strong> (imagen/video y textos si los tiene). No hay carrusel de principales. Los <strong>secundarios</strong> se colocan desde “Secciones del inicio”.</>
              : <>Los banners <strong>principales</strong> forman el carrusel de arriba. Los <strong>secundarios</strong> se colocan donde quieras desde “Secciones del inicio”.</>}
          </small>
          <TabBanners toast={toast} qc={qc} embed modoAtelier={familiaActiva === 'atelier'} />
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="nosotros" titulo={<>📖 Página "Nosotros" (bloques)</>}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', flex: 1 }}>Arma la página con bloques. También puedes <strong>editar el texto directamente sobre el diseño</strong> con el editor en el lienzo.</small>
            {cfgUrl && <button className={`btn btn-sm pz-solo-pc ${lienzo === 'nosotros' ? 'btn-danger' : 'btn-primary'}`} onClick={() => entrarLienzo('nosotros')}>{lienzo === 'nosotros' ? <>✕ Salir del lienzo</> : <><Ico as={Pencil} size={13} />Editar en el lienzo</>}</button>}
            <small className="pz-aviso-movil">🖥️ El editor en el lienzo requiere pantalla de escritorio.</small>
          </div>
          {lienzo === 'nosotros'
            ? <div style={{ background: 'color-mix(in srgb, var(--selva) 10%, #fff)', border: '1px solid var(--selva)', borderRadius: 8, padding: '10px 12px', fontSize: '0.82rem', color: 'var(--selva)' }}>✏️ <strong>Editando en el lienzo.</strong> Trabaja directamente sobre la vista previa: clic para seleccionar, escribe en textos, arrastra para mover (también dentro de cajas), y usa la barra flotante y de widgets. Sal del lienzo para volver a la edición por panel.</div>
            : <EditorNosotros bloques={Array.isArray(cfg.nosotros_bloques) ? cfg.nosotros_bloques : []} onChange={(bl) => set('nosotros_bloques', bl)} toast={toast} paginas={cfg.paginas || []} />}
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="galeria" titulo={<>🖼️ Galería (álbumes)</>}>
          <div className="form-grid-2">
            <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Título de la galería</label><input className="form-control" value={cfg.galeria_titulo || ''} onChange={e => set('galeria_titulo', e.target.value)} placeholder="Galería" /></div>
            <div className="form-group" style={{ marginBottom: 6 }}><label className="form-label">Subtítulo</label><input className="form-control" value={cfg.galeria_subtitulo || ''} onChange={e => set('galeria_subtitulo', e.target.value)} /></div>
          </div>
          <GaleriaEditor albumes={Array.isArray(cfg.galeria_albumes) ? cfg.galeria_albumes : []} onChange={(al) => set('galeria_albumes', al)} toast={toast} />
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="paginas" titulo={<>📄 Páginas personalizadas</>}>
          <PaginasEditor paginas={Array.isArray(cfg.paginas) ? cfg.paginas : []} onChange={(pgs) => set('paginas', pgs)} toast={toast} lienzo={lienzo} onLienzo={cfgUrl ? entrarLienzo : null} />
        </PzSec>

        {cropLogo && <ImageCropper file={cropLogo} aspect={1} salidaW={400} salidaH={400} onCancel={() => setCropLogo(null)} onCropped={(blob) => { setCropLogo(null); void subirLogo(blob, 'image/jpeg') }} />}
        {cropFavicon && <ImageCropper file={cropFavicon} aspect={1} salidaW={192} salidaH={192} onCancel={() => setCropFavicon(null)} onCropped={(blob) => { setCropFavicon(null); subirFavicon(blob) }} />}
        {cropImpactoImg && <ImageCropper file={cropImpactoImg} aspect={4 / 3} salidaW={1200} salidaH={900} onCancel={() => setCropImpactoImg(null)} onCropped={(blob) => { setCropImpactoImg(null); subirImgCfg(blob, 'impacto_imagen', setSubiendoImpactoImg) }} />}
        {gestionFrutos && <GestionFrutos frutos={frutosCat} toast={toast} qc={qc} onClose={() => setGestionFrutos(false)} />}
        {editCanvas && (() => {
          const blk = bloqueEnRuta(arbolDe(editCanvas.target, cfg), editCanvas.ruta)
          if (!blk) return null
          return <ModalBloque bloque={blk} paginas={cfg.paginas || []} toast={toast}
            onClose={() => setEditCanvas(null)}
            onGuardar={(nb) => {
              setCfg(c => conArbol(editCanvas.target, c, setBloqueEnRuta(arbolDe(editCanvas.target, c), editCanvas.ruta, nb)))
              setEditCanvas(null)
            }} />
        })()}
      </div>

      {/* Vista previa en vivo */}
      <div className="pz-preview">
        <div className="pz-preview-bar">
          <span><Eye size={14} style={{ verticalAlign: '-2px' }} /> Vista previa{import.meta.env.DEV ? ' · local' : ''}{packPendiente && selPack ? ` · ${selPack.nombre}` : familiaActiva === 'atelier' ? ' · Atelier' : ' · Clásico'}</span>
          <div className="pz-devices">
            <button type="button" className={dispositivo === 'desktop' ? 'on' : ''} onClick={() => setDispositivo('desktop')} title="PC"><Monitor size={15} /></button>
            <button type="button" className={dispositivo === 'tablet' ? 'on' : ''} onClick={() => setDispositivo('tablet')} title="Tablet"><Tablet size={15} /></button>
            <button type="button" className={dispositivo === 'mobile' ? 'on' : ''} onClick={() => setDispositivo('mobile')} title="Móvil"><Smartphone size={15} /></button>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={previewMayorista} onChange={e => setPreviewMayorista(e.target.checked)} /> mayorista
          </label>
          <button type="button" className="btn btn-xs btn-secondary" onClick={() => {
            setIframeBroken(false)
            if (iframeEl && previewUrl) iframeEl.src = previewUrl
          }} title="Recargar"><RefreshCw size={13} /></button>
        </div>
        {previewUrl
          ? <div ref={setStageEl} className={`pz-stage pz-stage-${dispositivo}`}>
              {iframeBroken ? (
                <div className="pz-frame-empty" style={{ border: 0, minHeight: 320 }}>
                  No se pudo cargar el iframe.<br />
                  <a href={previewUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--selva)', fontWeight: 700 }}>Abrir catálogo ↗</a>
                </div>
              ) : (() => {
                const H = stage.h || Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.72)
                return (
                  <div className="pz-device-frame" style={dispositivo === 'desktop' ? { width: Math.round(PC_W * escala), height: H, overflow: 'hidden', borderRadius: 8, boxShadow: 'var(--sombra, 0 8px 30px rgba(0,0,0,0.15))' } : undefined}>
                    <iframe
                      key={previewUrl}
                      ref={setIframeEl}
                      className="pz-frame"
                      src={previewUrl}
                      title="Vista previa del catálogo"
                      onError={() => setIframeBroken(true)}
                      style={dispositivo === 'desktop' ? { width: PC_W, height: Math.round(H / Math.max(escala, 0.4)), transform: `scale(${escala})`, transformOrigin: 'top left', border: 0 } : undefined}
                    />
                  </div>
                )
              })()}
            </div>
          : <div className="pz-frame pz-frame-empty">
              Define la <strong>URL pública</strong> en <strong>Catálogo → Configuración</strong> (ej. https://catalogo.mumiamazonia.workers.dev) para ver la vista previa en vivo.
            </div>}
      </div>
    </div>
  )
}

// ==================== BANNERS ====================
const BANNER_VACIO = {
  nombre: '', tipo: 'imagen', imagen_url: '', imagen_tablet: '', imagen_mobile: '',
  youtube: '', titulo: '', subtitulo: '', boton_texto: '', boton_link: '',
  color_overlay: '', overlay_opacidad: 72, color_texto: '', color_boton: '',
  orden: 0, activo: true, es_secundario: false, grupo: '',
}

const OVERLAY_PRESETS = [
  { id: 'oscuro', label: 'Oscuro', color: '#111111', op: 72 },
  { id: 'selva', label: 'Selva', color: '#1a3a2a', op: 68 },
  { id: 'dorado', label: 'Dorado', color: '#C8A94A', op: 78 },
  { id: 'crema', label: 'Crema', color: '#FAF9F6', op: 86 },
]

/** Contraste de tipografía sobre un hex (capa o botón). */
function contrasteSobre(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return L > 0.55 ? '#1a1a1a' : '#ffffff'
}

/** Envía mensajes al iframe de vista previa del catálogo. */
function postToCatalogPreview(msg) {
  try {
    document.querySelectorAll('iframe.pz-frame').forEach((f) => {
      try { f.contentWindow?.postMessage(msg, '*') } catch { /* noop */ }
    })
  } catch { /* noop */ }
}

function normalizarBanner(raw = {}) {
  const n = { ...BANNER_VACIO, ...raw }
  if (n.id != null) n.id = raw.id
  for (const k of ['imagen_url', 'imagen_tablet', 'imagen_mobile', 'youtube', 'titulo', 'subtitulo', 'boton_texto', 'boton_link', 'nombre', 'grupo', 'color_overlay', 'color_texto', 'color_boton']) {
    n[k] = n[k] == null ? '' : String(n[k])
  }
  // Compat: color_fondo antiguo = capa del texto
  if (!n.color_overlay && raw.color_fondo) n.color_overlay = String(raw.color_fondo)
  const op = raw.overlay_opacidad
  if (op == null || op === '') n.overlay_opacidad = 72
  else {
    const num = Number(op)
    n.overlay_opacidad = Number.isFinite(num) ? (num <= 1 ? Math.round(num * 100) : Math.round(num)) : 72
  }
  n.activo = n.activo !== false
  n.es_secundario = !!n.es_secundario
  n.tipo = n.tipo === 'youtube' ? 'youtube' : 'imagen'
  n.orden = parseInt(n.orden, 10) || 0
  n._nuevo = !!raw._nuevo
  return n
}

/** Slots de imagen del banner: web / tablet / móvil — todos con recorte recomendado. */
const BANNER_IMG_SLOTS = [
  { key: 'web', field: 'imagen_url', label: 'Web', icon: Monitor, hint: '16:9 · se recorta a 1600×900', crop: true, aspect: 16 / 9, w: 1600, h: 900, previewRatio: '16 / 9' },
  { key: 'tablet', field: 'imagen_tablet', label: 'Tablet', icon: Tablet, hint: '4:3 · se recorta a 1200×900', crop: true, aspect: 4 / 3, w: 1200, h: 900, previewRatio: '4 / 3' },
  { key: 'mobile', field: 'imagen_mobile', label: 'Móvil', icon: Smartphone, hint: '4:5 · se recorta a 1080×1350', crop: true, aspect: 4 / 5, w: 1080, h: 1350, previewRatio: '4 / 5' },
]

function TabBanners({ toast, qc, modoAtelier = false }) {
  const [edit, setEdit] = useState(null)
  const { data: banners = [], isLoading } = useQuery({
    queryKey: ['banners_catalogo'],
    queryFn: async () => { const { data } = await supabase.from('banners_catalogo').select('*').order('orden'); return data || [] },
  })
  const eliminar = async (b) => { if (!window.confirm('¿Eliminar este banner?')) return; try { await supabase.from('banners_catalogo').delete().eq('id', b.id); qc.invalidateQueries({ queryKey: ['banners_catalogo'] }); toast('Banner eliminado') } catch (e) { toast(e.message, 'error') } }
  const claveGrupo = (x) => `${x.es_secundario ? 1 : 0}|${(x.grupo || '').trim() || 'General'}`
  const pares = (b) => banners.filter(x => claveGrupo(x) === claveGrupo(b)).sort((x, y) => (x.orden || 0) - (y.orden || 0))
  const portadaId = modoAtelier
    ? (banners.filter(b => !b.es_secundario && b.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0))[0]?.id || null)
    : null
  const mover = async (b, dir) => {
    const lista = pares(b)
    const i = lista.findIndex(x => x.id === b.id); const j = i + dir
    if (i < 0 || j < 0 || j >= lista.length) return
    const arr = [...lista]; const [m] = arr.splice(i, 1); arr.splice(j, 0, m)
    try {
      await Promise.all(arr.map((x, k) => supabase.from('banners_catalogo').update({ orden: k }).eq('id', x.id)))
      qc.invalidateQueries({ queryKey: ['banners_catalogo'] })
    } catch (e) { toast(e.message, 'error') }
  }
  const abrirEdicion = async (b) => {
    if (!b?.id) { setEdit({ ...BANNER_VACIO, ...b, _nuevo: true }); return }
    try {
      const { data, error } = await supabase.from('banners_catalogo').select('*').eq('id', b.id).maybeSingle()
      if (error) throw error
      setEdit(data || b)
    } catch {
      setEdit(b)
    }
  }
  if (isLoading) return <div className="card"><p className="empty-table">Cargando…</p></div>
  const ordenados = [...banners].sort((x, y) => (x.es_secundario ? 1 : 0) - (y.es_secundario ? 1 : 0) || String(x.grupo || '').localeCompare(String(y.grupo || '')) || (x.orden || 0) - (y.orden || 0))
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', margin: 0, flex: 1 }}>
          {modoAtelier
            ? <>Portada = primer principal activo. </>
            : <>Principales = carrusel. Secundarios = secciones del inicio. </>}
          Sin textos → solo imagen. Sube Web / Tablet / Móvil con recorte.
        </p>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEdit({ ...BANNER_VACIO, orden: banners.length, _nuevo: true })}><Plus size={14} /> Nuevo banner</button>
      </div>
      {banners.length === 0
        ? <p className="empty-table">Sin banners.</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ordenados.map(b => {
              const idx = pares(b).findIndex(x => x.id === b.id)
              const esPortada = portadaId != null && b.id === portadaId
              const thumb = b.imagen_url || b.imagen_tablet || b.imagen_mobile
              const slots = [b.imagen_url && 'W', b.imagen_tablet && 'T', b.imagen_mobile && 'M'].filter(Boolean).join('·')
              return (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
                  border: esPortada ? '1.5px solid var(--selva)' : '1px solid var(--crema-oscuro)',
                  borderRadius: 8, background: '#fff', opacity: b.activo ? 1 : 0.55,
                }}>
                  <div style={{ width: 56, height: 36, borderRadius: 6, overflow: 'hidden', background: 'var(--crema)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {thumb
                      ? <img src={thumb} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '0.85rem' }}>{b.tipo === 'youtube' ? '▶️' : '🖼️'}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.nombre || b.titulo || '(sin nombre)'}</strong>
                      <span className={`badge ${b.es_secundario ? 'badge-dorado' : 'badge-verde'}`} style={{ fontSize: '0.62rem' }}>
                        {b.es_secundario ? `2° ${(b.grupo || '').trim() || 'General'}` : (esPortada ? 'Portada' : 'Principal')}
                      </span>
                      {!b.activo && <span className="badge badge-gris" style={{ fontSize: '0.62rem' }}>Oculto</span>}
                      {b.tipo !== 'youtube' && slots && <span style={{ fontSize: '0.62rem', color: 'var(--texto-suave)' }}>{slots}</span>}
                    </div>
                    {(b.titulo || b.subtitulo) ? (
                      <div style={{ fontSize: '0.7rem', color: 'var(--texto-suave)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[b.titulo, b.subtitulo].filter(Boolean).join(' — ')}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.68rem', color: 'var(--texto-suave)' }}>Solo imagen</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                    <button className="btn btn-xs btn-secondary" title="Subir" disabled={idx === 0} onClick={() => mover(b, -1)}><ChevronUp size={13} /></button>
                    <button className="btn btn-xs btn-secondary" title="Bajar" disabled={idx === pares(b).length - 1} onClick={() => mover(b, 1)}><ChevronDown size={13} /></button>
                    <button className="btn btn-xs btn-secondary" onClick={() => abrirEdicion(b)}><Pencil size={13} /></button>
                    <button className="btn btn-xs btn-danger" onClick={() => eliminar(b)}><Trash2 size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>}
      {edit && <EditorBanner key={edit.id || 'nuevo'} banner={edit} toast={toast} qc={qc} onClose={() => setEdit(null)} modoAtelier={modoAtelier} />}
    </div>
  )
}

function EditorBanner({ banner, toast, qc, onClose, modoAtelier = false }) {
  const [b, setB] = useState(() => normalizarBanner(banner))
  const [subiendo, setSubiendo] = useState(null)
  const [cropSlot, setCropSlot] = useState(null)
  const [cargando, setCargando] = useState(!!(banner?.id && !banner?._nuevo))

  useEffect(() => {
    let cancel = false
    ;(async () => {
      if (banner?._nuevo || !banner?.id) {
        setB(normalizarBanner(banner))
        setCargando(false)
        return
      }
      setCargando(true)
      try {
        const { data } = await supabase.from('banners_catalogo').select('*').eq('id', banner.id).maybeSingle()
        if (!cancel) setB(normalizarBanner(data || banner))
      } catch {
        if (!cancel) setB(normalizarBanner(banner))
      } finally {
        if (!cancel) setCargando(false)
      }
    })()
    return () => { cancel = true }
  }, [banner?.id, banner?._nuevo])

  // Vista previa en vivo: empuja el borrador al iframe; limpia al cerrar; reenvía si el iframe recarga
  useEffect(() => {
    if (cargando) return
    const push = () => {
      const opN = Math.min(100, Math.max(0, Number(b.overlay_opacidad)))
      postToCatalogPreview({
        type: 'mumi-preview-banner',
        banner: {
          ...b,
          activo: true,
          overlay_opacidad: Number.isFinite(opN) ? opN : 72,
          color_overlay: (b.color_overlay || '').trim() || (b.color_fondo || '').trim() || '',
        },
      })
    }
    const t = setTimeout(push, 100)
    const onMsg = (e) => { if (e.data?.type === 'mumi-preview-ready') push() }
    window.addEventListener('message', onMsg)
    return () => { clearTimeout(t); window.removeEventListener('message', onMsg) }
  }, [b, cargando])
  useEffect(() => () => postToCatalogPreview({ type: 'mumi-preview-banner', banner: null }), [])

  const set = (k, v) => setB(x => ({ ...x, [k]: v }))
  const setOpacidadCapa = (v) => {
    const n = Math.min(100, Math.max(0, Number(v)))
    setB(x => ({ ...x, overlay_opacidad: Number.isFinite(n) ? n : 72 }))
  }
  const aplicarCapa = (color, opacidad, forzarTexto = false) => {
    setB(x => {
      const opN = Math.min(100, Math.max(0, Number(opacidad)))
      const next = {
        ...x,
        color_overlay: color || '',
        overlay_opacidad: Number.isFinite(opN) ? opN : (x.overlay_opacidad ?? 72),
      }
      if (color && (forzarTexto || !x.color_texto)) next.color_texto = contrasteSobre(color)
      if (!color && forzarTexto) next.color_texto = ''
      return next
    })
  }
  const subirArchivo = async (fileOrBlob, field, slotKey, contentType = 'image/jpeg') => {
    setSubiendo(slotKey)
    try {
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
      const path = `catalogo/banner_${slotKey}_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('product-images').upload(path, fileOrBlob, { upsert: true, contentType })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      setB(x => ({ ...x, [field]: data.publicUrl }))
    } catch (e) { toast('No se pudo subir: ' + e.message, 'error') } finally { setSubiendo(null) }
  }
  const onPickSlot = (slot, file) => {
    if (!file) return
    if (slot.crop) setCropSlot({ file, slot })
    else void subirArchivo(file, slot.field, slot.key, file.type || 'image/jpeg')
  }
  const guardar = async () => {
    try {
      const vacio = (v) => { const t = (v == null ? '' : String(v)).trim(); return t || null }
      const core = {
        nombre: vacio(b.nombre),
        tipo: b.tipo === 'youtube' ? 'youtube' : 'imagen',
        imagen_url: vacio(b.imagen_url),
        imagen_tablet: vacio(b.imagen_tablet),
        imagen_mobile: vacio(b.imagen_mobile),
        youtube: vacio(b.youtube),
        titulo: vacio(b.titulo),
        subtitulo: vacio(b.subtitulo),
        boton_texto: vacio(b.boton_texto),
        boton_link: vacio(b.boton_link),
        orden: parseInt(b.orden, 10) || 0,
        activo: b.activo !== false,
        es_secundario: !!b.es_secundario,
        grupo: b.es_secundario ? (vacio(b.grupo) || 'General') : null,
      }
      let id = b.id
      if (id) {
        const { error } = await supabase.from('banners_catalogo').update(core).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('banners_catalogo').insert(core).select('id').single()
        if (error) throw error
        id = data.id
      }
      const overlay = vacio(b.color_overlay)
      const estilo = {
        color_overlay: overlay,
        color_fondo: overlay, // compat catálogo / v147
        overlay_opacidad: b.overlay_opacidad == null || b.overlay_opacidad === '' ? null : Math.min(100, Math.max(0, Number(b.overlay_opacidad) || 0)),
        color_texto: vacio(b.color_texto),
        color_boton: vacio(b.color_boton),
      }
      const { error: eEstilo } = await supabase.from('banners_catalogo').update(estilo).eq('id', id)
      if (eEstilo) {
        toast('Imágenes guardadas. Para colores/opacidad ejecuta migration_v148 en Supabase.', 'error')
      } else {
        toast('Banner guardado ✓')
      }
      const { data: todos } = await supabase.from('banners_catalogo').select('*').order('orden')
      postToCatalogPreview({ type: 'mumi-banners-refresh', banners: todos || [] })
      await qc.invalidateQueries({ queryKey: ['banners_catalogo'] })
      onClose()
    } catch (e) { toast(e.message, 'error') }
  }
  const faltanSlots = BANNER_IMG_SLOTS.filter(s => !b[s.field]).map(s => s.label)
  const soloImagen = !(b.titulo?.trim() || b.subtitulo?.trim() || b.boton_texto?.trim())
  const op = Math.min(100, Math.max(0, Number(b.overlay_opacidad) || 72))
  const fgFallback = contrasteSobre(b.color_overlay || '#111111')
  const btnFallback = '#ffffff'

  return (
    <Modal open onClose={onClose} movable
      title={banner._nuevo ? 'Nuevo banner' : 'Editar banner'}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={!!subiendo || cargando}><Ico as={Save} size={14} />Guardar</button></>}>
      {cargando ? <p className="empty-table">Cargando banner…</p> : (
      <>
      <div className="form-grid-2">
        <div className="form-group"><label className="form-label">Nombre interno <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(no se muestra en el catálogo)</small></label><input className="form-control" value={b.nombre || ''} onChange={e => set('nombre', e.target.value)} placeholder="Ej: Promo octubre" /></div>
        <div className="form-group"><label className="form-label">Tipo</label>
          <Select className="form-control" value={b.tipo} onChange={e => set('tipo', e.target.value)}><option value="imagen">Imagen</option><option value="youtube">Video de YouTube</option></Select>
        </div>
      </div>
      {b.tipo === 'youtube'
        ? <div className="form-group"><label className="form-label">URL de YouTube</label><input className="form-control" value={b.youtube || ''} onChange={e => set('youtube', e.target.value)} placeholder="https://youtu.be/XXXXXXXXXXX" /></div>
        : (
          <div className="form-group">
            <label className="form-label">Imágenes por dispositivo</label>
            <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', margin: '0 0 10px' }}>
              Sube las <strong>tres versiones</strong> con recorte: <strong>Web</strong> 16:9, <strong>Tablet</strong> 4:3 y <strong>Móvil</strong> 4:5.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {BANNER_IMG_SLOTS.map(slot => {
                const url = (b[slot.field] || '').trim()
                const Icon = slot.icon
                const busy = subiendo === slot.key
                return (
                  <div key={slot.key} style={{ border: url ? '1.5px solid var(--selva)' : '1px dashed var(--crema-oscuro)', borderRadius: 10, padding: 10, background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontWeight: 700, fontSize: '0.82rem', color: 'var(--selva)' }}>
                      <Icon size={15} /> {slot.label}
                    </div>
                    <div style={{ aspectRatio: slot.previewRatio, background: 'var(--crema)', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                      {url
                        ? <img
                            key={url}
                            src={url}
                            alt=""
                            referrerPolicy="no-referrer"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        : <span style={{ fontSize: '0.7rem', color: 'var(--texto-suave)', textAlign: 'center', padding: 6 }}>Sin imagen</span>}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--texto-suave)', marginBottom: 8, lineHeight: 1.35 }}>{slot.hint}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <label className="btn btn-secondary btn-xs" style={{ cursor: busy ? 'wait' : 'pointer', flex: 1, display: 'inline-flex', justifyContent: 'center' }}>
                        {busy ? '…' : <><Upload size={12} /> {url ? 'Cambiar' : 'Subir'}</>}
                        <input type="file" accept="image/*" hidden disabled={busy || !!subiendo} onChange={e => { const f = e.target.files?.[0]; onPickSlot(slot, f); e.target.value = '' }} />
                      </label>
                      {url ? (
                        <button type="button" className="btn btn-xs btn-danger" title="Quitar" onClick={() => set(slot.field, '')} disabled={!!subiendo}><X size={12} /></button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
            {faltanSlots.length > 0 && faltanSlots.length < 3 && (
              <small style={{ color: 'var(--tierra)', fontSize: '0.72rem', display: 'block', marginTop: 8 }}>
                Falta: {faltanSlots.join(', ')}. Conviene subir las tres para un resultado óptimo.
              </small>
            )}
            {cropSlot && (
              <ImageCropper
                file={cropSlot.file}
                aspect={cropSlot.slot.aspect}
                salidaW={cropSlot.slot.w}
                salidaH={cropSlot.slot.h}
                onCancel={() => setCropSlot(null)}
                onCropped={(blob) => {
                  const { slot } = cropSlot
                  setCropSlot(null)
                  void subirArchivo(blob, slot.field, slot.key, 'image/jpeg')
                }}
              />
            )}
          </div>
        )}
      <div className="form-grid-2">
        <div className="form-group"><label className="form-label">Título <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(opcional)</small></label><input className="form-control" value={b.titulo || ''} onChange={e => set('titulo', e.target.value)} placeholder="Vacío = solo imagen" /></div>
        <div className="form-group"><label className="form-label">Subtítulo <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(opcional)</small></label><input className="form-control" value={b.subtitulo || ''} onChange={e => set('subtitulo', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Texto del botón</label><input className="form-control" value={b.boton_texto || ''} onChange={e => set('boton_texto', e.target.value)} placeholder="Ver productos" /></div>
        <div className="form-group"><label className="form-label">Enlace del botón</label><input className="form-control" value={b.boton_link || ''} onChange={e => set('boton_link', e.target.value)} placeholder="/tienda, /galeria o https://…" /></div>
      </div>
      {soloImagen ? (
        <div style={{ background: 'color-mix(in srgb, var(--selva) 8%, #fff)', border: '1px solid var(--crema-oscuro)', borderRadius: 8, padding: '8px 10px', fontSize: '0.75rem', color: 'var(--selva)', marginBottom: 10 }}>
          Sin título, subtítulo ni botón → <strong>solo imagen</strong> (sin panel/capa de texto). Arrastra el encabezado del modal para ver la vista previa.
        </div>
      ) : (
      <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid var(--crema-oscuro)', background: '#fff' }}>
        <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Colores del panel de texto</label>
        <small style={{ display: 'block', color: 'var(--texto-suave)', fontSize: '0.72rem', marginBottom: 8 }}>
          La <strong>capa</strong> es el panel (PC) / degradado (móvil) detrás del texto — no el fondo de la página.
          El color del texto se ajusta solo al elegir un preset; puedes cambiarlo. Mira el resultado en la <strong>vista previa</strong> (arrastra este modal).
        </small>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {OVERLAY_PRESETS.map(p => (
            <button key={p.id} type="button" className="btn btn-xs btn-secondary" onClick={() => aplicarCapa(p.color, p.op, true)}
              style={{ borderColor: (b.color_overlay || '').toLowerCase() === p.color.toLowerCase() ? 'var(--selva)' : undefined }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, display: 'inline-block', marginRight: 5, verticalAlign: '-1px', border: '1px solid rgba(0,0,0,0.15)' }} />
              {p.label}
            </button>
          ))}
          <button type="button" className="btn btn-xs btn-secondary" onClick={() => aplicarCapa('', op, true)}>Auto (paleta)</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          <ColorPick label="Capa" value={b.color_overlay || ''} fallback="#111111"
            onChange={v => aplicarCapa(v, op, false)}
            onClear={() => aplicarCapa('', op, false)} />
          <ColorPick label="Texto / tipografía" value={b.color_texto || ''} fallback={fgFallback}
            onChange={v => set('color_texto', v)}
            onClear={() => set('color_texto', '')} />
          <ColorPick label="Botón" value={b.color_boton || ''} fallback={btnFallback}
            onChange={v => set('color_boton', v)}
            onClear={() => set('color_boton', '')} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Opacidad de la capa · {op}%</label>
          <input type="range" min={0} max={100} step={1} value={op} onChange={e => setOpacidadCapa(e.target.value)} style={{ width: '100%' }} />
          <small style={{ display: 'block', color: 'var(--texto-suave)', fontSize: '0.68rem', marginTop: 4 }}>
            0% = transparente a la izquierda · 100% = color pleno desde la mitad del panel.
          </small>
        </div>
      </div>
      )}

      <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginBottom: 8 }}>El <strong>orden</strong> se ajusta con las flechas ↑↓ de la lista de banners.</small>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, color: 'var(--selva)' }}><input type="checkbox" checked={!!b.activo} onChange={e => set('activo', e.target.checked)} /> Activo (visible en el catálogo)</label>
      <div className="form-group" style={{ marginTop: 10 }}>
        <label className="form-label">Ubicación</label>
        <Select className="form-control" value={b.es_secundario ? 'sec' : 'prin'} onChange={e => set('es_secundario', e.target.value === 'sec')}>
          <option value="prin">{modoAtelier ? 'Banner principal (portada Atelier si es el 1º)' : 'Banner principal (slide de arriba)'}</option>
          <option value="sec">Banner secundario (dentro del inicio)</option>
        </Select>
      </div>
      {b.es_secundario && (
        <div className="form-group">
          <label className="form-label">Grupo del banner secundario</label>
          <input className="form-control" value={b.grupo || ''} onChange={e => set('grupo', e.target.value)} placeholder="Ej: Promociones" />
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Los banners con el <strong>mismo grupo</strong> forman un solo banner. Con <strong>varias imágenes</strong> se vuelve slide; con una sola es estático.</small>
        </div>
      )}
      {!b.es_secundario && (
        <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
          {modoAtelier
            ? <>En Atelier, el <strong>primer principal activo</strong> (orden ↑↓) es la portada del catálogo.</>
            : <>Los banners principales forman el carrusel de arriba.</>}
        </small>
      )}
      </>
      )}
    </Modal>
  )
}

// ==================== CONTACTO (formulario del catálogo) ====================
function TabMensajes() {
  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ['mensajes_catalogo'],
    queryFn: async () => { const { data } = await supabase.from('mensajes_catalogo').select('*').order('id', { ascending: false }).limit(500); return data || [] },
  })
  if (isLoading) return <div className="card"><p className="empty-table">Cargando…</p></div>
  return (
    <div className="card">
      <div className="card-title">✉️ Mensajes ({msgs.length})</div>
      <p style={{ fontSize: '0.84rem', color: 'var(--texto-suave)', marginTop: 0 }}>
        Aquí llegan los mensajes del formulario de la página <strong>Contacto</strong> del catálogo público.
        No son plantillas de WhatsApp (esas están en Configuración) ni la lista de correos (esa está en <strong>Correos</strong>).
      </p>
      {msgs.length === 0 ? <p className="empty-table">Aún no hay mensajes.</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map(m => (
              <div key={m.id} style={{ border: '1px solid var(--crema-oscuro)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ color: 'var(--selva)' }}>{m.nombre || 'Anónimo'}</strong>
                  {m.email && <a href={`mailto:${m.email}`} style={{ fontSize: '0.82rem', color: 'var(--tierra)' }}>{m.email}</a>}
                  {m.telefono && <span style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>· {m.telefono}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--texto-suave)' }}>{m.created_at ? new Date(m.created_at).toLocaleString('es-CO') : ''}</span>
                </div>
                <p style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{m.mensaje}</p>
              </div>
            ))}
          </div>}
    </div>
  )
}

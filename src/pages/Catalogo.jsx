import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../hooks/useToast'
import { fNum } from '../lib/businessLogic'
import { Store, Eye, EyeOff, Star, Save, Settings, BarChart3, ExternalLink, Pencil, X, Plus, Upload, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Palette, Image as ImageIcon, Layout, Users, RefreshCw, Monitor, Tablet, Smartphone } from 'lucide-react'
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

// Fuentes de Google disponibles para el catálogo (títulos, subtítulos, párrafos)
const FUENTES = [
  'Playfair Display', 'Cormorant Garamond', 'DM Serif Display', 'Lora', 'Merriweather', 'Libre Baskerville',
  'Source Sans 3', 'Poppins', 'Montserrat', 'Nunito', 'Raleway', 'Work Sans', 'Quicksand',
  'Josefin Sans', 'Roboto', 'Open Sans', 'Inter', 'DM Sans', 'Rubik', 'Mulish',
]

const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />
const fCOP = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')

const capital = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
const imgsDe = (p) => { try { const a = Array.isArray(p.imagenes) ? p.imagenes : JSON.parse(p.imagenes || '[]'); return a.length ? a : (p.imagen_url ? [p.imagen_url] : []) } catch { return p.imagen_url ? [p.imagen_url] : [] } }

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

export default function Catalogo() {
  const toast = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState('productos')
  const { data: cfgUrl } = useQuery({
    queryKey: ['catalogo_url'],
    queryFn: async () => { const { data } = await supabase.from('config_catalogo').select('url_publica').eq('id', 1).maybeSingle(); return data?.url_publica || '' },
  })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><Ico as={Store} size={16} />Catálogo público</h1>
        <div className="page-actions">
          {cfgUrl
            ? <a className="btn btn-secondary btn-sm" href={cfgUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ExternalLink size={14} /> Ver catálogo
              </a>
            : <span style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>Define la URL en <strong>Configuración</strong></span>}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'productos' ? 'active' : ''}`} onClick={() => setTab('productos')}><Ico as={Store} size={14} />Productos</button>
        <button className={`tab-btn ${tab === 'personalizar' ? 'active' : ''}`} onClick={() => setTab('personalizar')}><Ico as={Palette} size={14} />Personalizar</button>
        <button className={`tab-btn ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}><Ico as={Settings} size={14} />Configuración</button>
        <button className={`tab-btn ${tab === 'mensajes' ? 'active' : ''}`} onClick={() => setTab('mensajes')}>✉️ Mensajes</button>
        <button className={`tab-btn ${tab === 'metricas' ? 'active' : ''}`} onClick={() => setTab('metricas')}><Ico as={BarChart3} size={14} />Métricas</button>
      </div>

      {tab === 'productos' && <TabProductos toast={toast} qc={qc} />}
      {tab === 'personalizar' && <TabPersonalizar toast={toast} qc={qc} cfgUrl={cfgUrl} />}
      {tab === 'config' && <TabConfig toast={toast} />}
      {tab === 'mensajes' && <TabMensajes />}
      {tab === 'metricas' && <TabMetricas />}
    </div>
  )
}

// ==================== PRODUCTOS ====================
function TabProductos({ toast, qc }) {
  const [editar, setEditar] = useState(null)   // producto en edición
  const [gestFrutos, setGestFrutos] = useState(false)
  const { data: frutosCat = [] } = useQuery({
    queryKey: ['frutos_catalogo'],
    queryFn: async () => { const { data } = await supabase.from('frutos_catalogo').select('*').order('orden'); return data || [] },
  })
  const { data: productos = [], isLoading } = useQuery({
    queryKey: ['catalogo_admin_productos'],
    queryFn: async () => {
      const { data } = await supabase.from('finished_products')
        .select('id, nombre, product_id, precio_detal, precio_mayor, imagen_url, imagenes, descripcion, catalogo_descripcion, categoria_alegra_nombre, catalogo_visible, catalogo_frutos, catalogo_beneficios, catalogo_destacado, catalogo_novedad, catalogo_precio_oferta, catalogo_seo_titulo, catalogo_seo_desc, stock, activo')
        .order('nombre')
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
                      {imgsDe(p)[0] ? <img src={imgsDe(p)[0]} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} /> : <span style={{ fontSize: '1.3rem' }}>🌿</span>}
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

      {editar && <EditorProducto producto={editar} frutosCat={frutosCat} toast={toast} qc={qc} onClose={() => setEditar(null)} />}
      {gestFrutos && <GestionFrutos frutos={frutosCat} toast={toast} qc={qc} onClose={() => setGestFrutos(false)} />}
    </div>
    <ProductosExtra toast={toast} baseProductos={productos} />
    </>
  )
}

// ---- Productos y combos adicionales (no vienen de Productos Terminados) ----
const EXTRA_VACIO = (tipo) => ({ id: 'x' + Date.now() + Math.random().toString(36).slice(2, 5), tipo, nombre: '', categoria: '', descripcion: '', imagenes: [], precio_detal: '', precio_oferta: '', precio_mayor: '', stock: '', componentes: [], destacado: false, novedad: false, visible: true })
function ProductosExtra({ toast, baseProductos = [] }) {
  const [items, setItems] = useState(null)
  const [cats, setCats] = useState([])            // categorías creadas por el usuario
  const [catInput, setCatInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [comp, setComp] = useState({})   // borrador de componente por combo
  useEffect(() => { supabase.from('config_catalogo').select('productos_extra, categorias_extra').eq('id', 1).maybeSingle().then(({ data }) => { setItems(Array.isArray(data?.productos_extra) ? data.productos_extra : []); setCats(Array.isArray(data?.categorias_extra) ? data.categorias_extra : []) }) }, [])
  const catsConocidas = [...new Set([...baseProductos.map(p => p.categoria).filter(Boolean), ...cats, ...(items || []).map(x => x.categoria).filter(Boolean)])]
  const addCat = () => { const v = catInput.trim(); if (v && !cats.includes(v)) setCats(c => [...c, v]); setCatInput('') }
  const delCat = (c) => setCats(cs => cs.filter(x => x !== c))
  const upd = (i, campo, val) => setItems(a => a.map((x, k) => k === i ? { ...x, [campo]: val } : x))
  const add = (tipo) => setItems(a => [...(a || []), EXTRA_VACIO(tipo)])
  const del = (i) => setItems(a => a.filter((_, k) => k !== i))
  const subir = async (i, files) => {
    setSubiendo(true)
    try {
      const nuevos = []
      for (const f of files) {
        const path = `catalogo/extra_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`
        const { error } = await supabase.storage.from('product-images').upload(path, f, { upsert: true, contentType: f.type || 'image/jpeg' })
        if (error) throw error
        const { data } = supabase.storage.from('product-images').getPublicUrl(path)
        nuevos.push(data.publicUrl)
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
      }))
      const { error } = await supabase.from('config_catalogo').upsert({ id: 1, productos_extra: limpio, categorias_extra: cats, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      if (error) throw error
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
                {(x.imagenes || []).map((url, k) => (
                  <div key={k} style={{ position: 'relative', width: 62, height: 62 }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    <button onClick={() => upd(i, 'imagenes', x.imagenes.filter((_, z) => z !== k))} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '2px 4px' }}><X size={11} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={guardar} disabled={saving}><Ico as={Save} size={14} />{saving ? 'Guardando…' : 'Guardar productos adicionales'}</button>
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
function EditorProducto({ producto, frutosCat = [], toast, qc, onClose }) {
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
  const [imgs, setImgs] = useState(imgsDe(producto))
  const [subiendo, setSubiendo] = useState(false)
  const [cropFile, setCropFile] = useState(null)   // archivo pendiente de recortar
  const [nuevoFruto, setNuevoFruto] = useState(null)  // abre EditorFruto inline
  const [gestionFrutos, setGestionFrutos] = useState(false)  // abre gestor de frutos
  const [saving, setSaving] = useState(false)

  const toggleFruto = (id) => setFrutos(fs => fs.includes(id) ? fs.filter(x => x !== id) : [...fs, id])
  const moverImg = (i, d) => setImgs(a => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a;[b[i], b[j]] = [b[j], b[i]]; return b })
  const addBene = () => { const v = beneInput.trim(); if (v && !beneficios.includes(v)) setBeneficios(b => [...b, v]); setBeneInput('') }
  const quitarBene = (b) => setBeneficios(bs => bs.filter(x => x !== b))

  // Sube un blob ya recortado (1:1) al bucket y lo agrega a la galería
  const subirBlob = async (blob) => {
    setSubiendo(true)
    try {
      const path = `catalogo/${producto.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      setImgs(a => [...a, data.publicUrl])
    } catch (e) { toast('No se pudo subir la imagen: ' + e.message, 'error') } finally { setSubiendo(false) }
  }
  const quitarImg = (url) => setImgs(a => a.filter(x => x !== url))

  const guardar = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('finished_products').update({
        catalogo_frutos: frutos, catalogo_beneficios: beneficios, catalogo_destacado: destacado, catalogo_novedad: novedad,
        catalogo_descripcion: descripcion || null, catalogo_precio_oferta: (precioOferta === '' || Number(precioOferta) <= 0) ? null : Number(precioOferta),
        catalogo_seo_titulo: seoTitulo.trim() || null, catalogo_seo_desc: seoDesc.trim() || null,
        imagen_url: imgs[0] || null, imagenes: imgs,
      }).eq('id', producto.id)
      if (error) throw error
      // Las imágenes SÍ son las mismas de la ficha; se sincronizan. La descripción NO (la del catálogo es aparte).
      if (producto.product_id) {
        try { await supabase.from('products_costing').update({ imagen_url: imgs[0] || null, imagenes: imgs }).eq('id', producto.product_id) } catch { /* opcional */ }
      }
      qc.invalidateQueries({ queryKey: ['catalogo_admin_productos'] })
      toast('Producto actualizado ✓'); onClose()
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} size="modal-lg"
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Store size={18} /> {producto.nombre}</span>}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
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
      <div className="card-title" style={{ fontSize: '0.95rem' }}>🔎 SEO (al compartir el enlace)</div>
      <div className="form-grid-2">
        <div className="form-group"><label className="form-label">Título SEO</label><input className="form-control" value={seoTitulo} onChange={e => setSeoTitulo(e.target.value)} placeholder={producto.nombre} /></div>
        <div className="form-group"><label className="form-label">Descripción SEO</label><input className="form-control" value={seoDesc} onChange={e => setSeoDesc(e.target.value)} placeholder="Se toma de la descripción del producto" /></div>
      </div>
      <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginBottom: 12 }}>Si los dejas vacíos se usan el <strong>nombre</strong> y la <strong>descripción</strong> del producto.</small>

      {/* Imágenes */}
      <div className="card-title" style={{ fontSize: '0.95rem' }}>🖼️ Imágenes <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--texto-suave)' }}>(las mismas de la ficha)</span></div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        {imgs.map((url, i) => (
          <div key={url} style={{ position: 'relative', width: 84, height: 84 }}>
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: i === 0 ? '2px solid var(--selva)' : '1px solid var(--crema-oscuro)' }} />
            {i === 0 && <span style={{ position: 'absolute', top: -8, left: -6, fontSize: '0.6rem', background: 'var(--selva)', color: '#fff', padding: '1px 5px', borderRadius: 6 }}>Principal</span>}
            <button className="btn btn-xs btn-danger" style={{ position: 'absolute', top: -8, right: -8, padding: 3 }} onClick={() => quitarImg(url)}><X size={12} /></button>
            <div style={{ position: 'absolute', bottom: 2, left: 2, right: 2, display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-xs btn-secondary" style={{ padding: '1px 4px' }} disabled={i === 0} onClick={() => moverImg(i, -1)}><ChevronLeft size={12} /></button>
              <button className="btn btn-xs btn-secondary" style={{ padding: '1px 4px' }} disabled={i === imgs.length - 1} onClick={() => moverImg(i, 1)}><ChevronRight size={12} /></button>
            </div>
          </div>
        ))}
        <label className="btn btn-secondary btn-sm" style={{ width: 84, height: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 4 }}>
          {subiendo ? '…' : <><Upload size={18} /><span style={{ fontSize: '0.66rem' }}>Subir</span></>}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = '' }} />
        </label>
      </div>
      <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Recomendado: 1000×1000 px (cuadrada). Al subir podrás recortar. Usa ‹ › para ordenar (la 1ª es la principal).</small>
      {cropFile && <ImageCropper file={cropFile} aspect={1} salidaW={1000} salidaH={1000} onCancel={() => setCropFile(null)} onCropped={(blob) => { setCropFile(null); subirBlob(blob) }} />}

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
  { t: 'saludo', d: 'Saludo' }, { t: 'cliente', d: 'Nombre del cliente' }, { t: 'pedido', d: 'Detalle del pedido' },
  { t: 'total', d: 'Total' }, { t: 'envio', d: 'Envío' }, { t: 'nota', d: 'Nota del cliente' },
  { t: 'cierre', d: 'Frase de cierre' }, { t: 'tienda', d: 'Nombre de la tienda' },
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
function AvisosEditor({ avisos = [], onChange }) {
  const lista = avisos.map(a => (typeof a === 'string' ? a : a?.texto || ''))
  const upd = (i, v) => onChange(lista.map((t, k) => k === i ? v : t))
  const add = () => lista.length < 3 && onChange([...lista, ''])
  const del = (i) => onChange(lista.filter((_, k) => k !== i))
  const mover = (i, d) => { const a = [...lista]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  return (
    <div style={{ marginTop: 8 }}>
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
          <div style={{ background: 'var(--dorado)', color: 'var(--selva)', fontSize: '0.78rem', fontWeight: 700, padding: '6px 12px', textAlign: 'center', borderRadius: 6 }}>{lista.find(t => t.trim())}</div>
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
function TabConfig({ toast }) {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [sec, setSec] = useState('general')     // sección abierta del acordeón
  const [waSel, setWaSel] = useState('stock')   // mensaje que se previsualiza
  useEffect(() => {
    supabase.from('config_catalogo').select('*').eq('id', 1).maybeSingle()
      .then(({ data }) => setCfg(data || { id: 1 }))
  }, [])
  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))
  const guardar = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('config_catalogo').upsert({ ...cfg, id: 1, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      if (error) throw error
      toast('Configuración del catálogo guardada ✓')
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }
  if (!cfg) return <div className="card"><p className="empty-table">Cargando…</p></div>
  const base = (cfg.url_publica || '').replace(/\/+$/, '')
  return (
    <div className="pz-layout">
      {/* Panel de ajustes en acordeón */}
      <div className="pz-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={saving}><Ico as={Save} size={13} />{saving ? 'Guardando…' : 'Guardar configuración'}</button>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>La apariencia se edita en <strong>Personalizar</strong>.</small>
        </div>

        <PzSec abierto={sec} setAbierto={setSec} id="general" titulo={<><Ico as={Settings} size={14} />Datos generales</>}>
          <div className="form-group"><label className="form-label">URL pública del catálogo</label><input className="form-control" value={cfg.url_publica || ''} onChange={e => set('url_publica', e.target.value)} placeholder="https://catalogo.tu-cuenta.workers.dev" /><small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>La que te dé Cloudflare al desplegar (o tu dominio propio).</small></div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">WhatsApp (con indicativo)</label><input className="form-control" value={cfg.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} placeholder="+573157702180" /></div>
            <div className="form-group"><label className="form-label">País <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(para el copyright)</small></label><input className="form-control" value={cfg.pais || ''} onChange={e => set('pais', e.target.value)} placeholder="Colombia" /></div>
          </div>
          <div className="form-group" style={{ maxWidth: 240 }}><label className="form-label">Pedido mínimo al detal (COP)</label><MoneyInput value={cfg.pedido_minimo ?? 0} onChange={v => set('pedido_minimo', v || 0)} /></div>
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="envio" titulo={<>🚚 Envío</>}>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Tarifa fija de envío (opcional)</label><MoneyInput value={cfg.envio_tarifa ?? ''} onChange={v => set('envio_tarifa', v || null)} /></div>
            <div className="form-group"><label className="form-label">Mensaje de envío (opcional)</label><input className="form-control" value={cfg.envio_mensaje || ''} onChange={e => set('envio_mensaje', e.target.value)} placeholder="Envío a todo el país en 2–4 días" /></div>
          </div>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Si dejas ambos vacíos, el envío <strong>no se muestra</strong> en ningún lado. Se muestra en el <strong>carrito</strong>, pero <strong>no se envía por WhatsApp</strong> salvo que insertes la ficha <strong>{'{envio}'}</strong> en una plantilla.</small>
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="pagos" titulo={<>💳 Métodos de pago</>}>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Se muestran en el <strong>carrito</strong> (no se envían por WhatsApp).</small>
          <PagosEditor pagos={Array.isArray(cfg.pagos) ? cfg.pagos : []} onChange={v => set('pagos', v)} />
        </PzSec>

        <PzSec abierto={sec} setAbierto={setSec} id="seo" titulo={<>🔎 SEO del sitio</>}>
          <div className="form-group"><label className="form-label">Título</label><input className="form-control" value={cfg.seo_titulo || ''} onChange={e => set('seo_titulo', e.target.value)} placeholder={cfg.nombre_tienda || 'Mumi Amazonia'} /></div>
          <div className="form-group"><label className="form-label">Descripción</label><textarea className="form-control" rows={2} value={cfg.seo_descripcion || ''} onChange={e => set('seo_descripcion', e.target.value)} placeholder={[cfg.nombre_tienda || 'Mumi Amazonia', cfg.slogan].filter(Boolean).join(' — ')} /></div>
          <div className="form-group"><label className="form-label">Imagen para compartir (URL)</label><input className="form-control" value={cfg.seo_imagen || ''} onChange={e => set('seo_imagen', e.target.value)} placeholder="https://…/imagen.jpg" /></div>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Si lo dejas vacío se usa <strong>nombre de la tienda + slogan</strong> y el logo. El SEO de cada producto se edita en <strong>Productos</strong>.</small>
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
              placeholder={'{saludo}\nSoy *{cliente}*\n\n🛒 *MI PEDIDO*\n\n{pedido}\n━━━━━━━━━━━━━━\n💰 *Total: {total}*\n\n{nota}\n\n{cierre}'}
              ayuda="Por defecto: saludo → Soy [cliente] → pedido → total → cierre." />
          </div>
          <div onFocus={() => setWaSel('sinstock')}>
            <CampoPlantillaWA label="2) Consulta de disponibilidad (agotado)" value={cfg.wa_texto_sin_stock} onChange={v => set('wa_texto_sin_stock', v)}
              tokens={TOKENS_WA.filter(k => k.t !== 'cliente' && k.t !== 'total')}
              placeholder={'{saludo} Quisiera consultar la disponibilidad de:\n\n{pedido}\n\n💬 *¿Cuándo estará disponible?*\n\n{cierre}'}
              ayuda="No incluye nombre del cliente ni total (es una consulta)." />
          </div>
          <div onFocus={() => setWaSel('mayorista')}>
            <CampoPlantillaWA label="3) Pedido mayorista" value={cfg.wa_texto_mayorista} onChange={v => set('wa_texto_mayorista', v)}
              placeholder={'{saludo}\nSoy *{cliente}*, mayorista, y quiero hacer este pedido:\n\n{pedido}\n━━━━━━━━━━━━━━\n💰 *Total: {total}*\n\n{cierre}'}
              ayuda="Se usa cuando el cliente pide desde la zona mayorista." />
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
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Clave de acceso <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(vacío = sin clave)</small></label><input className="form-control" value={cfg.mayorista_clave || ''} onChange={e => set('mayorista_clave', e.target.value)} placeholder="Ej: Mum1Mayor2026" /></div>
            <div className="form-group"><label className="form-label">Pedido mínimo mayorista (COP)</label><MoneyInput value={cfg.mayorista_pedido_minimo ?? 0} onChange={v => set('mayorista_pedido_minimo', v || 0)} /></div>
          </div>
          {base && <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Enlace para mayoristas: <strong>{base}/mayorista</strong></small>}
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 6 }}>El mensaje que se envía por WhatsApp se edita en <strong>Mensajes de WhatsApp → 4)</strong>.</small>
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
                <div className="cfg-mayo-barra">
                  <span>{cfg.mayorista_mensaje || '¿Eres mayorista? Accede a precios especiales por volumen.'}</span>
                  <span className="cfg-mayo-btn">Quiero ser mayorista</span>
                </div>
                <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 8 }}>Así se ve la barra fija bajo el menú. {cfg.mayorista_clave ? 'El acceso pedirá clave.' : 'El acceso no pedirá clave.'}</small>
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

          {(sec === 'general' || !sec) && (
            <div style={{ fontSize: '0.85rem', color: 'var(--texto-suave)', lineHeight: 1.7 }}>
              <div><strong>Catálogo:</strong> {base || '— sin URL —'}</div>
              <div><strong>WhatsApp:</strong> {cfg.whatsapp || '—'}</div>
              <div><strong>Pedido mínimo:</strong> {fCOP(cfg.pedido_minimo || 0)}</div>
              <div><strong>País:</strong> {cfg.pais || '—'}</div>
              <p style={{ marginTop: 10 }}>Abre una sección para ver su vista previa.</p>
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
// Estilos de diseño (formas/bordes), independientes del color
const DISENOS = [
  { id: 'selva', nombre: 'Selva', desc: 'Redondeado suave (actual)', radio: 12, radioMini: 4 },
  { id: 'editorial', nombre: 'Editorial', desc: 'Elegante, esquinas rectas, líneas finas', radio: 0, radioMini: 0 },
  { id: 'organico', nombre: 'Orgánico', desc: 'Muy redondeado, botones píldora, suave', radio: 20, radioMini: 8 },
]
const PLANTILLAS = [
  { id: 'amazonia', nombre: 'Amazonia', primario: '#1a3a2a', secundario: '#C8A94A' },
  { id: 'natural', nombre: 'Natural', primario: '#3d6b4a', secundario: '#7CB342' },
  { id: 'noche', nombre: 'Noche selva', primario: '#0f261b', secundario: '#d9bd63' },
  { id: 'tierra', nombre: 'Tierra', primario: '#5c3d2e', secundario: '#d99a4e' },
  // Tonos pastel / suaves
  { id: 'menta', nombre: 'Menta pastel', primario: '#5b8a72', secundario: '#a8d5ba' },
  { id: 'durazno', nombre: 'Durazno', primario: '#c67b5c', secundario: '#f6c9a8' },
  { id: 'lavanda', nombre: 'Lavanda', primario: '#6d5c8a', secundario: '#cdc0e6' },
  { id: 'rosa', nombre: 'Rosa suave', primario: '#a35d6a', secundario: '#f3c6cf' },
  { id: 'cielo', nombre: 'Cielo', primario: '#4a7c93', secundario: '#bfe0ec' },
  { id: 'arena', nombre: 'Arena', primario: '#8a7a5c', secundario: '#ece2c8' },
  // Vibrantes / oscuros
  { id: 'vino', nombre: 'Vino & oro', primario: '#6b1f3a', secundario: '#d4af37' },
  { id: 'oceano', nombre: 'Océano', primario: '#0e5a6e', secundario: '#3fb8c0' },
  { id: 'chocolate', nombre: 'Chocolate', primario: '#4a2f24', secundario: '#c88a52' },
  { id: 'coral', nombre: 'Coral', primario: '#c14b57', secundario: '#ffb4a2' },
  { id: 'grafito', nombre: 'Grafito', primario: '#2f3640', secundario: '#b0883c' },
  { id: 'uva', nombre: 'Uva', primario: '#4a2b6b', secundario: '#c9a8e6' },
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
  { tipo: 'banner', label: 'Banner' }, { tipo: 'newsletter', label: 'Suscripción' },
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

function TabPersonalizar({ toast, qc, cfgUrl }) {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [cropLogo, setCropLogo] = useState(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [abierto, setAbierto] = useState('marca')       // sección abierta del acordeón
  const [gestionFrutos, setGestionFrutos] = useState(false)
  const [previewMayorista, setPreviewMayorista] = useState(false)
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

  useEffect(() => {
    supabase.from('config_catalogo').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      const base = data || { id: 1 }
      if (!Array.isArray(base.secciones) || !base.secciones.length) base.secciones = SECCIONES_DEFAULT
      // Por defecto, las fuentes son las mismas que las configuradas en la app
      const app = getConfig()
      if (!base.fuente_titulos) base.fuente_titulos = app.fuente_titulos || 'Playfair Display'
      if (!base.fuente_subtitulos) base.fuente_subtitulos = app.fuente || 'Source Sans 3'
      if (!base.fuente_texto) base.fuente_texto = app.fuente || 'Source Sans 3'
      setCfg(base)
    })
  }, [])

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))

  // Envía la config al preview (iframe) para verlo en vivo
  const enviarPreview = () => { try { iframeEl?.contentWindow?.postMessage({ type: 'mumi-preview', cfg }, '*') } catch { /* noop */ } }
  const enviarEdicion = () => { try { iframeEl?.contentWindow?.postMessage({ type: 'mumi-edit-mode', on: !!lienzo, target: lienzo }, '*') } catch { /* noop */ } }
  // Entra/sale del editor en el lienzo para un objetivo ('nosotros' o 'pagina:slug')
  const entrarLienzo = (target) => {
    const on = lienzo === target ? null : target
    setLienzo(on)
    if (iframeEl) {
      const base = (cfgUrl || '').replace(/\/+$/, '')
      iframeEl.src = on === 'nosotros' ? `${base}/nosotros` : (on && on.startsWith('pagina:')) ? `${base}/p/${on.slice(7)}` : cfgUrl
    }
  }
  useEffect(() => { if (iframeEl && cfg) { const t = setTimeout(enviarPreview, 150); return () => clearTimeout(t) } }, [cfg, iframeEl]) // eslint-disable-line
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

  const subirLogo = async (blob) => {
    setSubiendoLogo(true)
    try {
      const path = `catalogo/logo_${Date.now()}.jpg`
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      set('logo_url', data.publicUrl)
    } catch (e) { toast('No se pudo subir el logo: ' + e.message, 'error') } finally { setSubiendoLogo(false) }
  }
  const aplicarPlantilla = (p) => setCfg(c => ({ ...c, plantilla: p.id, color_primario: p.primario, color_secundario: p.secundario }))
  const moverSeccion = (i, d) => setCfg(c => { const a = [...(c.secciones || SECCIONES_DEFAULT)]; const j = i + d; if (j < 0 || j >= a.length) return c;[a[i], a[j]] = [a[j], a[i]]; return { ...c, secciones: a } })
  const toggleSeccion = (id) => setCfg(c => ({ ...c, secciones: (c.secciones || SECCIONES_DEFAULT).map(s => s.id === id ? { ...s, on: !(s.on !== false) } : s) }))

  const guardar = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('config_catalogo').upsert({ ...cfg, id: 1, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      if (error) throw error
      toast('Personalización guardada ✓')
      if (iframeEl) iframeEl.src = iframeEl.src   // recarga el preview con datos guardados
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  if (!cfg) return <div className="card"><p className="empty-table">Cargando…</p></div>
  const secciones = cfg.secciones || SECCIONES_DEFAULT

  return (
    <div className="pz-layout">
      {/* Panel de controles */}
      <div className="pz-panel">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={saving}><Ico as={Save} size={13} />{saving ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="marca" titulo={<><ImageIcon size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Marca (logo, nombre, slogan)</>}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden', background: 'var(--crema)', border: '1px solid var(--crema-oscuro)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {cfg.logo_url ? <img src={cfg.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.66rem', color: 'var(--texto-suave)' }}>Sin logo</span>}
              </div>
              <label className="btn btn-xs btn-secondary" style={{ marginTop: 6, cursor: 'pointer' }}><Upload size={12} /> {subiendoLogo ? '…' : 'Logo'}<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setCropLogo(f); e.target.value = '' }} /></label>
              {cfg.logo_url && <button className="btn btn-xs btn-danger" style={{ marginTop: 4 }} onClick={() => set('logo_url', '')}>Quitar</button>}
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
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Si dejas el nombre o el slogan vacíos, se usa el valor por defecto de la app. El logo se recorta cuadrado (recomendado 400×400).</small>
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="colores" titulo={<><Palette size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Colores y diseño</>}>
          <label className="form-label">Estilo de diseño <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(formas, bordes y botones)</small></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {DISENOS.map(d => (
              <button key={d.id} type="button" onClick={() => set('diseno', d.id)} title={d.desc}
                style={{ flex: '1 1 150px', textAlign: 'left', padding: 10, borderRadius: d.radio, cursor: 'pointer', background: '#fff', border: (cfg.diseno || 'selva') === d.id ? '2px solid var(--selva)' : '1px solid var(--crema-oscuro)' }}>
                <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                  <span style={{ width: 26, height: 16, background: 'var(--selva)', borderRadius: d.radioMini }} />
                  <span style={{ width: 16, height: 16, background: 'var(--dorado)', borderRadius: d.radioMini }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--selva)' }}>{d.nombre}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>{d.desc}</div>
              </button>
            ))}
          </div>
          <label className="form-label">Plantillas de color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {PLANTILLAS.map(p => (
              <button key={p.id} type="button" onClick={() => aplicarPlantilla(p)} title={p.nombre}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                  border: cfg.plantilla === p.id ? '2px solid var(--selva)' : '1px solid var(--crema-oscuro)', background: '#fff' }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, background: p.primario }} /><span style={{ width: 16, height: 16, borderRadius: 4, background: p.secundario }} />{p.nombre}
              </button>
            ))}
          </div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Color primario</label><input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={cfg.color_primario || '#1a3a2a'} onChange={e => set('color_primario', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Color de acento</label><input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={cfg.color_secundario || '#C8A94A'} onChange={e => set('color_secundario', e.target.value)} /></div>
          </div>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer', marginTop: 10 }}>
            <input type="checkbox" checked={!!cfg.mostrar_filtro_frutos} onChange={e => set('mostrar_filtro_frutos', e.target.checked)} /> Mostrar filtro por frutos en la tienda
          </label>
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="aviso" titulo={<><Megaphone size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Aviso superior</>}>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
            Franja sobre el encabezado para anuncios breves (ej. <em>“🎉 10% de descuento por temporada”</em>). Puedes poner hasta <strong>3</strong> mensajes que van rotando. Si no configuras ninguno, no se muestra.
          </small>
          <AvisosEditor avisos={Array.isArray(cfg.avisos) ? cfg.avisos : []} onChange={v => set('avisos', v)} />
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="barra" titulo={<>📣 Barra de beneficios</>}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={cfg.barra_activa !== false} onChange={e => set('barra_activa', e.target.checked)} /> Mostrar la barra
          </label>
          <BarraItemsEditor items={Array.isArray(cfg.barra_items) ? cfg.barra_items : []} onChange={(v) => set('barra_items', v)} />
          <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">Tamaño del texto</label>
            <Select className="form-control" value={cfg.barra_tamano || 'md'} onChange={e => set('barra_tamano', e.target.value)}><option value="sm">Pequeño</option><option value="md">Mediano</option><option value="lg">Grande</option></Select>
          </div>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>El color de la barra depende de la <strong>plantilla</strong>. Aparece debajo de la de "¿Eres mayorista?".</small>
        </PzSec>

        <PzSec abierto={abierto} setAbierto={setAbierto} id="footer" titulo={<>🔻 Pie de página (footer)</>}>
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
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Los banners <strong>principales</strong> aparecen arriba (carrusel). Los <strong>secundarios</strong> se colocan donde quieras desde "Secciones del inicio".</small>
          <TabBanners toast={toast} qc={qc} embed />
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

        {cropLogo && <ImageCropper file={cropLogo} aspect={1} salidaW={400} salidaH={400} onCancel={() => setCropLogo(null)} onCropped={(blob) => { setCropLogo(null); subirLogo(blob) }} />}
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
          <span><Eye size={14} style={{ verticalAlign: '-2px' }} /> Vista previa</span>
          <div className="pz-devices">
            <button className={dispositivo === 'desktop' ? 'on' : ''} onClick={() => setDispositivo('desktop')} title="PC"><Monitor size={15} /></button>
            <button className={dispositivo === 'tablet' ? 'on' : ''} onClick={() => setDispositivo('tablet')} title="Tablet"><Tablet size={15} /></button>
            <button className={dispositivo === 'mobile' ? 'on' : ''} onClick={() => setDispositivo('mobile')} title="Móvil"><Smartphone size={15} /></button>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={previewMayorista} onChange={e => setPreviewMayorista(e.target.checked)} /> mayorista
          </label>
          <button className="btn btn-xs btn-secondary" onClick={() => { if (iframeEl) iframeEl.src = iframeEl.src }} title="Recargar"><RefreshCw size={13} /></button>
        </div>
        {cfgUrl
          ? <div ref={setStageEl} className={`pz-stage pz-stage-${dispositivo}`}>
              {(() => { const H = stage.h || Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.72)
                return (
                  <div className="pz-device-frame" style={dispositivo === 'desktop' ? { width: Math.round(PC_W * escala), height: H, overflow: 'hidden', borderRadius: 8, boxShadow: 'var(--sombra, 0 8px 30px rgba(0,0,0,0.15))' } : undefined}>
                    <iframe ref={setIframeEl} className="pz-frame" src={cfgUrl} title="Vista previa del catálogo"
                      style={dispositivo === 'desktop' ? { width: PC_W, height: Math.round(H / escala), transform: `scale(${escala})`, transformOrigin: 'top left', border: 0 } : undefined} />
                  </div>
                ) })()}
            </div>
          : <div className="pz-frame pz-frame-empty">Define la <strong>URL pública</strong> en Configuración para ver la vista previa en vivo.</div>}
      </div>
    </div>
  )
}

// ==================== BANNERS ====================
const BANNER_VACIO = { nombre: '', tipo: 'imagen', imagen_url: '', youtube: '', titulo: '', subtitulo: '', boton_texto: '', boton_link: '', orden: 0, activo: true, es_secundario: false, grupo: '' }

function TabBanners({ toast, qc }) {
  const [edit, setEdit] = useState(null)
  const { data: banners = [], isLoading } = useQuery({
    queryKey: ['banners_catalogo'],
    queryFn: async () => { const { data } = await supabase.from('banners_catalogo').select('*').order('orden'); return data || [] },
  })
  const eliminar = async (b) => { if (!window.confirm('¿Eliminar este banner?')) return; try { await supabase.from('banners_catalogo').delete().eq('id', b.id); qc.invalidateQueries({ queryKey: ['banners_catalogo'] }); toast('Banner eliminado') } catch (e) { toast(e.message, 'error') } }
  // Reordena dentro de su propio conjunto (principales entre sí; secundarios dentro de su grupo)
  const claveGrupo = (x) => `${x.es_secundario ? 1 : 0}|${(x.grupo || '').trim() || 'General'}`
  const pares = (b) => banners.filter(x => claveGrupo(x) === claveGrupo(b)).sort((x, y) => (x.orden || 0) - (y.orden || 0))
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
  if (isLoading) return <div className="card"><p className="empty-table">Cargando…</p></div>
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)', margin: 0 }}>Los <strong>principales</strong> forman el carrusel de arriba. Los <strong>secundarios</strong> se agrupan: cada grupo es un banner independiente que colocas desde "Secciones del inicio".</p>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEdit({ ...BANNER_VACIO, orden: banners.length, _nuevo: true })}><Plus size={14} /> Nuevo banner</button>
      </div>
      {banners.length === 0
        ? <p className="empty-table">Sin banners.</p>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
            {[...banners].sort((x, y) => (x.es_secundario ? 1 : 0) - (y.es_secundario ? 1 : 0) || String(x.grupo || '').localeCompare(String(y.grupo || '')) || (x.orden || 0) - (y.orden || 0)).map(b => {
              const idx = pares(b).findIndex(x => x.id === b.id)
              return (
                <div key={b.id} style={{ border: '1px solid var(--crema-oscuro)', borderRadius: 12, overflow: 'hidden', background: '#fff', opacity: b.activo ? 1 : 0.6, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ position: 'relative', aspectRatio: '16 / 9', background: 'var(--crema)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {b.imagen_url
                      ? <img src={b.imagen_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '1.8rem' }}>{b.tipo === 'youtube' ? '▶️' : '🖼️'}</span>}
                    <span style={{ position: 'absolute', top: 6, left: 6 }} className={`badge ${b.es_secundario ? 'badge-dorado' : 'badge-verde'}`}>
                      {b.es_secundario ? `2° · ${(b.grupo || '').trim() || 'General'}` : 'Principal'}
                    </span>
                    {!b.activo && <span style={{ position: 'absolute', top: 6, right: 6 }} className="badge badge-gris">Oculto</span>}
                  </div>
                  <div style={{ padding: '8px 10px', flex: 1 }}>
                    <strong style={{ fontSize: '0.88rem', display: 'block' }}>{b.nombre || b.titulo || '(sin nombre)'}</strong>
                    {b.titulo && b.nombre && <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>Título: {b.titulo}</div>}
                    {b.subtitulo && <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>{b.subtitulo}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', alignItems: 'center' }}>
                    <button className="btn btn-xs btn-secondary" title="Subir" disabled={idx === 0} onClick={() => mover(b, -1)}><ChevronUp size={13} /></button>
                    <button className="btn btn-xs btn-secondary" title="Bajar" disabled={idx === pares(b).length - 1} onClick={() => mover(b, 1)}><ChevronDown size={13} /></button>
                    <button className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setEdit(b)}><Pencil size={13} /></button>
                    <button className="btn btn-xs btn-danger" onClick={() => eliminar(b)}><Trash2 size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>}
      {edit && <EditorBanner banner={edit} toast={toast} qc={qc} onClose={() => setEdit(null)} />}
    </div>
  )
}

function EditorBanner({ banner, toast, qc, onClose }) {
  const [b, setB] = useState({ ...BANNER_VACIO, ...banner })
  const [subiendo, setSubiendo] = useState(false)
  const [cropFile, setCropFile] = useState(null)
  const set = (k, v) => setB(x => ({ ...x, [k]: v }))
  const subirBlob = async (blob) => {
    setSubiendo(true)
    try {
      const path = `catalogo/banner_${Date.now()}.jpg`
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      set('imagen_url', data.publicUrl)
    } catch (e) { toast('No se pudo subir: ' + e.message, 'error') } finally { setSubiendo(false) }
  }
  const guardar = async () => {
    try {
      const { _nuevo, id, ...rest } = b
      const payload = { ...rest, orden: parseInt(b.orden) || 0 }
      const { error } = id ? await supabase.from('banners_catalogo').update(payload).eq('id', id) : await supabase.from('banners_catalogo').insert(payload)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['banners_catalogo'] }); toast('Banner guardado ✓'); onClose()
    } catch (e) { toast(e.message, 'error') }
  }
  return (
    <Modal open onClose={onClose} title={banner._nuevo ? 'Nuevo banner' : 'Editar banner'}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={subiendo}><Ico as={Save} size={14} />Guardar</button></>}>
      <div className="form-grid-2">
        <div className="form-group"><label className="form-label">Nombre interno <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(no se muestra en el catálogo)</small></label><input className="form-control" value={b.nombre || ''} onChange={e => set('nombre', e.target.value)} placeholder="Ej: Promo octubre" /></div>
        <div className="form-group"><label className="form-label">Tipo</label>
          <Select className="form-control" value={b.tipo} onChange={e => set('tipo', e.target.value)}><option value="imagen">Imagen</option><option value="youtube">Video de YouTube</option></Select>
        </div>
      </div>
      {b.tipo === 'youtube'
        ? <div className="form-group"><label className="form-label">URL de YouTube</label><input className="form-control" value={b.youtube} onChange={e => set('youtube', e.target.value)} placeholder="https://youtu.be/XXXXXXXXXXX" /></div>
        : <div className="form-group"><label className="form-label">Imagen</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {b.imagen_url && <img src={b.imagen_url} alt="" style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 8 }} />}
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>{subiendo ? 'Subiendo…' : <><Upload size={14} /> Subir imagen</>}<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = '' }} /></label>
            </div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Proporción <strong>16:9</strong> (se guarda a 1600×900). Los banners secundarios usan el mismo diseño y medidas que el principal.</small>
            {cropFile && <ImageCropper file={cropFile} aspect={16 / 9} salidaW={1600} salidaH={900} onCancel={() => setCropFile(null)} onCropped={(blob) => { setCropFile(null); subirBlob(blob) }} />}
          </div>}
      <div className="form-grid-2">
        <div className="form-group"><label className="form-label">Título</label><input className="form-control" value={b.titulo} onChange={e => set('titulo', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Subtítulo</label><input className="form-control" value={b.subtitulo} onChange={e => set('subtitulo', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Texto del botón</label><input className="form-control" value={b.boton_texto} onChange={e => set('boton_texto', e.target.value)} placeholder="Ver productos" /></div>
        <div className="form-group"><label className="form-label">Enlace del botón</label><input className="form-control" value={b.boton_link} onChange={e => set('boton_link', e.target.value)} placeholder="/tienda, /galeria o https://…" /></div>
      </div>
      <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginBottom: 8 }}>El <strong>orden</strong> se ajusta con las flechas ↑↓ de la lista de banners.</small>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, color: 'var(--selva)' }}><input type="checkbox" checked={!!b.activo} onChange={e => set('activo', e.target.checked)} /> Activo (visible en el catálogo)</label>
      <div className="form-group" style={{ marginTop: 10 }}>
        <label className="form-label">Ubicación</label>
        <Select className="form-control" value={b.es_secundario ? 'sec' : 'prin'} onChange={e => set('es_secundario', e.target.value === 'sec')}>
          <option value="prin">Banner principal (slide de arriba)</option>
          <option value="sec">Banner secundario (dentro del inicio)</option>
        </Select>
      </div>
      {b.es_secundario && (
        <div className="form-group">
          <label className="form-label">Grupo del banner secundario</label>
          <input className="form-control" value={b.grupo || ''} onChange={e => set('grupo', e.target.value)} placeholder="Ej: Promociones" />
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Los banners con el <strong>mismo grupo</strong> forman un solo banner. Con <strong>varias imágenes</strong> se vuelve slide; con una sola es estático. Grupos distintos no se combinan.</small>
        </div>
      )}
      {!b.es_secundario && <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Los banners principales forman el carrusel de arriba (todos juntos).</small>}
    </Modal>
  )
}

// ==================== MENSAJES ====================
function TabMensajes() {
  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ['mensajes_catalogo'],
    queryFn: async () => { const { data } = await supabase.from('mensajes_catalogo').select('*').order('id', { ascending: false }).limit(500); return data || [] },
  })
  if (isLoading) return <div className="card"><p className="empty-table">Cargando…</p></div>
  return (
    <div className="card">
      <div className="card-title">✉️ Mensajes de contacto ({msgs.length})</div>
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

// ==================== MÉTRICAS ====================
function TabMetricas() {
  const qVis = useQuery({
    queryKey: ['catalogo_visitas'],
    queryFn: async () => { const { data, error } = await supabase.from('visitas_catalogo').select('producto, dispositivo, fecha').order('id', { ascending: false }).limit(2000); if (error) throw error; return data || [] },
  })
  const qPed = useQuery({
    queryKey: ['catalogo_pedidos'],
    queryFn: async () => { const { data, error } = await supabase.from('pedidos_catalogo').select('total, estado, created_at').order('id', { ascending: false }).limit(1000); if (error) throw error; return data || [] },
  })
  const qSub = useQuery({
    queryKey: ['catalogo_subs'],
    queryFn: async () => { const { data, error } = await supabase.from('suscriptores_catalogo').select('email, nombre, created_at').order('id', { ascending: false }).limit(1000); if (error) throw error; return data || [] },
  })
  const visitas = qVis.data || [], pedidos = qPed.data || [], subs = qSub.data || []

  // ---- Estados: cargando / error / vacío ----
  if (qVis.isLoading || qPed.isLoading || qSub.isLoading) return <div className="card"><p className="empty-table">Cargando métricas…</p></div>
  const err = qVis.error || qPed.error || qSub.error
  if (err) return <div className="card"><p className="empty-table" style={{ color: 'var(--rojo)' }}>No se pudieron cargar las métricas: {err.message}</p></div>

  const hoy = new Date(); const hace7 = new Date(hoy.getTime() - 7 * 864e5).toISOString().slice(0, 10)
  const visitas7 = visitas.filter(v => (v.fecha || '') >= hace7).length
  const topProd = Object.entries(visitas.filter(v => v.producto).reduce((m, v) => { m[v.producto] = (m[v.producto] || 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const porDisp = visitas.reduce((m, v) => { const d = v.dispositivo || 'desconocido'; m[d] = (m[d] || 0) + 1; return m }, {})
  const totalPedidos = pedidos.length
  const montoPedidos = pedidos.reduce((s, p) => s + (p.total || 0), 0)
  const ticket = totalPedidos ? montoPedidos / totalPedidos : 0
  const conversion = visitas.length ? (totalPedidos / visitas.length) * 100 : 0

  // Tendencia de visitas por día (últimos 7 días)
  const dias = Array.from({ length: 7 }, (_, i) => new Date(hoy.getTime() - (6 - i) * 864e5).toISOString().slice(0, 10))
  const porDia = dias.map(d => ({ d, n: visitas.filter(v => (v.fecha || '').slice(0, 10) === d).length }))
  const maxDia = Math.max(1, ...porDia.map(x => x.n))
  const DISP = [['mobile', '📱 Móvil'], ['tablet', '📲 Tablet'], ['desktop', '💻 Escritorio'], ['desconocido', '❔ Otro']]

  const sinDatos = visitas.length === 0 && pedidos.length === 0 && subs.length === 0
  if (sinDatos) return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: '2.4rem' }}>📊</div>
      <div className="card-title" style={{ justifyContent: 'center' }}>Aún no hay datos</div>
      <p style={{ color: 'var(--texto-suave)', fontSize: '0.88rem' }}>Cuando los clientes visiten el catálogo, inicien pedidos o se suscriban, verás aquí las métricas.</p>
    </div>
  )

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card verde"><div className="kpi-label">Visitas totales</div><div className="kpi-value">{fNum(visitas.length)}</div><div className="kpi-sub">{visitas7} en 7 días</div></div>
        <div className="kpi-card dorado"><div className="kpi-label">Pedidos iniciados</div><div className="kpi-value">{fNum(totalPedidos)}</div><div className="kpi-sub">{fCOP(montoPedidos)} en total</div></div>
        <div className="kpi-card tierra"><div className="kpi-label">Ticket promedio</div><div className="kpi-value" style={{ fontSize: '1.4rem' }}>{fCOP(ticket)}</div><div className="kpi-sub">conversión {conversion.toFixed(1)}%</div></div>
        <div className="kpi-card lima"><div className="kpi-label">Suscriptores</div><div className="kpi-value">{fNum(subs.length)}</div><div className="kpi-sub">correos capturados</div></div>
      </div>

      <div className="card">
        <div className="card-title"><Ico as={BarChart3} size={15} />Visitas · últimos 7 días</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '8px 0' }}>
          {porDia.map(({ d, n }) => (
            <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--texto-suave)' }}>{n}</span>
              <div title={`${n} visitas`} style={{ width: '70%', minHeight: 3, height: `${(n / maxDia) * 100}%`, background: 'linear-gradient(var(--selva), var(--lima))', borderRadius: '5px 5px 0 0' }} />
              <span style={{ fontSize: '0.64rem', color: 'var(--texto-suave)' }}>{new Date(d + 'T00:00').toLocaleDateString('es-CO', { weekday: 'short' })}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">📟 Visitas por dispositivo</div>
        {visitas.length === 0 ? <p className="empty-table">Sin visitas todavía.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DISP.filter(([k]) => porDisp[k]).map(([k, label]) => {
                const pct = Math.round((porDisp[k] / visitas.length) * 100)
                return (
                  <div key={k}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 3 }}><span>{label}</span><span style={{ color: 'var(--texto-suave)' }}>{fNum(porDisp[k])} · {pct}%</span></div>
                    <div style={{ height: 8, background: 'var(--crema)', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--selva)' }} /></div>
                  </div>
                )
              })}
            </div>}
      </div>

      <div className="card">
        <div className="card-title"><Ico as={Star} size={15} />Productos más vistos</div>
        {topProd.length === 0 ? <p className="empty-table">Aún no hay visitas a productos.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Producto</th><th className="td-number">Visitas</th></tr></thead>
              <tbody>{topProd.map(([n, c]) => <tr key={n}><td>{n}</td><td className="td-number">{c}</td></tr>)}</tbody>
            </table></div>}
      </div>

      <div className="card">
        <div className="card-title">📧 Suscriptores ({fNum(subs.length)})</div>
        {subs.length === 0 ? <p className="empty-table">Aún no hay suscriptores.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Correo</th><th>Nombre</th><th>Fecha</th></tr></thead>
              <tbody>{subs.slice(0, 20).map((s, i) => <tr key={i}><td>{s.email}</td><td>{s.nombre || '—'}</td><td>{s.created_at ? new Date(s.created_at).toLocaleDateString('es-CO') : '—'}</td></tr>)}</tbody>
            </table></div>}
      </div>

      <div className="card">
        <div className="card-title">🧾 Últimos pedidos iniciados</div>
        {pedidos.length === 0 ? <p className="empty-table">Aún no hay pedidos.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Fecha</th><th className="td-number">Total</th><th>Estado</th></tr></thead>
              <tbody>{pedidos.slice(0, 15).map((p, i) => <tr key={i}><td>{p.created_at ? new Date(p.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td><td className="td-number">{fCOP(p.total)}</td><td><span className="badge badge-dorado">{p.estado || 'iniciado'}</span></td></tr>)}</tbody>
            </table></div>}
      </div>
    </>
  )
}

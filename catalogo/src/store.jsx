import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { cargarFrutos } from './utils'

const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

// Secciones del home por defecto (orden + visibilidad)
export const SECCIONES_DEFAULT = [
  { id: 'hero', on: true }, { id: 'novedades', on: true }, { id: 'categorias', on: true },
  { id: 'frutos', on: true }, { id: 'newsletter', on: true },
]

export const CFG_DEFAULT = {
  whatsapp: '+573157702180', titulo_banner: 'Sabores de la selva',
  subtitulo: 'Infusiones, galletas y dulces amazónicos', mostrar_mayor: false,
  pedido_minimo: 30000, mostrar_stock: true, umbral_pocas: 10, umbral_ultimas: 3,
  categorias_orden: [], secciones: SECCIONES_DEFAULT,
  nombre_tienda: null, slogan: null, logo_url: '', nosotros_texto: '', solo_logo: false, mostrar_filtro_frutos: false, mostrar_slogan: true,
  fuente_titulos: 'Playfair Display', fuente_subtitulos: 'Source Sans 3', fuente_texto: 'Source Sans 3',
  contacto_mapa: '', paginas: [], galeria_albumes: [], galeria_titulo: '', galeria_subtitulo: '', categorias_extra: [],
  envio_tarifa: null, envio_mensaje: '', avisos: [], pagos: [],
  seo_titulo: '', seo_descripcion: '', seo_imagen: '',
  mantenimiento_activo: false, mantenimiento_mensaje: '', terminos_texto: '', diseno: 'selva',
  plantillas_guardadas: [],
  ficha_cta_fijo: true, ficha_mostrar_envio: true, ficha_titulo_relacionados: 'Combina bien con',
  mayorista_activo: true, mayorista_clave: '', mayorista_pedido_minimo: 0,
  mayorista_mensaje: '¿Eres mayorista? Accede a precios especiales por volumen.',
  mayorista_wa_texto: 'Hola Mumi Amazonia, me interesa ser mayorista. ¿Me comparten los precios al por mayor?',
}

export function StoreProvider({ children }) {
  const [cfgBase, setCfgBase] = useState(CFG_DEFAULT)
  const [cfgPreview, setCfgPreview] = useState(null)   // override en vivo desde el panel (iframe)
  const [banners, setBanners] = useState([])
  const [carrito, setCarrito] = useState(() => { try { return JSON.parse(localStorage.getItem('mumi_carrito') || '[]') } catch { return [] } })
  const [favs, setFavs] = useState(() => { try { return JSON.parse(localStorage.getItem('mumi_favs') || '[]') } catch { return [] } })
  const [mayorista, setMayoristaState] = useState(() => { try { return localStorage.getItem('mumi_mayorista') === '1' } catch { return false } })
  const [edicion, setEdicion] = useState({ on: false, target: null })   // edición en el lienzo (desde el panel)

  const cfg = useMemo(() => ({ ...cfgBase, ...(cfgPreview || {}) }), [cfgBase, cfgPreview])

  const [extra, setExtra] = useState([])   // productos/combos adicionales (de config)
  const [base, setBase] = useState(null)   // productos de la vista (Productos Terminados)

  useEffect(() => {
    supabase.from('config_catalogo').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (!data) return
      const secciones = Array.isArray(data.secciones) && data.secciones.length ? data.secciones : SECCIONES_DEFAULT
      setCfgBase({ ...CFG_DEFAULT, ...data, secciones })
      setExtra(Array.isArray(data.productos_extra) ? data.productos_extra : [])
    }, () => {})
    supabase.from('frutos_catalogo').select('*').order('orden').then(({ data }) => cargarFrutos(data || []), () => {})
    supabase.from('banners_catalogo').select('*').order('orden').then(({ data }) => setBanners(data || []), () => {})
    supabase.from('catalogo_productos').select('*').order('nombre').then(({ data, error }) => { if (error) console.error('catalogo_productos:', error.message); setBase(data || []) })
  }, [])

  // Fusiona los productos de la vista con los productos/combos adicionales (calcula stock de combos)
  const productos = useMemo(() => {
    if (base === null) return null
    const porId = Object.fromEntries(base.map(p => [String(p.id), p]))
    const extras = (extra || []).filter(e => e && e.visible !== false).map(e => {
      let stock = Number(e.stock) || 0
      if (e.tipo === 'combo' && Array.isArray(e.componentes) && e.componentes.length) {
        stock = Math.min(...e.componentes.map(c => { const comp = porId[String(c.id)]; const cant = Number(c.cantidad) || 1; return comp ? Math.floor((Number(comp.stock) || 0) / cant) : 0 }))
        if (!isFinite(stock)) stock = 0
      }
      const imgs = Array.isArray(e.imagenes) ? e.imagenes : []
      const primera = imgs[0]
      const imagen_url = typeof primera === 'string' ? primera : (primera?.url || null)
      return {
        id: e.id, nombre: e.nombre, descripcion: e.descripcion || '',
        precio_detal: Number(e.precio_detal) || 0, precio_mayor: Number(e.precio_mayor) || 0,
        precio_oferta: Number(e.precio_oferta) || null,
        imagen_url, imagenes: imgs, categoria: e.categoria || 'otros',
        frutos: e.frutos || [], beneficios: e.beneficios || [],
        contenido: e.contenido || '', origen: e.origen || '',
        destacado: !!e.destacado, novedad: !!e.novedad, stock, _extra: true, _tipo: e.tipo || 'producto',
      }
    })
    return [...base, ...extras]
  }, [base, extra])

  // Preview en vivo: el panel de administración manda la config por postMessage
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data
      if (d && d.type === 'mumi-preview' && d.cfg) setCfgPreview(d.cfg)
      if (d && d.type === 'mumi-preview-mayorista') setMayoristaState(!!d.on)
      if (d && d.type === 'mumi-edit-mode') setEdicion({ on: !!d.on, target: d.target || null })
    }
    window.addEventListener('message', onMsg)
    // avisa al panel que el preview está listo
    try { if (window.parent !== window) window.parent.postMessage({ type: 'mumi-preview-ready' }, '*') } catch { /* noop */ }
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => { try { localStorage.setItem('mumi_carrito', JSON.stringify(carrito)) } catch { /* noop */ } }, [carrito])
  useEffect(() => { try { localStorage.setItem('mumi_favs', JSON.stringify(favs)) } catch { /* noop */ } }, [favs])

  const setMayorista = (v) => { setMayoristaState(v); try { v ? localStorage.setItem('mumi_mayorista', '1') : localStorage.removeItem('mumi_mayorista') } catch { /* noop */ } }

  const toggleFav = (id) => setFavs(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id])
  const esFav = (id) => favs.includes(id)

  // ¿Hay oferta vigente? (precio_oferta válido y menor al precio normal)
  const enOferta = (p) => !mayorista && p?.precio_oferta > 0 && p.precio_oferta < (p.precio_detal || 0)
  // Precio activo según modo: mayorista → precio_mayor; oferta → precio_oferta; si no → precio_detal
  const precio = (p) => {
    if (mayorista && p?.precio_mayor > 0) return p.precio_mayor
    if (enOferta(p)) return p.precio_oferta
    return p?.precio_detal || 0
  }
  // Porcentaje de descuento (para el badge)
  const descuentoPct = (p) => enOferta(p) ? Math.round((1 - p.precio_oferta / p.precio_detal) * 100) : 0

  const agregar = (p, delta = 1) => setCarrito(c => {
    const ex = c.find(i => i.id === p.id)
    if (!ex) return delta > 0 ? [...c, { ...p, cantidad: delta }] : c
    const cant = ex.cantidad + delta
    return cant <= 0 ? c.filter(i => i.id !== p.id) : c.map(i => i.id === p.id ? { ...i, cantidad: cant } : i)
  })
  const quitar = (id) => setCarrito(c => c.filter(i => i.id !== id))
  const vaciar = () => setCarrito([])
  const enCarrito = (id) => carrito.find(i => i.id === id)?.cantidad || 0
  const total = carrito.reduce((s, i) => s + precio(i) * i.cantidad, 0)
  const nItems = carrito.reduce((s, i) => s + i.cantidad, 0)
  const pedidoMinimo = mayorista ? (cfg.mayorista_pedido_minimo || 0) : (cfg.pedido_minimo || 0)

  const productoPorId = (id) => (productos || []).find(p => String(p.id) === String(id))

  const value = useMemo(() => ({
    cfg, productos, banners, carrito, agregar, quitar, vaciar, enCarrito, total, nItems,
    productoPorId, favs, toggleFav, esFav, mayorista, setMayorista, precio, pedidoMinimo,
    enOferta, descuentoPct, edicion, esPreview: cfgPreview !== null,
  }), [cfg, productos, banners, carrito, favs, mayorista, cfgPreview, edicion])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

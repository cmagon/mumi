import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fNum, fFecha, componerSurtido } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'
import MoneyInput from '../components/ui/MoneyInput'
import Cargando from '../components/ui/Cargando'
import ImageCropper from '../components/ui/ImageCropper'
import { UNIDADES_ALEGRA, UNSPSC_ALIMENTOS } from '../lib/alegraCatalogos'
import Select from '../components/ui/Select'
import {
  Settings, Plug, DollarSign, ClipboardList, Shuffle, Plus, Tags, Scale, ScrollText,
  Pencil, X, RefreshCw, Check, AlertTriangle, FlaskConical, Unplug, BarChart3, TrendingUp, Package,
  ArrowUpFromLine, ArrowDownToLine,
} from 'lucide-react'

const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

const EMPTY_PROD = { nombre: '', descripcion: '', sku: '', alegra_item_id: '', tipo: 'base', stock_min: '', costo_unitario: '', precio_mayor: '', precio_detal: '', activo: true, unidad_medida: 'unit', codigo_unspsc: '', categoria_alegra_id: '', categoria_alegra_nombre: '', surtido_a: '', surtido_b: '', product_id: null, mp_id: null, _stock_inicial: 0 }
const EMPTY_AJUSTE = { tipo: 'entrada', cantidad: '', lote: '', motivo: '' }

export default function ProductosTerminados() {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const esAdmin = profile?.rol === 'admin'
  const [buscar, setBuscar] = useState('')
  const [modalProd, setModalProd] = useState(false)
  const [pForm, setPForm] = useState(EMPTY_PROD)
  // Menú desplegable de acciones de Alegra (Configurar / Enlazar masivo / Enviar / Traer)
  const [menuAlegraOpen, setMenuAlegraOpen] = useState(false)
  const menuAlegraRef = useRef(null)
  useEffect(() => {
    if (!menuAlegraOpen) return
    const onClick = (e) => { if (menuAlegraRef.current && !menuAlegraRef.current.contains(e.target)) setMenuAlegraOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuAlegraOpen])
  // Desplegable de sugerencias UNSPSC propio de la app (no datalist del navegador)
  const [unspscAbierto, setUnspscAbierto] = useState(false)
  const unspscSugeridos = useMemo(() => {
    const q = String(pForm.codigo_unspsc || '').trim().toLowerCase()
    const vistos = new Set()
    const matches = (u) => !q || u.codigo.includes(q) || u.desc.toLowerCase().includes(q) || (u.grupo || '').toLowerCase().includes(q) || (u.alias || []).some(a => a.toLowerCase().includes(q))
    const out = []
    for (const u of UNSPSC_ALIMENTOS) {
      if (vistos.has(u.codigo)) continue
      if (matches(u)) { out.push(u); vistos.add(u.codigo) }
      if (out.length >= 10) break
    }
    return out
  }, [pForm.codigo_unspsc])
  const [pEditId, setPEditId] = useState(null)
  const [modalAjuste, setModalAjuste] = useState(null)   // producto al que se ajusta
  const [aForm, setAForm] = useState(EMPTY_AJUSTE)
  const [kardexDe, setKardexDe] = useState(null)
  // Imágenes dentro del modal de edición del producto (la primera es la principal)
  const [edImgs, setEdImgs] = useState([])
  const [subiendoEdImg, setSubiendoEdImg] = useState(false)
  const [cropEd, setCropEd] = useState(null)      // archivo pendiente de recortar (ficha)
  const [cropGal, setCropGal] = useState(null)    // archivo pendiente de recortar (galería)
  // Sube un blob JPEG ya recortado (1:1) y devuelve la URL pública
  const subirImgProd = async (blob) => {
    const path = `terminados/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`
    const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) throw error
    return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
  }
  const subirEdBlob = async (blob) => {
    setSubiendoEdImg(true)
    try { const url = await subirImgProd(blob); setEdImgs(prev => [...prev, url]) }
    catch (e) { toast('No se pudo subir: ' + e.message, 'error') } finally { setSubiendoEdImg(false) }
  }
  // Auditoría (admin): historial global de ajustes/movimientos de producto terminado
  const [modalHistAjustes, setModalHistAjustes] = useState(false)
  const [histSoloManuales, setHistSoloManuales] = useState(true)
  // Galería de imágenes por producto (para catálogos / futuras integraciones con otras APIs)
  const [galeriaDe, setGaleriaDe] = useState(null)       // producto cuya galería se edita
  const [galeriaImgs, setGaleriaImgs] = useState([])
  const [subiendoGal, setSubiendoGal] = useState(false)
  const imgsDe = (p) => { try { const a = Array.isArray(p.imagenes) ? p.imagenes : JSON.parse(p.imagenes || '[]'); return a.length ? a : (p.imagen_url ? [p.imagen_url] : []) } catch { return p.imagen_url ? [p.imagen_url] : [] } }
  const abrirGaleria = (p) => { setGaleriaDe(p); setGaleriaImgs(imgsDe(p)) }
  const subirGalBlob = async (blob) => {
    setSubiendoGal(true)
    try { const url = await subirImgProd(blob); setGaleriaImgs(prev => [...prev, url]) }
    catch (e) { toast('No se pudo subir: ' + e.message, 'error') } finally { setSubiendoGal(false) }
  }
  // Experimental: intenta enviar la imagen principal al ítem de Alegra (3 métodos; su API
  // pública no lo documenta — la función reporta si alguno fue aceptado).
  const probarImgAlegra = useMutation({
    meta: { label: 'Enviando imagen a Alegra…' },
    mutationFn: async (p) => {
      const { data, error } = await supabase.functions.invoke('alegra-push-image', { body: { finished_id: p.id } })
      if (error) throw error
      if (data?.error && !data?.intentos) throw new Error(data.error)
      return data
    },
    onSuccess: (data) => {
      if (data?.ok) toast(`✓ Alegra aceptó la imagen (método: ${data.metodo})`, 'success')
      else toast('Alegra no aceptó la imagen por ninguno de los 3 métodos probados — su API pública no soporta imágenes de ítems.', 'warning')
      console.log('Intentos de envío de imagen a Alegra:', data?.intentos)
    },
    onError: (e) => toast('No se pudo intentar: ' + e.message, 'error'),
  })
  const guardarGaleria = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('finished_products').update({ imagen_url: galeriaImgs[0] || null }).eq('id', galeriaDe.id)
      if (error) throw error
      // Columna v92 — tolerante si la migración aún no se corre
      try { await supabase.from('finished_products').update({ imagenes: galeriaImgs }).eq('id', galeriaDe.id) } catch { /* opcional */ }
    },
    meta: { label: 'Guardando imágenes…' },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finished_products'] }); setGaleriaDe(null); toast('Imágenes guardadas ✓') },
    onError: (e) => toast(e.message, 'error'),
  })
  const [modalGen, setModalGen] = useState(false)        // generar surtidos
  const [selGen, setSelGen] = useState([])               // ids de base seleccionados
  const [modalEnlace, setModalEnlace] = useState(false)  // enlazar con Alegra
  const [alegraItems, setAlegraItems] = useState(null)   // null = no cargado
  const [cargandoAlegra, setCargandoAlegra] = useState(false)
  const [enlaces, setEnlaces] = useState({})             // { finished_id: alegra_item_id }
  const [ocultarFact, setOcultarFact] = useState(false)  // ocultar ítems de solo facturación
  const [modalConfig, setModalConfig] = useState(false)  // configurar credenciales Alegra
  const [cfgForm, setCfgForm] = useState({ email: '', token: '', price_list_mayor: '', price_list_detal: '' })
  const [probando, setProbando] = useState(false)
  const [pruebaMsg, setPruebaMsg] = useState(null)
  const [listasPrecios, setListasPrecios] = useState(null)
  const [cargandoListas, setCargandoListas] = useState(false)

  const { data: productos = [], isFetching: fetchingProds, isSuccess: okProds } = useQuery({
    queryKey: ['finished_products'],
    queryFn: async () => { const { data } = await supabase.from('finished_products').select('*').order('nombre'); return data || [] },
    staleTime: 1000 * 60 * 5, refetchOnWindowFocus: false, refetchOnMount: 'always',
  })
  const { data: movimientos = [] } = useQuery({
    queryKey: ['finished_movements'],
    queryFn: async () => { const { data } = await supabase.from('finished_movements').select('*').order('created_at', { ascending: false }).limit(500); return data || [] },
  })
  // Movimientos para el ANÁLISIS mensual (producido vs vendido). Sin límite pequeño.
  const { data: movAnalisis = [] } = useQuery({
    queryKey: ['finished_mov_analisis'],
    queryFn: async () => { const { data } = await supabase.from('finished_movements').select('finished_id, cantidad, tipo, origen, fecha, created_at').order('created_at', { ascending: false }).limit(8000); return data || [] },
    enabled: esAdmin, staleTime: 5 * 60 * 1000,
  })
  const [tab, setTab] = useState('lista')
  const [anioAn, setAnioAn] = useState(new Date().getFullYear())
  // Histórico de ventas de Alegra (facturas de todos los años) para el análisis y la proyección
  const { data: alegraVentas = { ventas: {} }, isFetching: cargandoVentas } = useQuery({
    queryKey: ['alegra_ventas_hist'],
    queryFn: async () => { const { data } = await supabase.functions.invoke('alegra-ventas', { body: {} }); return data || { ventas: {} } },
    enabled: esAdmin && tab === 'analisis', retry: false, staleTime: 30 * 60 * 1000,
  })
  // Materias primas (para calcular la MP necesaria según la proyección)
  const { data: rawMps = [] } = useQuery({
    queryKey: ['raw_materials_min'],
    queryFn: async () => { const { data } = await supabase.from('raw_materials').select('id, nombre, unidad'); return data || [] },
    enabled: esAdmin, staleTime: 5 * 60 * 1000,
  })
  // Categorías de Alegra (para asignarlas a los productos)
  const { data: alegraCategorias = [] } = useQuery({
    queryKey: ['alegra_categories'],
    queryFn: async () => { const { data } = await supabase.functions.invoke('alegra-categories', { body: {} }); return data?.items || [] },
    enabled: esAdmin, retry: false, staleTime: 5 * 60 * 1000,
  })
  const [nuevaCatOpen, setNuevaCatOpen] = useState(false)
  const [nuevaCatNombre, setNuevaCatNombre] = useState('')
  const crearCategoria = useMutation({
    meta: { label: 'Creando categoría en Alegra…' },
    mutationFn: async (nombre) => {
      const n = String(nombre || '').trim()
      if (!n) throw new Error('Escribe el nombre de la categoría')
      const { data, error } = await supabase.functions.invoke('alegra-create-category', { body: { name: n } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['alegra_categories'] })
      setPForm(f => ({ ...f, categoria_alegra_id: data.id, categoria_alegra_nombre: data.name }))
      setNuevaCatOpen(false)
      toast(`Categoría "${data.name}" creada en Alegra ✓`)
    },
    onError: (e) => toast('No se pudo crear la categoría: ' + e.message, 'error'),
  })
  // Stock que tiene Alegra (para comparar y verificar sincronía). NO bloquea la tabla si Alegra falla.
  const { data: alegraStock = {}, isFetching: cargandoAlegraStock } = useQuery({
    queryKey: ['alegra_items_stock'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('alegra-items', { body: {} })
      const map = {}
      // Guarda el ítem completo (nombre, referencia, disponible) para poder AUDITAR
      // diferencias app ↔ Alegra, no solo el stock.
      for (const it of (data?.items || [])) if (it?.id != null) map[String(it.id)] = { available: it.available, name: it.name || '', reference: it.reference || '' }
      return map
    },
    enabled: esAdmin, retry: false, staleTime: 2 * 60 * 1000, refetchOnWindowFocus: false,
  })
  // Fichas de producto: el costo del surtido se promedia desde el costo de la FICHA (no del catálogo)
  const { data: fichas = [], isFetching: fetchingFichas, isSuccess: okFichas } = useQuery({
    queryKey: ['fichas_costo_terminado'],
    queryFn: async () => { const { data } = await supabase.from('products_costing').select('id, nombre, tipo, costo_final, precio_mayor, precio_detal, activo, imagen_url, mp_id, ingredientes, rendimiento, desperdicio, peso_unidad, descripcion').order('nombre'); return data || [] },
    staleTime: 1000 * 60 * 5, refetchOnWindowFocus: false, refetchOnMount: 'always',
  })
  // Loader SOLO en la primera carga (hasta tener datos frescos: stock + estado de Alegra).
  // Una vez cargado se queda en caché y no vuelve a mostrar el loader en refrescos en segundo plano.
  const [yaCargo, setYaCargo] = useState(false)
  useEffect(() => { if (okProds && okFichas && !fetchingProds && !fetchingFichas) setYaCargo(true) }, [okProds, okFichas, fetchingProds, fetchingFichas])
  const cargandoProds = !yaCargo
  // Materias primas marcadas como vendibles (para crearlas como producto terminado)
  const { data: mpsVendibles = [] } = useQuery({
    queryKey: ['mps_vendibles'],
    queryFn: async () => { const { data } = await supabase.from('raw_materials').select('id, nombre, precio, precio_venta, stock, unidad').eq('vendible', true).order('nombre'); return data || [] },
  })
  const [modalMp, setModalMp] = useState(false)
  const [modalFicha, setModalFicha] = useState(false)
  // Ficha MP (con costos) por materia prima: la MP solo puede agregarse a terminados si YA pasó por Fichas de Productos
  const fichaMpDe = (mpId) => fichas.find(f => f.tipo === 'mp' && String(f.mp_id) === String(mpId) && f.activo !== false)
  const mpsDisponibles = mpsVendibles.filter(m => fichaMpDe(m.id) && !productos.some(p => p.mp_id === m.id || (p.nombre || '').toLowerCase() === (m.nombre || '').toLowerCase()))
  // Los productos tipo 'mp' reflejan el stock de la materia prima (Inventario MP), no un stock propio
  const mpStockById = Object.fromEntries(mpsVendibles.map(m => [m.id, Number(m.stock) || 0]))
  const stockReal = (p) => (p.tipo === 'mp' && p.mp_id != null && mpStockById[p.mp_id] != null) ? mpStockById[p.mp_id] : Number(p.stock || 0)

  // ── Auditoría app ↔ Alegra: detecta productos cuyos datos difieren de lo que Alegra tiene ──
  const [modalAuditoria, setModalAuditoria] = useState(false)
  const difsAlegra = useMemo(() => {
    const out = []
    if (!Object.keys(alegraStock).length) return out
    for (const p of productos) {
      if (!p.alegra_item_id) continue
      const a = alegraStock[String(p.alegra_item_id)]
      if (!a) { out.push({ producto: p.nombre, campo: 'enlace', app: `ID ${p.alegra_item_id}`, alegra: 'no existe en Alegra' }); continue }
      const stockApp = stockReal(p)
      if (a.available != null && Math.abs((Number(a.available) || 0) - stockApp) > 0.001) {
        out.push({ producto: p.nombre, campo: 'stock', app: fNum(stockApp), alegra: fNum(Number(a.available) || 0) })
      }
      if ((p.nombre || '').trim().toLowerCase() !== (a.name || '').trim().toLowerCase()) {
        out.push({ producto: p.nombre, campo: 'nombre', app: p.nombre, alegra: a.name || '(vacío)' })
      }
      if ((p.sku || '').trim() && (p.sku || '').trim().toLowerCase() !== (a.reference || '').trim().toLowerCase()) {
        out.push({ producto: p.nombre, campo: 'SKU', app: p.sku, alegra: a.reference || '(vacío)' })
      }
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, alegraStock, mpsVendibles])
  // Fichas ACTIVAS (vendibles) que aún no están en el catálogo de terminados
  const fichasDisponibles = fichas.filter(f => (f.tipo || '') !== 'subproducto' && f.activo !== false &&
    !productos.some(p => p.product_id === f.id || (p.nombre || '').toLowerCase() === (f.nombre || '').toLowerCase()))
  // "Agregar" NO inserta directo: precarga el modal de edición con los datos de la ficha/MP
  // (costo, precios) para que el usuario termine de definir SKU, stock mínimo, categoría,
  // código UNSPSC, etc. ANTES de crear el producto terminado.
  const prepararDesdeFicha = (f) => {
    setPForm({ ...EMPTY_PROD, nombre: f.nombre, descripcion: f.descripcion || '', tipo: 'base', product_id: f.id,
      costo_unitario: Math.round(Number(f.costo_final) || 0),
      precio_mayor: Math.round(Number(f.precio_mayor) || 0), precio_detal: Math.round(Number(f.precio_detal) || 0),
    })
    setEdImgs(f.imagen_url ? [f.imagen_url] : []); setPEditId(null); setModalFicha(false); setModalProd(true)
  }
  const prepararDesdeMp = (m) => {
    const f = fichaMpDe(m.id)   // ficha de MP con costos ya asignados
    if (!f) { toast('Esta MP aún no tiene ficha de costos creada. Créala primero en Fichas de Productos.', 'error'); return }
    setPForm({ ...EMPTY_PROD, nombre: f.nombre || m.nombre, tipo: 'mp', mp_id: m.id, product_id: f.id,
      costo_unitario: Math.round(Number(f.costo_final) || Number(m.precio) || 0),
      precio_mayor: Math.round(Number(f.precio_mayor) || Number(m.precio_venta) || 0),
      precio_detal: Math.round(Number(f.precio_detal) || 0),
      _stock_inicial: Number(m.stock) || 0,
    })
    setEdImgs([]); setPEditId(null); setModalMp(false); setModalProd(true)
  }

  const costoFicha = (p) => {
    const f = fichas.find(x => x.id === p.product_id) || fichas.find(x => x.nombre === p.nombre)
    return Number(f?.costo_final) || 0
  }

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return productos.filter(p => !q || (p.nombre || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
  }, [productos, buscar])


  // Promedio de costo/precios de dos fichas (para surtidos)
  const promedioFichas = (aId, bId) => {
    const a = fichas.find(f => String(f.id) === String(aId))
    const b = fichas.find(f => String(f.id) === String(bId))
    if (!a || !b) return null
    const avg = (x, y) => Math.round(((Number(x) || 0) + (Number(y) || 0)) / 2)
    return { costo_unitario: avg(a.costo_final, b.costo_final), precio_mayor: avg(a.precio_mayor, b.precio_mayor), precio_detal: avg(a.precio_detal, b.precio_detal) }
  }
  const setSaborSurtido = (cual, id) => setPForm(f => {
    const next = { ...f, [cual]: id }
    const prom = promedioFichas(cual === 'surtido_a' ? id : f.surtido_a, cual === 'surtido_b' ? id : f.surtido_b)
    return prom ? { ...next, ...prom } : next
  })

  const pushAlegra = async (finished_id) => {
    try { await supabase.functions.invoke('alegra-push-stock', { body: { finished_id } }) } catch (e) { console.warn('No se pudo sincronizar con Alegra:', e) }
  }

  const saveProd = useMutation({
    mutationFn: async () => {
      if (!pForm.nombre.trim()) throw new Error('Indica el nombre comercial del producto')
      if (pForm.stock_min === '' || pForm.stock_min == null) throw new Error('Define el stock mínimo (usa 0 si no quieres alerta de stock bajo)')
      if (alegraCategorias.length > 0 && !pForm.categoria_alegra_id) throw new Error('Elige una categoría de Alegra')
      const payload = { nombre: pForm.nombre.trim(), descripcion: (pForm.descripcion || '').trim() || null, sku: pForm.sku || null, alegra_item_id: pForm.alegra_item_id || null, tipo: pForm.tipo, stock_min: parseFloat(pForm.stock_min) || 0, costo_unitario: parseFloat(pForm.costo_unitario) || 0, precio_mayor: parseFloat(pForm.precio_mayor) || 0, precio_detal: parseFloat(pForm.precio_detal) || 0, imagen_url: edImgs[0] || null, activo: pForm.activo, unidad_medida: pForm.unidad_medida || 'unit', codigo_unspsc: pForm.codigo_unspsc || null, categoria_alegra_id: pForm.categoria_alegra_id || null, categoria_alegra_nombre: pForm.categoria_alegra_nombre || null, surtido_a: pForm.surtido_a ? Number(pForm.surtido_a) : null, surtido_b: pForm.surtido_b ? Number(pForm.surtido_b) : null }
      let out
      if (pEditId) {
        const { error } = await supabase.from('finished_products').update(payload).eq('id', pEditId); if (error) throw error
        out = { id: pEditId, esNuevo: false }
      } else {
        // product_id/mp_id (enlace con la ficha o la MP) solo se fija AL CREAR; nunca se toca al editar.
        const { data, error } = await supabase.from('finished_products').insert({ ...payload, product_id: pForm.product_id || null, mp_id: pForm.mp_id || null, stock: pForm._stock_inicial || 0 }).select('id').single()
        if (error) throw error
        out = { id: data.id, esNuevo: true }
      }
      // Galería de imágenes (columna v92) — aparte y tolerante
      try { await supabase.from('finished_products').update({ imagenes: edImgs }).eq('id', out.id) } catch { /* opcional */ }
      // Propaga los cambios a la FICHA DE PRODUCTO enlazada (nombre, descripción e imágenes),
      // para que ambas queden consistentes. El usuario ya confirmó antes de guardar.
      const pid = pEditId ? (productos.find(x => x.id === pEditId)?.product_id || null) : (pForm.product_id || null)
      if (pid) {
        await supabase.from('products_costing').update({
          nombre: pForm.nombre.trim(),
          descripcion: (pForm.descripcion || '').trim() || null,
          imagen_url: edImgs[0] || '',
        }).eq('id', pid)
        try { await supabase.from('products_costing').update({ imagenes: edImgs }).eq('id', pid) } catch { /* columna v92 opcional */ }
      }
      return out
    },
    onSuccess: async ({ id, esNuevo }) => {
      qc.invalidateQueries({ queryKey: ['finished_products'] })
      qc.invalidateQueries({ queryKey: ['fichas_costo_terminado'] })
      qc.invalidateQueries({ queryKey: ['products_costing'] })
      const nombre = pForm.nombre.trim()
      // Si el usuario pidió "crear en Alegra al guardar" (no había match ni enlace previo), se crea ahora con el id ya persistido.
      if (esNuevo && crearAlGuardar && !pForm.alegra_item_id) {
        crearEnAlegra.mutate({ id, nombre })
      }
      setModalProd(false); setPForm(EMPTY_PROD); setPEditId(null); setCrearAlGuardar(false); setAlegraVerif({ estado: 'idle', match: null })
      toast('Producto terminado guardado ✓')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  // Verificación en Alegra DENTRO del modal: busca por SKU/nombre antes de decidir crear o enlazar.
  const [alegraVerif, setAlegraVerif] = useState({ estado: 'idle', match: null })   // idle | buscando | coincidencia | sin_match
  const [crearAlGuardar, setCrearAlGuardar] = useState(false)
  // Ids de Alegra que YA están enlazados a algún producto de la app: se excluyen de las
  // búsquedas para no ofrecer enlazar dos productos al mismo ítem (causa de confusiones).
  const idsAlegraEnlazados = () => new Set(productos.filter(p => p.alegra_item_id).map(p => String(p.alegra_item_id)))
  const verificarEnAlegra = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('alegra-items', { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const enlazados = idsAlegraEnlazados()
      if (pEditId && pForm.alegra_item_id) enlazados.delete(String(pForm.alegra_item_id))   // el propio no cuenta
      const items = (data?.items || []).filter(it => !enlazados.has(String(it.id)))
      // 1) Coincidencia EXACTA por SKU/referencia o por nombre completo
      const porRef = pForm.sku ? items.filter(it => norm(it.reference) === norm(pForm.sku)) : []
      const porNom = items.filter(it => norm(it.name) === norm(pForm.nombre))
      const exactos = porRef.length ? porRef : porNom
      const match = exactos.find(it => !it.esServicio) || exactos[0] || null
      // 2) SIMILARES: ítems que comparten palabras clave con el nombre (ignora conectores y
      //    presentaciones tipo "x40g"), ordenados por cuántas palabras coinciden.
      const STOP = new Set(['de', 'la', 'el', 'los', 'las', 'con', 'y', 'x', 'del', 'en', 'a', 'mumi'])
      const tokens = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ').filter(w => w.length > 2 && !STOP.has(w) && !/^x?\d+(g|gr|ml|kg|und|u)?$/.test(w))
      const tNom = tokens(pForm.nombre)
      const similares = tNom.length ? items
        .filter(it => !match || String(it.id) !== String(match.id))
        .map(it => { const ti = tokens(it.name); const score = tNom.filter(w => ti.some(x => x.includes(w) || w.includes(x))).length; return { it, score } })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score || (a.it.esServicio ? 1 : 0) - (b.it.esServicio ? 1 : 0))
        .slice(0, 8)
        .map(x => x.it) : []
      return { match, similares, items }
    },
    meta: { label: 'Buscando en Alegra…' },
    onMutate: () => { setAlegraVerif({ estado: 'buscando', match: null, similares: [], items: [] }); setBusqAlegra('') },
    onSuccess: ({ match, similares, items }) => setAlegraVerif({ estado: match ? 'coincidencia' : 'sin_match', match, similares, items }),
    onError: (e) => { setAlegraVerif({ estado: 'idle', match: null, similares: [], items: [] }); toast('No se pudo verificar en Alegra: ' + e.message, 'error') },
  })
  // Búsqueda EN VIVO sobre los ítems traídos de Alegra: filtra mientras el usuario escribe
  const [busqAlegra, setBusqAlegra] = useState('')
  const resultadosBusqAlegra = useMemo(() => {
    const items = alegraVerif.items || []
    const q = norm(busqAlegra).normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (!q.trim()) return null   // sin texto: se muestran los similares automáticos
    const palabras = q.split(/\s+/).filter(Boolean)
    return items
      .map(it => {
        const l = norm(it.name).normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ' + norm(it.reference)
        let score = 0
        if (l.startsWith(q)) score = 3
        else if (palabras.every(w => l.includes(w))) score = 2
        else if (palabras.some(w => l.includes(w))) score = 1
        return { it, score }
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || (a.it.esServicio ? 1 : 0) - (b.it.esServicio ? 1 : 0))
      .slice(0, 10)
      .map(x => x.it)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqAlegra, alegraVerif.items])
  const enlazarDesdeModal = (match) => {
    setPForm(f => ({ ...f, alegra_item_id: String(match.id), sku: f.sku || match.reference || f.sku }))
    setAlegraVerif({ estado: 'idle', match: null, similares: [] })
    toast(`Se enlazará con "${match.name}" al guardar`, 'success')
  }
  // Cada vez que se abre el modal (nuevo o editar), reinicia el estado de verificación de Alegra
  useEffect(() => { if (modalProd) { setAlegraVerif({ estado: 'idle', match: null }); setCrearAlGuardar(false) } }, [modalProd])

  const delProd = useMutation({
    mutationFn: async (id) => {
      const prod = productos.find(p => p.id === id)
      if (prod?.alegra_item_id) throw new Error('Está enlazado a Alegra. Desenlázalo primero.')
      const { error } = await supabase.from('finished_products').delete().eq('id', id); if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finished_products'] }); toast('Producto eliminado ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  // Ajuste de stock: entrada (+), salida (−) o ajuste (fija el valor absoluto)
  const ajustar = useMutation({
    mutationFn: async () => {
      const p = modalAjuste
      const cant = parseFloat(aForm.cantidad)
      if (!(cant >= 0) || aForm.cantidad === '') throw new Error('Ingresa la cantidad')
      if (!aForm.motivo.trim()) throw new Error('Indica el motivo del ajuste')
      const actual = Number(p.stock || 0)
      let nuevo, mov
      if (aForm.tipo === 'entrada') { nuevo = actual + cant; mov = cant }
      else if (aForm.tipo === 'salida') { nuevo = actual - cant; mov = -cant }
      else { nuevo = cant; mov = cant - actual }   // ajuste absoluto
      const { error } = await supabase.from('finished_products').update({ stock: nuevo }).eq('id', p.id)
      if (error) throw error
      await supabase.from('finished_movements').insert({
        finished_id: p.id, product_id: p.product_id || null, tipo: aForm.tipo, cantidad: Math.abs(mov),
        lote: aForm.lote || '', origen: 'manual', obs: aForm.motivo, creado_por: profile?.nombre || '',
      })
      await pushAlegra(p.id)
      return nuevo
    },
    meta: { label: 'Guardando ajuste de stock…' },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finished_products'] }); qc.invalidateQueries({ queryKey: ['finished_movements'] }); setModalAjuste(null); setAForm(EMPTY_AJUSTE); toast('Stock ajustado y sincronizado con Alegra ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  const crearEnAlegra = useMutation({
    mutationFn: async (p) => {
      const { data, error } = await supabase.functions.invoke('alegra-create-item', { body: { finished_id: p.id } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return p.nombre
    },
    meta: { label: 'Creando en Alegra…' },
    onSuccess: (nombre) => { qc.invalidateQueries({ queryKey: ['finished_products'] }); toast(`"${nombre}" creado en Alegra como inventariable ✓`) },
    onError: (e) => toast('Crear en Alegra: ' + e.message, 'error'),
  })

  // Botón de la lista: primero VERIFICA si ya existe en Alegra (por SKU/nombre) — si hay
  // coincidencia, ofrece enlazar; solo si no encuentra nada, ofrece crear uno nuevo. Evita duplicados.
  // IMPORTANTE: la decisión del usuario (enlazar/crear/cancelar) se resuelve en un modal APARTE,
  // nunca dentro del onSuccess de una mutación — si se espera ahí una respuesta del usuario, la
  // mutación queda "pendiente" y el overlay global "Guardando…" tapa el diálogo de confirmación
  // (z-index más alto), dejándolo inaccesible y con apariencia de que "se quedó pegado".
  const [verifAlegra, setVerifAlegra] = useState(null)   // { p, match, buscando }
  const verificarEnAlegraFila = async (p) => {
    setVerifAlegra({ p, match: null, buscando: true })
    try {
      const { data, error } = await supabase.functions.invoke('alegra-items', { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const enlazados = idsAlegraEnlazados()
      const items = (data?.items || []).filter(it => !enlazados.has(String(it.id)))
      const porRef = p.sku ? items.filter(it => norm(it.reference) === norm(p.sku)) : []
      const porNom = items.filter(it => norm(it.name) === norm(p.nombre))
      const candidatos = porRef.length ? porRef : porNom
      const match = candidatos.find(it => !it.esServicio) || candidatos[0] || null
      setVerifAlegra({ p, match, buscando: false })
    } catch (e) {
      setVerifAlegra(null)
      toast('No se pudo verificar en Alegra: ' + e.message, 'error')
    }
  }
  const enlazarDesdeVerificacion = useMutation({
    mutationFn: async ({ p, match }) => {
      const upd = { alegra_item_id: String(match.id) }
      if (!p.sku && match.reference) upd.sku = match.reference
      const { error } = await supabase.from('finished_products').update(upd).eq('id', p.id)
      if (error) throw error
      return { p, match }
    },
    meta: { label: 'Enlazando con Alegra…' },
    onSuccess: ({ p, match }) => { qc.invalidateQueries({ queryKey: ['finished_products'] }); setVerifAlegra(null); toast(`"${p.nombre}" enlazado con "${match.name}" ✓`) },
    onError: (e) => toast(e.message, 'error'),
  })

  const desenlazar = useMutation({
    meta: { label: 'Desenlazando de Alegra…' },
    mutationFn: async (p) => { const { error } = await supabase.from('finished_products').update({ alegra_item_id: null }).eq('id', p.id); if (error) throw error; return p.nombre },
    onSuccess: (nombre) => { qc.invalidateQueries({ queryKey: ['finished_products'] }); toast(`"${nombre}" desenlazado de Alegra ✓`) },
    onError: (e) => toast(e.message, 'error'),
  })

  const sincronizarUno = useMutation({
    meta: { label: 'Sincronizando con Alegra…' },
    mutationFn: async (p) => {
      if (!p.alegra_item_id) throw new Error('Asigna primero el ID del ítem en Alegra')
      const { data, error } = await supabase.functions.invoke('alegra-push-stock', { body: { finished_id: p.id } })
      if (error) throw error
      const r = (data?.resultados || [])[0]
      if (r && r.estado === 'error') throw new Error(r.detalle || 'Error en Alegra')
      console.log('Sincronización Alegra:', r?.debug)
      const d = r?.debug
      if (d) {
        if (d.lista_detal === '(sin mapear)') toast('⚠ No hay lista "Detal" mapeada en ⚙ Configurar Alegra', 'warning')
        else if (!(d.precio_detal > 0)) toast('⚠ Este producto tiene precio detal en $0', 'warning')
      }
      return p.nombre
    },
    onSuccess: (nombre) => toast(`"${nombre}" sincronizado con Alegra ✓`),
    onError: (e) => toast('No se pudo sincronizar: ' + e.message, 'error'),
  })

  // Actualiza el costo unitario de los terminados BASE desde el costo de su ficha
  const actualizarCostos = useMutation({
    meta: { label: 'Actualizando costos desde fichas…' },
    mutationFn: async () => {
      let n = 0
      for (const p of productos) {
        if (p.tipo !== 'base') continue
        const c = costoFicha(p)
        if (c > 0 && Math.round(c) !== Math.round(Number(p.costo_unitario) || 0)) {
          await supabase.from('finished_products').update({ costo_unitario: Math.round(c) }).eq('id', p.id)
          n++
        }
      }
      return n
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ['finished_products'] }); toast(n > 0 ? `Costos actualizados desde las fichas: ${n} ✓` : 'Los costos ya estaban al día ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  const sincronizarTodo = useMutation({
    meta: { label: 'Enviando stock a Alegra…' },
    mutationFn: async () => { const { data, error } = await supabase.functions.invoke('alegra-push-stock', { body: { all: true } }); if (error) throw error; return data },
    onSuccess: (data) => { const ok = (data?.resultados || []).filter(r => r.estado === 'ok').length; toast(`Stock sincronizado con Alegra: ${ok} producto(s) ✓`) },
    onError: (e) => toast('No se pudo sincronizar: ' + e.message, 'error'),
  })

  // Trae DESDE Alegra: remisiones (reservan) y facturas (descuentan stock / liberan reserva).
  const traerDesdeAlegra = useMutation({
    meta: { label: 'Trayendo ventas de Alegra…' },
    mutationFn: async () => { const { data, error } = await supabase.functions.invoke('alegra-sync-stock', { body: {} }); if (error) throw error; if (data?.error) throw new Error(data.error); return data },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['finished_products'] }); qc.invalidateQueries({ queryKey: ['finished_movements'] })
      const partes = [data?.reservas && `${data.reservas} reserva(s)`, data?.descuentos && `${data.descuentos} descuento(s)`, data?.liberaciones && `${data.liberaciones} liberación(es)`, data?.devoluciones && `${data.devoluciones} devolución(es)`].filter(Boolean)
      toast(partes.length ? `Traído desde Alegra: ${partes.join(', ')} ✓` : 'Todo al día con Alegra ✓')
    },
    onError: (e) => toast('No se pudo traer desde Alegra: ' + e.message, 'error'),
  })

  // Genera TODOS los surtidos (pares) entre las FICHAS elegidas, con costo = promedio de los dos
  const baseProds = useMemo(() => fichas.filter(f => (f.tipo || '') !== 'subproducto'), [fichas])
  const previewGen = useMemo(() => {
    const base = baseProds.filter(p => selGen.includes(p.id))
    const avg = (x, y) => Math.round(((Number(x) || 0) + (Number(y) || 0)) / 2)
    const seen = new Set()
    const out = []
    for (let i = 0; i < base.length; i++) for (let j = i + 1; j < base.length; j++) {
      const a = base[i], b = base[j]
      const nombre = componerSurtido(a.nombre, b.nombre)
      const key = `${a.id}-${b.id}`
      if (seen.has(key)) continue
      seen.add(key)
      // Empareja por par de sabores (sobrevive a renombrar) o por nombre compuesto
      const ya = productos.find(p => (p.surtido_a === a.id && p.surtido_b === b.id) || (p.surtido_a === b.id && p.surtido_b === a.id) || (p.nombre || '').toLowerCase() === (nombre || '').toLowerCase())
      out.push({
        nombre, existeId: ya?.id || null, a_id: a.id, b_id: b.id,
        costo: avg(a.costo_final, b.costo_final),
        precio_mayor: avg(a.precio_mayor, b.precio_mayor),
        precio_detal: avg(a.precio_detal, b.precio_detal),
      })
    }
    return out
  }, [baseProds, selGen, productos, fichas])

  const generarSurtidos = useMutation({
    meta: { label: 'Generando surtidos…' },
    mutationFn: async () => {
      if (!previewGen.length) throw new Error('No hay combinaciones para aplicar')
      let creados = 0, actualizados = 0
      const nuevos = []
      for (const c of previewGen) {
        if (c.existeId) {
          // No pisa el nombre comercial que el usuario haya puesto; solo costo/precios y enlace de sabores
          await supabase.from('finished_products').update({ costo_unitario: c.costo, precio_mayor: c.precio_mayor, precio_detal: c.precio_detal, surtido_a: c.a_id, surtido_b: c.b_id }).eq('id', c.existeId)
          actualizados++
        } else {
          nuevos.push({ nombre: c.nombre, tipo: 'surtido', costo_unitario: c.costo, precio_mayor: c.precio_mayor, precio_detal: c.precio_detal, surtido_a: c.a_id, surtido_b: c.b_id, stock: 0, activo: true })
        }
      }
      if (nuevos.length) { const { error } = await supabase.from('finished_products').insert(nuevos); if (error) throw error; creados = nuevos.length }
      return { creados, actualizados }
    },
    onSuccess: ({ creados, actualizados }) => { qc.invalidateQueries({ queryKey: ['finished_products'] }); setModalGen(false); toast(`Surtidos: ${creados} creado(s), ${actualizados} actualizado(s) ✓`) },
    onError: (e) => toast(e.message, 'error'),
  })

  // ---- Configuración de credenciales de Alegra ----
  const { data: alegraCfg } = useQuery({
    queryKey: ['alegra_config'],
    queryFn: async () => { const { data } = await supabase.from('alegra_config').select('email, token, price_list_mayor, price_list_detal').eq('id', 1).maybeSingle(); return data || {} },
    enabled: esAdmin,
  })
  const abrirConfig = () => { setCfgForm({ email: alegraCfg?.email || '', token: alegraCfg?.token || '', price_list_mayor: alegraCfg?.price_list_mayor || '', price_list_detal: alegraCfg?.price_list_detal || '' }); setPruebaMsg(null); setModalConfig(true) }
  const cargarListas = async () => {
    setCargandoListas(true)
    try {
      await guardarConfig.mutateAsync()
      const { data, error } = await supabase.functions.invoke('alegra-pricelists', { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setListasPrecios(data?.items || [])
    } catch (e) { toast('No se pudieron cargar las listas: ' + e.message, 'error'); setListasPrecios([]) }
    finally { setCargandoListas(false) }
  }
  const guardarConfig = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('alegra_config').upsert({ id: 1, email: cfgForm.email || null, token: cfgForm.token || null, price_list_mayor: cfgForm.price_list_mayor || null, price_list_detal: cfgForm.price_list_detal || null, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alegra_config'] }); toast('Credenciales de Alegra guardadas ✓') },
    onError: (e) => toast(e.message, 'error'),
  })
  const probarConexion = async () => {
    setProbando(true); setPruebaMsg(null)
    try {
      await guardarConfig.mutateAsync()   // guarda antes de probar
      const { data, error } = await supabase.functions.invoke('alegra-items', { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setPruebaMsg({ ok: true, txt: `✓ Conexión exitosa — ${data?.total || 0} ítems en Alegra` })
    } catch (e) { setPruebaMsg({ ok: false, txt: '✗ ' + (e.message || 'No se pudo conectar') }) }
    finally { setProbando(false) }
  }

  // ---- Enlazar con Alegra ----
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
  const abrirEnlace = async () => {
    setModalEnlace(true)
    if (!alegraItems) await escanearAlegra()
  }
  const escanearAlegra = async () => {
    setCargandoAlegra(true)
    try {
      const { data, error } = await supabase.functions.invoke('alegra-items', { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const items = data?.items || []
      setAlegraItems(items)
      // Autosugerencia: por referencia=SKU, o por nombre igual
      // Prefiere los ítems que NO son de solo facturación (los correctos para sincronizar stock)
      const pick = (arr) => (arr.find(it => !it.esServicio) || arr[0])
      const sug = {}
      for (const p of productos) {
        if (p.alegra_item_id) { sug[p.id] = String(p.alegra_item_id); continue }
        const porRef = items.filter(it => p.sku && norm(it.reference) === norm(p.sku))
        const porNom = items.filter(it => norm(it.name) === norm(p.nombre))
        const m = porRef.length ? pick(porRef) : (porNom.length ? pick(porNom) : null)
        if (m) sug[p.id] = m.id
      }
      setEnlaces(sug)
    } catch (e) { toast('No se pudo conectar con Alegra: ' + e.message, 'error'); setAlegraItems([]) }
    finally { setCargandoAlegra(false) }
  }
  const guardarEnlaces = useMutation({
    mutationFn: async () => {
      let n = 0
      for (const p of productos) {
        const itId = enlaces[p.id] || ''
        if (String(p.alegra_item_id || '') === String(itId)) continue
        const it = (alegraItems || []).find(x => x.id === itId)
        const upd = { alegra_item_id: itId || null }
        if (it && it.reference && !p.sku) upd.sku = it.reference   // hereda SKU si falta
        await supabase.from('finished_products').update(upd).eq('id', p.id)
        n++
      }
      return n
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ['finished_products'] }); setModalEnlace(false); toast(n > 0 ? `${n} enlace(s) guardado(s) ✓` : 'Sin cambios') },
    onError: (e) => toast(e.message, 'error'),
  })

  const kardex = kardexDe ? movimientos.filter(m => m.finished_id === kardexDe.id) : []

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Producto Terminado</h1>
        <div className="page-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* El resto de acciones se ocultan mientras se cargan los datos reales (evita botones erróneos) */}
          {!cargandoProds && <>
          {esAdmin && (
            <div ref={menuAlegraRef} style={{ position: 'relative' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setMenuAlegraOpen(o => !o)}><Ico as={Plug} size={14} />Alegra ▾</button>
              {menuAlegraOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--blanco)', border: '1px solid var(--crema-oscuro)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.14)', zIndex: 30, minWidth: 240, padding: 6 }}>
                  {[
                    { ico: Settings, label: 'Configurar Alegra', on: () => abrirConfig() },
                    { ico: Plug, label: 'Enlazar con Alegra (masivo)', on: () => abrirEnlace() },
                    { ico: ArrowDownToLine, label: traerDesdeAlegra.isPending ? 'Trayendo...' : 'Traer ventas de Alegra (respaldo del webhook)', on: () => traerDesdeAlegra.mutate(), disabled: traerDesdeAlegra.isPending },
                  ].map((it, i) => (
                    <button key={i} disabled={it.disabled} onClick={() => { it.on(); setMenuAlegraOpen(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', cursor: it.disabled ? 'default' : 'pointer', fontSize: '0.84rem', borderRadius: 6, color: 'var(--texto)' }}
                      onMouseEnter={e => !it.disabled && (e.currentTarget.style.background = 'var(--crema)')} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <Ico as={it.ico} size={14} />{it.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {esAdmin && (
            <button className={`btn btn-sm ${difsAlegra.length ? 'btn-dorado' : 'btn-secondary'}`} style={{ position: 'relative' }}
              title={difsAlegra.length ? `${difsAlegra.length} diferencia(s) entre la app y Alegra — clic para revisar` : 'La app y Alegra están sincronizadas. Clic para ver el detalle o forzar un reenvío.'}
              onClick={() => setModalAuditoria(true)}>
              <Ico as={ArrowUpFromLine} size={14} />Sincronizar con Alegra
              {difsAlegra.length > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--rojo)', color: '#fff', borderRadius: '50%', minWidth: 18, height: 18, fontSize: '0.66rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{difsAlegra.length}</span>
              )}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => actualizarCostos.mutate()} disabled={actualizarCostos.isPending}>{actualizarCostos.isPending ? 'Actualizando...' : <><Ico as={DollarSign} size={14} />Actualizar costos desde fichas</>}</button>
          {esAdmin && <button className="btn btn-secondary btn-sm" title="Auditoría: quién ajustó el inventario, qué movió, cuánto y cuándo" onClick={() => setModalHistAjustes(true)}><Ico as={ScrollText} size={14} />Historial de ajustes</button>}
          {fichasDisponibles.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setModalFicha(true)}><Ico as={ClipboardList} size={14} />Agregar producto ({fichasDisponibles.length})</button>}
          {mpsDisponibles.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setModalMp(true)}><Ico as={FlaskConical} size={14} />Agregar MP vendible ({mpsDisponibles.length})</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => { setSelGen(baseProds.map(p => p.id)); setModalGen(true) }}><Ico as={Shuffle} size={14} />Generar surtidos</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setPForm(EMPTY_PROD); setEdImgs([]); setPEditId(null); setModalProd(true) }}><Ico as={Plus} size={14} />Nuevo producto</button>
          </>}
        </div>
      </div>

      <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
        Catálogo y stock de productos vendibles (base y surtidos). El stock sube al aprobar producción y baja al facturar en Alegra. Aquí puedes <strong>ajustar el stock manualmente</strong> (se sincroniza con Alegra) y <strong>editar los nombres</strong> que luego se eligen al empacar surtidos.
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'lista' ? 'active' : ''}`} onClick={() => setTab('lista')}>Stock</button>
        {esAdmin && <button className={`tab-btn ${tab === 'analisis' ? 'active' : ''}`} onClick={() => setTab('analisis')}>Análisis mensual</button>}
      </div>

      {tab === 'lista' && (
      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Tags size={16} aria-hidden="true" /> Stock de productos terminados</span>
          <input className="form-control" style={{ marginLeft: 'auto', maxWidth: 240 }} placeholder="Buscar nombre o SKU..." value={buscar} onChange={e => setBuscar(e.target.value)} />
        </div>
        {cargandoProds ? <Cargando texto="Cargando productos terminados…" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th className="col-opcional-2">Tipo</th><th className="col-opcional">SKU</th><th className="col-opcional-2">Alegra</th><th className="td-number">Disponible</th><th className="td-number">Stock Alegra</th><th className="td-number col-opcional">Costo unit.</th><th className="col-opcional-2">Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {filtrados.length === 0
                ? <tr><td colSpan={9} className="empty-table">Sin productos terminados.</td></tr>
                : filtrados.map(p => {
                    const reservado = Number(p.reservado || 0)
                    const totalStock = stockReal(p)
                    const disp = totalStock - reservado
                    const bajo = (p.stock_min || 0) > 0 && disp <= Number(p.stock_min || 0)
                    return (
                      <tr key={p.id} style={p.activo === false ? { opacity: 0.55 } : undefined}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {(() => { const im = imgsDe(p); return im.length
                              ? <img src={im[0]} alt="" title={`${im.length} imagen(es) — clic en 📷 para gestionar`} style={{ width: 30, height: 30, borderRadius: 4, objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }} onClick={() => abrirGaleria(p)} />
                              : <div onClick={() => abrirGaleria(p)} title="Sin imágenes — clic para agregar" style={{ width: 30, height: 30, borderRadius: 4, background: 'var(--crema)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--texto-suave)', flexShrink: 0, cursor: 'pointer' }}>📷</div> })()}
                            <strong>{p.nombre}</strong>
                          </div>
                        </td>
                        <td className="col-opcional-2"><span className={`badge ${p.tipo === 'surtido' ? 'badge-dorado' : p.tipo === 'mp' ? 'badge-gris' : 'badge-azul'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{p.tipo === 'surtido' ? <><Shuffle size={11} aria-hidden="true" /> Surtido</> : p.tipo === 'mp' ? <><FlaskConical size={11} aria-hidden="true" /> MP</> : 'Base'}</span></td>
                        <td className="col-opcional">{p.sku || '—'}</td>
                        <td className="col-opcional-2">{p.alegra_item_id ? <Check size={14} aria-hidden="true" style={{ color: 'var(--selva)' }} /> : '—'}</td>
                        <td className="td-number"><strong style={{ color: bajo ? 'var(--rojo)' : undefined }}>{fNum(disp)}</strong>{bajo && <div style={{ fontSize: '0.65rem', color: 'var(--rojo)', display: 'flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={10} aria-hidden="true" /> bajo</div>}{reservado > 0 && <div style={{ fontSize: '0.62rem', color: 'var(--tierra)' }}>Reservado: {fNum(reservado)} · Total: {fNum(totalStock)}</div>}{p.tipo === 'mp' && <div style={{ fontSize: '0.6rem', color: 'var(--texto-suave)' }}>stock de MP</div>}</td>
                        {(() => {
                          if (!p.alegra_item_id) return <td className="td-number" style={{ color: 'var(--texto-suave)' }}>—</td>
                          const av = alegraStock[String(p.alegra_item_id)]?.available
                          if (av === undefined) return <td className="td-number" style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>{cargandoAlegraStock ? '…' : 's/d'}</td>
                          const ok = Math.round(Number(av)) === Math.round(Number(p.stock || 0))
                          return <td className="td-number"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: ok ? 'var(--selva)' : 'var(--tierra)' }}>{fNum(av)} {ok ? <Check size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}</span></td>
                        })()}
                        {(() => {
                          const costoMostrar = p.tipo === 'base' ? (Number(p.costo_unitario) || costoFicha(p)) : (Number(p.costo_unitario) || 0)
                          const desync = p.tipo === 'base' && costoFicha(p) > 0 && Math.round(costoFicha(p)) !== Math.round(Number(p.costo_unitario) || 0)
                          return (
                            <td className="td-number col-opcional">$ {costoMostrar.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {p.tipo === 'base' && <div style={{ fontSize: '0.62rem', color: desync ? 'var(--tierra)' : 'var(--texto-suave)', display: 'flex', alignItems: 'center', gap: 2 }}>{desync ? <><AlertTriangle size={10} aria-hidden="true" /> ficha (sin guardar)</> : 'desde ficha'}</div>}
                            </td>
                          )
                        })()}
                        <td className="col-opcional-2">{p.activo === false ? <span className="badge badge-gris">Inactivo</span> : <span className="badge badge-verde">Activo</span>}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button className="btn btn-xs btn-primary" title="Ajustar stock" onClick={() => { setModalAjuste(p); setAForm(EMPTY_AJUSTE) }}><Scale size={13} aria-hidden="true" /></button>
                            <button className="btn btn-xs btn-secondary" title="Kardex (movimientos)" onClick={() => setKardexDe(p)}><ScrollText size={13} aria-hidden="true" /></button>
                            {!p.alegra_item_id && esAdmin && <button className="btn btn-xs btn-dorado" title="Busca si ya existe en Alegra por SKU/nombre; si no existe, permite crearlo" disabled={verifAlegra?.buscando} onClick={() => verificarEnAlegraFila(p)}><Ico as={Plug} size={13} />{verifAlegra?.p?.id === p.id && verifAlegra.buscando ? 'Verificando...' : 'Verificar / Crear en Alegra'}</button>}
                            <button className="btn btn-xs btn-secondary" title={p.alegra_item_id ? 'Sincronizar stock y costo con Alegra' : 'Falta el ID del ítem en Alegra'} disabled={!p.alegra_item_id || sincronizarUno.isPending} onClick={() => sincronizarUno.mutate(p)}><RefreshCw size={13} aria-hidden="true" /></button>
                            <button className="btn btn-xs btn-secondary" onClick={() => { setPForm({ nombre: p.nombre, descripcion: p.descripcion || '', sku: p.sku || '', alegra_item_id: p.alegra_item_id || '', tipo: p.tipo || 'base', stock_min: p.stock_min || '', costo_unitario: p.costo_unitario || '', precio_mayor: p.precio_mayor || '', precio_detal: p.precio_detal || '', activo: p.activo !== false, unidad_medida: p.unidad_medida || 'unit', codigo_unspsc: p.codigo_unspsc || '', categoria_alegra_id: p.categoria_alegra_id || '', categoria_alegra_nombre: p.categoria_alegra_nombre || '', surtido_a: p.surtido_a || '', surtido_b: p.surtido_b || '' }); setEdImgs(imgsDe(p)); setPEditId(p.id); setModalProd(true) }} title="Editar"><Pencil size={13} aria-hidden="true" /></button>
                            {esAdmin && (p.alegra_item_id
                              ? <button className="btn btn-xs btn-danger" disabled title="Está enlazado a Alegra. Desenlázalo primero para poder eliminarlo." style={{ opacity: 0.5 }}><X size={13} aria-hidden="true" /></button>
                              : <button className="btn btn-xs btn-danger" title="Quitar del catálogo" onClick={() => confirmar(`¿Quitar "${p.nombre}" SOLO del catálogo de Producto Terminado?\n\nEsto NO elimina la ficha de producto ni su costo. Podrás recrearlo desde la ficha cuando quieras.`).then(ok => ok && delProd.mutate(p.id))}><X size={13} aria-hidden="true" /></button>)}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
        )}
      </div>
      )}

      {tab === 'analisis' && cargandoVentas && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(124,179,66,0.08)', border: '1px solid rgba(124,179,66,0.3)' }}>
          <div style={{ width: 28, height: 28, flexShrink: 0, border: '3px solid var(--crema-oscuro)', borderTopColor: 'var(--selva)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <div>
            <strong style={{ color: 'var(--selva)' }}>Cargando historial de ventas de Alegra…</strong>
            <div style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>Puede tardar unos segundos la primera vez (trae facturas y remisiones de todos los años). Quedará en caché por 30 minutos.</div>
          </div>
        </div>
      )}
      {tab === 'analisis' && (() => {
        const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
        const nombreFP = Object.fromEntries(productos.map(p => [p.id, p.nombre]))
        const mesDe = (m) => parseInt(String(m.fecha || m.created_at || '').slice(5, 7), 10) - 1
        const anioDe = (m) => String(m.fecha || m.created_at || '').slice(0, 4)
        const ventasAle = alegraVentas?.ventas || {}
        const usarAlegra = Object.keys(ventasAle).length > 0   // hay histórico descargado de Alegra
        // Años disponibles: de la producción registrada + del histórico de Alegra
        const aniosVentas = Object.values(ventasAle).flatMap(v => Object.keys(v)).map(ym => ym.slice(0, 4))
        const anios = [...new Set([...movAnalisis.map(anioDe), ...aniosVentas].filter(Boolean))].sort((a, b) => b.localeCompare(a))
        // Producido por finished_id (del año elegido)
        const prodByFid = {}
        for (const m of movAnalisis) {
          if (String(anioDe(m)) !== String(anioAn)) continue
          if (m.tipo === 'entrada' && m.origen === 'produccion') {
            const mes = mesDe(m); if (mes < 0 || mes > 11) continue
            const arr = prodByFid[m.finished_id] || Array(12).fill(0); arr[mes] += Number(m.cantidad) || 0; prodByFid[m.finished_id] = arr
          }
        }
        // Vendido: del histórico de Alegra (por SKU) si está; si no, de finished_movements (salidas alegra)
        const vendFallback = {}
        if (!usarAlegra) for (const m of movAnalisis) {
          if (String(anioDe(m)) !== String(anioAn)) continue
          if (m.tipo === 'salida' && m.origen === 'alegra') { const mes = mesDe(m); if (mes >= 0 && mes < 12) { const a = vendFallback[m.finished_id] || Array(12).fill(0); a[mes] += Number(m.cantidad) || 0; vendFallback[m.finished_id] = a } }
        }
        const rows = productos.map(p => {
          const prod = prodByFid[p.id] || Array(12).fill(0)
          const vend = Array(12).fill(0)
          if (usarAlegra) {
            const vmap = (p.alegra_item_id && ventasAle[String(p.alegra_item_id)]) || (p.sku && ventasAle[p.sku]) || {}
            for (const [ym, q] of Object.entries(vmap)) { if (ym.slice(0, 4) === String(anioAn)) { const mes = parseInt(ym.slice(5, 7), 10) - 1; if (mes >= 0 && mes < 12) vend[mes] += Number(q) || 0 } }
          } else { const fb = vendFallback[p.id]; if (fb) for (let i = 0; i < 12; i++) vend[i] += fb[i] }
          // Promedio mensual con TODA la historia de Alegra (todos los años) → proyección más estable
          const vmapFull = (p.alegra_item_id && ventasAle[String(p.alegra_item_id)]) || (p.sku && ventasAle[p.sku]) || {}
          const mesesHist = Object.keys(vmapFull).length
          const promHist = mesesHist > 0 ? Object.values(vmapFull).reduce((a, b) => a + (Number(b) || 0), 0) / mesesHist : 0
          return { nombre: p.nombre, prod, vend, promHist, tProd: prod.reduce((a, b) => a + b, 0), tVend: vend.reduce((a, b) => a + b, 0) }
        }).filter(r => r.tProd > 0 || r.tVend > 0).sort((a, b) => b.tVend - a.tVend)
        const hoy = new Date()
        const esAnioActual = String(anioAn) === String(hoy.getFullYear())
        const mesesTranscurridos = esAnioActual ? (hoy.getMonth() + 1) : 12
        const restoAnio = esAnioActual ? (11 - hoy.getMonth()) : 0
        const totProd = MESES.map((_, i) => rows.reduce((s, r) => s + r.prod[i], 0))
        const totVend = MESES.map((_, i) => rows.reduce((s, r) => s + r.vend[i], 0))
        // ===== MP necesaria según la proyección (ingredientes principales) =====
        const parseIngs = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []) } catch { return [] } }
        const rawById = Object.fromEntries(rawMps.map(m => [String(m.id), m]))
        // Promedio mensual para proyección: usa TODA la historia de Alegra si existe; si no, el año en curso.
        const promDe = Object.fromEntries(rows.map(r => [r.nombre, r.promHist > 0 ? r.promHist : (mesesTranscurridos > 0 ? r.tVend / mesesTranscurridos : 0)]))
        const mpNeed = {}
        // Acumula la MP de una ficha para 'unidsMes' unidades/mes proyectadas de esa ficha (dulce base).
        const acumularMpFicha = (f, unidsMes) => {
          if (!f || !(unidsMes > 0)) return
          const ings = parseIngs(f.ingredientes).filter(i => i.mpId && (parseFloat(i.cantidad) || 0) > 0)
          const totalMezcla = ings.reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0)
          const rend = parseFloat(f.rendimiento) || 62, desp = parseFloat(f.desperdicio) || 2, pu = parseFloat(f.peso_unidad) || 1000
          const unidsBache = pu > 0 ? totalMezcla * (rend / 100) * (1 - desp / 100) / pu : 0
          if (!(unidsBache > 0)) return
          for (const i of ings) {
            const gMes = ((parseFloat(i.cantidad) || 0) / unidsBache) * unidsMes
            const key = String(i.mpId); const raw = rawById[key]
            const cur = mpNeed[key] || { nombre: raw?.nombre || i.nombre || 'MP', unidad: raw?.unidad || 'Kg', gMes: 0 }
            cur.gMes += gMes; mpNeed[key] = cur
          }
        }
        const fichaPorId = Object.fromEntries(fichas.map(f => [String(f.id), f]))
        for (const p of productos) {
          const prom = promDe[p.nombre] || 0
          if (!(prom > 0)) continue
          if (p.tipo === 'surtido') {
            // El surtido no tiene ficha propia: se explota en sus dos dulces base (surtido_a/surtido_b).
            // Cada caja de surtido combina ambos sabores → media unidad de cada ficha base por caja vendida.
            const fa = fichaPorId[String(p.surtido_a)], fb = fichaPorId[String(p.surtido_b)]
            if (fa) acumularMpFicha(fa, prom * 0.5)
            if (fb) acumularMpFicha(fb, prom * 0.5)
            continue
          }
          const f = fichas.find(x => x.id === p.product_id) || fichas.find(x => (x.nombre || '').toLowerCase() === (p.nombre || '').toLowerCase())
          acumularMpFicha(f, prom)
        }
        const mpRows = Object.values(mpNeed).sort((a, b) => b.gMes - a.gMes)
        const convMp = (gMes, mult, unidad) => { const g = gMes * mult; return ['Kg', 'Litro'].includes(unidad) ? `${fNum(Math.round(g / 1000 * 100) / 100)} ${unidad}` : `${fNum(Math.round(g))} ${unidad || 'u'}` }
        return (
          <>
            <div className="card">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BarChart3 size={16} aria-hidden="true" /> Producido vs Vendido por mes</span>
                <Select className="form-control" style={{ width: 110, marginLeft: 'auto' }} value={anioAn} onChange={e => setAnioAn(Number(e.target.value))}>
                  {(anios.length ? anios : [String(anioAn)]).map(a => <option key={a} value={a}>{a}</option>)}
                </Select>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Producto</th>{MESES.map(m => <th key={m} className="td-number">{m}</th>)}<th className="td-number">Total</th></tr></thead>
                  <tbody>
                    {rows.length === 0 ? <tr><td colSpan={14} className="empty-table">Sin datos de {anioAn}</td></tr> : rows.map(r => (
                      <tr key={r.nombre}>
                        <td><strong>{r.nombre}</strong></td>
                        {MESES.map((_, i) => <td key={i} className="td-number" style={{ fontSize: '0.72rem' }}><span style={{ color: 'var(--selva)' }}>{r.prod[i] || '·'}</span>{' / '}<span style={{ color: 'var(--tierra)' }}>{r.vend[i] || '·'}</span></td>)}
                        <td className="td-number"><strong style={{ color: 'var(--selva)' }}>{fNum(r.tProd)}</strong> / <strong style={{ color: 'var(--tierra)' }}>{fNum(r.tVend)}</strong></td>
                      </tr>
                    ))}
                    {rows.length > 0 && <tr style={{ background: 'rgba(45,90,61,0.06)', fontWeight: 700 }}>
                      <td>Total</td>{MESES.map((_, i) => <td key={i} className="td-number" style={{ fontSize: '0.72rem' }}><span style={{ color: 'var(--selva)' }}>{totProd[i] || '·'}</span> / <span style={{ color: 'var(--tierra)' }}>{totVend[i] || '·'}</span></td>)}
                      <td className="td-number">{fNum(totProd.reduce((a, b) => a + b, 0))} / {fNum(totVend.reduce((a, b) => a + b, 0))}</td>
                    </tr>}
                  </tbody>
                </table>
              </div>
              <small style={{ color: 'var(--texto-suave)' }}>Verde = <strong>producido</strong> · Marrón = <strong>vendido</strong> (facturas de Alegra). "·" = 0. Las ventas se llenan a medida que Alegra factura.</small>
            </div>

            <div className="card">
              <div className="card-title"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TrendingUp size={16} aria-hidden="true" /> Proyección de venta</span></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Producto</th><th className="td-number">Prom. mensual</th><th className="td-number">Próx. mes</th><th className="td-number">Trimestre</th><th className="td-number">Semestre</th><th className="td-number">Resto de {anioAn}</th><th className="td-number">Año siguiente</th></tr></thead>
                  <tbody>
                    {rows.length === 0 ? <tr><td colSpan={7} className="empty-table">Sin datos</td></tr> : rows.map(r => {
                      const prom = r.promHist > 0 ? r.promHist : (mesesTranscurridos > 0 ? r.tVend / mesesTranscurridos : 0)
                      return <tr key={r.nombre}>
                        <td><strong>{r.nombre}</strong></td>
                        <td className="td-number">{fNum(Math.round(prom))}</td>
                        <td className="td-number">{fNum(Math.round(prom))}</td>
                        <td className="td-number">{fNum(Math.round(prom * 3))}</td>
                        <td className="td-number">{fNum(Math.round(prom * 6))}</td>
                        <td className="td-number">{fNum(Math.round(prom * restoAnio))}</td>
                        <td className="td-number">{fNum(Math.round(prom * 12))}</td>
                      </tr>
                    })}
                  </tbody>
                </table>
              </div>
              <small style={{ color: 'var(--texto-suave)' }}>Proyección = promedio mensual de ventas de Alegra sobre <strong>toda la historia disponible</strong> (todos los años facturados) × período.</small>
            </div>

            <div className="card">
              <div className="card-title"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Package size={16} aria-hidden="true" /> Materia prima necesaria (según proyección)</span></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Materia prima</th><th className="td-number">Próx. mes</th><th className="td-number">Trimestre</th><th className="td-number">Semestre</th><th className="td-number">Resto de {anioAn}</th><th className="td-number">Año siguiente</th></tr></thead>
                  <tbody>
                    {mpRows.length === 0 ? <tr><td colSpan={6} className="empty-table">Sin datos suficientes (necesita ventas y fichas con ingredientes vinculados).</td></tr> : mpRows.map((r, k) => (
                      <tr key={k}>
                        <td><strong>{r.nombre}</strong></td>
                        <td className="td-number">{convMp(r.gMes, 1, r.unidad)}</td>
                        <td className="td-number">{convMp(r.gMes, 3, r.unidad)}</td>
                        <td className="td-number">{convMp(r.gMes, 6, r.unidad)}</td>
                        <td className="td-number">{convMp(r.gMes, restoAnio, r.unidad)}</td>
                        <td className="td-number">{convMp(r.gMes, 12, r.unidad)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small style={{ color: 'var(--texto-suave)' }}>Estimación de MP (ingredientes vinculados a materia prima) según el promedio mensual de ventas proyectado, considerando rendimiento y desperdicio de cada ficha.</small>
            </div>
          </>
        )
      })()}

      {/* Modal crear/editar producto terminado */}
      <Modal open={modalProd} onClose={() => setModalProd(false)} title={pEditId ? 'Editar producto terminado' : 'Nuevo producto terminado'}
        footer={<>
          {pEditId && pForm.alegra_item_id && esAdmin && (
            <button className="btn btn-secondary" style={{ marginRight: 'auto' }} disabled={desenlazar.isPending}
              onClick={() => confirmar(`¿Desenlazar "${pForm.nombre}" de Alegra?\nNo borra nada en Alegra; solo quita el enlace en la app.`).then(ok => { if (ok) { desenlazar.mutate({ id: pEditId, nombre: pForm.nombre }); setPForm(f => ({ ...f, alegra_item_id: '' })) } })}>
              <Ico as={Unplug} size={14} />Desenlazar de Alegra
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setModalProd(false)}>Cancelar</button>
          <button className="btn btn-primary" disabled={saveProd.isPending || subiendoEdImg} onClick={async () => {
            // Si el producto está enlazado a una ficha de costos, avisar que también se actualizará
            const pid = pEditId ? (productos.find(x => x.id === pEditId)?.product_id || null) : (pForm.product_id || null)
            if (pid) {
              const ok = await confirmar('Este producto está enlazado a una ficha de producto.\n\nAl guardar, el nombre, la descripción y las imágenes también se actualizarán en esa ficha para que queden consistentes.\n\n¿Continuar?', { title: 'También se actualizará la ficha', confirmText: 'Sí, guardar', danger: false })
              if (!ok) return
            }
            saveProd.mutate()
          }}>Guardar</button>
        </>}>
        <div className="form-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Nombre comercial</label>
            <input className="form-control" value={pForm.nombre} onChange={e => setPForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Bocadillo Mumi Surt. Seje - Araza x 250g" />
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
              Cómo nombrarlo: <strong>Producto + Marca + Presentación + Cantidad</strong> (ej. "Bocadillo Mumi Surtido Seje-Arazá x 250g").
            </small>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Descripción <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(se sincroniza con la descripción del ítem en Alegra)</small></label>
            <textarea className="form-control" rows={2} maxLength={500} value={pForm.descripcion || ''} onChange={e => setPForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Imágenes <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(la primera es la principal — ★ para cambiarla)</small></label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {edImgs.map((url, i) => (
                <div key={url + i} style={{ position: 'relative', width: 64, height: 64, borderRadius: 6, overflow: 'hidden', border: i === 0 ? '2px solid var(--dorado)' : '1px solid var(--crema-oscuro)' }}>
                  <img src={url} alt={`imagen ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
                    {i > 0 && <button type="button" title="Hacer principal" onClick={() => setEdImgs(prev => [prev[i], ...prev.filter((_, idx) => idx !== i)])} style={{ background: 'rgba(0,0,0,0.55)', color: '#ffd54f', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.68rem', padding: '1px 4px' }}>★</button>}
                    <button type="button" title="Quitar" onClick={() => setEdImgs(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.68rem', padding: '1px 4px' }}>✕</button>
                  </div>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.4)' }}>
                    <button type="button" title="Mover izquierda" disabled={i === 0} onClick={() => setEdImgs(prev => { const b = [...prev];[b[i - 1], b[i]] = [b[i], b[i - 1]]; return b })} style={{ background: 'none', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0 4px', opacity: i === 0 ? 0.3 : 1 }}>‹</button>
                    <button type="button" title="Mover derecha" disabled={i === edImgs.length - 1} onClick={() => setEdImgs(prev => { const b = [...prev];[b[i + 1], b[i]] = [b[i], b[i + 1]]; return b })} style={{ background: 'none', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0 4px', opacity: i === edImgs.length - 1 ? 0.3 : 1 }}>›</button>
                  </div>
                </div>
              ))}
              <label style={{ width: 64, height: 64, border: '2px dashed var(--crema-oscuro)', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', background: 'var(--crema)', color: 'var(--texto-suave)' }}>
                {subiendoEdImg ? '…' : '＋'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setCropEd(f); e.target.value = '' }} />
              </label>
            </div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Recomendado 1000×1000 px (1:1). Podrás recortar al subir.</small>
            {cropEd && <ImageCropper file={cropEd} aspect={1} salidaW={1000} salidaH={1000} onCancel={() => setCropEd(null)} onCropped={(blob) => { setCropEd(null); subirEdBlob(blob) }} />}
          </div>
          <div className="form-group"><label className="form-label">Tipo</label><Select className="form-control" value={pForm.tipo} onChange={e => setPForm(f => ({ ...f, tipo: e.target.value }))}><option value="base">Base</option><option value="surtido">Surtido</option></Select></div>
          <div className="form-group"><label className="form-label">SKU / Referencia (Alegra)</label><input className="form-control" value={pForm.sku} onChange={e => setPForm(f => ({ ...f, sku: e.target.value }))} /></div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Enlace con Alegra</label>
            {pForm.alegra_item_id ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="form-control" style={{ background: 'var(--crema)', flex: '1 1 200px' }}>ID: {pForm.alegra_item_id}</span>
                {esAdmin && <button type="button" className="btn btn-xs btn-secondary" onClick={() => setPForm(f => ({ ...f, alegra_item_id: '' }))}>Quitar enlace</button>}
              </div>
            ) : (
              <div>
                {esAdmin && alegraVerif.estado !== 'coincidencia' && alegraVerif.estado !== 'sin_match' && (
                  <button type="button" className="btn btn-sm btn-secondary" disabled={verificarEnAlegra.isPending || !pForm.nombre.trim()} onClick={() => verificarEnAlegra.mutate()}>
                    <Ico as={Plug} size={14} />{verificarEnAlegra.isPending ? 'Buscando en Alegra...' : 'Verificar si ya existe en Alegra'}
                  </button>
                )}
                {alegraVerif.estado === 'coincidencia' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'rgba(124,179,66,0.08)', border: '1px solid rgba(124,179,66,0.3)', borderRadius: 8, padding: '8px 10px' }}>
                    <span style={{ fontSize: '0.85rem' }}>Coincidencia exacta en Alegra: <strong>{alegraVerif.match.name}</strong>{alegraVerif.match.reference ? ` (ref: ${alegraVerif.match.reference})` : ''}</span>
                    <button type="button" className="btn btn-xs btn-primary" onClick={() => enlazarDesdeModal(alegraVerif.match)}>Enlazar con este</button>
                    <button type="button" className="btn btn-xs btn-secondary" onClick={() => setAlegraVerif({ estado: 'idle', match: null, similares: [] })}>No es este</button>
                  </div>
                )}
                {alegraVerif.estado === 'sin_match' && !(alegraVerif.items || []).length && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--crema)', borderRadius: 8, padding: '8px 10px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>No se encontró en Alegra ningún ítem parecido a este nombre/SKU.</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={crearAlGuardar} onChange={e => setCrearAlGuardar(e.target.checked)} />
                      Crear en Alegra al guardar
                    </label>
                  </div>
                )}
                {(alegraVerif.estado === 'coincidencia' || alegraVerif.estado === 'sin_match') && (alegraVerif.items || []).length > 0 && (
                  <div style={{ marginTop: 8, background: 'var(--crema)', borderRadius: 8, padding: '8px 10px' }}>
                    <input className="form-control" style={{ marginBottom: 6 }} value={busqAlegra} onChange={e => setBusqAlegra(e.target.value)}
                      placeholder={`🔍 Buscar entre los ${(alegraVerif.items || []).length} ítems de Alegra (filtra mientras escribes)...`} />
                    {(() => {
                      const lista = resultadosBusqAlegra !== null ? resultadosBusqAlegra : (alegraVerif.similares || [])
                      return (<>
                        <div style={{ fontSize: '0.8rem', color: 'var(--texto-suave)', marginBottom: 6 }}>
                          {resultadosBusqAlegra !== null
                            ? (lista.length ? `${lista.length} coincidencia(s) con "${busqAlegra}":` : `Nada en Alegra coincide con "${busqAlegra}".`)
                            : alegraVerif.estado === 'sin_match'
                              ? (lista.length ? 'Sin coincidencia exacta, pero hay ítems PARECIDOS — revisa si alguno corresponde (o busca arriba):' : 'Sin parecidos automáticos — usa el buscador de arriba.')
                              : (lista.length ? 'Otros ítems parecidos en Alegra:' : '')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 170, overflowY: 'auto' }}>
                          {lista.map(it => (
                            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blanco)', border: '1px solid var(--crema-oscuro)', borderRadius: 6, padding: '5px 8px' }}>
                              <span style={{ flex: 1, fontSize: '0.82rem' }}>
                                <strong>{it.name}</strong>{it.reference ? <small style={{ color: 'var(--texto-suave)' }}> · ref: {it.reference}</small> : ''}{it.esServicio ? <small style={{ color: 'var(--tierra)' }}> · solo facturación</small> : ''}
                              </span>
                              <button type="button" className="btn btn-xs btn-primary" onClick={() => enlazarDesdeModal(it)}>Enlazar</button>
                            </div>
                          ))}
                        </div>
                      </>)
                    })()}
                    {alegraVerif.estado === 'sin_match' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer', marginTop: 8 }}>
                        <input type="checkbox" checked={crearAlGuardar} onChange={e => setCrearAlGuardar(e.target.checked)} />
                        Ninguno corresponde — crear en Alegra al guardar
                      </label>
                    )}
                  </div>
                )}
                {!esAdmin && <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Solo un admin puede verificar/crear/enlazar con Alegra.</small>}
              </div>
            )}
          </div>
          <div className="form-group"><label className="form-label">Stock mínimo (alerta)</label><input type="number" className="form-control" value={pForm.stock_min} onChange={e => setPForm(f => ({ ...f, stock_min: e.target.value }))} min={0} /></div>
          {pForm.tipo === 'surtido' && (
            <div className="form-group" style={{ gridColumn: '1 / -1', background: 'rgba(124,179,66,0.07)', borderRadius: 6, padding: 10 }}>
              <label className="form-label">Sabores combinados <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(definen costo y precios = promedio de las dos fichas)</small></label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Select className="form-control" style={{ maxWidth: 220 }} value={pForm.surtido_a} onChange={e => setSaborSurtido('surtido_a', e.target.value)}>
                  <option value="">Sabor 1...</option>
                  {fichas.filter(f => (f.tipo || '') !== 'subproducto').map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </Select>
                <Select className="form-control" style={{ maxWidth: 220 }} value={pForm.surtido_b} onChange={e => setSaborSurtido('surtido_b', e.target.value)}>
                  <option value="">Sabor 2...</option>
                  {fichas.filter(f => (f.tipo || '') !== 'subproducto').map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </Select>
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Precio venta mayor {pForm.tipo === 'base' ? '(desde la ficha)' : pForm.tipo === 'surtido' ? '(promedio)' : ''}</label>
            {(pForm.tipo === 'base' || pForm.tipo === 'surtido')
              ? <div className="form-control" style={{ background: 'var(--crema)', color: 'var(--texto-suave)' }}>$ {Number(pForm.precio_mayor || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              : <MoneyInput value={pForm.precio_mayor} onChange={v => setPForm(f => ({ ...f, precio_mayor: v }))} />}
          </div>
          <div className="form-group">
            <label className="form-label">Precio detal / distribuidores {pForm.tipo === 'base' ? '(desde la ficha)' : pForm.tipo === 'surtido' ? '(promedio)' : ''}</label>
            {(pForm.tipo === 'base' || pForm.tipo === 'surtido')
              ? <div className="form-control" style={{ background: 'var(--crema)', color: 'var(--texto-suave)' }}>$ {Number(pForm.precio_detal || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              : <MoneyInput value={pForm.precio_detal} onChange={v => setPForm(f => ({ ...f, precio_detal: v }))} />}
          </div>
          <div className="form-group">
            <label className="form-label">Unidad de medida (Alegra)</label>
            <Select className="form-control" value={pForm.unidad_medida} onChange={e => setPForm(f => ({ ...f, unidad_medida: e.target.value }))}>
              {UNIDADES_ALEGRA.map(u => <option key={u.l} value={u.v}>{u.l}</option>)}
            </Select>
          </div>
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center' }}>
              Categoría (Alegra)
              {esAdmin && !nuevaCatOpen && <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => { setNuevaCatNombre(''); setNuevaCatOpen(true) }}>+ Nueva</button>}
            </label>
            <Select className="form-control" value={pForm.categoria_alegra_id} onChange={e => { const id = e.target.value; const c = alegraCategorias.find(x => x.id === id); setPForm(f => ({ ...f, categoria_alegra_id: id, categoria_alegra_nombre: c?.name || '' })) }}>
              <option value="">— Sin categoría —</option>
              {alegraCategorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {nuevaCatOpen && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input className="form-control" placeholder="Ej: Pulpas y frutas procesadas" value={nuevaCatNombre} onChange={e => setNuevaCatNombre(e.target.value)} />
                <button type="button" className="btn btn-xs btn-primary" disabled={crearCategoria.isPending} onClick={() => crearCategoria.mutate(nuevaCatNombre)}>Crear</button>
                <button type="button" className="btn btn-xs btn-secondary" onClick={() => setNuevaCatOpen(false)}>✕</button>
              </div>
            )}
            {alegraCategorias.length === 0 && <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Configura Alegra para cargar las categorías (Dulces, Galletas, Infusiones...).</small>}
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1', position: 'relative' }}>
            <label className="form-label">Código del producto/servicio (UNSPSC — clasificador DIAN)</label>
            <input className="form-control" autoComplete="off" value={pForm.codigo_unspsc}
              onChange={e => setPForm(f => ({ ...f, codigo_unspsc: e.target.value }))}
              onFocus={() => setUnspscAbierto(true)}
              onBlur={() => setTimeout(() => setUnspscAbierto(false), 150)}
              placeholder="Opcional: escribe para buscar (ej: pulpa, galleta, infusión...)" />
            {unspscAbierto && unspscSugeridos.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4, background: 'var(--blanco)', border: '1px solid var(--crema-oscuro)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }}>
                {unspscSugeridos.map((u, i) => (
                  <div key={u.codigo + i} onMouseDown={() => { setPForm(f => ({ ...f, codigo_unspsc: u.codigo })); setUnspscAbierto(false) }}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.82rem', borderBottom: i < unspscSugeridos.length - 1 ? '1px solid var(--crema)' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--crema)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <strong style={{ color: 'var(--selva)' }}>{u.codigo}</strong> — {u.desc}
                    <small style={{ display: 'block', color: 'var(--texto-suave)' }}>{u.grupo}</small>
                  </div>
                ))}
              </div>
            )}
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
              {UNSPSC_ALIMENTOS.find(u => u.codigo === pForm.codigo_unspsc)?.desc
                || (pForm.codigo_unspsc ? 'Código escrito manualmente (no está en el catálogo de la app).' : 'Opcional: solo se necesita para facturar electrónicamente.')}
            </small>
          </div>
          <div className="form-group">
            <label className="form-label">Costo unitario {pForm.tipo === 'base' ? '(desde la ficha)' : pForm.tipo === 'surtido' ? '(promedio de las fichas)' : ''}</label>
            <div className="form-control" style={{ background: 'var(--crema)', color: 'var(--texto-suave)' }}>$ {Number(pForm.costo_unitario || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>{pForm.tipo === 'base' ? 'Se sincroniza automáticamente desde la ficha.' : pForm.tipo === 'surtido' ? 'Promedio del costo de las dos fichas combinadas (no editable).' : 'No editable.'}</small>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={pForm.activo} onChange={e => setPForm(f => ({ ...f, activo: e.target.checked }))} /> Activo</label>
          </div>
        </div>
        {!pEditId && <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>El stock arranca en 0; usa "Ajustar" para fijar el inicial.</small>}
      </Modal>

      {/* Modal ajuste de stock */}
      <Modal open={!!modalAjuste} onClose={() => setModalAjuste(null)} title={`Ajustar stock — ${modalAjuste?.nombre || ''}`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalAjuste(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => ajustar.mutate()} disabled={ajustar.isPending}>{ajustar.isPending ? 'Guardando...' : 'Aplicar y sincronizar'}</button>
        </>}>
        {modalAjuste && (
          <div>
            <p style={{ fontSize: '0.85rem' }}>Stock actual: <strong>{fNum(modalAjuste.stock)}</strong></p>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Tipo de ajuste</label><Select className="form-control" value={aForm.tipo} onChange={e => setAForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="entrada">Entrada (+)</option>
                <option value="salida">Salida (−)</option>
                <option value="ajuste">Ajuste (fijar valor)</option>
              </Select></div>
              <div className="form-group"><label className="form-label">{aForm.tipo === 'ajuste' ? 'Nuevo stock' : 'Cantidad'}</label><input type="number" className="form-control" value={aForm.cantidad} onChange={e => setAForm(f => ({ ...f, cantidad: e.target.value }))} min={0} /></div>
              <div className="form-group"><label className="form-label">Lote (opcional)</label><input className="form-control" value={aForm.lote} onChange={e => setAForm(f => ({ ...f, lote: e.target.value }))} /></div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Motivo</label><input className="form-control" value={aForm.motivo} onChange={e => setAForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ej: conteo físico, merma, devolución..." /></div>
            </div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>El ajuste actualiza el stock, queda en el kardex y se empuja a Alegra.</small>
          </div>
        )}
      </Modal>

      {/* Modal configurar credenciales de Alegra */}
      <Modal open={modalConfig} onClose={() => setModalConfig(false)} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Settings size={18} aria-hidden="true" /> Configurar conexión con Alegra</span>}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalConfig(false)}>Cerrar</button>
          <button className="btn btn-secondary" onClick={probarConexion} disabled={probando || !cfgForm.email || !cfgForm.token}>{probando ? 'Probando...' : <><Ico as={Plug} size={14} />Probar conexión</>}</button>
          <button className="btn btn-primary" onClick={() => guardarConfig.mutate()} disabled={guardarConfig.isPending}>Guardar</button>
        </>}>
        <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>Ingresa los datos de tu cuenta de Alegra. El <strong>token de API</strong> lo encuentras en Alegra → <strong>Configuración → API / Integraciones</strong>. Se guardan de forma segura y solo los administradores los ven.</div>
        <div className="form-group"><label className="form-label">Correo de Alegra</label><input className="form-control" value={cfgForm.email} onChange={e => setCfgForm(f => ({ ...f, email: e.target.value }))} placeholder="tu-correo@dominio.com" /></div>
        <div className="form-group"><label className="form-label">Token de API</label><input className="form-control" type="password" value={cfgForm.token} onChange={e => setCfgForm(f => ({ ...f, token: e.target.value }))} placeholder="Pega aquí el token de Alegra" /></div>
        {pruebaMsg && <div className="alert" style={{ fontSize: '0.85rem', color: pruebaMsg.ok ? 'var(--selva)' : 'var(--rojo)', background: pruebaMsg.ok ? 'rgba(124,179,66,0.10)' : 'rgba(192,57,43,0.08)' }}>{pruebaMsg.txt}</div>}

        <div style={{ borderTop: '1px solid var(--crema-oscuro)', marginTop: 12, paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: '0.88rem', color: 'var(--selva)' }}>Listas de precios</strong>
            <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={cargarListas} disabled={cargandoListas || !cfgForm.email || !cfgForm.token}>{cargandoListas ? 'Cargando...' : <><Ico as={RefreshCw} size={13} />Cargar listas de Alegra</>}</button>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginTop: 0 }}>Indica qué lista de Alegra recibe el precio <strong>mayor</strong> y cuál el <strong>detal/distribuidores</strong>. Se enviarán desde la ficha.</p>
          {listasPrecios && (
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Lista "por mayor"</label>
                <Select className="form-control" value={cfgForm.price_list_mayor} onChange={e => setCfgForm(f => ({ ...f, price_list_mayor: e.target.value }))}>
                  <option value="">— Sin asignar —</option>
                  {listasPrecios.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </div>
              <div className="form-group"><label className="form-label">Lista "detal / distribuidores"</label>
                <Select className="form-control" value={cfgForm.price_list_detal} onChange={e => setCfgForm(f => ({ ...f, price_list_detal: e.target.value }))}>
                  <option value="">— Sin asignar —</option>
                  {listasPrecios.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </div>
            </div>
          )}
        </div>
        <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Tras guardar, usa "🔌 Enlazar con Alegra" para mapear cada producto.</small>
      </Modal>

      {/* Modal enlazar con Alegra */}
      <Modal open={modalEnlace} onClose={() => setModalEnlace(false)} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Plug size={18} aria-hidden="true" /> Enlazar productos con Alegra</span>} size="modal-xl"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalEnlace(false)}>Cerrar</button>
          <button className="btn btn-secondary" onClick={escanearAlegra} disabled={cargandoAlegra}>{cargandoAlegra ? 'Escaneando...' : <><Ico as={RefreshCw} size={14} />Volver a escanear</>}</button>
          <button className="btn btn-primary" onClick={() => guardarEnlaces.mutate()} disabled={guardarEnlaces.isPending || cargandoAlegra || !alegraItems}>Guardar enlaces</button>
        </>}>
        {cargandoAlegra
          ? <p style={{ padding: 20, textAlign: 'center' }}>Conectando con Alegra y cargando ítems…</p>
          : !alegraItems
            ? <p style={{ padding: 20 }}>No se pudieron cargar los ítems.</p>
            : alegraItems.length === 0
              ? <div className="alert alert-warning" style={{ fontSize: '0.85rem' }}>Conexión establecida pero Alegra no devolvió ítems. Crea ítems en Alegra o revisa el token.</div>
              : (
                <>
                  <div className="alert alert-info" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span>✓ Conectado con Alegra ({alegraItems.length} ítems). Elige el equivalente de cada producto. Los 📦 manejan inventario (sincronizan stock); los 🧾 son de solo facturación.</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={ocultarFact} onChange={e => setOcultarFact(e.target.checked)} /> Ocultar solo facturación
                    </label>
                  </div>
                  <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
                    <table>
                      <thead><tr><th>Producto (app)</th><th>SKU</th><th>Ítem en Alegra</th></tr></thead>
                      <tbody>
                        {productos.map(p => {
                          const sel = enlaces[p.id] || ''
                          const yaUsado = (id) => id && Object.entries(enlaces).some(([k, v]) => v === id && Number(k) !== p.id && k !== p.id)
                          return (
                            <tr key={p.id}>
                              <td><strong>{p.nombre}</strong> {p.tipo === 'surtido' && <span className="badge badge-dorado" style={{ fontSize: '0.6rem' }}><Shuffle size={10} aria-hidden="true" /></span>}</td>
                              <td>{p.sku || '—'}</td>
                              <td>
                                <Select className="form-control" value={sel} onChange={e => setEnlaces(m => ({ ...m, [p.id]: e.target.value }))} style={{ borderColor: yaUsado(sel) ? 'var(--rojo)' : undefined }}>
                                  <option value="">— Sin enlazar —</option>
                                  {/* Oculta los ítems ya asignados a OTRO producto (en la BD o elegidos en este modal) para evitar enlaces duplicados */}
                                  {alegraItems.filter(it => it.id === sel || (!(ocultarFact && it.esServicio) && !yaUsado(it.id))).map(it => <option key={it.id} value={it.id}>{it.esServicio ? '🧾 ' : '📦 '}{it.name}{it.reference ? ` · ${it.reference}` : ''}{it.esServicio ? ' · solo facturación' : ` · stock ${it.available ?? 0}`}</option>)}
                                </Select>
                                {yaUsado(sel) && <small style={{ color: 'var(--rojo)', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={11} aria-hidden="true" /> ese ítem ya está asignado a otro producto</small>}
                                {sel && alegraItems.find(it => it.id === sel)?.esServicio && <small style={{ color: 'var(--tierra)', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={11} aria-hidden="true" /> es un ítem de solo facturación — el stock no se sincronizará.</small>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
      </Modal>

      {/* Modal agregar fichas */}
      <Modal open={modalFicha} onClose={() => setModalFicha(false)} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ClipboardList size={18} aria-hidden="true" /> Agregar fichas de producto</span>} size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={() => setModalFicha(false)}>Cerrar</button>}>
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>Fichas de producto <strong>activas</strong> que aún no están en el catálogo de terminados. Al agregarlas quedan listas para enlazar/crear en Alegra. (Las nuevas fichas se agregan solas al guardarlas.)</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Producto (ficha)</th><th className="td-number">Costo</th><th className="td-number">P. mayor</th><th></th></tr></thead>
            <tbody>
              {fichasDisponibles.length === 0
                ? <tr><td colSpan={4} className="empty-table">No hay fichas pendientes.</td></tr>
                : fichasDisponibles.map(f => (
                    <tr key={f.id}>
                      <td><strong>{f.nombre}</strong></td>
                      <td className="td-number">$ {Number(f.costo_final || 0).toLocaleString('es-CO')}</td>
                      <td className="td-number">$ {Number(f.precio_mayor || 0).toLocaleString('es-CO')}</td>
                      <td><button className="btn btn-xs btn-primary" onClick={() => prepararDesdeFicha(f)}>Configurar y agregar</button></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Modal agregar MP vendibles */}
      <Modal open={modalMp} onClose={() => setModalMp(false)} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><FlaskConical size={18} aria-hidden="true" /> Agregar materias primas vendibles</span>} size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={() => setModalMp(false)}>Cerrar</button>}>
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>MPs marcadas como <strong>vendibles</strong> en Inventario que aún no están en el catálogo. Al agregarlas se crean como producto terminado (luego puedes enlazarlas/crearlas en Alegra).</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Materia prima</th><th className="td-number">Costo</th><th className="td-number">P. venta</th><th className="td-number">Stock</th><th></th></tr></thead>
            <tbody>
              {mpsDisponibles.length === 0
                ? <tr><td colSpan={5} className="empty-table">No hay MPs vendibles pendientes.</td></tr>
                : mpsDisponibles.map(m => (
                    <tr key={m.id}>
                      <td><strong>{m.nombre}</strong></td>
                      <td className="td-number">$ {Number(m.precio || 0).toLocaleString('es-CO')}</td>
                      <td className="td-number">$ {Number(m.precio_venta || 0).toLocaleString('es-CO')}</td>
                      <td className="td-number">{fNum(m.stock)} {m.unidad}</td>
                      <td><button className="btn btn-xs btn-primary" onClick={() => prepararDesdeMp(m)}>Configurar y agregar</button></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Modal: historial global de ajustes de inventario (auditoría admin) */}
      <Modal open={modalHistAjustes} onClose={() => setModalHistAjustes(false)} guard={false} size="modal-xl"
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ScrollText size={18} aria-hidden="true" /> Historial de ajustes de inventario</span>}
        footer={<button className="btn btn-secondary" onClick={() => setModalHistAjustes(false)}>Cerrar</button>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={histSoloManuales} onChange={e => setHistSoloManuales(e.target.checked)} />
            Solo ajustes manuales
          </label>
          <small style={{ color: 'var(--texto-suave)' }}>Desmarca para ver también los movimientos automáticos (producción, ventas de Alegra). Últimos 500 movimientos.</small>
        </div>
        {(() => {
          const nombreFP = Object.fromEntries(productos.map(p => [p.id, p.nombre]))
          const lista = movimientos.filter(m => !histSoloManuales || (m.origen || '') === 'manual')
          return (
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table style={{ fontSize: '0.84rem' }}>
                <thead><tr><th>Fecha y hora</th><th>Quién</th><th>Producto</th><th>Tipo</th><th className="td-number">Cantidad</th><th>Lote</th><th>Origen</th><th>Motivo / detalle</th></tr></thead>
                <tbody>
                  {lista.length === 0
                    ? <tr><td colSpan={8} className="empty-table">{histSoloManuales ? 'Sin ajustes manuales registrados.' : 'Sin movimientos.'}</td></tr>
                    : lista.map(m => (
                      <tr key={m.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{m.created_at ? new Date(m.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : (m.fecha ? fFecha(m.fecha) : '—')}</td>
                        <td><strong>{m.creado_por || '—'}</strong></td>
                        <td>{nombreFP[m.finished_id] || '—'}</td>
                        <td><span className={`badge ${m.tipo === 'entrada' ? 'badge-verde' : m.tipo === 'salida' ? 'badge-gris' : 'badge-dorado'}`}>{m.tipo}</span></td>
                        <td className="td-number">{fNum(m.cantidad)}</td>
                        <td>{m.lote || '—'}</td>
                        <td>{m.origen || '—'}</td>
                        <td style={{ fontSize: '0.78rem' }}>{m.obs || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )
        })()}
      </Modal>

      {/* Modal: galería de imágenes del producto (para catálogos / futuras integraciones) */}
      <Modal open={!!galeriaDe} onClose={() => setGaleriaDe(null)} guard={false}
        title={`📷 Imágenes — ${galeriaDe?.nombre || ''}`}
        footer={<>
          {galeriaDe?.alegra_item_id && galeriaImgs.length > 0 && (
            <button className="btn btn-dorado" style={{ marginRight: 'auto' }} disabled={probarImgAlegra.isPending}
              title="Experimental: intenta enviar la imagen principal al ítem de Alegra por 3 métodos distintos"
              onClick={() => probarImgAlegra.mutate(galeriaDe)}>
              {probarImgAlegra.isPending ? 'Intentando...' : '⚗ Intentar enviar a Alegra'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setGaleriaDe(null)}>Cancelar</button>
          <button className="btn btn-primary" disabled={guardarGaleria.isPending || subiendoGal} onClick={() => guardarGaleria.mutate()}>{guardarGaleria.isPending ? 'Guardando...' : 'Guardar imágenes'}</button>
        </>}>
        <div className="alert alert-info" style={{ fontSize: '0.8rem' }}>
          La <strong>primera</strong> imagen es la principal. Estas imágenes quedan guardadas con el producto para catálogos y futuras integraciones con otros servicios.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {galeriaImgs.map((url, i) => (
            <div key={url + i} style={{ position: 'relative', width: 96, height: 96, borderRadius: 8, overflow: 'hidden', border: i === 0 ? '2px solid var(--dorado)' : '1px solid var(--crema-oscuro)' }}>
              <img src={url} alt={`imagen ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', top: 3, right: 3, display: 'flex', gap: 3 }}>
                {i > 0 && <button type="button" title="Hacer principal" onClick={() => setGaleriaImgs(prev => [prev[i], ...prev.filter((_, idx) => idx !== i)])} style={{ background: 'rgba(0,0,0,0.55)', color: '#ffd54f', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.78rem', padding: '1px 5px' }}>★</button>}
                <button type="button" title="Quitar" onClick={() => setGaleriaImgs(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.78rem', padding: '1px 5px' }}>✕</button>
              </div>
              {i === 0 && <span style={{ position: 'absolute', bottom: 3, left: 3, background: 'var(--dorado)', color: '#2b1c04', fontSize: '0.6rem', fontWeight: 700, borderRadius: 3, padding: '0 5px' }}>PRINCIPAL</span>}
              <div style={{ position: 'absolute', bottom: 3, right: 3, display: 'flex', gap: 2 }}>
                <button type="button" title="Mover izquierda" disabled={i === 0} onClick={() => setGaleriaImgs(prev => { const b = [...prev];[b[i - 1], b[i]] = [b[i], b[i - 1]]; return b })} style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', padding: '0 5px', opacity: i === 0 ? 0.3 : 1 }}>‹</button>
                <button type="button" title="Mover derecha" disabled={i === galeriaImgs.length - 1} onClick={() => setGaleriaImgs(prev => { const b = [...prev];[b[i + 1], b[i]] = [b[i], b[i + 1]]; return b })} style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem', padding: '0 5px', opacity: i === galeriaImgs.length - 1 ? 0.3 : 1 }}>›</button>
              </div>
            </div>
          ))}
          <label style={{ width: 96, height: 96, border: '2px dashed var(--crema-oscuro)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', background: 'var(--crema)', color: 'var(--texto-suave)' }}>
            {subiendoGal ? '…' : '＋'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setCropGal(f); e.target.value = '' }} />
          </label>
          {cropGal && <ImageCropper file={cropGal} aspect={1} salidaW={1000} salidaH={1000} onCancel={() => setCropGal(null)} onCropped={(blob) => { setCropGal(null); subirGalBlob(blob) }} />}
        </div>
      </Modal>

      {/* Modal: auditoría app ↔ Alegra + sincronización de respaldo */}
      <Modal open={modalAuditoria} onClose={() => setModalAuditoria(false)} guard={false} size="modal-lg"
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ArrowUpFromLine size={18} aria-hidden="true" /> Sincronización con Alegra</span>}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalAuditoria(false)}>Cerrar</button>
          <button className="btn btn-primary" disabled={sincronizarTodo.isPending}
            onClick={async () => { await sincronizarTodo.mutateAsync(); qc.invalidateQueries({ queryKey: ['alegra_items_stock'] }) }}>
            {sincronizarTodo.isPending ? 'Sincronizando...' : 'Sincronizar todo ahora (app → Alegra)'}
          </button>
        </>}>
        <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
          Los cambios en fichas, ajustes de stock y producción se envían a Alegra <strong>automáticamente</strong>. Esta pantalla es un
          <strong> respaldo</strong>: compara lo que tiene la app contra lo que tiene Alegra (stock, nombre y SKU) y te muestra cualquier diferencia.
        </div>
        {cargandoAlegraStock && <p style={{ fontSize: '0.86rem' }}>Consultando datos actuales de Alegra…</p>}
        {!cargandoAlegraStock && difsAlegra.length === 0 && (
          <p style={{ fontSize: '0.9rem', color: 'var(--selva)' }}><Check size={15} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> Todo coincide — la app y Alegra están sincronizadas.</p>
        )}
        {difsAlegra.length > 0 && (
          <div className="table-wrap">
            <table style={{ fontSize: '0.84rem' }}>
              <thead><tr><th>Producto</th><th>Campo</th><th>Valor en la app</th><th>Valor en Alegra</th></tr></thead>
              <tbody>
                {difsAlegra.map((d, i) => (
                  <tr key={i}>
                    <td><strong>{d.producto}</strong></td>
                    <td><span className="badge badge-dorado">{d.campo}</span></td>
                    <td style={{ color: 'var(--selva)' }}>{d.app}</td>
                    <td style={{ color: 'var(--tierra)' }}>{d.alegra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {difsAlegra.length > 0 && (
          <small style={{ display: 'block', marginTop: 8, color: 'var(--texto-suave)', fontSize: '0.76rem' }}>
            "Sincronizar todo ahora" envía los valores de la APP hacia Alegra (la app es la fuente de verdad). Si el valor correcto es el de Alegra, corrige primero el dato en la app.
          </small>
        )}
      </Modal>

      {/* Modal: resultado de "Verificar / Crear en Alegra" (evita duplicados en Alegra) */}
      <Modal open={!!verifAlegra} onClose={() => setVerifAlegra(null)} guard={false}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Plug size={18} aria-hidden="true" /> Verificación en Alegra</span>}
        footer={<button className="btn btn-secondary" onClick={() => setVerifAlegra(null)}>Cerrar</button>}>
        {verifAlegra?.buscando && <p style={{ fontSize: '0.88rem' }}>Buscando "{verifAlegra.p.nombre}" en Alegra…</p>}
        {verifAlegra && !verifAlegra.buscando && verifAlegra.match && (
          <div>
            <p style={{ fontSize: '0.88rem' }}>Ya existe en Alegra: <strong>{verifAlegra.match.name}</strong>{verifAlegra.match.reference ? ` (ref: ${verifAlegra.match.reference})` : ''}.</p>
            <p style={{ fontSize: '0.88rem' }}>¿Enlazar <strong>"{verifAlegra.p.nombre}"</strong> con este ítem?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setVerifAlegra(null)}>No es este</button>
              <button className="btn btn-primary btn-sm" disabled={enlazarDesdeVerificacion.isPending} onClick={() => enlazarDesdeVerificacion.mutate(verifAlegra)}>{enlazarDesdeVerificacion.isPending ? 'Enlazando...' : 'Enlazar'}</button>
            </div>
          </div>
        )}
        {verifAlegra && !verifAlegra.buscando && !verifAlegra.match && (
          <div>
            <p style={{ fontSize: '0.88rem' }}>No se encontró ningún ítem con este nombre/SKU en Alegra.</p>
            <p style={{ fontSize: '0.88rem' }}>¿Crear <strong>"{verifAlegra.p.nombre}"</strong> en Alegra como producto inventariable nuevo?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setVerifAlegra(null)}>Cancelar</button>
              <button className="btn btn-dorado btn-sm" disabled={crearEnAlegra.isPending} onClick={() => { crearEnAlegra.mutate(verifAlegra.p); setVerifAlegra(null) }}>{crearEnAlegra.isPending ? 'Creando...' : 'Crear en Alegra'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal generar surtidos */}
      <Modal open={modalGen} onClose={() => setModalGen(false)} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Shuffle size={18} aria-hidden="true" /> Generar surtidos (combinaciones de sabores)</span>} size="modal-lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalGen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => generarSurtidos.mutate()} disabled={generarSurtidos.isPending || !previewGen.length}>{generarSurtidos.isPending ? 'Aplicando...' : `Aplicar (${previewGen.length})`}</button>
        </>}>
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>Elige los productos base (dulces) a combinar. Se crean todas las parejas con el <strong>costo y precios promedio</strong> de los dos sabores. Las que ya existen se <strong>actualizan</strong> con esos valores.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button className="btn btn-xs btn-secondary" onClick={() => setSelGen(baseProds.map(p => p.id))}>Todos</button>
          <button className="btn btn-xs btn-secondary" onClick={() => setSelGen([])}>Ninguno</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', maxHeight: 160, overflowY: 'auto', border: '1px solid var(--crema-oscuro)', borderRadius: 6, padding: 8, marginBottom: 10 }}>
          {baseProds.length === 0
            ? <span style={{ color: 'var(--texto-suave)', fontSize: '0.82rem' }}>No hay productos base.</span>
            : baseProds.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={selGen.includes(p.id)} onChange={() => setSelGen(s => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])} />
                  {p.nombre}
                </label>
              ))}
        </div>
        <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
          <table>
            <thead><tr><th>Surtido ({previewGen.length})</th><th className="td-number">Costo</th><th className="td-number">P. mayor</th><th className="td-number">P. detal</th><th></th></tr></thead>
            <tbody>
              {previewGen.length === 0
                ? <tr><td colSpan={5} className="empty-table">Selecciona 2+ productos para ver las combinaciones.</td></tr>
                : previewGen.map((c, i) => <tr key={i}>
                    <td style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Shuffle size={12} aria-hidden="true" /> {c.nombre}</td>
                    <td className="td-number">$ {Number(c.costo).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="td-number">$ {Number(c.precio_mayor).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="td-number">$ {Number(c.precio_detal).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>{c.existeId ? <span className="badge badge-dorado" style={{ fontSize: '0.6rem' }}>actualizar</span> : <span className="badge badge-verde" style={{ fontSize: '0.6rem' }}>nuevo</span>}</td>
                  </tr>)}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Modal kardex */}
      <Modal open={!!kardexDe} onClose={() => setKardexDe(null)} title={`Kardex — ${kardexDe?.nombre || ''}`} size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={() => setKardexDe(null)}>Cerrar</button>}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th className="td-number">Cantidad</th><th>Lote</th><th>Origen</th><th>Detalle</th>{esAdmin && <th>Quién</th>}</tr></thead>
            <tbody>
              {kardex.length === 0
                ? <tr><td colSpan={esAdmin ? 7 : 6} className="empty-table">Sin movimientos.</td></tr>
                : kardex.map(m => (
                    <tr key={m.id}>
                      <td>{m.created_at ? new Date(m.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : (m.fecha ? fFecha(m.fecha) : '—')}</td>
                      <td><span className={`badge ${m.tipo === 'entrada' ? 'badge-verde' : m.tipo === 'salida' ? 'badge-gris' : 'badge-dorado'}`}>{m.tipo}</span></td>
                      <td className="td-number">{fNum(m.cantidad)}</td>
                      <td>{m.lote || '—'}</td>
                      <td>{m.origen || '—'}</td>
                      <td style={{ fontSize: '0.78rem' }}>{m.obs || '—'}</td>
                      {esAdmin && <td style={{ fontSize: '0.78rem' }}>{m.creado_por || '—'}</td>}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  )
}

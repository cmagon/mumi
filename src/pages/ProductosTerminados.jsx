import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fNum, fFecha, componerSurtido } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'
import MoneyInput from '../components/ui/MoneyInput'
import { UNIDADES_ALEGRA, UNSPSC_ALIMENTOS } from '../lib/alegraCatalogos'

const EMPTY_PROD = { nombre: '', sku: '', alegra_item_id: '', tipo: 'base', stock_min: '', costo_unitario: '', precio_mayor: '', precio_detal: '', imagen_url: '', activo: true, unidad_medida: 'unit', codigo_unspsc: '', categoria_alegra_id: '', categoria_alegra_nombre: '', surtido_a: '', surtido_b: '' }
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
  const [pEditId, setPEditId] = useState(null)
  const [modalAjuste, setModalAjuste] = useState(null)   // producto al que se ajusta
  const [aForm, setAForm] = useState(EMPTY_AJUSTE)
  const [kardexDe, setKardexDe] = useState(null)
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

  const { data: productos = [] } = useQuery({
    queryKey: ['finished_products'],
    queryFn: async () => { const { data } = await supabase.from('finished_products').select('*').order('nombre'); return data || [] },
  })
  const { data: movimientos = [] } = useQuery({
    queryKey: ['finished_movements'],
    queryFn: async () => { const { data } = await supabase.from('finished_movements').select('*').order('created_at', { ascending: false }).limit(500); return data || [] },
  })
  // Categorías de Alegra (para asignarlas a los productos)
  const { data: alegraCategorias = [] } = useQuery({
    queryKey: ['alegra_categories'],
    queryFn: async () => { const { data } = await supabase.functions.invoke('alegra-categories', { body: {} }); return data?.items || [] },
    enabled: esAdmin, retry: false, staleTime: 5 * 60 * 1000,
  })
  // Fichas de producto: el costo del surtido se promedia desde el costo de la FICHA (no del catálogo)
  const { data: fichas = [] } = useQuery({
    queryKey: ['fichas_costo_terminado'],
    queryFn: async () => { const { data } = await supabase.from('products_costing').select('id, nombre, tipo, costo_final, precio_mayor, precio_detal, activo, imagen_url').order('nombre'); return data || [] },
  })
  // Materias primas marcadas como vendibles (para crearlas como producto terminado)
  const { data: mpsVendibles = [] } = useQuery({
    queryKey: ['mps_vendibles'],
    queryFn: async () => { const { data } = await supabase.from('raw_materials').select('id, nombre, precio, precio_venta, stock, unidad').eq('vendible', true).order('nombre'); return data || [] },
  })
  const [modalMp, setModalMp] = useState(false)
  const [modalFicha, setModalFicha] = useState(false)
  const mpsDisponibles = mpsVendibles.filter(m => !productos.some(p => p.mp_id === m.id || (p.nombre || '').toLowerCase() === (m.nombre || '').toLowerCase()))
  // Fichas ACTIVAS (vendibles) que aún no están en el catálogo de terminados
  const fichasDisponibles = fichas.filter(f => (f.tipo || '') !== 'subproducto' && f.activo !== false &&
    !productos.some(p => p.product_id === f.id || (p.nombre || '').toLowerCase() === (f.nombre || '').toLowerCase()))
  const crearDesdeFicha = useMutation({
    mutationFn: async (f) => {
      const { error } = await supabase.from('finished_products').insert({
        nombre: f.nombre, tipo: 'base', product_id: f.id,
        costo_unitario: Math.round(Number(f.costo_final) || 0),
        precio_mayor: Math.round(Number(f.precio_mayor) || 0), precio_detal: Math.round(Number(f.precio_detal) || 0),
        imagen_url: f.imagen_url || null, stock: 0, activo: true,
      })
      if (error) throw error
      return f.nombre
    },
    onSuccess: (nombre) => { qc.invalidateQueries({ queryKey: ['finished_products'] }); toast(`"${nombre}" agregado como producto terminado ✓`) },
    onError: (e) => toast(e.message, 'error'),
  })
  const crearDesdeMp = useMutation({
    mutationFn: async (m) => {
      const { error } = await supabase.from('finished_products').insert({
        nombre: m.nombre, tipo: 'mp', mp_id: m.id,
        costo_unitario: Math.round(Number(m.precio) || 0), precio_mayor: Math.round(Number(m.precio_venta) || 0),
        stock: Number(m.stock) || 0, activo: true,
      })
      if (error) throw error
      return m.nombre
    },
    onSuccess: (nombre) => { qc.invalidateQueries({ queryKey: ['finished_products'] }); toast(`"${nombre}" agregado como producto terminado ✓`) },
    onError: (e) => toast(e.message, 'error'),
  })

  const costoFicha = (p) => {
    const f = fichas.find(x => x.id === p.product_id) || fichas.find(x => x.nombre === p.nombre)
    return Number(f?.costo_final) || 0
  }

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return productos.filter(p => !q || (p.nombre || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
  }, [productos, buscar])

  const [subiendoImg, setSubiendoImg] = useState(false)
  const subirImagen = async (file) => {
    if (!file) return
    setSubiendoImg(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `terminados/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
      const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      setPForm(f => ({ ...f, imagen_url: data.publicUrl }))
      toast('Imagen cargada ✓')
    } catch (e) { toast('No se pudo subir la imagen: ' + e.message, 'error') }
    finally { setSubiendoImg(false) }
  }

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
      if (!pForm.nombre.trim()) throw new Error('Indica el nombre del producto terminado')
      const payload = { nombre: pForm.nombre.trim(), sku: pForm.sku || null, alegra_item_id: pForm.alegra_item_id || null, tipo: pForm.tipo, stock_min: parseFloat(pForm.stock_min) || 0, costo_unitario: parseFloat(pForm.costo_unitario) || 0, precio_mayor: parseFloat(pForm.precio_mayor) || 0, precio_detal: parseFloat(pForm.precio_detal) || 0, imagen_url: pForm.imagen_url || null, activo: pForm.activo, unidad_medida: pForm.unidad_medida || 'unit', codigo_unspsc: pForm.codigo_unspsc || null, categoria_alegra_id: pForm.categoria_alegra_id || null, categoria_alegra_nombre: pForm.categoria_alegra_nombre || null, surtido_a: pForm.surtido_a ? Number(pForm.surtido_a) : null, surtido_b: pForm.surtido_b ? Number(pForm.surtido_b) : null }
      if (pEditId) { const { error } = await supabase.from('finished_products').update(payload).eq('id', pEditId); if (error) throw error }
      else { const { error } = await supabase.from('finished_products').insert(payload); if (error) throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finished_products'] }); setModalProd(false); setPForm(EMPTY_PROD); setPEditId(null); toast('Producto terminado guardado ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

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
    onSuccess: (nombre) => { qc.invalidateQueries({ queryKey: ['finished_products'] }); toast(`"${nombre}" creado en Alegra como inventariable ✓`) },
    onError: (e) => toast('Crear en Alegra: ' + e.message, 'error'),
  })

  const desenlazar = useMutation({
    mutationFn: async (p) => { const { error } = await supabase.from('finished_products').update({ alegra_item_id: null }).eq('id', p.id); if (error) throw error; return p.nombre },
    onSuccess: (nombre) => { qc.invalidateQueries({ queryKey: ['finished_products'] }); toast(`"${nombre}" desenlazado de Alegra ✓`) },
    onError: (e) => toast(e.message, 'error'),
  })

  const enviarImagen = useMutation({
    mutationFn: async (p) => {
      if (!p.alegra_item_id) throw new Error('Enlázalo primero con un ítem de Alegra')
      const { data, error } = await supabase.functions.invoke('alegra-push-image', { body: { finished_id: p.id } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.ok) throw new Error('Alegra respondió ' + (data?.status || '') + ': ' + (data?.alegra || '').slice(0, 200))
      return p.nombre
    },
    onSuccess: (nombre) => toast(`Imagen enviada a Alegra para "${nombre}" ✓`),
    onError: (e) => toast('Imagen: ' + e.message, 'error'),
  })

  const sincronizarUno = useMutation({
    mutationFn: async (p) => {
      if (!p.alegra_item_id) throw new Error('Asigna primero el ID del ítem en Alegra')
      const { data, error } = await supabase.functions.invoke('alegra-push-stock', { body: { finished_id: p.id } })
      if (error) throw error
      const r = (data?.resultados || [])[0]
      if (r && r.estado === 'error') throw new Error(r.detalle || 'Error en Alegra')
      return p.nombre
    },
    onSuccess: (nombre) => toast(`"${nombre}" sincronizado con Alegra ✓`),
    onError: (e) => toast('No se pudo sincronizar: ' + e.message, 'error'),
  })

  // Actualiza el costo unitario de los terminados BASE desde el costo de su ficha
  const actualizarCostos = useMutation({
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
    mutationFn: async () => { const { data, error } = await supabase.functions.invoke('alegra-push-stock', { body: { all: true } }); if (error) throw error; return data },
    onSuccess: (data) => { const ok = (data?.resultados || []).filter(r => r.estado === 'ok').length; toast(`Stock sincronizado con Alegra: ${ok} producto(s) ✓`) },
    onError: (e) => toast('No se pudo sincronizar: ' + e.message, 'error'),
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
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={abrirConfig}>⚙ Configurar Alegra</button>}
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={abrirEnlace}>🔌 Enlazar con Alegra</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => actualizarCostos.mutate()} disabled={actualizarCostos.isPending}>{actualizarCostos.isPending ? 'Actualizando...' : '💲 Actualizar costos desde fichas'}</button>
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={() => sincronizarTodo.mutate()} disabled={sincronizarTodo.isPending}>{sincronizarTodo.isPending ? 'Sincronizando...' : '🔗 Sincronizar todo con Alegra'}</button>}
          {fichasDisponibles.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setModalFicha(true)}>📋 Agregar ficha ({fichasDisponibles.length})</button>}
          {mpsDisponibles.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setModalMp(true)}>🧪 Agregar MP vendible ({mpsDisponibles.length})</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => { setSelGen(baseProds.map(p => p.id)); setModalGen(true) }}>🔀 Generar surtidos</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setPForm(EMPTY_PROD); setPEditId(null); setModalProd(true) }}>+ Nuevo producto</button>
        </div>
      </div>

      <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
        Catálogo y stock de productos vendibles (base y surtidos). El stock sube al aprobar producción y baja al facturar en Alegra. Aquí puedes <strong>ajustar el stock manualmente</strong> (se sincroniza con Alegra) y <strong>editar los nombres</strong> que luego se eligen al empacar surtidos.
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          🏷️ Stock de productos terminados
          <input className="form-control" style={{ marginLeft: 'auto', maxWidth: 240 }} placeholder="Buscar nombre o SKU..." value={buscar} onChange={e => setBuscar(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th>Tipo</th><th>SKU</th><th>Alegra</th><th className="td-number">Stock</th><th className="td-number">Costo unit.</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {filtrados.length === 0
                ? <tr><td colSpan={8} className="empty-table">Sin productos terminados.</td></tr>
                : filtrados.map(p => {
                    const bajo = (p.stock_min || 0) > 0 && Number(p.stock || 0) <= Number(p.stock_min || 0)
                    return (
                      <tr key={p.id} style={p.activo === false ? { opacity: 0.55 } : undefined}>
                        <td><strong>{p.nombre}</strong></td>
                        <td><span className={`badge ${p.tipo === 'surtido' ? 'badge-dorado' : p.tipo === 'mp' ? 'badge-gris' : 'badge-azul'}`}>{p.tipo === 'surtido' ? '🔀 Surtido' : p.tipo === 'mp' ? '🧪 MP' : 'Base'}</span></td>
                        <td>{p.sku || '—'}</td>
                        <td>{p.alegra_item_id ? '✓' : '—'}</td>
                        <td className="td-number"><strong style={{ color: bajo ? 'var(--rojo)' : undefined }}>{fNum(p.stock)}</strong>{bajo && <div style={{ fontSize: '0.65rem', color: 'var(--rojo)' }}>⚠ bajo</div>}</td>
                        {(() => {
                          const costoMostrar = p.tipo === 'base' ? (Number(p.costo_unitario) || costoFicha(p)) : (Number(p.costo_unitario) || 0)
                          const desync = p.tipo === 'base' && costoFicha(p) > 0 && Math.round(costoFicha(p)) !== Math.round(Number(p.costo_unitario) || 0)
                          return (
                            <td className="td-number">$ {costoMostrar.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {p.tipo === 'base' && <div style={{ fontSize: '0.62rem', color: desync ? 'var(--tierra)' : 'var(--texto-suave)' }}>{desync ? '⚠ ficha (sin guardar)' : 'desde ficha'}</div>}
                            </td>
                          )
                        })()}
                        <td>{p.activo === false ? <span className="badge badge-gris">Inactivo</span> : <span className="badge badge-verde">Activo</span>}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button className="btn btn-xs btn-primary" onClick={() => { setModalAjuste(p); setAForm(EMPTY_AJUSTE) }}>⚖ Ajustar</button>
                            <button className="btn btn-xs btn-secondary" onClick={() => setKardexDe(p)}>📜 Kardex</button>
                            {!p.alegra_item_id && esAdmin && <button className="btn btn-xs btn-dorado" title="Crear este producto en Alegra (inventariable, con todos sus datos)" disabled={crearEnAlegra.isPending} onClick={() => confirmar(`¿Crear "${p.nombre}" en Alegra como producto inventariable?\n\nSolo hazlo si NO existe ya en Alegra (para no duplicar).`).then(ok => ok && crearEnAlegra.mutate(p))}>➕ Crear en Alegra</button>}
                            <button className="btn btn-xs btn-secondary" title={p.alegra_item_id ? 'Sincronizar stock y costo con Alegra' : 'Falta el ID del ítem en Alegra'} disabled={!p.alegra_item_id || sincronizarUno.isPending} onClick={() => sincronizarUno.mutate(p)}>🔗 Sincronizar</button>
                            {p.alegra_item_id && esAdmin && <button className="btn btn-xs btn-secondary" title="Quitar el enlace con Alegra (para re-enlazar o crear de nuevo)" disabled={desenlazar.isPending} onClick={() => confirmar(`¿Desenlazar "${p.nombre}" de Alegra?\nNo borra nada en Alegra; solo quita el enlace en la app.`).then(ok => ok && desenlazar.mutate(p))}>🔌✕ Desenlazar</button>}
                            <button className="btn btn-xs btn-secondary" onClick={() => { setPForm({ nombre: p.nombre, sku: p.sku || '', alegra_item_id: p.alegra_item_id || '', tipo: p.tipo || 'base', stock_min: p.stock_min || '', costo_unitario: p.costo_unitario || '', precio_mayor: p.precio_mayor || '', precio_detal: p.precio_detal || '', imagen_url: p.imagen_url || '', activo: p.activo !== false, unidad_medida: p.unidad_medida || 'unit', codigo_unspsc: p.codigo_unspsc || '', categoria_alegra_id: p.categoria_alegra_id || '', categoria_alegra_nombre: p.categoria_alegra_nombre || '', surtido_a: p.surtido_a || '', surtido_b: p.surtido_b || '' }); setPEditId(p.id); setModalProd(true) }}>✏</button>
                            {esAdmin && (p.alegra_item_id
                              ? <button className="btn btn-xs btn-danger" disabled title="Está enlazado a Alegra. Desenlázalo primero para poder eliminarlo." style={{ opacity: 0.5 }}>✕</button>
                              : <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Quitar "${p.nombre}" SOLO del catálogo de Producto Terminado?\n\nEsto NO elimina la ficha de producto ni su costo. Podrás recrearlo desde la ficha cuando quieras.`).then(ok => ok && delProd.mutate(p.id))}>✕</button>)}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear/editar producto terminado */}
      <Modal open={modalProd} onClose={() => setModalProd(false)} title={pEditId ? 'Editar producto terminado' : 'Nuevo producto terminado'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalProd(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => saveProd.mutate()} disabled={saveProd.isPending}>Guardar</button>
        </>}>
        <div className="form-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Nombre</label><input className="form-control" value={pForm.nombre} onChange={e => setPForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Bocadillo Mumi Surt. Seje - Araza" /></div>
          <div className="form-group"><label className="form-label">Tipo</label><select className="form-control" value={pForm.tipo} onChange={e => setPForm(f => ({ ...f, tipo: e.target.value }))}><option value="base">Base</option><option value="surtido">Surtido</option></select></div>
          <div className="form-group"><label className="form-label">SKU / Referencia (Alegra)</label><input className="form-control" value={pForm.sku} onChange={e => setPForm(f => ({ ...f, sku: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">ID ítem en Alegra</label><input className="form-control" value={pForm.alegra_item_id} onChange={e => setPForm(f => ({ ...f, alegra_item_id: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Stock mínimo (alerta)</label><input type="number" className="form-control" value={pForm.stock_min} onChange={e => setPForm(f => ({ ...f, stock_min: e.target.value }))} min={0} /></div>
          {pForm.tipo === 'surtido' && (
            <div className="form-group" style={{ gridColumn: '1 / -1', background: 'rgba(124,179,66,0.07)', borderRadius: 6, padding: 10 }}>
              <label className="form-label">Sabores combinados <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(definen costo y precios = promedio de las dos fichas)</small></label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select className="form-control" style={{ maxWidth: 220 }} value={pForm.surtido_a} onChange={e => setSaborSurtido('surtido_a', e.target.value)}>
                  <option value="">Sabor 1...</option>
                  {fichas.filter(f => (f.tipo || '') !== 'subproducto').map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select>
                <select className="form-control" style={{ maxWidth: 220 }} value={pForm.surtido_b} onChange={e => setSaborSurtido('surtido_b', e.target.value)}>
                  <option value="">Sabor 2...</option>
                  {fichas.filter(f => (f.tipo || '') !== 'subproducto').map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select>
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
            <select className="form-control" value={pForm.unidad_medida} onChange={e => setPForm(f => ({ ...f, unidad_medida: e.target.value }))}>
              {UNIDADES_ALEGRA.map(u => <option key={u.v} value={u.v}>{u.l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Categoría (Alegra)</label>
            <select className="form-control" value={pForm.categoria_alegra_id} onChange={e => { const id = e.target.value; const c = alegraCategorias.find(x => x.id === id); setPForm(f => ({ ...f, categoria_alegra_id: id, categoria_alegra_nombre: c?.name || '' })) }}>
              <option value="">— Sin categoría —</option>
              {alegraCategorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {alegraCategorias.length === 0 && <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Configura Alegra para cargar las categorías (Dulces, Galletas, Infusiones...).</small>}
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Código del producto/servicio (UNSPSC — Colombia Compra Eficiente)</label>
            <input className="form-control" list="dl-unspsc" value={pForm.codigo_unspsc} onChange={e => setPForm(f => ({ ...f, codigo_unspsc: e.target.value }))} placeholder="Elige o escribe el código (ej: 50181900)" />
            <datalist id="dl-unspsc">{UNSPSC_ALIMENTOS.map(u => <option key={u.codigo} value={u.codigo}>{u.codigo} — {u.desc}</option>)}</datalist>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>{(UNSPSC_ALIMENTOS.find(u => u.codigo === pForm.codigo_unspsc)?.desc) || 'Selecciona del catálogo o escribe tu código.'}</small>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Imagen del producto</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {pForm.imagen_url
                ? <img src={pForm.imagen_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
                : <div style={{ width: 56, height: 56, borderRadius: 6, background: 'var(--crema)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--texto-suave)' }}>🖼</div>}
              <input type="file" accept="image/*" onChange={e => subirImagen(e.target.files?.[0])} disabled={subiendoImg} />
              {pForm.imagen_url && <button type="button" className="btn btn-xs btn-secondary" onClick={() => setPForm(f => ({ ...f, imagen_url: '' }))}>Quitar</button>}
            </div>
            {subiendoImg && <small style={{ color: 'var(--texto-suave)' }}>Subiendo…</small>}
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
              <div className="form-group"><label className="form-label">Tipo de ajuste</label><select className="form-control" value={aForm.tipo} onChange={e => setAForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="entrada">Entrada (+)</option>
                <option value="salida">Salida (−)</option>
                <option value="ajuste">Ajuste (fijar valor)</option>
              </select></div>
              <div className="form-group"><label className="form-label">{aForm.tipo === 'ajuste' ? 'Nuevo stock' : 'Cantidad'}</label><input type="number" className="form-control" value={aForm.cantidad} onChange={e => setAForm(f => ({ ...f, cantidad: e.target.value }))} min={0} /></div>
              <div className="form-group"><label className="form-label">Lote (opcional)</label><input className="form-control" value={aForm.lote} onChange={e => setAForm(f => ({ ...f, lote: e.target.value }))} /></div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Motivo</label><input className="form-control" value={aForm.motivo} onChange={e => setAForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ej: conteo físico, merma, devolución..." /></div>
            </div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>El ajuste actualiza el stock, queda en el kardex y se empuja a Alegra.</small>
          </div>
        )}
      </Modal>

      {/* Modal configurar credenciales de Alegra */}
      <Modal open={modalConfig} onClose={() => setModalConfig(false)} title="⚙ Configurar conexión con Alegra"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalConfig(false)}>Cerrar</button>
          <button className="btn btn-secondary" onClick={probarConexion} disabled={probando || !cfgForm.email || !cfgForm.token}>{probando ? 'Probando...' : '🔌 Probar conexión'}</button>
          <button className="btn btn-primary" onClick={() => guardarConfig.mutate()} disabled={guardarConfig.isPending}>Guardar</button>
        </>}>
        <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>Ingresa los datos de tu cuenta de Alegra. El <strong>token de API</strong> lo encuentras en Alegra → <strong>Configuración → API / Integraciones</strong>. Se guardan de forma segura y solo los administradores los ven.</div>
        <div className="form-group"><label className="form-label">Correo de Alegra</label><input className="form-control" value={cfgForm.email} onChange={e => setCfgForm(f => ({ ...f, email: e.target.value }))} placeholder="tu-correo@dominio.com" /></div>
        <div className="form-group"><label className="form-label">Token de API</label><input className="form-control" type="password" value={cfgForm.token} onChange={e => setCfgForm(f => ({ ...f, token: e.target.value }))} placeholder="Pega aquí el token de Alegra" /></div>
        {pruebaMsg && <div className="alert" style={{ fontSize: '0.85rem', color: pruebaMsg.ok ? 'var(--selva)' : 'var(--rojo)', background: pruebaMsg.ok ? 'rgba(124,179,66,0.10)' : 'rgba(192,57,43,0.08)' }}>{pruebaMsg.txt}</div>}

        <div style={{ borderTop: '1px solid var(--crema-oscuro)', marginTop: 12, paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: '0.88rem', color: 'var(--selva)' }}>Listas de precios</strong>
            <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={cargarListas} disabled={cargandoListas || !cfgForm.email || !cfgForm.token}>{cargandoListas ? 'Cargando...' : '🔄 Cargar listas de Alegra'}</button>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginTop: 0 }}>Indica qué lista de Alegra recibe el precio <strong>mayor</strong> y cuál el <strong>detal/distribuidores</strong>. Se enviarán desde la ficha.</p>
          {listasPrecios && (
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Lista "por mayor"</label>
                <select className="form-control" value={cfgForm.price_list_mayor} onChange={e => setCfgForm(f => ({ ...f, price_list_mayor: e.target.value }))}>
                  <option value="">— Sin asignar —</option>
                  {listasPrecios.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Lista "detal / distribuidores"</label>
                <select className="form-control" value={cfgForm.price_list_detal} onChange={e => setCfgForm(f => ({ ...f, price_list_detal: e.target.value }))}>
                  <option value="">— Sin asignar —</option>
                  {listasPrecios.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
        <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Tras guardar, usa "🔌 Enlazar con Alegra" para mapear cada producto.</small>
      </Modal>

      {/* Modal enlazar con Alegra */}
      <Modal open={modalEnlace} onClose={() => setModalEnlace(false)} title="🔌 Enlazar productos con Alegra" size="modal-xl"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalEnlace(false)}>Cerrar</button>
          <button className="btn btn-secondary" onClick={escanearAlegra} disabled={cargandoAlegra}>{cargandoAlegra ? 'Escaneando...' : '🔄 Volver a escanear'}</button>
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
                              <td><strong>{p.nombre}</strong> {p.tipo === 'surtido' && <span className="badge badge-dorado" style={{ fontSize: '0.6rem' }}>🔀</span>}</td>
                              <td>{p.sku || '—'}</td>
                              <td>
                                <select className="form-control" value={sel} onChange={e => setEnlaces(m => ({ ...m, [p.id]: e.target.value }))} style={{ borderColor: yaUsado(sel) ? 'var(--rojo)' : undefined }}>
                                  <option value="">— Sin enlazar —</option>
                                  {alegraItems.filter(it => it.id === sel || !(ocultarFact && it.esServicio)).map(it => <option key={it.id} value={it.id}>{it.esServicio ? '🧾 ' : '📦 '}{it.name}{it.reference ? ` · ${it.reference}` : ''}{it.esServicio ? ' · solo facturación' : ` · stock ${it.available ?? 0}`}</option>)}
                                </select>
                                {yaUsado(sel) && <small style={{ color: 'var(--rojo)', fontSize: '0.68rem' }}>⚠ ese ítem ya está asignado a otro producto</small>}
                                {sel && alegraItems.find(it => it.id === sel)?.esServicio && <small style={{ color: 'var(--tierra)', fontSize: '0.68rem' }}>⚠ es un ítem de solo facturación — el stock no se sincronizará.</small>}
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
      <Modal open={modalFicha} onClose={() => setModalFicha(false)} title="📋 Agregar fichas de producto" size="modal-lg"
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
                      <td><button className="btn btn-xs btn-primary" disabled={crearDesdeFicha.isPending} onClick={() => crearDesdeFicha.mutate(f)}>+ Agregar</button></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Modal agregar MP vendibles */}
      <Modal open={modalMp} onClose={() => setModalMp(false)} title="🧪 Agregar materias primas vendibles" size="modal-lg"
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
                      <td><button className="btn btn-xs btn-primary" disabled={crearDesdeMp.isPending} onClick={() => crearDesdeMp.mutate(m)}>+ Agregar</button></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Modal generar surtidos */}
      <Modal open={modalGen} onClose={() => setModalGen(false)} title="🔀 Generar surtidos (combinaciones de sabores)" size="modal-lg"
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
                    <td>🔀 {c.nombre}</td>
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
            <thead><tr><th>Fecha</th><th>Tipo</th><th className="td-number">Cantidad</th><th>Lote</th><th>Origen</th><th>Detalle</th></tr></thead>
            <tbody>
              {kardex.length === 0
                ? <tr><td colSpan={6} className="empty-table">Sin movimientos.</td></tr>
                : kardex.map(m => (
                    <tr key={m.id}>
                      <td>{m.fecha ? fFecha(m.fecha) : (m.created_at ? fFecha(m.created_at.slice(0, 10)) : '—')}</td>
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
      </Modal>
    </div>
  )
}

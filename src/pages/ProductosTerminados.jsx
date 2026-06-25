import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fNum, fFecha, componerSurtido } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'

const EMPTY_PROD = { nombre: '', sku: '', alegra_item_id: '', tipo: 'base', stock_min: '', costo_unitario: '', precio_mayor: '', imagen_url: '', activo: true }
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
  const [modalConfig, setModalConfig] = useState(false)  // configurar credenciales Alegra
  const [cfgForm, setCfgForm] = useState({ email: '', token: '' })
  const [probando, setProbando] = useState(false)
  const [pruebaMsg, setPruebaMsg] = useState(null)

  const { data: productos = [] } = useQuery({
    queryKey: ['finished_products'],
    queryFn: async () => { const { data } = await supabase.from('finished_products').select('*').order('nombre'); return data || [] },
  })
  const { data: movimientos = [] } = useQuery({
    queryKey: ['finished_movements'],
    queryFn: async () => { const { data } = await supabase.from('finished_movements').select('*').order('created_at', { ascending: false }).limit(500); return data || [] },
  })
  // Fichas de producto: el costo del surtido se promedia desde el costo de la FICHA (no del catálogo)
  const { data: fichas = [] } = useQuery({
    queryKey: ['fichas_costo_terminado'],
    queryFn: async () => { const { data } = await supabase.from('products_costing').select('id, nombre, tipo, costo_final').order('nombre'); return data || [] },
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

  const pushAlegra = async (finished_id) => {
    try { await supabase.functions.invoke('alegra-push-stock', { body: { finished_id } }) } catch (e) { console.warn('No se pudo sincronizar con Alegra:', e) }
  }

  const saveProd = useMutation({
    mutationFn: async () => {
      if (!pForm.nombre.trim()) throw new Error('Indica el nombre del producto terminado')
      const payload = { nombre: pForm.nombre.trim(), sku: pForm.sku || null, alegra_item_id: pForm.alegra_item_id || null, tipo: pForm.tipo, stock_min: parseFloat(pForm.stock_min) || 0, costo_unitario: parseFloat(pForm.costo_unitario) || 0, precio_mayor: parseFloat(pForm.precio_mayor) || 0, imagen_url: pForm.imagen_url || null, activo: pForm.activo }
      if (pEditId) { const { error } = await supabase.from('finished_products').update(payload).eq('id', pEditId); if (error) throw error }
      else { const { error } = await supabase.from('finished_products').insert(payload); if (error) throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finished_products'] }); setModalProd(false); setPForm(EMPTY_PROD); setPEditId(null); toast('Producto terminado guardado ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  const delProd = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('finished_products').delete().eq('id', id); if (error) throw error },
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
      // Si tiene imagen (propia o de la ficha), también la envía
      if (p.imagen_url || p.product_id) { try { await supabase.functions.invoke('alegra-push-image', { body: { finished_id: p.id } }) } catch (e) { console.warn('Imagen:', e) } }
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
    const existentes = new Set(productos.map(p => (p.nombre || '').toLowerCase()))
    const out = []
    for (let i = 0; i < base.length; i++) for (let j = i + 1; j < base.length; j++) {
      const a = base[i], b = base[j]
      const nombre = componerSurtido(a.nombre, b.nombre)
      if (!nombre || existentes.has(nombre.toLowerCase())) continue
      existentes.add(nombre.toLowerCase())
      out.push({ nombre, costo: Math.round(((Number(a.costo_final) || 0) + (Number(b.costo_final) || 0)) / 2) })
    }
    return out
  }, [baseProds, selGen, productos, fichas])

  const generarSurtidos = useMutation({
    mutationFn: async () => {
      if (!previewGen.length) throw new Error('No hay combinaciones nuevas para crear')
      const rows = previewGen.map(c => ({ nombre: c.nombre, tipo: 'surtido', costo_unitario: c.costo, stock: 0, activo: true }))
      const { error } = await supabase.from('finished_products').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ['finished_products'] }); setModalGen(false); toast(`${n} surtido(s) creado(s) ✓`) },
    onError: (e) => toast(e.message, 'error'),
  })

  // ---- Configuración de credenciales de Alegra ----
  const { data: alegraCfg } = useQuery({
    queryKey: ['alegra_config'],
    queryFn: async () => { const { data } = await supabase.from('alegra_config').select('email, token').eq('id', 1).maybeSingle(); return data || {} },
    enabled: esAdmin,
  })
  const abrirConfig = () => { setCfgForm({ email: alegraCfg?.email || '', token: alegraCfg?.token || '' }); setPruebaMsg(null); setModalConfig(true) }
  const guardarConfig = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('alegra_config').upsert({ id: 1, email: cfgForm.email || null, token: cfgForm.token || null, updated_at: new Date().toISOString() }, { onConflict: 'id' })
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
    if (alegraItems) return
    setCargandoAlegra(true)
    try {
      const { data, error } = await supabase.functions.invoke('alegra-items', { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      const items = data?.items || []
      setAlegraItems(items)
      // Autosugerencia: por referencia=SKU, o por nombre igual
      // Prefiere SIEMPRE los ítems que manejan inventario (los correctos para sincronizar stock)
      const conInv = (arr) => arr.filter(it => it.inventoriable)
      const pick = (arr) => (conInv(arr)[0] || arr[0])
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
                        <td><span className={`badge ${p.tipo === 'surtido' ? 'badge-dorado' : 'badge-azul'}`}>{p.tipo === 'surtido' ? '🔀 Surtido' : 'Base'}</span></td>
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
                            <button className="btn btn-xs btn-secondary" title={p.alegra_item_id ? 'Sincronizar stock y costo con Alegra' : 'Falta el ID del ítem en Alegra'} disabled={!p.alegra_item_id || sincronizarUno.isPending} onClick={() => sincronizarUno.mutate(p)}>🔗 Sincronizar</button>
                            {p.tipo === 'base' && <button className="btn btn-xs btn-secondary" title={p.alegra_item_id ? 'Enviar la imagen de la ficha a Alegra (experimental)' : 'Falta el ID del ítem en Alegra'} disabled={!p.alegra_item_id || enviarImagen.isPending} onClick={() => enviarImagen.mutate(p)}>🖼 Imagen</button>}
                            <button className="btn btn-xs btn-secondary" onClick={() => { setPForm({ nombre: p.nombre, sku: p.sku || '', alegra_item_id: p.alegra_item_id || '', tipo: p.tipo || 'base', stock_min: p.stock_min || '', costo_unitario: p.costo_unitario || '', precio_mayor: p.precio_mayor || '', imagen_url: p.imagen_url || '', activo: p.activo !== false }); setPEditId(p.id); setModalProd(true) }}>✏</button>
                            {esAdmin && <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Quitar "${p.nombre}" SOLO del catálogo de Producto Terminado?\n\nEsto NO elimina la ficha de producto ni su costo. Podrás recrearlo desde la ficha cuando quieras.`).then(ok => ok && delProd.mutate(p.id))}>✕</button>}
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
          <div className="form-group"><label className="form-label">Precio venta mayor</label><input type="number" className="form-control" value={pForm.precio_mayor} onChange={e => setPForm(f => ({ ...f, precio_mayor: e.target.value }))} min={0} /></div>
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
            <label className="form-label">Costo unitario {pForm.tipo === 'base' ? '(desde la ficha)' : '(promedio de las fichas)'}</label>
            <div className="form-control" style={{ background: 'var(--crema)', color: 'var(--texto-suave)' }}>$ {Number(pForm.costo_unitario || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>{pForm.tipo === 'base' ? 'Se sincroniza automáticamente desde la ficha de producto.' : 'Es el promedio del costo de las dos fichas combinadas (no editable).'}</small>
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
        <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Tras guardar, usa "🔌 Enlazar con Alegra" para mapear cada producto.</small>
      </Modal>

      {/* Modal enlazar con Alegra */}
      <Modal open={modalEnlace} onClose={() => setModalEnlace(false)} title="🔌 Enlazar productos con Alegra" size="modal-xl"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalEnlace(false)}>Cerrar</button>
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
                  <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>✓ Conectado con Alegra. Mostrando solo los <strong>{alegraItems.filter(it => it.inventoriable).length}</strong> ítems con <strong>📦 inventario</strong> (los de solo facturación se ocultan). Elige el equivalente de cada producto.</div>
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
                                  {alegraItems.filter(it => it.inventoriable || it.id === sel).map(it => <option key={it.id} value={it.id}>{it.inventoriable ? '📦 ' : '🧾 '}{it.name}{it.reference ? ` · ${it.reference}` : ''}{it.inventoriable ? ` · stock ${it.available ?? 0}` : ' · solo facturación'}</option>)}
                                </select>
                                {yaUsado(sel) && <small style={{ color: 'var(--rojo)', fontSize: '0.68rem' }}>⚠ ese ítem ya está asignado a otro producto</small>}
                                {sel && !(alegraItems.find(it => it.id === sel)?.inventoriable) && <small style={{ color: 'var(--tierra)', fontSize: '0.68rem' }}>⚠ este ítem no maneja inventario — el stock no se sincronizará. Elige el de 📦 inventario.</small>}
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

      {/* Modal generar surtidos */}
      <Modal open={modalGen} onClose={() => setModalGen(false)} title="🔀 Generar surtidos (combinaciones de sabores)" size="modal-lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalGen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => generarSurtidos.mutate()} disabled={generarSurtidos.isPending || !previewGen.length}>{generarSurtidos.isPending ? 'Creando...' : `Crear ${previewGen.length} surtido(s)`}</button>
        </>}>
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>Elige los productos base (dulces) a combinar. Se crearán todas las parejas posibles con el <strong>costo promedio</strong> de los dos sabores. Las que ya existen se omiten.</p>
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
            <thead><tr><th>Surtido a crear ({previewGen.length})</th><th className="td-number">Costo promedio</th></tr></thead>
            <tbody>
              {previewGen.length === 0
                ? <tr><td colSpan={2} className="empty-table">Selecciona 2+ productos para ver las combinaciones.</td></tr>
                : previewGen.map((c, i) => <tr key={i}><td>🔀 {c.nombre}</td><td className="td-number">$ {Number(c.costo).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>)}
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

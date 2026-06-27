import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fFecha, fNum, getEstadoStock } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'
import MoneyInput from '../components/ui/MoneyInput'
import { useConfirm, usePrompt } from '../context/ConfirmContext'
import { AccordionItem, Fila } from '../components/ui/Acordeon'
import { crearLoteEntrada, consumirPEPS, consumirLote, estadoLote } from '../lib/lotes'
import * as XLSX from 'xlsx'

const EMPTY_MP = { nombre: '', categoria: 'pulpa', tipo: 'comprado', unidad: 'Kg', precio: '', stock_min: 0, stock: 0, lote: '', vencimiento: '', obs: '', extra: {}, vendible: false, precio_venta: '' }
const EMPTY_MOV = { mp_id: '', tipo: 'entrada', cantidad: '', fecha: new Date().toISOString().split('T')[0], responsable: '', obs: '', lote: '', vencimiento: '', extra: {}, costo: '', motivo: 'consumo', lote_id: '' }
// Motivos de salida/ajuste manual de inventario
const MOTIVOS_SALIDA = [
  { value: 'consumo', label: 'Consumo / uso' },
  { value: 'perdida', label: 'Pérdida / daño' },
  { value: 'vencimiento', label: 'Vencimiento' },
  { value: 'no_contabilizada', label: 'Salida no contabilizada' },
  { value: 'ajuste', label: 'Ajuste de conteo' },
]
const motivoLabel = (m) => (MOTIVOS_SALIDA.find(x => x.value === m)?.label || m)
const UNIDADES = ['Kg','Litro','Unidad']
// Sufijo corto para mostrar el precio según la unidad
const sufijoUnidad = (u) => u === 'Kg' ? '/Kg' : u === 'Litro' ? '/L' : u === 'Unidad' ? '/u' : `/${u || 'u'}`
// Cantidad de un movimiento expresada en gramos/ml (Kg→g, Litro→ml); las unidades sueltas quedan igual
const fCantMov = (cant, unidad) => {
  const v = Number(cant) || 0
  if (unidad === 'Kg') return `${fNum(v * 1000)} g`
  if (unidad === 'Litro') return `${fNum(v * 1000)} ml`
  return `${fNum(v)} ${unidad || ''}`.trim()
}
// Los empaques no requieren lote, vencimiento ni campos adicionales
const esEmpaque = (categoria) => /empaque|envase/i.test(categoria || '')

// ---- Editor de campos personalizados (objeto JSONB clave→valor) ----
function CamposExtra({ value = {}, onChange }) {
  const entries = Object.entries(value || {})
  const setEntry = (i, k, v) => {
    const next = entries.map(([ek, ev], idx) => idx === i ? [k, v] : [ek, ev])
    onChange(Object.fromEntries(next.filter(([kk]) => kk !== '')))
  }
  const addEntry = () => onChange({ ...(value || {}), [`campo_${entries.length + 1}`]: '' })
  const delEntry = (i) => onChange(Object.fromEntries(entries.filter((_, idx) => idx !== i)))
  return (
    <div className="form-group">
      <label className="form-label">Campos personalizados <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(fecha cosecha, productor, etc.)</small></label>
      {entries.map(([k, v], i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
          <input className="form-control" placeholder="Nombre del campo" value={k} onChange={e => setEntry(i, e.target.value, v)} />
          <input className="form-control" placeholder="Valor" value={v} onChange={e => setEntry(i, k, e.target.value)} />
          <button className="btn btn-xs btn-danger" onClick={() => delEntry(i)}>✕</button>
        </div>
      ))}
      <button className="btn btn-xs btn-secondary" onClick={addEntry}>+ Agregar campo</button>
    </div>
  )
}

export default function Inventario() {
  const toast = useToast()
  const confirmar = useConfirm()
  const pedir = usePrompt()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const esAdmin = profile?.rol === 'admin'
  const puedeEditarInv = profile?.rol !== 'auxiliar'   // admin y operario editan; auxiliar solo lectura

  const [modalMP, setModalMP] = useState(false)
  const [modalMov, setModalMov] = useState(false)
  const [modalCats, setModalCats] = useState(false)
  const [modalHist, setModalHist] = useState(false)
  const [histMP, setHistMP] = useState(null)
  const [formMP, setFormMP] = useState(EMPTY_MP)
  const [editMPId, setEditMPId] = useState(null)
  const [filtroCat, setFiltroCat] = useState('')
  const [formMov, setFormMov] = useState(EMPTY_MOV)

  // Si se llega desde "Convertir receta a producto" con ingredientes por registrar,
  // abre el modal de Nueva MP precargando el primero.
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const nuevas = location.state?.nuevasMP
    if (nuevas && nuevas.length && puedeEditarInv) {
      setFormMP({ ...EMPTY_MP, nombre: nuevas[0] })
      setEditMPId(null); setModalMP(true)
      if (nuevas.length > 1) toast(`Por registrar: ${nuevas.join(', ')}`, 'info')
      navigate(location.pathname, { replace: true, state: {} })   // limpia el state
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [nuevaCat, setNuevaCat] = useState('')

  const { data: mps = [] } = useQuery({
    queryKey: ['raw_materials'],
    queryFn: async () => { const { data } = await supabase.from('raw_materials').select('*').order('nombre'); return data || [] },
  })
  const { data: categoriasDB = [] } = useQuery({
    queryKey: ['mp_categories'],
    queryFn: async () => { const { data } = await supabase.from('mp_categories').select('*').order('nombre'); return data || [] },
  })
  const { data: movimientos = [] } = useQuery({
    queryKey: ['inventory_movements'],
    queryFn: async () => { const { data } = await supabase.from('inventory_movements').select('*').order('created_at', { ascending: false }).limit(200); return data || [] },
  })
  const { data: lotesDB = [] } = useQuery({
    queryKey: ['raw_material_lots'],
    queryFn: async () => { const { data } = await supabase.from('raw_material_lots').select('*').order('vencimiento', { ascending: true, nullsFirst: false }); return data || [] },
  })
  const [modalLotes, setModalLotes] = useState(false)
  const [lotesMP, setLotesMP] = useState(null)
  const lotesDe = (mpId) => lotesDB.filter(l => l.mp_id === mpId).sort((a, b) => (a.vencimiento || '9999') < (b.vencimiento || '9999') ? -1 : (a.fecha_entrada < b.fecha_entrada ? -1 : 1))
  const stockLotes = (mpId) => lotesDe(mpId).reduce((s, l) => s + (l.cantidad_actual || 0), 0)

  // Lista de nombres de categoría (tabla + las usadas por MPs por seguridad)
  const categorias = [...new Set([...categoriasDB.map(c => c.nombre), ...mps.map(m => m.categoria).filter(Boolean)])].sort()
  const usoCategoria = (nombre) => mps.filter(m => m.categoria === nombre).length

  // ---- MP CRUD ----
  const saveMP = useMutation({
    mutationFn: async (datos) => {
      const payload = {
        ...datos,
        precio: parseFloat(datos.precio) || 0,
        stock_min: parseFloat(datos.stock_min) || 0,
        stock: parseFloat(datos.stock) || 0,
        vencimiento: datos.vencimiento || null,
        extra: datos.extra || {},
        vendible: !!datos.vendible,
        precio_venta: parseFloat(datos.precio_venta) || 0,
      }
      // Asegurar que la categoría exista en la tabla (no debe bloquear el guardado de la MP)
      if (payload.categoria) { try { await supabase.from('mp_categories').upsert({ nombre: payload.categoria }, { onConflict: 'nombre' }) } catch { /* ignora si la tabla/política no está */ } }
      if (editMPId) { const { error } = await supabase.from('raw_materials').update(payload).eq('id', editMPId); if (error) throw error }
      else { const { error } = await supabase.from('raw_materials').insert(payload); if (error) throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['mp_categories'] })
      setModalMP(false); setFormMP(EMPTY_MP); setEditMPId(null); toast('Materia prima guardada ✓')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const deleteMP = useMutation({
    mutationFn: async (mp) => {
      if ((mp.stock || 0) !== 0) throw new Error(`No se puede eliminar "${mp.nombre}": tiene stock (${fNum(mp.stock)} ${mp.unidad}). Ajústalo a 0 primero.`)
      const { error } = await supabase.from('raw_materials').delete().eq('id', mp.id); if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['raw_materials'] }); toast('Materia prima eliminada') },
    onError: (e) => toast(e.message, 'error'),
  })

  // ---- Movimiento ----
  const saveMov = useMutation({
    mutationFn: async () => {
      const cantidad = parseFloat(formMov.cantidad) || 0
      if (!formMov.mp_id) throw new Error('Selecciona la materia prima')
      if (!cantidad) throw new Error('Ingresa una cantidad')
      const mpId = parseInt(formMov.mp_id)
      const mp = mps.find(m => m.id === mpId)
      const extra = { ...(formMov.extra || {}) }
      // PEPS: entrada crea lote; salida consume del lote más antiguo/próximo a vencer
      if (formMov.tipo === 'entrada' && !esEmpaque(mp?.categoria)) {
        await crearLoteEntrada({
          mp_id: mpId, lote: formMov.lote, vencimiento: formMov.vencimiento, fecha: formMov.fecha,
          cantidad, costo_unitario: formMov.costo !== '' ? parseFloat(formMov.costo) || 0 : (mp?.precio || 0),
          creado_por: profile?.nombre || '',
        })
      } else if (!esEmpaque(mp?.categoria) && (formMov.tipo === 'salida' || (formMov.tipo === 'ajuste' && cantidad < 0))) {
        // Salida (o ajuste negativo): exige motivo; descuenta del lote elegido o por PEPS
        if (!formMov.motivo) throw new Error('Indica el motivo de la salida')
        const aDescontar = formMov.tipo === 'salida' ? cantidad : Math.abs(cantidad)
        let consumidos = [], faltante = 0
        if (formMov.lote_id) {
          const r = await consumirLote({ lote_id: parseInt(formMov.lote_id), cantidad: aDescontar }); consumidos = r.consumidos; faltante = r.faltante
        } else {
          const r = await consumirPEPS({ mp_id: mpId, cantidad: aDescontar }); consumidos = r.consumidos; faltante = r.faltante
        }
        if (consumidos.length) extra.lotes_consumidos = consumidos
        if (faltante > 0) extra.faltante_sin_lote = faltante
        extra.motivo = formMov.motivo
      }
      const obsFinal = (formMov.tipo === 'salida' || (formMov.tipo === 'ajuste' && cantidad < 0))
        ? `[${motivoLabel(formMov.motivo)}] ${formMov.obs || ''}`.trim()
        : formMov.obs
      const { error: movErr } = await supabase.from('inventory_movements').insert({
        mp_id: mpId, tipo: formMov.tipo, cantidad, fecha: formMov.fecha,
        responsable: formMov.responsable, obs: obsFinal,
        lote: formMov.lote || '', vencimiento: formMov.vencimiento || null, extra,
      })
      if (movErr) throw movErr
      if (mp) {
        let newStock = mp.stock || 0
        if (formMov.tipo === 'entrada') newStock += cantidad
        else if (formMov.tipo === 'salida') newStock = newStock - cantidad   // permite negativo
        else newStock += cantidad
        // Si es entrada, también actualiza lote/venc y el COSTO del MP (último ingreso)
        const upd = { stock: newStock }
        if (formMov.tipo === 'entrada') {
          if (formMov.lote) upd.lote = formMov.lote
          if (formMov.vencimiento) upd.vencimiento = formMov.vencimiento
          // El costo ingresado actualiza el precio de la MP (por su unidad)
          if (formMov.costo !== '' && formMov.costo != null) upd.precio = parseFloat(formMov.costo) || 0
        }
        await supabase.from('raw_materials').update(upd).eq('id', mpId)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['inventory_movements'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] })
      setModalMov(false); setFormMov(EMPTY_MOV); toast('Movimiento registrado ✓')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  // ---- Categorías ----
  const addCategoria = useMutation({
    mutationFn: async (nombre) => { const { error } = await supabase.from('mp_categories').insert({ nombre: nombre.trim() }); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp_categories'] }); setNuevaCat(''); toast('Categoría creada ✓') },
    onError: (e) => toast(e.message.includes('duplicate') ? 'Esa categoría ya existe' : e.message, 'error'),
  })
  // Renombrar por nombre: actualiza la fila en mp_categories (o la crea) y cascada en todas las MPs
  const renameCategoria = useMutation({
    mutationFn: async ({ viejo, nuevo }) => {
      const n = nuevo.trim(); if (!n) throw new Error('Nombre vacío')
      if (n === viejo) return
      const row = categoriasDB.find(c => c.nombre === viejo)
      if (row) { const { error } = await supabase.from('mp_categories').update({ nombre: n }).eq('id', row.id); if (error) throw error }
      else { await supabase.from('mp_categories').upsert({ nombre: n }, { onConflict: 'nombre' }) }
      // cascada: renombrar en todas las MPs que la usaban
      await supabase.from('raw_materials').update({ categoria: n }).eq('categoria', viejo)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp_categories'] }); qc.invalidateQueries({ queryKey: ['raw_materials'] }); toast('Categoría renombrada ✓') },
    onError: (e) => toast(e.message, 'error'),
  })
  // Eliminar por nombre: solo si no tiene MPs asignadas
  const deleteCategoria = useMutation({
    mutationFn: async ({ nombre }) => {
      if (usoCategoria(nombre) > 0) throw new Error('No se puede eliminar: hay materias primas usándola')
      const row = categoriasDB.find(c => c.nombre === nombre)
      if (row) { const { error } = await supabase.from('mp_categories').delete().eq('id', row.id); if (error) throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp_categories'] }); toast('Categoría eliminada') },
    onError: (e) => toast(e.message, 'error'),
  })

  const openEditMP = (mp) => {
    setFormMP({ nombre: mp.nombre, categoria: mp.categoria, tipo: mp.tipo, unidad: mp.unidad, precio: mp.precio, stock_min: mp.stock_min, stock: mp.stock || 0, lote: mp.lote || '', vencimiento: mp.vencimiento || '', obs: mp.obs || '', extra: mp.extra || {}, vendible: !!mp.vendible, precio_venta: mp.precio_venta || '' })
    setEditMPId(mp.id); setModalMP(true)
  }
  const openMovimiento = (mpId = '', tipo = 'entrada') => {
    setFormMov({ ...EMPTY_MOV, mp_id: String(mpId), tipo, responsable: profile?.nombre || '' })
    setModalMov(true)
  }
  const openHistorial = (mp) => { setHistMP(mp); setModalHist(true) }

  const bajo = mps.filter(m => m.stock > 0 && m.stock <= m.stock_min).length
  const cero = mps.filter(m => m.stock <= 0).length
  const mpsFiltrados = mps.filter(m => !filtroCat || m.categoria === filtroCat)
  const histMovs = histMP ? movimientos.filter(mv => mv.mp_id === histMP.id) : []

  // Lote/vencimiento vigente = el de la última ENTRADA registrada (movimientos vienen ordenados desc),
  // con respaldo en el campo de la MP. Así se actualiza a medida que se dan ingresos.
  const loteVigente = (m) => {
    const ult = movimientos.find(mv => mv.mp_id === m.id && mv.tipo === 'entrada' && (mv.lote || mv.vencimiento))
    return { lote: ult?.lote || m.lote || '', vence: ult?.vencimiento || m.vencimiento || '' }
  }

  const exportarExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Materia Prima','Categoría','Unidad','Stock Actual','Stock Mínimo','Lote','Vencimiento','Estado'],
      ...mps.map(m => { const { label } = getEstadoStock(m.stock, m.stock_min); return [m.nombre, m.categoria, m.unidad, m.stock || 0, m.stock_min || 0, m.lote || '', m.vencimiento || '', label] })
    ])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    XLSX.writeFile(wb, 'Inventario_MumiAmazonia.xlsx'); toast('Excel exportado ✓')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Inventario MP</h1>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={exportarExcel}>⬇ Excel</button>
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={() => setModalCats(true)}>🏷 Categorías</button>}
          {puedeEditarInv && <button className="btn btn-secondary btn-sm" onClick={() => { setFormMP(EMPTY_MP); setEditMPId(null); setModalMP(true) }}>+ Nueva MP</button>}
          {puedeEditarInv && <button className="btn btn-primary btn-sm" onClick={() => openMovimiento()}>+ Movimiento</button>}
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="kpi-card verde"><div className="kpi-label">Total Ítems</div><div className="kpi-value">{mps.length}</div></div>
        <div className="kpi-card dorado"><div className="kpi-label">Stock Bajo ⚠</div><div className="kpi-value">{bajo}</div></div>
        <div className="kpi-card tierra"><div className="kpi-label">Sin Stock</div><div className="kpi-value">{cero}</div></div>
      </div>

      <div className="card">
        <div className="card-title">📦 Estado del Inventario</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="form-label" style={{ margin: 0 }}>Categoría:</label>
          <select className="form-control" value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {filtroCat && <button className="btn btn-sm btn-secondary" onClick={() => setFiltroCat('')}>Limpiar filtro</button>}
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--texto-suave)' }}>Clic en una fila para ver su historial</span>
        </div>

        {/* ===== Versión móvil: acordeón ===== */}
        <div className="solo-movil">
          {mpsFiltrados.length === 0
            ? <p className="empty-table">Sin materias primas en esta categoría</p>
            : mpsFiltrados.map(m => {
              const { label, badge } = getEstadoStock(m.stock || 0, m.stock_min || 0)
              const lv = loteVigente(m)
              return (
                <AccordionItem key={m.id}
                  titulo={<>{m.nombre} {m.tipo === 'interno' && <span className="badge badge-dorado" style={{ fontSize: '0.6rem' }}>interno</span>}</>}
                  sub={<><span className={`badge ${badge}`} style={{ fontSize: '0.62rem' }}>{label}</span> · {fNum(m.stock || 0)} {m.unidad}</>}
                >
                  <Fila et="Categoría">{m.categoria}</Fila>
                  <Fila et="Precio">${fNum(m.precio || 0)}{sufijoUnidad(m.unidad)}</Fila>
                  <Fila et="Stock">{fNum(m.stock || 0)} {m.unidad}</Fila>
                  <Fila et="Stock mín.">{fNum(m.stock_min || 0)}</Fila>
                  <Fila et="Lote">{lv.lote || '—'}</Fila>
                  <Fila et="Vence">{lv.vence ? fFecha(lv.vence) : '—'}</Fila>
                  <div className="acordeon-acciones">
                    {puedeEditarInv && <button className="btn btn-xs btn-primary" onClick={() => openMovimiento(m.id, 'entrada')}>+ Entrada</button>}
                    {puedeEditarInv && <button className="btn btn-xs btn-secondary" onClick={() => openMovimiento(m.id, 'salida')}>- Salida</button>}
                    <button className="btn btn-xs btn-secondary" onClick={() => openHistorial(m)}>🕑 Historial</button>
                    {puedeEditarInv && <button className="btn btn-xs btn-secondary" onClick={() => openEditMP(m)}>✏ Editar</button>}
                    {esAdmin && <button className="btn btn-xs btn-danger" disabled={(m.stock || 0) !== 0}
                      onClick={() => confirmar(`¿Eliminar la materia prima "${m.nombre}"?\nEsta acción no se puede deshacer.`).then(ok => ok && deleteMP.mutate(m))}>✕</button>}
                  </div>
                </AccordionItem>
              )
            })}
        </div>

        {/* ===== Versión desktop: tabla ===== */}
        <div className="table-wrap solo-desktop">
          <table>
            <thead><tr><th>Materia Prima</th><th className="col-opcional-2">Categoría</th><th className="col-opcional-2">Unidad</th><th>Precio</th><th>Stock</th><th className="col-opcional-2">Mín.</th><th className="col-opcional">Lote</th><th className="col-opcional">Vence</th><th className="col-opcional">Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {mpsFiltrados.length === 0
                ? <tr><td colSpan={10} className="empty-table">Sin materias primas en esta categoría</td></tr>
                : mpsFiltrados.map(m => {
                  const { label, badge } = getEstadoStock(m.stock || 0, m.stock_min || 0)
                  const lv = loteVigente(m)
                  return (
                    <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => openHistorial(m)}>
                      <td>
                        <strong>{m.nombre}</strong>
                        {m.tipo === 'interno' && <span className="badge badge-dorado" style={{ marginLeft: 6, fontSize: '0.7rem' }}>interno</span>}
                      </td>
                      <td className="col-opcional-2"><span className="badge badge-gris">{m.categoria}</span></td>
                      <td className="col-opcional-2">{m.unidad}</td>
                      <td className="td-number">${fNum(m.precio || 0)}<small style={{ color: 'var(--texto-suave)' }}>{sufijoUnidad(m.unidad)}</small></td>
                      <td className="td-number"><strong>{fNum(m.stock || 0)}</strong></td>
                      <td className="td-number col-opcional-2">{fNum(m.stock_min || 0)}</td>
                      <td className="col-opcional">{lv.lote || '—'}</td>
                      <td className="col-opcional">{lv.vence ? fFecha(lv.vence) : '—'}</td>
                      <td className="col-opcional"><span className={`badge ${badge}`}>{label}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {puedeEditarInv && <button className="btn btn-xs btn-primary" onClick={() => openMovimiento(m.id, 'entrada')}>+ Ent.</button>}
                          {puedeEditarInv && <button className="btn btn-xs btn-secondary" onClick={() => openMovimiento(m.id, 'salida')}>- Sal.</button>}
                          <button className="btn btn-xs btn-secondary" onClick={() => openHistorial(m)}>🕑</button>
                          {!esEmpaque(m.categoria) && <button className="btn btn-xs btn-secondary" title="Lotes (PEPS)" onClick={() => { setLotesMP(m); setModalLotes(true) }}>🧊</button>}
                          {puedeEditarInv && <button className="btn btn-xs btn-secondary" onClick={() => openEditMP(m)}>✏</button>}
                          {esAdmin && <button className="btn btn-xs btn-danger"
                            disabled={(m.stock || 0) !== 0}
                            title={(m.stock || 0) !== 0 ? 'Tiene stock — no se puede eliminar' : 'Eliminar'}
                            onClick={() => confirmar(`¿Eliminar la materia prima "${m.nombre}"?\nEsta acción no se puede deshacer.`).then(ok => ok && deleteMP.mutate(m))}>✕</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">📋 Últimos Movimientos</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>MP</th><th>Tipo</th><th>Cantidad</th><th>Lote</th><th>Responsable</th><th>Observación</th></tr></thead>
            <tbody>
              {movimientos.length === 0
                ? <tr><td colSpan={7} className="empty-table">Sin movimientos</td></tr>
                : movimientos.slice(0, 30).map(mv => {
                    const mp = mps.find(m => m.id === mv.mp_id)
                    return (
                      <tr key={mv.id}>
                        <td>{fFecha(mv.fecha)}</td>
                        <td>{mp?.nombre || `MP #${mv.mp_id}`}</td>
                        <td><span className={`badge ${mv.tipo === 'entrada' ? 'badge-verde' : mv.tipo === 'salida' ? 'badge-rojo' : 'badge-gris'}`}>{mv.tipo}</span></td>
                        <td className="td-number">{fCantMov(mv.cantidad, mp?.unidad)}</td>
                        <td>{mv.lote || '—'}</td>
                        <td>{mv.responsable || '—'}</td>
                        <td>{mv.obs || '—'}</td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal MP */}
      <Modal open={modalMP} onClose={() => { setModalMP(false); setFormMP(EMPTY_MP); setEditMPId(null) }}
        title={`🌿 ${editMPId ? 'Editar' : 'Nueva'} Materia Prima`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalMP(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => { if (!formMP.nombre.trim()) { toast('Nombre requerido','warning'); return }; saveMP.mutate({ ...formMP, categoria: (formMP.categoria||'otro').trim() || 'otro' }) }} disabled={saveMP.isPending}>Guardar</button>
          </>
        }
      >
        <div className="form-group"><label className="form-label">Nombre</label><input className="form-control" value={formMP.nombre} onChange={e => setFormMP(f => ({ ...f, nombre: e.target.value }))} /></div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Categoría</label>
            <input className="form-control" list="dl-categorias" value={formMP.categoria} onChange={e => setFormMP(f => ({ ...f, categoria: e.target.value }))} placeholder="Elige o escribe una nueva" />
            <datalist id="dl-categorias">{categorias.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-control" value={formMP.tipo} onChange={e => setFormMP(f => ({ ...f, tipo: e.target.value }))}>
              <option value="comprado">Comprado</option>
              <option value="interno">Fabricado internamente</option>
            </select>
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Unidad de medida</label>
            <select className="form-control" value={formMP.unidad} onChange={e => setFormMP(f => ({ ...f, unidad: e.target.value }))}>
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Precio {formMP.unidad === 'Litro' ? 'por Litro' : formMP.unidad === 'Unidad' ? 'por Unidad' : 'por Kg'}</label>
            <MoneyInput value={formMP.precio} onChange={v => setFormMP(f => ({ ...f, precio: v }))} />
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Stock mínimo</label><input type="number" className="form-control" value={formMP.stock_min} onChange={e => setFormMP(f => ({ ...f, stock_min: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Stock actual</label><input type="number" className="form-control" value={formMP.stock} onChange={e => setFormMP(f => ({ ...f, stock: e.target.value }))} /></div>
        </div>
        <div className="form-group" style={{ background: 'rgba(124,179,66,0.07)', borderRadius: 'var(--radio)', padding: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
            <input type="checkbox" checked={!!formMP.vendible} onChange={e => setFormMP(f => ({ ...f, vendible: e.target.checked }))} /> 🏷️ Se puede vender (producto terminado)
          </label>
          {formMP.vendible && (
            <div style={{ marginTop: 8 }}>
              <label className="form-label">Precio de venta</label>
              <MoneyInput value={formMP.precio_venta} onChange={v => setFormMP(f => ({ ...f, precio_venta: v }))} />
              <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Como la fabricas tú, lo ideal es crearla como <strong>ficha de producto</strong> para configurar sus costos. Desde ahí se vuelve producto terminado y se sincroniza con Alegra.</small>
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-sm btn-dorado" disabled={!formMP.nombre.trim()} onClick={() => navigate('/costos', { state: { nuevaFichaNombre: formMP.nombre.trim(), nuevaFichaPrecio: parseFloat(formMP.precio_venta) || 0 } })}>📋 Crear ficha de producto</button>
              </div>
            </div>
          )}
        </div>
        <div className="form-grid-2">
          {!esEmpaque(formMP.categoria) && <>
            <div className="form-group"><label className="form-label">Lote</label><input className="form-control" value={formMP.lote} onChange={e => setFormMP(f => ({ ...f, lote: e.target.value }))} placeholder="Lote actual" /></div>
            <div className="form-group"><label className="form-label">Fecha de vencimiento</label><input type="date" className="form-control" value={formMP.vencimiento || ''} onChange={e => setFormMP(f => ({ ...f, vencimiento: e.target.value }))} /></div>
          </>}
        </div>
        <div className="form-group"><label className="form-label">Observaciones</label><textarea className="form-control" rows={2} value={formMP.obs} onChange={e => setFormMP(f => ({ ...f, obs: e.target.value }))} /></div>
        {!esEmpaque(formMP.categoria) && <CamposExtra value={formMP.extra} onChange={extra => setFormMP(f => ({ ...f, extra }))} />}
      </Modal>

      {/* Modal Movimiento */}
      <Modal open={modalMov} onClose={() => setModalMov(false)} title={`📦 ${formMov.tipo === 'entrada' ? 'Entrada' : formMov.tipo === 'salida' ? 'Salida' : 'Movimiento'} de Inventario`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalMov(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => saveMov.mutate()} disabled={saveMov.isPending}>Guardar</button>
          </>
        }
      >
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Materia Prima</label>
            <select className="form-control" value={formMov.mp_id} onChange={e => setFormMov(f => ({ ...f, mp_id: e.target.value }))}>
              <option value="">Seleccionar...</option>
              {mps.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-control" value={formMov.tipo} onChange={e => setFormMov(f => ({ ...f, tipo: e.target.value }))}>
              <option value="entrada">Entrada (Compra/Recepción)</option>
              <option value="salida">Salida (Uso en producción)</option>
              <option value="ajuste">Ajuste de inventario</option>
            </select>
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Cantidad {formMov.tipo === 'ajuste' && <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(+ suma / − resta)</small>}</label>
            <input type="number" className="form-control" value={formMov.cantidad} onChange={e => setFormMov(f => ({ ...f, cantidad: e.target.value }))} min={formMov.tipo === 'ajuste' ? undefined : 0} />
          </div>
          <div className="form-group"><label className="form-label">Fecha</label><input type="date" className="form-control" value={formMov.fecha} onChange={e => setFormMov(f => ({ ...f, fecha: e.target.value }))} /></div>
        </div>
        {/* Costo en entradas — actualiza el precio de la MP (y recalcula las fichas) */}
        {formMov.tipo === 'entrada' && (() => {
          const mpSel = mps.find(m => String(m.id) === String(formMov.mp_id))
          const u = mpSel?.unidad || 'Kg'
          return (
            <div className="form-group">
              <label className="form-label">Costo {u === 'Litro' ? 'por Litro' : u === 'Unidad' ? 'por Unidad' : 'por Kg'} <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>— opcional, actualiza el precio de la MP</small></label>
              <MoneyInput value={formMov.costo} onChange={v => setFormMov(f => ({ ...f, costo: v }))} placeholder={mpSel ? `Actual: $ ${fNum(mpSel.precio)}` : '$ 0'} />
            </div>
          )
        })()}
        {/* Salida/ajuste: motivo + lote a descontar (pérdida, vencimiento, salida no contabilizada…) */}
        {(formMov.tipo === 'salida' || formMov.tipo === 'ajuste') && !esEmpaque(mps.find(m => String(m.id) === String(formMov.mp_id))?.categoria) && (
          <div className="form-grid-2" style={{ background: 'rgba(192,57,43,0.05)', border: '1px solid rgba(192,57,43,0.18)', borderRadius: 'var(--radio)', padding: 10 }}>
            <div className="form-group">
              <label className="form-label">Motivo {formMov.tipo === 'salida' && <small style={{ color: 'var(--rojo)' }}>*</small>}</label>
              <select className="form-control" value={formMov.motivo} onChange={e => setFormMov(f => ({ ...f, motivo: e.target.value }))}>
                {MOTIVOS_SALIDA.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">¿De qué lote se descuenta?</label>
              <select className="form-control" value={formMov.lote_id} onChange={e => setFormMov(f => ({ ...f, lote_id: e.target.value }))}>
                <option value="">Automático (PEPS: el más antiguo/próximo a vencer)</option>
                {lotesDe(parseInt(formMov.mp_id)).map(l => (
                  <option key={l.id} value={l.id}>Lote {l.lote || '(s/n)'} · {fNum(l.cantidad_actual)} disp.{l.vencimiento ? ` · vence ${l.vencimiento}` : ''}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        {/* Lote y vencimiento — solo en entradas (crea el lote), no aplican a empaques */}
        {formMov.tipo === 'entrada' && !esEmpaque(mps.find(m => String(m.id) === String(formMov.mp_id))?.categoria) && (
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Lote</label><input className="form-control" value={formMov.lote} onChange={e => setFormMov(f => ({ ...f, lote: e.target.value }))} placeholder="N° de lote" /></div>
            <div className="form-group"><label className="form-label">Fecha de vencimiento</label><input type="date" className="form-control" value={formMov.vencimiento || ''} onChange={e => setFormMov(f => ({ ...f, vencimiento: e.target.value }))} /></div>
          </div>
        )}
        <div className="form-group"><label className="form-label">Responsable</label><input className="form-control" value={formMov.responsable} onChange={e => setFormMov(f => ({ ...f, responsable: e.target.value }))} placeholder="Nombre del responsable" /></div>
        <div className="form-group"><label className="form-label">Observación</label><textarea className="form-control" rows={2} value={formMov.obs} onChange={e => setFormMov(f => ({ ...f, obs: e.target.value }))} /></div>
        {!esEmpaque(mps.find(m => String(m.id) === String(formMov.mp_id))?.categoria) && <CamposExtra value={formMov.extra} onChange={extra => setFormMov(f => ({ ...f, extra }))} />}
      </Modal>

      {/* Modal Categorías */}
      <Modal open={modalCats} onClose={() => setModalCats(false)} title="🏷 Gestionar Categorías"
        footer={<button className="btn btn-secondary" onClick={() => setModalCats(false)}>Cerrar</button>}
      >
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          <input className="form-control" placeholder="Nueva categoría" value={nuevaCat} onChange={e => setNuevaCat(e.target.value)} />
          <button className="btn btn-primary" onClick={() => nuevaCat.trim() && addCategoria.mutate(nuevaCat)} disabled={addCategoria.isPending}>+ Crear</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Categoría</th><th>En uso</th><th>Acciones</th></tr></thead>
            <tbody>
              {categorias.length === 0
                ? <tr><td colSpan={3} className="empty-table">Sin categorías</td></tr>
                : categorias.map(nombre => {
                  const uso = usoCategoria(nombre)
                  const enTabla = categoriasDB.some(c => c.nombre === nombre)
                  return (
                    <tr key={nombre}>
                      <td><strong>{nombre}</strong>{!enTabla && <span className="badge badge-gris" style={{ marginLeft: 6, fontSize: '0.65rem' }}>solo en MPs</span>}</td>
                      <td>{uso > 0 ? <span className="badge badge-verde">{uso} MP</span> : <span className="badge badge-gris">sin uso</span>}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-xs btn-secondary" onClick={() => {
                            pedir(`Renombrar "${nombre}" a:`, { title: 'Renombrar categoría', defaultValue: nombre })
                              .then(nuevo => { if (nuevo && nuevo.trim() && nuevo.trim() !== nombre) renameCategoria.mutate({ viejo: nombre, nuevo }) })
                          }}>✏ Renombrar</button>
                          <button className="btn btn-xs btn-danger" disabled={uso > 0} title={uso > 0 ? 'En uso, no se puede eliminar' : 'Eliminar'}
                            onClick={() => confirmar(`¿Eliminar categoría "${nombre}"?`).then(ok => ok && deleteCategoria.mutate({ nombre }))}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginTop: 10 }}>Solo se pueden eliminar categorías que no tengan materias primas asignadas. Al renombrar, se actualiza en todas las MPs que la usaban.</p>
      </Modal>

      {/* Modal Lotes PEPS por MP */}
      <Modal open={modalLotes} onClose={() => setModalLotes(false)} title={`🧊 Lotes (PEPS) — ${lotesMP?.nombre || ''}`} size="modal-lg">
        {lotesMP && (() => {
          const lotes = lotesDe(lotesMP.id)
          const activos = lotes.filter(l => (l.cantidad_actual || 0) > 0)
          const totalLotes = stockLotes(lotesMP.id)
          const desfase = Math.round((totalLotes - (lotesMP.stock || 0)) * 100) / 100
          return (
            <>
              <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
                Las salidas consumen primero el lote <strong>más próximo a vencer / más antiguo</strong> (PEPS).
                Saldo en lotes: <strong>{fNum(totalLotes)} {lotesMP.unidad}</strong>.
                {desfase !== 0 && <span style={{ color: 'var(--rojo)' }}> ⚠ Difiere del stock general ({fNum(lotesMP.stock || 0)}) en {fNum(desfase)}. Ajusta con una entrada/salida.</span>}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#PEPS</th><th>Lote</th><th>Ingreso</th><th>Vence</th><th className="td-number">Inicial</th><th className="td-number">Disponible</th><th className="td-number">Reservado</th><th className="td-number">Costo/u</th><th>Estado</th></tr></thead>
                  <tbody>
                    {lotes.length === 0
                      ? <tr><td colSpan={9} className="empty-table">Sin lotes. Registra una entrada para crear el primero.</td></tr>
                      : lotes.map((l, i) => {
                        const est = estadoLote(l.vencimiento)
                        const agotado = (l.cantidad_actual || 0) <= 0
                        return (
                          <tr key={l.id} style={{ opacity: agotado ? 0.5 : 1 }}>
                            <td>{agotado ? '—' : activos.indexOf(l) + 1}</td>
                            <td>{l.lote || '—'}</td>
                            <td>{fFecha(l.fecha_entrada)}</td>
                            <td>{l.vencimiento ? fFecha(l.vencimiento) : '—'}</td>
                            <td className="td-number">{fNum(l.cantidad_inicial)}</td>
                            <td className="td-number"><strong>{fNum(l.cantidad_actual)}</strong></td>
                            <td className="td-number">{(l.cantidad_reservada || 0) > 0 ? <span style={{ color: 'var(--tierra)' }}>{fNum(l.cantidad_reservada)}</span> : '—'}</td>
                            <td className="td-number">{l.costo_unitario ? fNum(l.costo_unitario) : '—'}</td>
                            <td>{agotado ? <span className="badge">Agotado</span> : est === 'vencido' ? <span className="badge badge-rojo">Vencido</span> : est === 'por_vencer' ? <span className="badge badge-dorado">Por vencer</span> : <span className="badge badge-verde">Vigente</span>}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )
        })()}
      </Modal>

      {/* Modal Historial por MP */}
      <Modal open={modalHist} onClose={() => setModalHist(false)} title={`🕑 Historial — ${histMP?.nombre || ''}`} size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={() => setModalHist(false)}>Cerrar</button>}
      >
        {histMP && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16, fontSize: '0.88rem' }}>
              <div><strong>Categoría:</strong> {histMP.categoria}</div>
              <div><strong>Stock actual:</strong> {fNum(histMP.stock || 0)} {histMP.unidad}</div>
              <div><strong>Stock mínimo:</strong> {fNum(histMP.stock_min || 0)}</div>
              <div><strong>Lote actual:</strong> {histMP.lote || '—'}</div>
              <div><strong>Vence:</strong> {histMP.vencimiento ? fFecha(histMP.vencimiento) : '—'}</div>
              <div><strong>Precio:</strong> ${fNum(histMP.precio || 0)}</div>
            </div>
            {histMP.obs && <div style={{ marginBottom: 12, fontSize: '0.85rem' }}><strong>Obs:</strong> {histMP.obs}</div>}
            {histMP.extra && Object.keys(histMP.extra).length > 0 && (
              <div style={{ marginBottom: 12, fontSize: '0.85rem' }}>
                <strong>Campos personalizados:</strong>{' '}
                {Object.entries(histMP.extra).map(([k, v]) => <span key={k} className="badge badge-gris" style={{ marginRight: 6 }}>{k}: {v}</span>)}
              </div>
            )}
            <div className="card-title" style={{ fontSize: '0.95rem' }}>📋 Movimientos ({histMovs.length})</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Lote</th><th>Vence</th><th>Responsable</th><th>Obs</th><th>Otros</th></tr></thead>
                <tbody>
                  {histMovs.length === 0
                    ? <tr><td colSpan={8} className="empty-table">Sin movimientos registrados</td></tr>
                    : histMovs.map(mv => (
                      <tr key={mv.id}>
                        <td>{fFecha(mv.fecha)}</td>
                        <td><span className={`badge ${mv.tipo === 'entrada' ? 'badge-verde' : mv.tipo === 'salida' ? 'badge-rojo' : 'badge-gris'}`}>{mv.tipo}</span></td>
                        <td className="td-number">{fCantMov(mv.cantidad, histMP?.unidad)}</td>
                        <td>{mv.lote || '—'}</td>
                        <td>{mv.vencimiento ? fFecha(mv.vencimiento) : '—'}</td>
                        <td>{mv.responsable || '—'}</td>
                        <td>{mv.obs || '—'}</td>
                        <td>{mv.extra && Object.keys(mv.extra).length > 0 ? Object.entries(mv.extra).map(([k, v]) => `${k}: ${v}`).join(' · ') : '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

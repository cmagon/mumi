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
import { Download, Tags, Tag, Plus, Pencil, X, Package, ClipboardList, FileText, AlertTriangle } from 'lucide-react'

const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

const EMPTY_MP = { nombre: '', categoria: 'pulpa', tipo: 'comprado', unidad: 'Kg', precio: '', stock_min: 0, stock: 0, lote: '', vencimiento: '', obs: '', extra: {}, vendible: false, precio_venta: '' }
const EMPTY_MOV = { mp_id: '', tipo: 'entrada', cantidad: '', responsable: '', obs: '', lote: '', vencimiento: '', extra: {}, costo: '', motivo: 'consumo', lote_id: '', proveedor: '' }
// Motivos de salida/ajuste manual de inventario
const MOTIVOS_SALIDA = [
  { value: 'consumo', label: 'Consumo / uso' },
  { value: 'perdida', label: 'Pérdida / daño' },
  { value: 'vencimiento', label: 'Vencimiento' },
  { value: 'no_contabilizada', label: 'Salida no contabilizada' },
  { value: 'ajuste', label: 'Ajuste de conteo' },
]
const motivoLabel = (m) => (MOTIVOS_SALIDA.find(x => x.value === m)?.label || m)
const UNIDADES = ['Kg','Gramo','Litro','Mililitro','Unidad']
// Sufijo corto para mostrar el precio según la unidad
const sufijoUnidad = (u) => u === 'Kg' ? '/Kg' : u === 'Gramo' ? '/g' : u === 'Litro' ? '/L' : u === 'Mililitro' ? '/ml' : u === 'Unidad' ? '/u' : `/${u || 'u'}`
// Etiqueta "por X" para el precio según la unidad
const porUnidad = (u) => u === 'Litro' ? 'por Litro' : u === 'Gramo' ? 'por Gramo' : u === 'Mililitro' ? 'por Mililitro' : u === 'Unidad' ? 'por Unidad' : 'por Kg'
// Cantidad de un movimiento expresada en gramos/ml (Kg→g, Litro→ml); g/ml y unidades quedan igual
const fCantMov = (cant, unidad) => {
  const v = Number(cant) || 0
  if (unidad === 'Kg') return `${fNum(v * 1000)} g`
  if (unidad === 'Litro') return `${fNum(v * 1000)} ml`
  if (unidad === 'Gramo') return `${fNum(v)} g`
  if (unidad === 'Mililitro') return `${fNum(v)} ml`
  return `${fNum(v)} ${unidad || ''}`.trim()
}
// Factor para pasar de la unidad de PRECIO (Kg/Litro) a la unidad BASE de stock (g/ml). g/ml/Unidad = 1.
const factorU = (u) => (u === 'Kg' || u === 'Litro') ? 1000 : 1
const baseLbl = (u) => (u === 'Kg' || u === 'Gramo') ? 'g' : (u === 'Litro' || u === 'Mililitro') ? 'ml' : (u || 'u')
// Convierte una cantidad interna (en unidad de precio) a texto en unidad base (g/ml/u)
const fBase = (cantInterna, unidad) => `${fNum((Number(cantInterna) || 0) * factorU(unidad))} ${baseLbl(unidad)}`
// Los empaques no requieren lote, vencimiento ni campos adicionales
const esEmpaque = (categoria) => /empaque|envase/i.test(categoria || '')

// ---- Editor de campos personalizados (objeto JSONB clave→valor) ----
function CamposExtra({ value = {}, onChange }) {
  // Estado interno como ARRAY de filas: permite dejar el nombre vacío mientras se escribe
  // (antes el campo se borraba solo al vaciar el nombre, porque el objeto filtraba claves vacías).
  const [rows, setRows] = useState(() => Object.entries(value || {}))
  const build = (rs) => Object.fromEntries(rs.filter(([k]) => String(k).trim() !== ''))
  // Re-sincroniza SOLO si el valor cambió desde afuera (reset del formulario, cargar otra MP),
  // no cuando el cambio vino de este mismo componente.
  useEffect(() => {
    if (JSON.stringify(build(rows)) !== JSON.stringify(value || {})) setRows(Object.entries(value || {}))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const commit = (rs) => { setRows(rs); onChange(build(rs)) }
  const setEntry = (i, k, v) => commit(rows.map(([ek, ev], idx) => idx === i ? [k, v] : [ek, ev]))
  const addEntry = () => commit([...rows, ['', '']])
  const delEntry = (i) => commit(rows.filter((_, idx) => idx !== i))
  return (
    <div className="form-group">
      <label className="form-label">Campos personalizados <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(fecha cosecha, productor, etc.)</small></label>
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
          <input className="form-control" placeholder="Nombre del campo" value={k} onChange={e => setEntry(i, e.target.value, v)} />
          <input className="form-control" placeholder="Valor" value={v} onChange={e => setEntry(i, k, e.target.value)} />
          <button className="btn btn-xs btn-danger" onClick={() => delEntry(i)} title="Quitar"><X size={13} aria-hidden="true" /></button>
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
  // Proveedores ya registrados en lotes anteriores (para autocompletar en nuevas entradas)
  const proveedoresConocidos = [...new Set(lotesDB.map(l => (l.proveedor || '').trim()).filter(Boolean))].sort()

  // Lista de nombres de categoría (tabla + las usadas por MPs por seguridad)
  const categorias = [...new Set([...categoriasDB.map(c => c.nombre), ...mps.map(m => m.categoria).filter(Boolean)])].sort()
  const usoCategoria = (nombre) => mps.filter(m => m.categoria === nombre).length

  // ---- MP CRUD ----
  const saveMP = useMutation({
    mutationFn: async (datos) => {
      // El usuario ingresa stock/stock_min en unidad BASE (g/ml/u); se guarda internamente en la
      // unidad de precio (Kg/Litro) dividiendo por el factor (1000 para Kg/Litro).
      const fac = factorU(datos.unidad)
      const payload = {
        ...datos,
        precio: parseFloat(datos.precio) || 0,
        stock_min: (parseFloat(datos.stock_min) || 0) / fac,
        stock: (parseFloat(datos.stock) || 0) / fac,
        vencimiento: datos.vencimiento || null,
        extra: datos.extra || {},
        vendible: !!datos.vendible,
        precio_venta: parseFloat(datos.precio_venta) || 0,
      }
      // Asegurar que la categoría exista en la tabla (no debe bloquear el guardado de la MP)
      if (payload.categoria) { try { await supabase.from('mp_categories').upsert({ nombre: payload.categoria }, { onConflict: 'nombre' }) } catch { /* ignora si la tabla/política no está */ } }
      if (editMPId) {
        const { error } = await supabase.from('raw_materials').update(payload).eq('id', editMPId); if (error) throw error
        // Auditoría: registra QUÉ campos cambiaron, quién y cuándo (tabla v94, tolerante)
        const mpAnt = mps.find(m => m.id === editMPId)
        if (mpAnt) {
          const CAMPOS = { nombre: 'Nombre', categoria: 'Categoría', tipo: 'Tipo', unidad: 'Unidad', precio: 'Precio', stock: 'Stock', stock_min: 'Stock mínimo', lote: 'Lote', vencimiento: 'Vencimiento', obs: 'Observación', vendible: 'Vendible', precio_venta: 'Precio de venta' }
          const cambios = []
          for (const [k, label] of Object.entries(CAMPOS)) {
            const antes = mpAnt[k], despues = payload[k]
            const na = antes == null || antes === '' ? '' : String(antes)
            const nd = despues == null || despues === '' ? '' : String(despues)
            if (na !== nd) cambios.push({ campo: label, antes: na || '—', despues: nd || '—' })
          }
          if (cambios.length) {
            try { await supabase.from('mp_edit_log').insert({ mp_id: editMPId, cambios, editado_por: profile?.nombre || '' }) } catch { /* tabla v94 opcional */ }
          }
        }
        // Si cambió la unidad de medida, los lotes PEPS ya guardados quedan expresados en el factor
        // VIEJO (p.ej. Gramo→Kg cambia el factor de 1 a 1000) — hay que reescalarlos, si no la
        // trazabilidad de lotes queda hasta 1000x errónea frente al nuevo stock.
        const mpVieja = mps.find(m => m.id === editMPId)
        if (mpVieja && mpVieja.unidad !== datos.unidad) {
          const facVieja = factorU(mpVieja.unidad)
          const ratio = facVieja / fac
          const { data: lotesActuales } = await supabase.from('raw_material_lots').select('id, cantidad_actual, cantidad_inicial, cantidad_reservada').eq('mp_id', editMPId)
          for (const l of (lotesActuales || [])) {
            await supabase.from('raw_material_lots').update({
              cantidad_actual: (l.cantidad_actual || 0) * ratio,
              cantidad_inicial: (l.cantidad_inicial || 0) * ratio,
              cantidad_reservada: (l.cantidad_reservada || 0) * ratio,
            }).eq('id', l.id)
          }
        }
      }
      else { const { error } = await supabase.from('raw_materials').insert(payload); if (error) throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['mp_categories'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] })
      setModalMP(false); setFormMP(EMPTY_MP); setEditMPId(null); toast('Materia prima guardada ✓')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const deleteMP = useMutation({
    mutationFn: async (mp) => {
      if ((mp.stock || 0) !== 0) throw new Error(`No se puede eliminar "${mp.nombre}": tiene stock (${fBase(mp.stock, mp.unidad)}). Ajústalo a 0 primero.`)
      const { error } = await supabase.from('raw_materials').delete().eq('id', mp.id); if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['raw_materials'] }); toast('Materia prima eliminada') },
    onError: (e) => toast(e.message, 'error'),
  })

  // Verifica ANTES de guardar si una salida/ajuste negativo va a exceder lo disponible en lotes
  // PEPS (sin bloquear, solo para avisar — el stock general sigue siendo la fuente de verdad).
  // Devuelve el faltante en unidad BASE, o 0 si alcanza.
  const chequearFaltanteLotes = async () => {
    const mpId = parseInt(formMov.mp_id)
    const mp = mps.find(m => m.id === mpId)
    if (!mp || esEmpaque(mp.categoria)) return 0
    const cantidad = (parseFloat(formMov.cantidad) || 0) / factorU(mp.unidad)
    if (!(formMov.tipo === 'salida' || (formMov.tipo === 'ajuste' && cantidad < 0))) return 0
    const aDescontar = formMov.tipo === 'salida' ? cantidad : Math.abs(cantidad)
    let disponible = 0
    if (formMov.lote_id) {
      const { data } = await supabase.from('raw_material_lots').select('cantidad_actual').eq('id', formMov.lote_id).single()
      disponible = data?.cantidad_actual || 0
    } else {
      const { data } = await supabase.from('raw_material_lots').select('cantidad_actual').eq('mp_id', mpId).gt('cantidad_actual', 0)
      disponible = (data || []).reduce((s, l) => s + (l.cantidad_actual || 0), 0)
    }
    const faltante = aDescontar - disponible
    return faltante > 0 ? faltante * factorU(mp.unidad) : 0   // a unidad BASE para mostrar al usuario
  }
  const guardarMovimiento = async () => {
    const faltante = await chequearFaltanteLotes()
    if (faltante > 0) {
      const mp = mps.find(m => m.id === parseInt(formMov.mp_id))
      const ok = await confirmar(`⚠ No hay suficiente cantidad registrada en lotes PEPS: faltan ${fBase(faltante / factorU(mp?.unidad), mp?.unidad)} sin trazabilidad de lote.\n\nSe descontará igual del stock general, pero esa parte quedará "sin lote" (sin fecha de vencimiento asociada). ¿Continuar de todas formas?`)
      if (!ok) return
    }
    saveMov.mutate()
  }

  // ---- Movimiento ----
  const saveMov = useMutation({
    mutationFn: async () => {
      if (!formMov.mp_id) throw new Error('Selecciona la materia prima')
      const mpId = parseInt(formMov.mp_id)
      const mp = mps.find(m => m.id === mpId)
      // El usuario ingresa la cantidad en unidad BASE (g/ml/u); se guarda en la unidad de precio.
      const cantidad = (parseFloat(formMov.cantidad) || 0) / factorU(mp?.unidad)
      if (!cantidad) throw new Error('Ingresa una cantidad')
      // La fecha del movimiento SIEMPRE es el día en que se registra (fecha LOCAL, no editable):
      // el usuario no puede antedatar ni posfechar movimientos de inventario.
      const d = new Date()
      const fechaHoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const extra = { ...(formMov.extra || {}) }
      // PEPS: entrada crea lote; salida consume del lote más antiguo/próximo a vencer
      if ((formMov.tipo === 'entrada' || (formMov.tipo === 'ajuste' && cantidad > 0)) && !esEmpaque(mp?.categoria)) {
        // Ajuste positivo también crea lote — si no, ese sobrante queda contabilizado en el stock
        // general pero invisible/sin respaldo en la trazabilidad PEPS para siempre.
        await crearLoteEntrada({
          mp_id: mpId, lote: formMov.lote, vencimiento: formMov.vencimiento, fecha: fechaHoy,
          cantidad, costo_unitario: formMov.costo !== '' ? parseFloat(formMov.costo) || 0 : (mp?.precio || 0),
          creado_por: profile?.nombre || '', proveedor: formMov.proveedor || '',
        })
        if (formMov.proveedor) extra.proveedor = formMov.proveedor
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
        mp_id: mpId, tipo: formMov.tipo, cantidad, fecha: fechaHoy,
        responsable: formMov.responsable, obs: obsFinal,
        lote: formMov.lote || '', vencimiento: formMov.vencimiento || null, extra,
      })
      if (movErr) throw movErr
      if (mp) {
        // Ajuste atómico en BD (evita condición de carrera con otro movimiento/reserva simultánea)
        const delta = formMov.tipo === 'salida' ? -cantidad : cantidad   // "salida" permite negativo si excede
        await supabase.rpc('ajustar_stock_mp', { p_mp_id: mpId, p_delta: delta })
        // Si es entrada, también actualiza lote/venc y el COSTO del MP como PROMEDIO PONDERADO
        // (no se reemplaza por el costo del último ingreso; se pondera con el stock que ya había,
        // así la valorización no se distorsiona si el nuevo lote entra a un costo distinto).
        const upd = {}
        if (formMov.tipo === 'entrada') {
          if (formMov.lote) upd.lote = formMov.lote
          if (formMov.vencimiento) upd.vencimiento = formMov.vencimiento
          if (formMov.costo !== '' && formMov.costo != null) {
            const costoNuevo = parseFloat(formMov.costo) || 0
            const stockPrevio = Math.max(0, mp.stock || 0)
            upd.precio = (stockPrevio + cantidad) > 0
              ? (stockPrevio * (mp.precio || 0) + cantidad * costoNuevo) / (stockPrevio + cantidad)
              : costoNuevo
          }
        }
        if (Object.keys(upd).length) await supabase.from('raw_materials').update(upd).eq('id', mpId)
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
    const fac = factorU(mp.unidad)
    setFormMP({ nombre: mp.nombre, categoria: mp.categoria, tipo: mp.tipo, unidad: mp.unidad, precio: mp.precio, stock_min: (mp.stock_min || 0) * fac, stock: (mp.stock || 0) * fac, lote: mp.lote || '', vencimiento: mp.vencimiento || '', obs: mp.obs || '', extra: mp.extra || {}, vendible: !!mp.vendible, precio_venta: mp.precio_venta || '' })
    setEditMPId(mp.id); setModalMP(true)
  }
  const openMovimiento = (mpId = '', tipo = 'entrada') => {
    setFormMov({ ...EMPTY_MOV, mp_id: String(mpId), tipo, responsable: profile?.nombre || '' })
    setModalMov(true)
  }
  const openHistorial = (mp) => { setHistMP(mp); setModalHist(true) }

  const bajo = mps.filter(m => m.stock > 0 && m.stock <= m.stock_min).length
  const cero = mps.filter(m => m.stock <= 0).length
  // Filtro por ESTADO del stock: sin stock, stock bajo, por vencer/vencidas
  const [filtroEstado, setFiltroEstado] = useState('')
  const tieneLotePorVencer = (m) => lotesDe(m.id).some(l => (l.cantidad_actual || 0) > 0 && ['por_vencer', 'vencido'].includes(estadoLote(l.vencimiento)))
  const pasaEstado = (m) => {
    if (!filtroEstado) return true
    if (filtroEstado === 'sin_stock') return (m.stock || 0) <= 0
    if (filtroEstado === 'bajo') return (m.stock || 0) > 0 && (m.stock_min || 0) > 0 && m.stock <= m.stock_min
    if (filtroEstado === 'por_vencer') return tieneLotePorVencer(m)
    return true
  }
  const [buscarMP, setBuscarMP] = useState('')
  const normBusq = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const mpsFiltrados = mps.filter(m => (!filtroCat || m.categoria === filtroCat) && pasaEstado(m)
    && (!buscarMP.trim() || normBusq(m.nombre).includes(normBusq(buscarMP)) || normBusq(m.categoria).includes(normBusq(buscarMP))))
  const histMovs = histMP ? movimientos.filter(mv => mv.mp_id === histMP.id) : []
  // Auditoría de EDICIONES de la ficha de la MP (tabla v94 — si no existe, lista vacía)
  const { data: histEdits = [] } = useQuery({
    queryKey: ['mp_edit_log', histMP?.id],
    queryFn: async () => { const { data } = await supabase.from('mp_edit_log').select('*').eq('mp_id', histMP.id).order('created_at', { ascending: false }).limit(100); return data || [] },
    enabled: !!histMP?.id && modalHist,
  })

  // Lote/vencimiento vigente = el de la última ENTRADA registrada (movimientos vienen ordenados desc),
  // con respaldo en el campo de la MP. Así se actualiza a medida que se dan ingresos.
  const loteVigente = (m) => {
    const ult = movimientos.find(mv => mv.mp_id === m.id && mv.tipo === 'entrada' && (mv.lote || mv.vencimiento))
    return { lote: ult?.lote || m.lote || '', vence: ult?.vencimiento || m.vencimiento || '' }
  }

  const exportarExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Materia Prima','Categoría','Unidad precio','Stock Actual','Stock Mínimo','Unidad stock','Lote','Vencimiento','Estado'],
      ...mps.map(m => { const { label } = getEstadoStock(m.stock, m.stock_min); return [m.nombre, m.categoria, m.unidad, (m.stock || 0) * factorU(m.unidad), (m.stock_min || 0) * factorU(m.unidad), baseLbl(m.unidad), m.lote || '', m.vencimiento || '', label] })
    ])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    XLSX.writeFile(wb, 'Inventario_MumiAmazonia.xlsx'); toast('Excel exportado ✓')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Inventario MP</h1>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={exportarExcel}><Ico as={Download} size={14} />Excel</button>
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={() => setModalCats(true)}><Ico as={Tag} size={14} />Categorías</button>}
          {puedeEditarInv && <button className="btn btn-secondary btn-sm" onClick={() => { setFormMP(EMPTY_MP); setEditMPId(null); setModalMP(true) }}><Ico as={Plus} size={14} />Nueva MP</button>}
          {puedeEditarInv && <button className="btn btn-primary btn-sm" onClick={() => openMovimiento()}><Ico as={Plus} size={14} />Movimiento</button>}
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="kpi-card verde"><div className="kpi-label">Total Ítems</div><div className="kpi-value">{mps.length}</div></div>
        <div className="kpi-card dorado"><div className="kpi-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Stock Bajo <AlertTriangle size={13} aria-hidden="true" /></div><div className="kpi-value">{bajo}</div></div>
        <div className="kpi-card tierra"><div className="kpi-label">Sin Stock</div><div className="kpi-value">{cero}</div></div>
      </div>

      <div className="card">
        <div className="card-title"><Ico as={Package} size={16} />Estado del Inventario</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-control" style={{ width: 200 }} placeholder="🔍 Buscar materia prima..." value={buscarMP} onChange={e => setBuscarMP(e.target.value)} />
          <label className="form-label" style={{ margin: 0 }}>Categoría:</label>
          <select className="form-control" value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="form-label" style={{ margin: 0 }}>Estado:</label>
          <select className="form-control" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todos</option>
            <option value="sin_stock">Sin stock</option>
            <option value="bajo">Stock bajo</option>
            <option value="por_vencer">Por vencer / vencidas</option>
          </select>
          {(filtroCat || filtroEstado) && <button className="btn btn-sm btn-secondary" onClick={() => { setFiltroCat(''); setFiltroEstado('') }}>Limpiar filtros</button>}
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
                  titulo={<>
                    {((m.stock || 0) <= 0 || ((m.stock_min || 0) > 0 && m.stock <= m.stock_min)) && <AlertTriangle size={14} aria-hidden="true" style={{ color: (m.stock || 0) <= 0 ? 'var(--rojo)' : 'var(--dorado)', display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />}
                    {m.nombre} {m.tipo === 'interno' && <span className="badge badge-dorado" style={{ fontSize: '0.6rem' }}>interno</span>}
                  </>}
                  sub={<><span className={`badge ${badge}`} style={{ fontSize: '0.62rem' }}>{label}</span> · {fBase(m.stock, m.unidad)}</>}
                >
                  <Fila et="Categoría">{m.categoria}</Fila>
                  <Fila et="Precio">${fNum(m.precio || 0)}{sufijoUnidad(m.unidad)}</Fila>
                  <Fila et="Stock">{fBase(m.stock, m.unidad)}</Fila>
                  <Fila et="Stock mín.">{fBase(m.stock_min, m.unidad)}</Fila>
                  <Fila et="Lote">{lv.lote || '—'}</Fila>
                  <Fila et="Vence">{lv.vence ? fFecha(lv.vence) : '—'}</Fila>
                  <div className="acordeon-acciones">
                    {puedeEditarInv && <button className="btn btn-xs btn-primary" onClick={() => openMovimiento(m.id, 'entrada')}>+ Entrada</button>}
                    {puedeEditarInv && <button className="btn btn-xs btn-secondary" onClick={() => openMovimiento(m.id, 'salida')}>- Salida</button>}
                    <button className="btn btn-xs btn-secondary" onClick={() => openHistorial(m)}>🕑 Historial</button>
                    {puedeEditarInv && <button className="btn btn-xs btn-secondary" onClick={() => openEditMP(m)}><Ico as={Pencil} size={13} />Editar</button>}
                    {esAdmin && <button className="btn btn-xs btn-danger" disabled={(m.stock || 0) !== 0}
                      onClick={() => confirmar(`¿Eliminar la materia prima "${m.nombre}"?\nEsta acción no se puede deshacer.`).then(ok => ok && deleteMP.mutate(m))} title="Eliminar"><X size={13} aria-hidden="true" /></button>}
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
                      <td className="td-number"><strong>{fBase(m.stock, m.unidad)}</strong></td>
                      <td className="td-number col-opcional-2">{fBase(m.stock_min, m.unidad)}</td>
                      <td className="col-opcional">{lv.lote || '—'}</td>
                      <td className="col-opcional">{lv.vence ? fFecha(lv.vence) : '—'}</td>
                      <td className="col-opcional"><span className={`badge ${badge}`}>{label}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {puedeEditarInv && <button className="btn btn-xs btn-primary" onClick={() => openMovimiento(m.id, 'entrada')}>+ Ent.</button>}
                          {puedeEditarInv && <button className="btn btn-xs btn-secondary" onClick={() => openMovimiento(m.id, 'salida')}>- Sal.</button>}
                          <button className="btn btn-xs btn-secondary" onClick={() => openHistorial(m)}>🕑</button>
                          {!esEmpaque(m.categoria) && <button className="btn btn-xs btn-secondary" title="Lotes (PEPS)" onClick={() => { setLotesMP(m); setModalLotes(true) }}>🧊</button>}
                          {puedeEditarInv && <button className="btn btn-xs btn-secondary" onClick={() => openEditMP(m)} title="Editar"><Pencil size={13} aria-hidden="true" /></button>}
                          {esAdmin && <button className="btn btn-xs btn-danger"
                            disabled={(m.stock || 0) !== 0}
                            title={(m.stock || 0) !== 0 ? 'Tiene stock — no se puede eliminar' : 'Eliminar'}
                            onClick={() => confirmar(`¿Eliminar la materia prima "${m.nombre}"?\nEsta acción no se puede deshacer.`).then(ok => ok && deleteMP.mutate(m))} title="Eliminar"><X size={13} aria-hidden="true" /></button>}
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
        <div className="card-title"><Ico as={ClipboardList} size={16} />Últimos Movimientos</div>
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
            <label className="form-label">Precio {porUnidad(formMP.unidad)}</label>
            <MoneyInput value={formMP.precio} onChange={v => setFormMP(f => ({ ...f, precio: v }))} />
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Stock mínimo <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(en {baseLbl(formMP.unidad)})</small></label><input type="number" className="form-control" value={formMP.stock_min} onChange={e => setFormMP(f => ({ ...f, stock_min: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Stock actual <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(en {baseLbl(formMP.unidad)}{factorU(formMP.unidad) > 1 ? ` · 1 ${formMP.unidad}=${factorU(formMP.unidad)}${baseLbl(formMP.unidad)}` : ''})</small></label><input type="number" className="form-control" value={formMP.stock} onChange={e => setFormMP(f => ({ ...f, stock: e.target.value }))} /></div>
        </div>
        <div className="form-group" style={{ background: 'rgba(124,179,66,0.07)', borderRadius: 'var(--radio)', padding: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
            <input type="checkbox" checked={!!formMP.vendible} onChange={e => setFormMP(f => ({ ...f, vendible: e.target.checked }))} /> <Tag size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> Se puede vender (producto terminado)
          </label>
          {formMP.vendible && (
            <small style={{ display: 'block', marginTop: 6, color: 'var(--texto-suave)', fontSize: '0.75rem' }}>Los <strong>costos y el precio de venta</strong> se definen en <strong>Fichas de Productos</strong> → marca "Calcular costos de una MP vendible" y elige esta MP. Desde ahí pasa a producto terminado y se sincroniza con Alegra.</small>
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
      <Modal open={modalMov} onClose={() => setModalMov(false)} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Package size={18} aria-hidden="true" /> {formMov.tipo === 'entrada' ? 'Entrada' : formMov.tipo === 'salida' ? 'Salida' : 'Movimiento'} de Inventario</span>}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalMov(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardarMovimiento} disabled={saveMov.isPending}>Guardar</button>
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
            <label className="form-label">Cantidad {formMov.mp_id && <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(en {baseLbl(mps.find(m => String(m.id) === String(formMov.mp_id))?.unidad)})</small>} {formMov.tipo === 'ajuste' && <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(+ suma / − resta)</small>}</label>
            <input type="number" className="form-control" value={formMov.cantidad} onChange={e => setFormMov(f => ({ ...f, cantidad: e.target.value }))} min={formMov.tipo === 'ajuste' ? undefined : 0} />
          </div>
        </div>
        {/* Costo en entradas — actualiza el precio de la MP (y recalcula las fichas) */}
        {formMov.tipo === 'entrada' && (() => {
          const mpSel = mps.find(m => String(m.id) === String(formMov.mp_id))
          const u = mpSel?.unidad || 'Kg'
          return (
            <div className="form-group">
              <label className="form-label">Costo {porUnidad(u)} <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>— opcional, actualiza el precio de la MP</small></label>
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
              <label className="form-label">¿De qué lote se descuenta? <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(solo aplica si el ajuste RESTA)</small></label>
              {/* BUG corregido: aquí se usaba `mpSel`, que solo existe en el bloque de entradas —
                  al elegir salida/ajuste con lotes cargados el modal se rompía (ReferenceError). */}
              <select className="form-control" value={formMov.lote_id} onChange={e => setFormMov(f => ({ ...f, lote_id: e.target.value }))}>
                <option value="">Automático (PEPS: el más antiguo/próximo a vencer)</option>
                {lotesDe(parseInt(formMov.mp_id)).map(l => (
                  <option key={l.id} value={l.id}>Lote {l.lote || '(s/n)'} · {fBase(l.cantidad_actual, mps.find(m => String(m.id) === String(formMov.mp_id))?.unidad)} disp.{l.vencimiento ? ` · vence ${l.vencimiento}` : ''}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        {/* Lote y vencimiento — solo en entradas (crea el lote), no aplican a empaques */}
        {formMov.tipo === 'entrada' && !esEmpaque(mps.find(m => String(m.id) === String(formMov.mp_id))?.categoria) && (
          <>
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Lote</label><input className="form-control" value={formMov.lote} onChange={e => setFormMov(f => ({ ...f, lote: e.target.value }))} placeholder="N° de lote" /></div>
              <div className="form-group"><label className="form-label">Fecha de vencimiento</label><input type="date" className="form-control" value={formMov.vencimiento || ''} onChange={e => setFormMov(f => ({ ...f, vencimiento: e.target.value }))} /></div>
            </div>
            <div className="form-group">
              <label className="form-label">Proveedor <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(a quién se le compró este lote)</small></label>
              <input className="form-control" list="dl-proveedores-mp" value={formMov.proveedor || ''} onChange={e => setFormMov(f => ({ ...f, proveedor: e.target.value }))} />
              <datalist id="dl-proveedores-mp">{proveedoresConocidos.map(p => <option key={p} value={p} />)}</datalist>
            </div>
          </>
        )}
        <div className="form-group"><label className="form-label">Responsable</label><input className="form-control" value={formMov.responsable} onChange={e => setFormMov(f => ({ ...f, responsable: e.target.value }))} placeholder="Nombre del responsable" /></div>
        <div className="form-group"><label className="form-label">Observación</label><textarea className="form-control" rows={2} value={formMov.obs} onChange={e => setFormMov(f => ({ ...f, obs: e.target.value }))} /></div>
        {!esEmpaque(mps.find(m => String(m.id) === String(formMov.mp_id))?.categoria) && <CamposExtra value={formMov.extra} onChange={extra => setFormMov(f => ({ ...f, extra }))} />}
      </Modal>

      {/* Modal Categorías */}
      <Modal open={modalCats} onClose={() => setModalCats(false)} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Tags size={18} aria-hidden="true" /> Gestionar Categorías</span>}
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
                          }}><Ico as={Pencil} size={13} />Renombrar</button>
                          <button className="btn btn-xs btn-danger" disabled={uso > 0} title={uso > 0 ? 'En uso, no se puede eliminar' : 'Eliminar'}
                            onClick={() => confirmar(`¿Eliminar categoría "${nombre}"?`).then(ok => ok && deleteCategoria.mutate({ nombre }))}><X size={13} aria-hidden="true" /></button>
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
                Saldo en lotes: <strong>{fBase(totalLotes, lotesMP.unidad)}</strong>.
                {desfase !== 0 && <span style={{ color: 'var(--rojo)', display: 'inline-flex', alignItems: 'center', gap: 3 }}> <AlertTriangle size={12} aria-hidden="true" /> Difiere del stock general ({fNum(lotesMP.stock || 0)}) en {fNum(desfase)}. Ajusta con una entrada/salida.</span>}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#PEPS</th><th>Lote</th><th>Ingreso</th><th>Proveedor</th><th>Vence</th><th className="td-number">Inicial</th><th className="td-number">Disponible</th><th className="td-number">Reservado</th><th className="td-number">Costo/u</th><th>Estado</th></tr></thead>
                  <tbody>
                    {lotes.length === 0
                      ? <tr><td colSpan={10} className="empty-table">Sin lotes. Registra una entrada para crear el primero.</td></tr>
                      : lotes.map((l, i) => {
                        const est = estadoLote(l.vencimiento)
                        const agotado = (l.cantidad_actual || 0) <= 0
                        return (
                          <tr key={l.id} style={{ opacity: agotado ? 0.5 : 1 }}>
                            <td>{agotado ? '—' : activos.indexOf(l) + 1}</td>
                            <td>{l.lote || '—'}</td>
                            <td>{fFecha(l.fecha_entrada)}</td>
                            <td>{l.proveedor || '—'}</td>
                            <td>{l.vencimiento ? fFecha(l.vencimiento) : '—'}</td>
                            <td className="td-number">{fBase(l.cantidad_inicial, lotesMP.unidad)}</td>
                            <td className="td-number"><strong>{fBase(l.cantidad_actual, lotesMP.unidad)}</strong></td>
                            <td className="td-number">{(l.cantidad_reservada || 0) > 0 ? <span style={{ color: 'var(--tierra)' }}>{fBase(l.cantidad_reservada, lotesMP.unidad)}</span> : '—'}</td>
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
              <div><strong>Stock actual:</strong> {fBase(histMP.stock, histMP.unidad)}</div>
              <div><strong>Stock mínimo:</strong> {fBase(histMP.stock_min, histMP.unidad)}</div>
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
            <div className="card-title" style={{ fontSize: '0.95rem' }}><Ico as={ClipboardList} size={15} />Movimientos ({histMovs.length})</div>
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

            <div className="card-title" style={{ fontSize: '0.95rem', marginTop: 14 }}>✏ Ediciones de la ficha ({histEdits.length})</div>
            {histEdits.length === 0
              ? <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>Sin ediciones registradas (se auditan desde que se activó el registro).</p>
              : <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
                  <table style={{ fontSize: '0.82rem' }}>
                    <thead><tr><th>Fecha y hora</th><th>Quién</th><th>Cambios</th></tr></thead>
                    <tbody>
                      {histEdits.map(e => (
                        <tr key={e.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{e.created_at ? new Date(e.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                          <td><strong>{e.editado_por || '—'}</strong></td>
                          <td>
                            {(Array.isArray(e.cambios) ? e.cambios : []).map((c, k) => (
                              <div key={k}><strong>{c.campo}:</strong> <span style={{ color: 'var(--texto-suave)' }}>{c.antes}</span> → <span style={{ color: 'var(--selva)' }}>{c.despues}</span></div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
          </>
        )}
      </Modal>
    </div>
  )
}

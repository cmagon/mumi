import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fFecha, fNum, getEstadoStock } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../context/AuthContext'
import { puedeVerSeccion } from '../lib/permisos'
import Modal from '../components/ui/Modal'
import MoneyInput from '../components/ui/MoneyInput'
import { useNavTrail } from '../hooks/useNavTrail'
import { useConfirm, usePrompt } from '../context/ConfirmContext'
import { AccordionItem, Fila } from '../components/ui/Acordeon'
import {
  crearLoteEntrada, consumirPEPS, consumirLote, bajarLote, estadoLote, costoPEPS,
  reponerCantidadesLotes, reducirLote, stockDesdeLotes, sincronizarPEPSAlStock, LOTE_SIN_CODIGO,
  corregirCantidadLote, fijarStockMp,
} from '../lib/lotes'

/** Fecha + hora local (para ingresos PEPS / auditoría). Acepta date o timestamptz. */
const fFechaHora = (s) => {
  if (!s) return '—'
  try {
    const d = String(s).includes('T') || String(s).includes(' ')
      ? new Date(s)
      : new Date(s + 'T12:00:00')
    if (Number.isNaN(d.getTime())) return String(s)
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return String(s) }
}
import * as XLSX from 'xlsx'
import { Download, Tags, Tag, Plus, Pencil, X, Package, ClipboardList, FileText, AlertTriangle, Trash2, Undo2, Lock } from 'lucide-react'
import ReservasMPPanel from '../components/ReservasMPPanel'
import { explicarDescuadrePeps, resumenReservasPorMp, reservadoEnLotes } from '../lib/reservasMp'
import Select from '../components/ui/Select'
import PaginacionTabla from '../components/ui/PaginacionTabla'
import { usePaginacion } from '../hooks/usePaginacion'

const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

const EMPTY_MP = { nombre: '', categoria: '', tipo: 'comprado', unidad: 'Kg', precio: '', stock_min: 0, stock: 0, lote: '', vencimiento: '', obs: '', extra: {}, vendible: false, precio_venta: '' }
const EMPTY_MOV = { mp_id: '', tipo: 'entrada', cantidad: '', responsable: '', obs: '', lote: '', vencimiento: '', extra: {}, costo: '', motivo: 'consumo', lote_id: '', proveedor: '' }
// Motivos solo de salida (el "ajuste de conteo" es un tipo aparte: corrige cantidad absoluta de un PEPS)
const MOTIVOS_SALIDA = [
  { value: 'consumo', label: 'Consumo / uso' },
  { value: 'perdida', label: 'Pérdida / daño' },
  { value: 'vencimiento', label: 'Vencimiento' },
  { value: 'no_contabilizada', label: 'Salida no contabilizada' },
]
const motivoLabel = (m) => (MOTIVOS_SALIDA.find(x => x.value === m)?.label || m)
const tituloTipoMov = (t) => (t === 'entrada' ? 'Compra / recepción' : t === 'salida' ? 'Salida' : t === 'ajuste' ? 'Ajuste de conteo' : 'Movimiento')
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
  // Secciones configurables: sin override, auxiliar solo ve stock; operario también mueve.
  const puedeVerStock = puedeVerSeccion(profile?.rol, 'inventario', 'stock')
  const puedeEditarInv = puedeVerSeccion(profile?.rol, 'inventario', 'movimientos')

  const [modalMP, setModalMP] = useState(false)
  const [modalMov, setModalMov] = useState(false)
  const [modalCats, setModalCats] = useState(false)
  const [modalUltMovs, setModalUltMovs] = useState(false)
  const [modalReservas, setModalReservas] = useState(false)
  const [modalHist, setModalHist] = useState(false)
  const [histMP, setHistMP] = useState(null)
  const [formMP, setFormMP] = useState(EMPTY_MP)
  const [editMPId, setEditMPId] = useState(null)
  const [filtroCat, setFiltroCat] = useState('')
  const [formMov, setFormMov] = useState(EMPTY_MOV)

  // Si se llega desde "Convertir receta a producto" con ingredientes por registrar,
  // abre el modal de Nueva MP precargando el primero.
  const location = useLocation()
  const { consumeArrival } = useNavTrail()
  useEffect(() => {
    const st = location.state
    if (!st?.nuevasMP) return
    const nuevas = st.nuevasMP
    if (nuevas && nuevas.length && puedeEditarInv) {
      setFormMP({ ...EMPTY_MP, nombre: nuevas[0] })
      setEditMPId(null); setModalMP(true)
      if (nuevas.length > 1) toast(`Por registrar: ${nuevas.join(', ')}`, 'info')
    }
    consumeArrival()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])
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
  const { data: ordenesReserva = [] } = useQuery({
    queryKey: ['production_orders', 'reservas'],
    queryFn: async () => {
      const { data } = await supabase.from('production_orders')
        .select('id, producto, estado, lotes_reservados, created_at')
        .order('created_at', { ascending: false })
      return data || []
    },
  })
  const [modalLotes, setModalLotes] = useState(false)
  const [bajaLote, setBajaLote] = useState(null)   // lote a dar de baja: { lote, mp }
  const [bajaForm, setBajaForm] = useState({ cantidad: '', motivo: 'vencido', obs: '' })
  const [lotesMP, setLotesMP] = useState(null)
  // Orden PEPS de consumo: próximo a vencer / más antiguo primero (no cambiar: lo usan salidas y descuadre).
  const lotesDe = (mpId) => lotesDB.filter(l => l.mp_id === mpId).sort((a, b) => (a.vencimiento || '9999') < (b.vencimiento || '9999') ? -1 : (a.fecha_entrada < b.fecha_entrada ? -1 : 1))
  const stockLotes = (mpId) => stockDesdeLotes(lotesDe(mpId))
  // Listado del modal PEPS: más reciente → más antiguo (solo presentación).
  const tsIngresoLote = (l) => {
    const s = l?.created_at || l?.fecha_entrada
    if (!s) return 0
    const t = new Date(String(s).includes('T') || String(s).includes(' ') ? s : `${s}T12:00:00`).getTime()
    return Number.isFinite(t) ? t : 0
  }
  const lotesModalOrdenados = useMemo(() => {
    if (!lotesMP) return []
    return lotesDe(lotesMP.id).slice().sort((a, b) => tsIngresoLote(b) - tsIngresoLote(a))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotesMP?.id, lotesDB])
  const pagLotes = usePaginacion(lotesModalOrdenados, { defaultSize: 10, resetDeps: [lotesMP?.id] })
  const pagUltMovs = usePaginacion(movimientos, { defaultSize: 10, resetDeps: [modalUltMovs] })
  // Descuadre PEPS: stock general vs suma de lotes disponibles.
  // No cuenta como descuadre lo que una orden abierta ya amarró (empaque sin PEPS o reserva de lote).
  const reservasPorMp = useMemo(() => resumenReservasPorMp(ordenesReserva), [ordenesReserva])
  const descuadrePEPS = (m) => {
    if (!m) return null
    const lotesMp = lotesDe(m.id)
    const porLotes = stockDesdeLotes(lotesMp)
    const claimed = reservasPorMp.get(String(m.id))
    return explicarDescuadrePeps({
      stock: Number(m.stock) || 0,
      porLotes,
      reservadoLotes: reservadoEnLotes(lotesMp),
      sinLotesOrdenes: claimed?.sinLotes || 0,
    })
  }
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
      const mpVieja = editMPId ? mps.find(m => m.id === editMPId) : null
      const payload = {
        ...datos,
        precio: parseFloat(datos.precio) || 0,
        stock_min: (parseFloat(datos.stock_min) || 0) / fac,
        // En edición el stock NO se cambia desde la ficha (solo +/− Mov.: compra, salida, ajuste PEPS).
        // Así no se descuadran los lotes al editar nombre, precio, etc.
        stock: editMPId
          ? (Number(mpVieja?.stock) || 0)
          : ((parseFloat(datos.stock) || 0) / fac),
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
        if (mpVieja) {
          const CAMPOS = { nombre: 'Nombre', categoria: 'Categoría', tipo: 'Tipo', unidad: 'Unidad', precio: 'Precio', stock_min: 'Stock mínimo', lote: 'Lote', vencimiento: 'Vencimiento', obs: 'Observación', vendible: 'Vendible', precio_venta: 'Precio de venta' }
          const cambios = []
          for (const [k, label] of Object.entries(CAMPOS)) {
            const antes = mpVieja[k], despues = payload[k]
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
      else {
        const { data: nueva, error } = await supabase.from('raw_materials').insert(payload).select('id').single()
        if (error) throw error
        // MP nueva con stock inicial → respaldo PEPS "sin lote" (o con el lote de la ficha)
        if (nueva?.id && (Number(payload.stock) || 0) > 0.001) {
          await crearLoteEntrada({
            mp_id: nueva.id,
            lote: payload.lote || LOTE_SIN_CODIGO,
            vencimiento: payload.vencimiento || null,
            cantidad: payload.stock,
            costo_unitario: payload.precio || 0,
            creado_por: profile?.nombre || '',
          })
        }
      }
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

  // Verifica ANTES de guardar si una salida va a exceder lo disponible en lotes PEPS
  // (sin bloquear, solo para avisar — el stock general sigue siendo la fuente de verdad).
  // Devuelve el faltante en unidad BASE, o 0 si alcanza.
  const chequearFaltanteLotes = async () => {
    const mpId = parseInt(formMov.mp_id)
    const mp = mps.find(m => m.id === mpId)
    if (!mp || esEmpaque(mp.categoria) || formMov.tipo !== 'salida') return 0
    const cantidad = (parseFloat(formMov.cantidad) || 0) / factorU(mp.unidad)
    if (!(cantidad > 0)) return 0
    let disponible = 0
    if (formMov.lote_id) {
      const { data } = await supabase.from('raw_material_lots').select('cantidad_actual').eq('id', formMov.lote_id).single()
      disponible = data?.cantidad_actual || 0
    } else {
      const { data } = await supabase.from('raw_material_lots').select('cantidad_actual').eq('mp_id', mpId).gt('cantidad_actual', 0)
      disponible = (data || []).reduce((s, l) => s + (l.cantidad_actual || 0), 0)
    }
    const faltante = cantidad - disponible
    return faltante > 0 ? faltante * factorU(mp.unidad) : 0   // a unidad BASE para mostrar al usuario
  }
  const guardarMovimiento = async () => {
    if (formMov.tipo === 'entrada' && !String(formMov.proveedor || '').trim()) {
      toast('Indica el proveedor de esta compra', 'warning')
      return
    }
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
      const fac = factorU(mp?.unidad)
      // Cantidad en unidad BASE en el form → unidad de precio para guardar.
      const cantBaseRaw = parseFloat(formMov.cantidad)
      // La fecha del movimiento SIEMPRE es el día en que se registra (fecha LOCAL, no editable).
      const d = new Date()
      const fechaHoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const extra = { ...(formMov.extra || {}) }
      let costoMovimiento = formMov.costo !== '' && formMov.costo != null ? (parseFloat(formMov.costo) || 0) : (mp?.precio || 0)
      // Si PEPS / corrección ya ajustó stock, no se vuelve a tocar.
      let stockYaAjustado = false
      let cantidad = Number.isFinite(cantBaseRaw) ? cantBaseRaw / fac : NaN
      let obsFinal = formMov.obs
      let loteNombre = formMov.lote || ''
      let vencMov = formMov.vencimiento || null

      if (formMov.tipo === 'ajuste') {
        if (!Number.isFinite(cantBaseRaw) || cantBaseRaw < 0) throw new Error('Ingresa la cantidad correcta (puede ser 0)')
        if (!formMov.lote_id) {
          // Sin lote: fija el stock GENERAL (p. ej. 0 si quedó negativo) y alinea PEPS.
          const objetivo = cantBaseRaw / fac
          const r = await fijarStockMp({
            mp_id: mpId, stockObjetivo: objetivo,
            costo_unitario: mp?.precio || 0, creado_por: profile?.nombre || '',
          })
          stockYaAjustado = true
          if (Math.abs(r.delta) <= 0.0001 && r.peps?.accion === 'ok') throw new Error('El stock ya está en ese valor — no hay nada que corregir')
          cantidad = r.delta
          extra.fijar_stock = true
          extra.stock_antes = r.stockAntes
          extra.stock_despues = r.stockDespues
          extra.peps_accion = r.peps?.accion || null
          extra.motivo = 'ajuste'
          obsFinal = `[Ajuste stock general → ${fBase(objetivo, mp?.unidad)}] ${formMov.obs || ''}`.trim()
          costoMovimiento = mp?.precio || 0
        } else {
          // Ajuste de conteo = corregir cantidad ABSOLUTA de un lote PEPS (incluye dejar en 0).
          const loteId = parseInt(formMov.lote_id)
          const loteSel = lotesDB.find(l => l.id === loteId)
          const cantidadNueva = cantBaseRaw / fac
          const r = await corregirCantidadLote({ lote_id: loteId, cantidad_nueva: cantidadNueva })
          stockYaAjustado = true
          if (Math.abs(r.delta) <= 0.0001) throw new Error('La cantidad es igual a la actual — no hay nada que corregir')
          cantidad = r.delta
          extra.correccion_lote = true
          extra.lote_id = loteId
          extra.cantidad_antes = Number(loteSel?.cantidad_actual) || 0
          extra.cantidad_despues = cantidadNueva
          extra.motivo = 'ajuste'
          loteNombre = loteSel?.lote || ''
          vencMov = loteSel?.vencimiento || null
          obsFinal = `[Ajuste de conteo · lote ${loteNombre || 's/n'}] ${formMov.obs || ''}`.trim()
          costoMovimiento = r.costo_unitario || mp?.precio || 0
        }
      } else if (formMov.tipo === 'entrada') {
        if (!(cantidad > 0)) throw new Error('Ingresa una cantidad')
        const prov = String(formMov.proveedor || '').trim()
        if (!prov) throw new Error('Indica el proveedor de esta compra')
        const costoLote = formMov.costo !== '' && formMov.costo != null
          ? (parseFloat(formMov.costo) || 0)
          : (mp?.precio || 0)
        costoMovimiento = costoLote
        extra.costo_lote = costoLote
        const creado = await crearLoteEntrada({
          mp_id: mpId,
          lote: formMov.lote || (esEmpaque(mp?.categoria) ? LOTE_SIN_CODIGO : ''),
          vencimiento: formMov.vencimiento, fecha: fechaHoy,
          cantidad, costo_unitario: costoLote,
          creado_por: profile?.nombre || '', proveedor: prov,
        })
        if (creado?.id) extra.lote_id = creado.id
        extra.proveedor = prov
        // Promedio ponderado ATÓMICO: stock + precio se recalculan y aplican con FOR UPDATE en una
        // sola transacción (v162), evitando que dos entradas simultáneas de la misma MP se pisen.
        const { data: prom, error: promErr } = await supabase.rpc('entrada_mp_promedio', {
          p_mp_id: mpId, p_cantidad: cantidad, p_costo_unitario: costoLote,
        })
        if (!promErr && prom) {
          extra.precio_antes = Number(prom.precio_antes) || 0
          extra.precio_despues = Number(prom.precio_despues) || 0
          if (Math.abs((Number(prom.precio_antes) || 0) - (Number(prom.precio_despues) || 0)) > 0.01) extra.cambio_precio_promedio = true
          stockYaAjustado = true   // la RPC ya subió el stock y fijó el precio: no repetir abajo
        } else {
          // Respaldo si la migración v162 aún no está: cálculo en cliente (comportamiento anterior).
          const { data: frescoPre } = await supabase.from('raw_materials').select('stock, precio').eq('id', mpId).single()
          const stockPrevio = Math.max(0, Number(frescoPre?.stock) || 0)
          const precioPrevio = Number(frescoPre?.precio) || 0
          const precioPromedio = (stockPrevio + cantidad) > 0
            ? (stockPrevio * precioPrevio + cantidad * costoLote) / (stockPrevio + cantidad)
            : costoLote
          extra.precio_antes = precioPrevio
          extra.precio_despues = precioPromedio
          if (Math.abs(precioPrevio - precioPromedio) > 0.01) extra.cambio_precio_promedio = true
          extra._precio_promedio_nuevo = precioPromedio   // se aplica abajo junto con lote/vencimiento
        }
      } else if (formMov.tipo === 'salida') {
        if (!(cantidad > 0)) throw new Error('Ingresa una cantidad')
        if (!formMov.motivo) throw new Error('Indica el motivo de la salida')
        let consumidos = [], faltante = 0
        if (formMov.lote_id) {
          const r = await consumirLote({ lote_id: parseInt(formMov.lote_id), cantidad, ajustarStock: true })
          consumidos = r.consumidos; faltante = r.faltante; stockYaAjustado = !!r.stockAjustado
        } else {
          const r = await consumirPEPS({ mp_id: mpId, cantidad, ajustarStock: true })
          consumidos = r.consumidos; faltante = r.faltante; stockYaAjustado = !!r.stockAjustado
        }
        if (consumidos.length) extra.lotes_consumidos = consumidos
        if (faltante > 0) extra.faltante_sin_lote = faltante
        extra.motivo = formMov.motivo
        const cp = costoPEPS(consumidos, faltante, mp?.precio || 0)
        costoMovimiento = cp.costoUnitario
        extra.costo_peps_total = Math.round(cp.costoTotal)
        obsFinal = `[${motivoLabel(formMov.motivo)}] ${formMov.obs || ''}`.trim()
      } else {
        throw new Error('Tipo de movimiento no válido')
      }

      const precioPromedioNuevo = extra._precio_promedio_nuevo
      delete extra._precio_promedio_nuevo

      const movBase = {
        mp_id: mpId, tipo: formMov.tipo, cantidad, fecha: fechaHoy,
        responsable: formMov.responsable, obs: obsFinal,
        lote: loteNombre, vencimiento: vencMov, extra,
      }
      let { error: movErr } = await supabase.from('inventory_movements').insert({ ...movBase, costo_unitario: costoMovimiento })
      if (movErr && /costo_unitario/i.test(movErr.message || '')) {
        ;({ error: movErr } = await supabase.from('inventory_movements').insert(movBase))
      }
      if (movErr) throw movErr
      if (mp) {
        if (!stockYaAjustado) {
          const delta = formMov.tipo === 'salida' ? -cantidad : cantidad
          await supabase.rpc('ajustar_stock_mp', { p_mp_id: mpId, p_delta: delta })
        }
        const upd = {}
        if (formMov.tipo === 'entrada') {
          if (formMov.lote) upd.lote = formMov.lote
          if (formMov.vencimiento) upd.vencimiento = formMov.vencimiento
          // Siempre actualiza el promedio ponderado con el costo del lote ingresado
          if (precioPromedioNuevo != null) upd.precio = precioPromedioNuevo
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

  // ---- Anular un movimiento equivocado del historial ----
  // No se "edita" el movimiento (rehacer el ajuste de stock y lotes sería frágil): se REVIERTE.
  // Un movimiento ya anulado, generado por otra anulación, un consumo de orden o una baja de lote
  // no se puede anular desde aquí, porque su reverso vive en el módulo que lo creó.
  const [anularMov, setAnularMov] = useState(null)
  const puedeAnular = (mv) => {
    if (!esAdmin) return false
    const ex = mv.extra || {}
    if (ex.anulado || ex.anulacion || ex.orden_id || ex.baja_lote || ex.ajuste_ingrediente) return false
    return true
  }
  const anularMovimiento = useMutation({
    mutationFn: async (mv) => {
      const mp = mps.find(m => m.id === mv.mp_id)
      if (!mp) throw new Error('Materia prima no encontrada')
      const cant = Number(mv.cantidad) || 0
      const ex = mv.extra || {}
      // Ajuste de conteo (corrección PEPS): restaurar cantidad_antes; corregirCantidadLote ya mueve el stock.
      if (ex.correccion_lote && ex.lote_id != null && ex.cantidad_antes != null) {
        await corregirCantidadLote({ lote_id: ex.lote_id, cantidad_nueva: Number(ex.cantidad_antes) })
      } else {
        // El reverso del efecto en stock: entrada sumó → resta; salida restó → suma.
        // Ajuste legacy (sin correccion_lote) guarda el delta con signo en cantidad.
        const signoOriginal = mv.tipo === 'salida' ? -1 : 1
        const delta = mv.tipo === 'ajuste' ? -cant : -(signoOriginal * cant)
        await supabase.rpc('ajustar_stock_mp', { p_mp_id: mv.mp_id, p_delta: delta })
        try {
          if (Array.isArray(ex.lotes_consumidos) && ex.lotes_consumidos.length) {
            const porId = ex.lotes_consumidos.filter(lc => lc.id && (Number(lc.cantidad) || 0) > 0)
            if (porId.length) {
              await reponerCantidadesLotes(porId)
            } else {
              for (const lc of ex.lotes_consumidos) {
                if (!lc.lote) continue
                const { data: ls } = await supabase.from('raw_material_lots').select('*')
                  .eq('mp_id', mv.mp_id).eq('lote', lc.lote).limit(1)
                const l = ls?.[0]
                if (l) await supabase.from('raw_material_lots').update({
                  cantidad_actual: (Number(l.cantidad_actual) || 0) + (Number(lc.cantidad) || 0),
                }).eq('id', l.id)
              }
            }
          } else if (mv.tipo === 'entrada') {
            let loteId = ex.lote_id
            if (!loteId && mv.lote) {
              const { data: ls } = await supabase.from('raw_material_lots').select('id')
                .eq('mp_id', mv.mp_id).eq('lote', mv.lote).order('fecha_entrada', { ascending: false }).limit(1)
              loteId = ls?.[0]?.id
            }
            if (loteId) await reducirLote({ lote_id: loteId, cantidad: Math.abs(cant) })
          }
        } catch (e) { console.warn('No se pudo revertir el lote del movimiento:', e) }
      }
      // Marca el original como anulado y crea un contra-asiento visible en el historial
      await supabase.from('inventory_movements').update({ extra: { ...ex, anulado: true, anulado_por: profile?.nombre || '', anulado_el: new Date().toISOString() } }).eq('id', mv.id)
      const contra = {
        mp_id: mv.mp_id, tipo: mv.tipo === 'entrada' ? 'salida' : mv.tipo === 'salida' ? 'entrada' : 'ajuste',
        cantidad: mv.tipo === 'ajuste' ? -cant : cant, fecha: new Date().toISOString().split('T')[0],
        responsable: profile?.nombre || '', obs: `[Anulación de movimiento del ${fFecha(mv.fecha)}] ${mv.obs || ''}`.trim(),
        lote: mv.lote || '', vencimiento: mv.vencimiento || null, extra: { anulacion: true, anula_id: mv.id },
      }
      let { error: cErr } = await supabase.from('inventory_movements').insert({ ...contra, costo_unitario: mv.costo_unitario || 0 })
      if (cErr && /costo_unitario/i.test(cErr.message || '')) await supabase.from('inventory_movements').insert(contra)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['inventory_movements'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] })
      setAnularMov(null); toast('Movimiento anulado — stock revertido ✓')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  // Alinea PEPS al stock (no al revés): si hay stock sin lotes, crea "sin lote";
  // si sobran lotes, los consume. El stock de la ficha no se toca. Solo admin.
  //
  // Núcleo reutilizable (por ítem y para "Igualar todas"). Con estricto=true lanza si el hueco es
  // una reserva de orden (no un descuadre); con estricto=false simplemente lo omite (return null).
  const reconciliarUnaMP = async (mp, { estricto = true } = {}) => {
    const d = descuadrePEPS(mp)
    if (!d || !d.igualar) {
      if (estricto && d && !d.igualar) throw new Error('Ese hueco es una reserva de orden, no un descuadre. Míralo en Reservas MP.')
      return null
    }
    const r = await sincronizarPEPSAlStock({
      mp_id: mp.id,
      stock: d.stock,
      costo_unitario: mp.precio || 0,
      creado_por: profile?.nombre || '',
    })
    const movBase = {
      mp_id: mp.id, tipo: 'ajuste', cantidad: 0,
      fecha: new Date().toISOString().split('T')[0],
      responsable: profile?.nombre || '',
      obs: r.accion === 'crear_sin_lote' || r.accion === 'sumar_sin_lote'
        ? `[PEPS] Creado/ajustado lote "${LOTE_SIN_CODIGO}" por ${fBase(Math.abs(d.diff), mp.unidad)} (stock ${fBase(d.stock, mp.unidad)})`
        : r.accion === 'consumir_exceso'
          ? `[PEPS] Consumidos ${fBase(Math.abs(d.diff), mp.unidad)} de lotes para igualar al stock ${fBase(d.stock, mp.unidad)}`
          : `[PEPS] Ya cuadraba`,
      extra: {
        reconciliacion_peps: true, accion: r.accion,
        stock: d.stock, lotes_antes: d.porLotes, diff: d.diff, lote_id: r.lote_id || null,
      },
    }
    const { error } = await supabase.from('inventory_movements').insert(movBase)
    if (error && !/inventory_movements/i.test(error.message || '')) throw error
    return r
  }

  const reconciliarPEPS = useMutation({
    mutationFn: (mp) => reconciliarUnaMP(mp, { estricto: true }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['raw_materials'] })
      qc.invalidateQueries({ queryKey: ['inventory_movements'] })
      qc.invalidateQueries({ queryKey: ['raw_material_lots'] })
      const msg = r?.accion === 'crear_sin_lote' ? 'Registro PEPS "sin lote" creado ✓'
        : r?.accion === 'sumar_sin_lote' ? 'Lote "sin lote" actualizado ✓'
        : r?.accion === 'consumir_exceso' ? 'Exceso de lotes consumido — PEPS = stock ✓'
        : 'PEPS ya cuadraba ✓'
      toast(msg)
    },
    onError: (e) => toast(e.message, 'error'),
  })

  // Materias primas con un descuadre SEGURO de igualar (no reservas de orden): stock ≠ Σ lotes por
  // una causa clara. Es lo que el botón "Igualar todas" resuelve de una sola vez.
  const descuadresSeguros = useMemo(
    () => mps.filter(m => { const d = descuadrePEPS(m); return d && d.igualar }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mps, lotesDB, reservasPorMp],
  )

  // "Igualar todas": aplica la reconciliación a todas las MP con descuadre seguro, una por una.
  // Cada fallo se registra pero no detiene al resto. No toca reservas de orden (estricto=false).
  const reconciliarTodos = useMutation({
    mutationFn: async () => {
      let ok = 0, fallidas = 0
      for (const mp of descuadresSeguros) {
        try { const r = await reconciliarUnaMP(mp, { estricto: false }); if (r) ok++ }
        catch (e) { fallidas++; console.warn('No se pudo igualar PEPS de', mp?.nombre, e) }
      }
      return { ok, fallidas }
    },
    onSuccess: ({ ok, fallidas }) => {
      qc.invalidateQueries({ queryKey: ['raw_materials'] })
      qc.invalidateQueries({ queryKey: ['inventory_movements'] })
      qc.invalidateQueries({ queryKey: ['raw_material_lots'] })
      toast(fallidas
        ? `Igualadas ${ok} · ${fallidas} con error (revisa una por una)`
        : (ok ? `${ok} materia(s) prima(s) igualadas ✓` : 'No había descuadres por igualar'))
    },
    onError: (e) => toast(e.message, 'error'),
  })

  // ---- Dar de baja un lote PEPS (vencido, dañado, contaminado…) ----
  // Descuento atómico de lote + stock (RPC v137). Luego deja el rastro de auditoría.
  const darBajaLote = useMutation({
    mutationFn: async () => {
      const l = bajaLote?.lote, mp = bajaLote?.mp
      if (!l || !mp) throw new Error('Lote no válido')
      const cant = parseFloat(bajaForm.cantidad) || 0
      const disp = Number(l.cantidad_actual) || 0
      if (!(cant > 0)) throw new Error('Ingresa la cantidad a dar de baja')
      if (cant > disp + 0.0001) throw new Error(`No puedes dar de baja más de lo disponible en el lote (${fBase(disp, mp.unidad)})`)
      if (!bajaForm.motivo) throw new Error('Indica el motivo de la baja')
      // 1) Lote + stock general en una sola transacción (evita carreras entre dos bajas)
      const baja = await bajarLote({ lote_id: l.id, cantidad: cant })
      // 2) Registro de la baja (auditoría). Tolerante si falta la tabla/migración.
      const motivoTxt = bajaForm.obs.trim() ? `${bajaForm.motivo} — ${bajaForm.obs.trim()}` : bajaForm.motivo
      const { error: bErr } = await supabase.from('lote_bajas').insert({
        lote_id: l.id, mp_id: mp.id, mp_nombre: mp.nombre, lote: baja.lote || l.lote || '',
        cantidad: cant, unidad: mp.unidad, motivo: motivoTxt, vencimiento: baja.vencimiento || l.vencimiento || null,
        creado_por: profile?.nombre || '',
      })
      if (bErr && !/lote_bajas|does not exist|schema cache/i.test(bErr.message || '')) {
        console.warn('No se pudo registrar la baja en lote_bajas:', bErr.message)
      }
      // 3) También como movimiento de inventario, para que aparezca en el historial de la MP
      const movBase = {
        mp_id: mp.id, tipo: 'salida', cantidad: cant, fecha: new Date().toISOString().split('T')[0],
        responsable: profile?.nombre || '', obs: `[Baja de lote ${baja.lote || l.lote || 's/n'}] ${motivoTxt}`,
        lote: baja.lote || l.lote || '', vencimiento: baja.vencimiento || l.vencimiento || null,
        extra: { baja_lote: true, lote_id: l.id, motivo: motivoTxt },
      }
      let { error: mErr } = await supabase.from('inventory_movements').insert({ ...movBase, costo_unitario: baja.costo_unitario || 0 })
      if (mErr && /costo_unitario/i.test(mErr.message || '')) await supabase.from('inventory_movements').insert(movBase)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] }); qc.invalidateQueries({ queryKey: ['inventory_movements'] })
      setBajaLote(null); toast('Lote dado de baja ✓')
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
    if (filtroEstado === 'negativo') return (m.stock || 0) < 0
    if (filtroEstado === 'bajo') return (m.stock || 0) > 0 && (m.stock_min || 0) > 0 && m.stock <= m.stock_min
    if (filtroEstado === 'por_vencer') return tieneLotePorVencer(m)
    return true
  }
  const [buscarMP, setBuscarMP] = useState('')
  const normBusq = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const mpsFiltrados = mps.filter(m => (!filtroCat || m.categoria === filtroCat) && pasaEstado(m)
    && (!buscarMP.trim() || normBusq(m.nombre).includes(normBusq(buscarMP)) || normBusq(m.categoria).includes(normBusq(buscarMP))))
  const pagMP = usePaginacion(mpsFiltrados, { resetDeps: [filtroCat, filtroEstado, buscarMP] })
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
          {(puedeVerStock || puedeEditarInv) && (
            <button className="btn btn-secondary btn-sm" onClick={() => setModalUltMovs(true)}>
              <Ico as={ClipboardList} size={14} />Últimos movimientos
            </button>
          )}
          {esAdmin && <button className="btn btn-secondary btn-sm" title="Ver MP reservada y amarre a cada orden" onClick={() => setModalReservas(true)}><Ico as={Lock} size={14} />Ver reservas MP</button>}
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

      <ReservasMPPanel
        esAdmin={esAdmin}
        mps={mps}
        open={modalReservas}
        onClose={() => setModalReservas(false)}
        historicos={mps.flatMap(m => {
          const d = descuadrePEPS(m)
          return d?.igualar ? [{ mp: m, descuadre: d }] : []
        })}
        igualarPending={reconciliarPEPS.isPending}
        onIgualar={(mp) => {
          const d = descuadrePEPS(mp)
          if (!d?.igualar) return
          confirmar(
            d.diff > 0
              ? `¿Crear/ajustar PEPS "sin lote" por ${fBase(d.diff, mp.unidad)} para "${mp.nombre}"?\nEl stock (${fBase(d.stock, mp.unidad)}) no se modifica.`
              : `¿Consumir ${fBase(Math.abs(d.diff), mp.unidad)} de lotes PEPS de "${mp.nombre}" para igualarlos al stock (${fBase(d.stock, mp.unidad)})?\nEl stock no se modifica.`
          ).then(ok => ok && reconciliarPEPS.mutate(mp))
        }}
      />

      <div className="card">
        <div className="card-title"><Ico as={Package} size={16} />Estado del Inventario</div>
        {esAdmin && descuadresSeguros.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            background: 'rgba(176,125,24,0.10)', border: '1px solid var(--dorado)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 14,
          }}>
            <AlertTriangle size={18} aria-hidden="true" style={{ color: 'var(--tierra)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>
              {descuadresSeguros.length} materia(s) prima(s) con descuadre PEPS que se pueden igualar automáticamente.
            </span>
            <button className="btn btn-sm btn-dorado" style={{ marginLeft: 'auto' }} disabled={reconciliarTodos.isPending || reconciliarPEPS.isPending}
              onClick={() => confirmar(
                `¿Igualar de una vez las ${descuadresSeguros.length} materias primas con descuadre PEPS?\n\n` +
                'Alinea los lotes PEPS al stock de cada ficha (crea "sin lote" o consume el exceso). ' +
                'El stock de las fichas NO se modifica. No incluye lo que esté amarrado a órdenes (reservas).',
                { title: 'Igualar todas las PEPS', confirmText: 'Igualar todas' },
              ).then(ok => ok && reconciliarTodos.mutate())}>
              {reconciliarTodos.isPending ? 'Igualando…' : `Igualar todas (${descuadresSeguros.length})`}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-control" style={{ width: 200 }} placeholder="🔍 Buscar materia prima..." value={buscarMP} onChange={e => setBuscarMP(e.target.value)} />
          <label className="form-label" style={{ margin: 0 }}>Categoría:</label>
          <Select className="form-control" value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <label className="form-label" style={{ margin: 0 }}>Estado:</label>
          <Select className="form-control" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todos</option>
            <option value="sin_stock">Sin stock</option>
            <option value="negativo">Stock negativo</option>
            <option value="bajo">Stock bajo</option>
            <option value="por_vencer">Por vencer / vencidas</option>
          </Select>
          {(filtroCat || filtroEstado) && <button className="btn btn-sm btn-secondary" onClick={() => { setFiltroCat(''); setFiltroEstado('') }}>Limpiar filtros</button>}
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--texto-suave)' }}>Clic en una fila para ver su historial</span>
        </div>

        {/* ===== Versión móvil: acordeón ===== */}
        <div className="solo-movil">
          {pagMP.slice.length === 0
            ? <p className="empty-table">Sin materias primas en esta categoría</p>
            : pagMP.slice.map(m => {
              const { label, badge } = getEstadoStock(m.stock || 0, m.stock_min || 0)
              const lv = loteVigente(m)
              const desq = descuadrePEPS(m)
              return (
                <AccordionItem key={m.id}
                  titulo={<>
                    {((m.stock || 0) <= 0 || ((m.stock_min || 0) > 0 && m.stock <= m.stock_min) || desq) && <AlertTriangle size={14} aria-hidden="true" style={{ color: desq ? 'var(--tierra)' : (m.stock || 0) <= 0 ? 'var(--rojo)' : 'var(--dorado)', display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />}
                    {m.nombre} {m.tipo === 'interno' && <span className="badge badge-dorado" style={{ fontSize: '0.6rem' }}>interno</span>}
                    {desq && <span className="badge badge-dorado" style={{ fontSize: '0.6rem', marginLeft: 4 }}>{desq.igualar ? 'PEPS ≠' : 'Reservado'}</span>}
                  </>}
                  sub={<><span className={`badge ${badge}`} style={{ fontSize: '0.62rem' }}>{label}</span> · {fBase(m.stock, m.unidad)}</>}
                >
                  <Fila et="Categoría">{m.categoria}</Fila>
                  <Fila et="Precio">${fNum(m.precio || 0)}{sufijoUnidad(m.unidad)}</Fila>
                  <Fila et="Stock">{fBase(m.stock, m.unidad)}</Fila>
                  {desq && <Fila et="Lotes PEPS">{fBase(desq.porLotes, m.unidad)} <small style={{ color: 'var(--tierra)' }}>(diff {fBase(desq.diff, m.unidad)})</small></Fila>}
                  <Fila et="Stock mín.">{fBase(m.stock_min, m.unidad)}</Fila>
                  <Fila et="Lote">{lv.lote || '—'}</Fila>
                  <Fila et="Vence">{lv.vence ? fFecha(lv.vence) : '—'}</Fila>
                  <div className="acordeon-acciones">
                    {puedeEditarInv && <button className="btn btn-xs btn-primary" onClick={() => openMovimiento(m.id)}>+/− Mov.</button>}
                    <button className="btn btn-xs btn-secondary" onClick={() => openHistorial(m)}>🕑 Historial</button>
                    <button className="btn btn-xs btn-secondary" onClick={() => { setLotesMP(m); setModalLotes(true) }}>Lotes PEPS</button>
                    {esAdmin && desq?.igualar && (
                      <button className="btn btn-xs btn-dorado" disabled={reconciliarPEPS.isPending}
                        onClick={() => confirmar(
                          desq.diff > 0
                            ? `¿Crear/ajustar PEPS "sin lote" por ${fBase(desq.diff, m.unidad)} para "${m.nombre}"?\nEl stock (${fBase(desq.stock, m.unidad)}) no se modifica.`
                            : `¿Consumir ${fBase(Math.abs(desq.diff), m.unidad)} de lotes PEPS de "${m.nombre}" para igualarlos al stock (${fBase(desq.stock, m.unidad)})?\nEl stock no se modifica.\n\nNo uses esto si esa cantidad está amarrada a una orden (mira Reservas MP).`
                        ).then(ok => ok && reconciliarPEPS.mutate(m))}>
                        {desq.diff > 0 ? 'Crear PEPS' : 'Igualar PEPS'}
                      </button>
                    )}
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
              {pagMP.slice.length === 0
                ? <tr><td colSpan={10} className="empty-table">Sin materias primas en esta categoría</td></tr>
                : pagMP.slice.map(m => {
                  const { label, badge } = getEstadoStock(m.stock || 0, m.stock_min || 0)
                  const lv = loteVigente(m)
                  const desq = descuadrePEPS(m)
                  return (
                    <tr key={m.id} style={{ cursor: 'pointer', background: desq ? 'color-mix(in srgb, var(--tierra) 8%, transparent)' : undefined }} onClick={() => openHistorial(m)}>
                      <td>
                        <strong>{m.nombre}</strong>
                        {m.tipo === 'interno' && <span className="badge badge-dorado" style={{ marginLeft: 6, fontSize: '0.7rem' }}>interno</span>}
                        {desq && <span className="badge badge-dorado" style={{ marginLeft: 6, fontSize: '0.7rem' }} title={desq.igualar ? `Stock ${fBase(desq.stock, m.unidad)} vs lotes ${fBase(desq.porLotes, m.unidad)}` : 'El hueco es reserva de una orden (empaque o lote PEPS), no un descuadre'}>{desq.igualar ? 'PEPS ≠' : 'Reservado'}</span>}
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
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {puedeEditarInv && <button className="btn btn-xs btn-primary" onClick={() => openMovimiento(m.id)} title="Compra, salida o ajuste de conteo">+/− Mov.</button>}
                          <button className="btn btn-xs btn-secondary" onClick={() => openHistorial(m)}>🕑</button>
                          <button className="btn btn-xs btn-secondary" title="Lotes (PEPS)" onClick={() => { setLotesMP(m); setModalLotes(true) }}>🧊</button>
                          {esAdmin && desq?.igualar && (
                            <button className="btn btn-xs btn-dorado" disabled={reconciliarPEPS.isPending}
                              title={desq.diff > 0 ? `Crear PEPS "sin lote" por ${fBase(desq.diff, m.unidad)}` : `Igualar lotes al stock`}
                              onClick={() => confirmar(
                                desq.diff > 0
                                  ? `¿Crear/ajustar PEPS "sin lote" por ${fBase(desq.diff, m.unidad)} para "${m.nombre}"?\nEl stock (${fBase(desq.stock, m.unidad)}) no se modifica.`
                                  : `¿Consumir ${fBase(Math.abs(desq.diff), m.unidad)} de lotes PEPS de "${m.nombre}" para igualarlos al stock (${fBase(desq.stock, m.unidad)})?\nEl stock no se modifica.\n\nNo uses esto si esa cantidad está amarrada a una orden (mira Reservas MP).`
                              ).then(ok => ok && reconciliarPEPS.mutate(m))}>
                              {desq.diff > 0 ? 'Crear PEPS' : 'Igualar'}
                            </button>
                          )}
                          {puedeEditarInv && <button className="btn btn-xs btn-secondary" onClick={() => openEditMP(m)} title="Editar"><Pencil size={13} aria-hidden="true" /></button>}
                          {esAdmin && <button className="btn btn-xs btn-danger"
                            disabled={(m.stock || 0) !== 0}
                            title={(m.stock || 0) !== 0 ? 'Tiene stock — no se puede eliminar' : 'Eliminar'}
                            onClick={() => confirmar(`¿Eliminar la materia prima "${m.nombre}"?\nEsta acción no se puede deshacer.`).then(ok => ok && deleteMP.mutate(m))}><X size={13} aria-hidden="true" /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <PaginacionTabla {...pagMP} />
      </div>

      {/* Modal Últimos movimientos (global) */}
      <Modal open={modalUltMovs} onClose={() => setModalUltMovs(false)}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ClipboardList size={18} aria-hidden="true" /> Últimos movimientos</span>}
        size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={() => setModalUltMovs(false)}>Cerrar</button>}
      >
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>MP</th><th>Tipo</th><th>Cantidad</th><th>Lote</th><th>Responsable</th><th>Observación</th></tr></thead>
            <tbody>
              {movimientos.length === 0
                ? <tr><td colSpan={7} className="empty-table">Sin movimientos</td></tr>
                : pagUltMovs.slice.map(mv => {
                    const mp = mps.find(m => m.id === mv.mp_id)
                    return (
                      <tr key={mv.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fFechaHora(mv.created_at || mv.fecha)}</td>
                        <td>{mp?.nombre || `MP #${mv.mp_id}`}</td>
                        <td><span className={`badge ${mv.tipo === 'entrada' ? 'badge-verde' : mv.tipo === 'salida' ? 'badge-rojo' : 'badge-gris'}`}>{mv.tipo}</span></td>
                        <td className="td-number">{fCantMov(mv.cantidad, mp?.unidad)}</td>
                        <td>{mv.lote || '—'}</td>
                        <td>{mv.responsable || '—'}</td>
                        <td>{mv.obs || '—'}</td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
        <PaginacionTabla {...pagUltMovs} />
      </Modal>

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
            <Select className="form-control" value={formMP.tipo} onChange={e => setFormMP(f => ({ ...f, tipo: e.target.value }))}>
              <option value="comprado">Comprado</option>
              <option value="interno">Fabricado internamente</option>
            </Select>
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Unidad de medida</label>
            <Select className="form-control" value={formMP.unidad} onChange={e => setFormMP(f => ({ ...f, unidad: e.target.value }))}>
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </div>
          <div className="form-group">
            <label className="form-label">Precio {porUnidad(formMP.unidad)}</label>
            <MoneyInput value={formMP.precio} onChange={v => setFormMP(f => ({ ...f, precio: v }))} />
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Stock mínimo <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(en {baseLbl(formMP.unidad)})</small></label><input type="number" className="form-control" value={formMP.stock_min} onChange={e => setFormMP(f => ({ ...f, stock_min: e.target.value }))} /></div>
          <div className="form-group">
            <label className="form-label">Stock actual <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(en {baseLbl(formMP.unidad)}{factorU(formMP.unidad) > 1 ? ` · 1 ${formMP.unidad}=${factorU(formMP.unidad)}${baseLbl(formMP.unidad)}` : ''})</small></label>
            <input type="number" className="form-control" value={formMP.stock} disabled={!!editMPId}
              onChange={e => setFormMP(f => ({ ...f, stock: e.target.value }))}
              title={editMPId ? 'El stock solo cambia con +/− Mov. (compra, salida o ajuste de conteo PEPS)' : undefined} />
            {editMPId
              ? <small style={{ color: 'var(--texto-suave)' }}>Solo lectura. Usa <strong>+/− Mov.</strong> → Compra, Salida o <strong>Ajuste de conteo</strong> (corrige un lote PEPS).</small>
              : <small style={{ color: 'var(--texto-suave)' }}>Opcional al crear. Si lo dejas en 0, luego registra una <strong>Compra</strong> (con lote y proveedor).</small>}
          </div>
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

      {/* Modal Movimiento unificado: Compra / Salida / Ajuste de conteo (PEPS) */}
      <Modal open={modalMov} onClose={() => setModalMov(false)} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Package size={18} aria-hidden="true" /> {tituloTipoMov(formMov.tipo)}</span>}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalMov(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardarMovimiento} disabled={saveMov.isPending}>Guardar</button>
          </>
        }
      >
        {(() => {
          const mpSel = mps.find(m => String(m.id) === String(formMov.mp_id))
          const uBase = baseLbl(mpSel?.unidad)
          // En +/− Mov. no listar lotes agotados (0): no aportan a salida ni a ajuste útil.
          const lotesMp = lotesDe(parseInt(formMov.mp_id) || 0).filter(l => (l.cantidad_actual || 0) > 0)
          const loteSel = lotesMp.find(l => String(l.id) === String(formMov.lote_id))
          return (
            <>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Materia Prima</label>
                  <Select className="form-control" value={formMov.mp_id} onChange={e => {
                    const mpId = e.target.value
                    const mp = mps.find(m => String(m.id) === String(mpId))
                    const stockBase = (Number(mp?.stock) || 0) * factorU(mp?.unidad)
                    setFormMov(f => ({
                      ...f, mp_id: mpId, lote_id: '',
                      cantidad: f.tipo === 'ajuste' ? String(stockBase < 0 ? 0 : '') : '',
                    }))
                  }}>
                    <option value="">Seleccionar...</option>
                    {mps.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </Select>
                </div>
                <div className="form-group">
                  <label className="form-label">Motivo / tipo</label>
                  <Select className="form-control" value={formMov.tipo} onChange={e => {
                    const tipo = e.target.value
                    const mp = mps.find(m => String(m.id) === String(formMov.mp_id))
                    const stockBase = (Number(mp?.stock) || 0) * factorU(mp?.unidad)
                    setFormMov(f => ({
                      ...f, tipo, lote_id: '',
                      cantidad: tipo === 'ajuste' ? String(stockBase < 0 ? 0 : '') : '',
                    }))
                  }}>
                    <option value="entrada">Compra / recepción</option>
                    <option value="salida">Salida</option>
                    <option value="ajuste">Ajuste de conteo (PEPS)</option>
                  </Select>
                </div>
              </div>

              {/* Ajuste: primero el lote PEPS, luego la cantidad absoluta */}
              {formMov.tipo === 'ajuste' && (
                <div style={{ background: 'rgba(124,179,66,0.07)', border: '1px solid rgba(124,179,66,0.25)', borderRadius: 'var(--radio)', padding: 10, marginBottom: 8 }}>
                  <div className="form-group">
                    <label className="form-label">Lote PEPS a corregir <small style={{ color: 'var(--rojo)' }}>*</small></label>
                    <Select className="form-control" value={formMov.lote_id} onChange={e => {
                      const id = e.target.value
                      const l = lotesMp.find(x => String(x.id) === String(id))
                      const stockBase = (Number(mpSel?.stock) || 0) * factorU(mpSel?.unidad)
                      setFormMov(f => ({
                        ...f,
                        lote_id: id,
                        cantidad: l
                          ? String((Number(l.cantidad_actual) || 0) * factorU(mpSel?.unidad))
                          : String(stockBase < 0 ? 0 : stockBase),
                      }))
                    }}>
                      <option value="">Stock general (toda la MP → p. ej. 0)</option>
                      {lotesMp.map(l => (
                        <option key={l.id} value={l.id}>
                          Ingreso {fFechaHora(l.created_at || l.fecha_entrada)} · Lote {l.lote || '(s/n)'} · {fBase(l.cantidad_actual, mpSel?.unidad)} disp.
                          {l.vencimiento ? ` · vence ${l.vencimiento}` : ''}
                        </option>
                      ))}
                    </Select>
                    <small style={{ color: 'var(--texto-suave)' }}>
                      {formMov.lote_id
                        ? <>Escribe lo que <strong>queda realmente</strong> en ese lote (no suma ni resta). Puedes dejarlo en <strong>0</strong>.</>
                        : <>Sin lote: fija el <strong>stock general</strong> a esa cantidad (usa <strong>0</strong> si quedó negativo) y alinea PEPS.</>}
                    </small>
                  </div>
                  {loteSel && (
                    <p style={{ fontSize: '0.82rem', margin: '0 0 8px' }}>
                      Disponible hoy: <strong>{fBase(loteSel.cantidad_actual, mpSel?.unidad)}</strong>
                      {(loteSel.cantidad_reservada || 0) > 0 && <> · Reservado: <strong>{fBase(loteSel.cantidad_reservada, mpSel?.unidad)}</strong></>}
                    </p>
                  )}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Cantidad correcta {mpSel && <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(en {uBase})</small>}</label>
                    <input type="number" className="form-control" value={formMov.cantidad} min={0} step="any"
                      onChange={e => setFormMov(f => ({ ...f, cantidad: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* Salida: motivo + lote (opcional), luego cantidad */}
              {formMov.tipo === 'salida' && (
                <div className="form-grid-2" style={{ background: 'rgba(192,57,43,0.05)', border: '1px solid rgba(192,57,43,0.18)', borderRadius: 'var(--radio)', padding: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Motivo de salida <small style={{ color: 'var(--rojo)' }}>*</small></label>
                    <Select className="form-control" value={formMov.motivo} onChange={e => setFormMov(f => ({ ...f, motivo: e.target.value }))}>
                      {MOTIVOS_SALIDA.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </Select>
                  </div>
                  {!esEmpaque(mpSel?.categoria) && (
                    <div className="form-group">
                      <label className="form-label">Lote a descontar</label>
                      <Select className="form-control" value={formMov.lote_id} onChange={e => setFormMov(f => ({ ...f, lote_id: e.target.value }))}>
                        <option value="">Automático (PEPS)</option>
                        {lotesMp.map(l => (
                          <option key={l.id} value={l.id}>
                            Ingreso {fFechaHora(l.created_at || l.fecha_entrada)} · Lote {l.lote || '(s/n)'} · {fBase(l.cantidad_actual, mpSel?.unidad)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {(formMov.tipo === 'entrada' || formMov.tipo === 'salida') && (
                <div className="form-group">
                  <label className="form-label">Cantidad {mpSel && <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(en {uBase})</small>}</label>
                  <input type="number" className="form-control" value={formMov.cantidad} min={0} step="any"
                    onChange={e => setFormMov(f => ({ ...f, cantidad: e.target.value }))} />
                </div>
              )}

              {formMov.tipo === 'entrada' && (
                <div className="form-group">
                  <label className="form-label">Costo {porUnidad(mpSel?.unidad || 'Kg')} <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>— opcional, actualiza el precio de la MP</small></label>
                  <MoneyInput value={formMov.costo} onChange={v => setFormMov(f => ({ ...f, costo: v }))} placeholder={mpSel ? `Actual: $ ${fNum(mpSel.precio)}` : '$ 0'} />
                </div>
              )}

              {formMov.tipo === 'entrada' && !esEmpaque(mpSel?.categoria) && (
                <>
                  <div className="form-grid-2">
                    <div className="form-group"><label className="form-label">Lote</label><input className="form-control" value={formMov.lote} onChange={e => setFormMov(f => ({ ...f, lote: e.target.value }))} placeholder="N° de lote" /></div>
                    <div className="form-group"><label className="form-label">Fecha de vencimiento</label><input type="date" className="form-control" value={formMov.vencimiento || ''} onChange={e => setFormMov(f => ({ ...f, vencimiento: e.target.value }))} /></div>
                  </div>
                </>
              )}

              {formMov.tipo === 'entrada' && (
                  <div className="form-group">
                    <label className="form-label">Proveedor * <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(obligatorio — a quién se le compró)</small></label>
                    <input className="form-control" list="dl-proveedores-mp" value={formMov.proveedor || ''} required onChange={e => setFormMov(f => ({ ...f, proveedor: e.target.value }))} placeholder="Nombre del proveedor" />
                    <datalist id="dl-proveedores-mp">{proveedoresConocidos.map(p => <option key={p} value={p} />)}</datalist>
                  </div>
              )}

              <div className="form-group"><label className="form-label">Responsable</label><input className="form-control" value={formMov.responsable} onChange={e => setFormMov(f => ({ ...f, responsable: e.target.value }))} placeholder="Nombre del responsable" /></div>
              <div className="form-group"><label className="form-label">Observación</label><textarea className="form-control" rows={2} value={formMov.obs} onChange={e => setFormMov(f => ({ ...f, obs: e.target.value }))} /></div>
              {formMov.tipo !== 'ajuste' && !esEmpaque(mpSel?.categoria) && <CamposExtra value={formMov.extra} onChange={extra => setFormMov(f => ({ ...f, extra }))} />}
            </>
          )
        })()}
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

      {/* Modal Lotes PEPS por MP — listado reciente→antiguo, máx. 10 por página */}
      <Modal open={modalLotes} onClose={() => setModalLotes(false)} title={`Lotes PEPS — ${lotesMP?.nombre || ''}`} size="modal-xl">
        {lotesMP && (() => {
          const activos = lotesDe(lotesMP.id).filter(l => (l.cantidad_actual || 0) > 0)
          const totalLotes = stockLotes(lotesMP.id)
          const desfase = Math.round((totalLotes - (lotesMP.stock || 0)) * 100) / 100
          const badgeEst = (l) => {
            const est = estadoLote(l.vencimiento)
            const agotado = (l.cantidad_actual || 0) <= 0
            if (agotado) return <span className="badge">Agotado</span>
            if (est === 'vencido') return <span className="badge badge-rojo">Vencido</span>
            if (est === 'por_vencer') return <span className="badge badge-dorado">Por vencer</span>
            return <span className="badge badge-verde">Vigente</span>
          }
          const darBaja = (l) => {
            const est = estadoLote(l.vencimiento)
            setBajaLote({ lote: l, mp: lotesMP })
            setBajaForm({ cantidad: String(l.cantidad_actual || ''), motivo: est === 'vencido' ? 'vencido' : 'dañado', obs: '' })
          }
          return (
            <>
              <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', margin: '0 0 10px' }}>
                Saldo en lotes: <strong>{fBase(totalLotes, lotesMP.unidad)}</strong>
                {desfase !== 0 && <span style={{ color: 'var(--rojo)' }}> · difiere del stock ({fNum(lotesMP.stock || 0)}) en {fNum(desfase)}</span>}
                {' · '}Las salidas siguen PEPS (vence primero). Ajuste de conteo en +/− Mov.; vencido o dañado: papelera.
              </p>
              <div className="solo-movil">
                {pagLotes.slice.length === 0
                  ? <p className="empty-table">Sin lotes. Registra una entrada para crear el primero.</p>
                  : pagLotes.slice.map((l) => {
                    const agotado = (l.cantidad_actual || 0) <= 0
                    return (
                      <AccordionItem
                        key={l.id}
                        titulo={<span style={{ opacity: agotado ? 0.55 : 1 }}>{l.lote || 's/lote'}</span>}
                        sub={<>{fBase(l.cantidad_actual, lotesMP.unidad)} · {badgeEst(l)}</>}
                      >
                        <Fila et="Disponible"><strong>{fBase(l.cantidad_actual, lotesMP.unidad)}</strong></Fila>
                        <Fila et="Reservado">{(l.cantidad_reservada || 0) > 0 ? fBase(l.cantidad_reservada, lotesMP.unidad) : '—'}</Fila>
                        <Fila et="Inicial">{fBase(l.cantidad_inicial, lotesMP.unidad)}</Fila>
                        <Fila et="Vence">{l.vencimiento ? fFecha(l.vencimiento) : '—'}</Fila>
                        <Fila et="Ingreso">{fFechaHora(l.created_at || l.fecha_entrada)}</Fila>
                        <Fila et="Proveedor">{l.proveedor || '—'}</Fila>
                        <Fila et="Costo/u">{l.costo_unitario ? fNum(l.costo_unitario) : '—'}</Fila>
                        {!agotado && (
                          <div className="acordeon-acciones">
                            <button className="btn btn-xs btn-danger" onClick={() => darBaja(l)}>
                              <Ico as={Trash2} size={13} />Dar de baja
                            </button>
                          </div>
                        )}
                      </AccordionItem>
                    )
                  })}
              </div>
              <div className="table-wrap solo-desktop">
                <table>
                  <thead>
                    <tr>
                      <th className="col-opcional-2">#</th>
                      <th>Lote</th>
                      <th className="col-opcional">Ingreso</th>
                      <th className="col-opcional">Proveedor</th>
                      <th>Vence</th>
                      <th className="td-number col-opcional">Inicial</th>
                      <th className="td-number">Disponible</th>
                      <th className="td-number col-opcional-2">Reservado</th>
                      <th className="td-number col-opcional">Costo/u</th>
                      <th>Estado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotesModalOrdenados.length === 0
                      ? <tr><td colSpan={11} className="empty-table">Sin lotes. Registra una entrada para crear el primero.</td></tr>
                      : pagLotes.slice.map((l) => {
                        const agotado = (l.cantidad_actual || 0) <= 0
                        return (
                          <tr key={l.id} style={{ opacity: agotado ? 0.5 : 1 }}>
                            <td className="col-opcional-2">{agotado ? '—' : activos.indexOf(l) + 1}</td>
                            <td><strong>{l.lote || '—'}</strong></td>
                            <td className="col-opcional" title={l.created_at || l.fecha_entrada}>{fFecha((l.created_at || l.fecha_entrada || '').toString().slice(0, 10))}</td>
                            <td className="col-opcional">{l.proveedor || '—'}</td>
                            <td>{l.vencimiento ? fFecha(l.vencimiento) : '—'}</td>
                            <td className="td-number col-opcional">{fBase(l.cantidad_inicial, lotesMP.unidad)}</td>
                            <td className="td-number"><strong>{fBase(l.cantidad_actual, lotesMP.unidad)}</strong></td>
                            <td className="td-number col-opcional-2">{(l.cantidad_reservada || 0) > 0 ? <span style={{ color: 'var(--tierra)' }}>{fBase(l.cantidad_reservada, lotesMP.unidad)}</span> : '—'}</td>
                            <td className="td-number col-opcional">{l.costo_unitario ? fNum(l.costo_unitario) : '—'}</td>
                            <td>{badgeEst(l)}</td>
                            <td>
                              {!agotado && (
                                <button className="btn btn-xs btn-danger" title="Dar de baja (vencido, dañado…)" onClick={() => darBaja(l)}>
                                  <Ico as={Trash2} size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
              <PaginacionTabla {...pagLotes} tamanos={[10]} />
            </>
          )
        })()}
      </Modal>

      {/* Modal Anular movimiento */}
      <Modal open={!!anularMov} onClose={() => setAnularMov(null)} title="↩ Anular movimiento"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setAnularMov(null)}>Cancelar</button>
          <button className="btn btn-danger" onClick={() => anularMovimiento.mutate(anularMov)} disabled={anularMovimiento.isPending}>{anularMovimiento.isPending ? 'Anulando…' : 'Anular y revertir'}</button>
        </>}>
        {anularMov && (
          <div style={{ fontSize: '0.88rem' }}>
            <p>Vas a anular este movimiento:</p>
            <div style={{ background: 'var(--crema)', borderRadius: 'var(--radio)', padding: 10, marginBottom: 12 }}>
              <div><strong>{anularMov.tipo}</strong> de <strong>{fCantMov(anularMov.cantidad, histMP?.unidad)}</strong> · {fFecha(anularMov.fecha)}</div>
              {anularMov.lote && <div>Lote: {anularMov.lote}</div>}
              {anularMov.obs && <div style={{ color: 'var(--texto-suave)' }}>{anularMov.obs}</div>}
            </div>
            <div className="alert alert-warning" style={{ fontSize: '0.82rem' }}>
              Se revertirá el efecto en el stock {anularMov.tipo === 'entrada' ? '(se descuenta lo que había sumado)' : '(se devuelve lo que había restado)'}
              {(anularMov.lote || anularMov.extra?.lotes_consumidos) && ' y en los lotes involucrados'}.
              Queda un registro de anulación en el historial; el movimiento original no se borra.
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!bajaLote} onClose={() => setBajaLote(null)} title={`🗑 Dar de baja lote — ${bajaLote?.mp?.nombre || ''}`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setBajaLote(null)}>Cancelar</button>
          <button className="btn btn-danger" onClick={() => darBajaLote.mutate()} disabled={darBajaLote.isPending}>{darBajaLote.isPending ? 'Guardando…' : 'Dar de baja'}</button>
        </>}>
        {bajaLote && (
          <div>
            <p style={{ fontSize: '0.85rem' }}>
              Lote <strong>{bajaLote.lote.lote || '(s/n)'}</strong> · Disponible: <strong>{fBase(bajaLote.lote.cantidad_actual, bajaLote.mp.unidad)}</strong>
              {bajaLote.lote.vencimiento && <> · Vence {fFecha(bajaLote.lote.vencimiento)}</>}
            </p>
            <div className="form-group">
              <label className="form-label">Cantidad a dar de baja ({baseLbl(bajaLote.mp.unidad)})</label>
              <input type="number" className="form-control" value={bajaForm.cantidad} min={0} max={bajaLote.lote.cantidad_actual} step="any"
                onChange={e => setBajaForm(f => ({ ...f, cantidad: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Motivo</label>
              <Select className="form-control" value={bajaForm.motivo} onChange={e => setBajaForm(f => ({ ...f, motivo: e.target.value }))}>
                <option value="vencido">Vencido</option>
                <option value="dañado">Dañado / deteriorado</option>
                <option value="contaminado">Contaminado</option>
                <option value="derrame">Derrame / pérdida física</option>
                <option value="otro">Otro</option>
              </Select>
            </div>
            <div className="form-group">
              <label className="form-label">Observación <small style={{ fontWeight: 400, color: 'var(--texto-suave)' }}>(opcional)</small></label>
              <input className="form-control" value={bajaForm.obs} onChange={e => setBajaForm(f => ({ ...f, obs: e.target.value }))} placeholder="Detalle de lo ocurrido" />
            </div>
            <div className="alert alert-warning" style={{ fontSize: '0.8rem' }}>
              Se descontará del lote y del stock general de la materia prima. Queda registrado con tu nombre y la fecha.
            </div>
          </div>
        )}
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
              <div><strong>Precio promedio:</strong> ${fNum(histMP.precio || 0)}</div>
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
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th className="td-number">Costo/u</th><th>Lote</th><th className="col-opcional">Proveedor</th><th className="col-opcional">Vence</th><th>Responsable</th><th className="col-opcional">Obs</th>{esAdmin && <th></th>}</tr></thead>
                <tbody>
                  {histMovs.length === 0
                    ? <tr><td colSpan={esAdmin ? 10 : 9} className="empty-table">Sin movimientos registrados</td></tr>
                    : histMovs.map(mv => {
                      const anulado = mv.extra?.anulado
                      const costoU = mv.costo_unitario != null && mv.costo_unitario !== '' ? Number(mv.costo_unitario) : null
                      const precioAntes = mv.extra?.precio_antes != null ? Number(mv.extra.precio_antes) : null
                      const precioDespues = mv.extra?.precio_despues != null ? Number(mv.extra.precio_despues) : null
                      const cambioPrecio = precioAntes != null && precioDespues != null && Math.abs(precioAntes - precioDespues) > 0.01
                      return (
                      <tr key={mv.id} style={anulado ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fFechaHora(mv.created_at || mv.fecha)}</td>
                        <td><span className={`badge ${mv.tipo === 'entrada' ? 'badge-verde' : mv.tipo === 'salida' ? 'badge-rojo' : 'badge-gris'}`}>{mv.tipo}</span></td>
                        <td className="td-number">{fCantMov(mv.cantidad, histMP?.unidad)}</td>
                        <td className="td-number" style={{ whiteSpace: 'nowrap' }}>
                          {costoU != null ? `$${fNum(costoU)}` : '—'}
                          {cambioPrecio && (
                            <div style={{ fontSize: '0.68rem', color: 'var(--tierra)' }} title="Promedio ponderado de la ficha MP">
                              avg ${fNum(precioAntes)}→${fNum(precioDespues)}
                            </div>
                          )}
                        </td>
                        <td>{mv.lote || '—'}</td>
                        <td className="col-opcional">{mv.extra?.proveedor || '—'}</td>
                        <td className="col-opcional">{mv.vencimiento ? fFecha(mv.vencimiento) : '—'}</td>
                        <td>{mv.responsable || '—'}</td>
                        <td className="col-opcional">{mv.obs || '—'}{anulado && <span className="badge badge-gris" style={{ marginLeft: 4, fontSize: '0.62rem' }}>anulado</span>}</td>
                        {esAdmin && <td>
                          {puedeAnular(mv)
                            ? <button className="btn btn-xs btn-danger" title="Anular este movimiento y revertir el stock" onClick={() => setAnularMov(mv)}><Ico as={Undo2} size={13} /></button>
                            : null}
                        </td>}
                      </tr>
                    )})}
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

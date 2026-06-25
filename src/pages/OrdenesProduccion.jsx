import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile } from '../lib/supabase'
import { reservarPEPS, liberarReservaLotes, consumirReservaLotes, estadoLote } from '../lib/lotes'
import { writeOrQueue } from '../lib/offlineQueue'
import { getConfig } from '../lib/appConfig'
import { useReorder } from '../hooks/useReorder'
import TimeField from '../components/ui/TimeField'
import { fFecha, fNum, fCOP, componerSurtido } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm, usePrompt } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { notificar } from '../lib/notificaciones'
import Modal from '../components/ui/Modal'

const ESTADO_LABEL = {
  pendiente:  { txt: 'Pendiente',  badge: 'badge-gris' },
  en_proceso: { txt: 'En proceso', badge: 'badge-azul' },
  ejecutada:  { txt: 'Enviada a aprobación', badge: 'badge-dorado' },
  aprobada:   { txt: 'Aprobada',   badge: 'badge-verde' },
  rechazada:  { txt: 'Rechazada',  badge: 'badge-rojo' },
}

const EMPTY_ORDEN = {
  producto: '', origen: 'producto', origen_id: '', es_subproducto: false, mp_id: '',
  cantidad_plan: '', unidad: 'unidades', operario: '', notas_orden: '', unidadesPorBache: 0, lote: '', vence: '', baches_plan: '', inicio: '', es_prueba: false, forzar_sin_lote: false,
  lotes_elegidos: {},   // { [mpId]: loteId }  — lote de MP elegido por el usuario (vacío = PEPS automático)
}

// Mezcla de referencia para planear recetas por ingrediente (se cancela en el cálculo)
const BASE_RECETA = 10000
// Suma meses a la fecha de hoy y devuelve 'YYYY-MM-DD'
// Fecha LOCAL en 'YYYY-MM-DD' (evita el desfase de un día por zona horaria que da toISOString en UTC)
const fechaLocalISO = (d = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const desdeHoyMeses = (meses) => { const d = new Date(); d.setMonth(d.getMonth() + meses); return fechaLocalISO(d) }
// Vencimiento = fecha base (fabricación) + N meses. Si no hay base, usa hoy.
const desdeFechaMeses = (base, meses) => { const d = base ? new Date(base + 'T00:00:00') : new Date(); d.setMonth(d.getMonth() + meses); return fechaLocalISO(d) }
const horaAhora = () => new Date().toTimeString().slice(0, 5)
const hoyISO = () => fechaLocalISO()
const labelMeses = (m) => m % 12 === 0 ? `${m / 12} año${m / 12 > 1 ? 's' : ''}` : `${m} mes${m > 1 ? 'es' : ''}`
const VENCE_OPTS_DEFAULT = [1, 2, 3, 6, 12, 24]
const getVenceOpts = () => { try { const v = JSON.parse(localStorage.getItem('mumi_vence_opts')); return Array.isArray(v) && v.length ? v : VENCE_OPTS_DEFAULT } catch { return VENCE_OPTS_DEFAULT } }
// Botones rápidos (configurables) para fijar la fecha de vencimiento
function QuickVence({ onPick, opts, onEdit, base }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, alignItems: 'center' }}>
      {opts.map(m => (
        <button key={m} type="button" className="btn btn-xs btn-secondary" onClick={() => onPick(desdeFechaMeses(base, m))}>+{labelMeses(m)}</button>
      ))}
      {base && <span style={{ fontSize: '0.66rem', color: 'var(--texto-suave)' }}>(desde fabricación)</span>}
      {onEdit && <button type="button" className="btn btn-xs btn-secondary" title="Personalizar opciones" onClick={onEdit}>⚙</button>}
    </div>
  )
}

export default function OrdenesProduccion() {
  const toast = useToast()
  const confirmar = useConfirm()
  const pedir = usePrompt()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const esAdmin = profile?.rol === 'admin'
  const esOperario = profile?.rol === 'operario'
  const fotoRef = useRef()

  const [modalNueva, setModalNueva] = useState(false)
  const [editOrdenId, setEditOrdenId] = useState(null)   // id de orden en edición (solo si está pendiente)
  // Evidencia firmada de la orden impresa (escaneo o firma digital)
  const [modalEvid, setModalEvid]   = useState(false)
  const [evidOrden, setEvidOrden]   = useState(null)
  const [evidFile, setEvidFile]     = useState(null)
  const [firmaDigital, setFirmaDigital] = useState('')
  const [savingEvid, setSavingEvid] = useState(false)
  // Lote y vencimiento que se completan en Preparar antes de registrar producción
  const [prepLote, setPrepLote] = useState('')
  const [prepVence, setPrepVence] = useState('')
  const [prepFechaInicio, setPrepFechaInicio] = useState('')
  const [prepProcesos, setPrepProcesos] = useState([{ nombre: '', inicio: '', fin: '' }])
  const ordProc = useReorder(setPrepProcesos)
  const [autoguardar, setAutoguardar] = useState(true)
  const [autoSavedAt, setAutoSavedAt] = useState('')
  const [modalProceso, setModalProceso] = useState(false)
  // Resultado de producción capturado en el modal de proceso
  const [prepUnidades, setPrepUnidades] = useState('')
  const [prepPesoFinal, setPrepPesoFinal] = useState('')
  const [prepPesoDesp, setPrepPesoDesp] = useState('')
  const [prepObs, setPrepObs] = useState('')
  const [prepResp, setPrepResp] = useState('')
  const [prepConforme, setPrepConforme] = useState(true)
  const [prepSurtido, setPrepSurtido] = useState(false)
  const [prepLoteMezcla, setPrepLoteMezcla] = useState('')
  const [prepProductoSurtido, setPrepProductoSurtido] = useState('')
  // Subporciones (solo si el producto "se porciona")
  const [prepPorciona, setPrepPorciona] = useState(false)
  const [prepPesoSubp, setPrepPesoSubp] = useState('')
  const [prepCantSubp, setPrepCantSubp] = useState('')
  // Lotes empacados ADICIONALES (sobrantes/saldos de mezcla empacados aparte del lote principal).
  // Cada uno: { lote, vence, unidades, conforme, saldo_id, surtido, lote_mezcla }
  const [prepLotesExtra, setPrepLotesExtra] = useState([])
  // Sobrante de mezcla que NO se empacó y queda como saldo en proceso (en peso)
  const [prepHaySobrante, setPrepHaySobrante] = useState(false)
  const [prepSobrantePeso, setPrepSobrantePeso] = useState('')
  const [prepSobranteUnidad, setPrepSobranteUnidad] = useState('g')
  // Cantidad de unidades/cajas empacadas surtidas (stock del producto terminado surtido)
  const [prepSurtidoCantidad, setPrepSurtidoCantidad] = useState('')
  // Mano de obra por destajo (operarios extra de un día puntual): [{ nombre, modo, cantidad, tarifa }]
  const [prepDestajo, setPrepDestajo] = useState([])
  const destajoTotal = (arr = prepDestajo) => arr.reduce((s, d) => s + (parseFloat(d.cantidad) || 0) * (parseFloat(d.tarifa) || 0), 0)
  const [prepFotoFile, setPrepFotoFile] = useState(null)
  const [prepFotoPrev, setPrepFotoPrev] = useState('')
  const [modalConfirmEnvio, setModalConfirmEnvio] = useState(false)
  const prepFotoRef = useRef()
  // Receta del producto seleccionado en Nueva Orden (para planear por ingrediente disponible)
  const [prodReceta, setProdReceta] = useState(null)   // { ings, unidsBacheNet, bache }
  const [ingIdx, setIngIdx] = useState('')
  const [ingDisp, setIngDisp] = useState('')
  // Opciones rápidas de vencimiento (personalizables, en meses)
  const [venceOpts, setVenceOpts] = useState(getVenceOpts)
  const editarVenceOpts = async () => {
    const actual = venceOpts.join(', ')
    const r = await pedir('Opciones de vencimiento en MESES, separadas por coma (ej: 1, 2, 3, 6, 12, 24):', { defaultValue: actual })
    if (r == null) return
    const arr = r.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
    if (!arr.length) { toast('Ingresa al menos un número de meses válido', 'warning'); return }
    setVenceOpts(arr); localStorage.setItem('mumi_vence_opts', JSON.stringify(arr))
    toast('Opciones de vencimiento actualizadas ✓')
  }
  const [ordenStartNum, setOrdenStartNum] = useState(() => parseInt(localStorage.getItem('mumi_orden_start')) || 1)
  const [modalEjec, setModalEjec]   = useState(false)
  const [modalPrep, setModalPrep]   = useState(false)
  const [ordenPrep, setOrdenPrep]   = useState(null)
  const [prepIngs, setPrepIngs]     = useState([])
  const [prepInfo, setPrepInfo]     = useState(null)
  const [prepDatos, setPrepDatos]   = useState(null)   // datos previstos (mezcla, unidades, costos)
  const [prepFicha, setPrepFicha]   = useState(null)   // { url, nombre } ficha técnica
  const [ordenDetalle, setOrdenDetalle] = useState(null)   // orden para ver detalles
  const [modalAudit, setModalAudit] = useState(false)      // registro de creación (solo admin)
  const [form, setForm]             = useState(EMPTY_ORDEN)
  const [ordenActiva, setOrdenActiva] = useState(null)
  const [ejec, setEjec] = useState({ cantidad_result: '', lote: '', vence: '', fecha_prod: new Date().toISOString().split('T')[0], inicio: '', fin: '', empaque: 'UNIDADES', obs_result: '' })
  const [fotoFile, setFotoFile] = useState(null)
  const [fotoPrev, setFotoPrev] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: ordenes = [] } = useQuery({
    queryKey: ['production_orders'],
    queryFn: async () => { const { data } = await supabase.from('production_orders').select('*').order('created_at', { ascending: false }); return data || [] },
  })

  // Lotes de MP en stock (para sugerencia PEPS y alertas de vencimiento al crear la orden)
  const { data: lotesMP = [] } = useQuery({
    queryKey: ['raw_material_lots'],
    queryFn: async () => { const { data } = await supabase.from('raw_material_lots').select('*').gt('cantidad_actual', 0); return data || [] },
  })
  // Catálogo de productos terminados (para elegir el nombre del surtido — no texto libre)
  const { data: terminados = [] } = useQuery({
    queryKey: ['finished_products'],
    queryFn: async () => { const { data } = await supabase.from('finished_products').select('id, nombre, tipo, activo').eq('activo', true).order('nombre'); return data || [] },
  })

  // Saldos de mezcla en proceso (sobrantes no empacados que esperan empacarse después)
  const { data: saldosMezcla = [] } = useQuery({
    queryKey: ['mezcla_saldos'],
    queryFn: async () => { const { data } = await supabase.from('mezcla_saldos').select('*').eq('estado', 'disponible').gt('peso', 0).order('vencimiento', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }); return data || [] },
  })
  // Saldos disponibles de un producto (por nombre y/o origen_id)
  const saldosDeProducto = (nombre, origenId) => saldosMezcla.filter(s =>
    (origenId && String(s.origen_id) === String(origenId)) || (s.producto && nombre && s.producto === nombre))

  const lotesDeMP = (mpId) => lotesMP.filter(l => String(l.mp_id) === String(mpId))
    .sort((a, b) => ((a.vencimiento || '9999-99-99') < (b.vencimiento || '9999-99-99') ? -1 : a.vencimiento === b.vencimiento ? ((a.fecha_entrada || '') < (b.fecha_entrada || '') ? -1 : 1) : 1))
  const fmtVence = (v) => v ? new Date(v + 'T00:00:00').toLocaleDateString('es-CO') : '—'

  // Estructura del lote: NN+AA (consecutivo del año + año a 2 dígitos). Ej: 0126 = lote 01 de 2026.
  const ultimoLoteOrden = (ordenes.find(o => (o.lote || '').trim()) || {}).lote || ''
  const anioYY = String(new Date().getFullYear()).slice(2)
  // Mayor consecutivo del año actual entre los lotes de las órdenes (formato NN+AA)
  const maxSeqAnio = ordenes
    .map(o => (o.lote || '').trim())
    .filter(l => /^\d{3,4}$/.test(l) && l.slice(-2) === anioYY)
    .map(l => parseInt(l.slice(0, -2)))
    .filter(n => !isNaN(n))
    .reduce((mx, n) => Math.max(mx, n), 0)
  const siguienteLoteSugerido = String(maxSeqAnio + 1).padStart(2, '0') + anioYY

  // Numeración visible de órdenes: secuencial (1,2,3…) por orden de creación, con inicio configurable
  const ordenIdsSorted = useMemo(() => [...ordenes].map(o => o.id).sort((a, b) => a - b), [ordenes])
  const opNum = (id) => {
    const idx = ordenIdsSorted.indexOf(parseInt(id))
    return (idx >= 0 ? idx : 0) + ordenStartNum
  }
  // Cantidad con decimales (para saldos en Kg/g; fNum redondea a entero y no sirve para Kg)
  const fCant = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
  // Producto de un lote (para autocompletar el nombre del surtido según el lote combinado)
  const productoDeLote = (lote) => {
    const k = String(lote || '').trim().split(/[,;]/)[0].trim()
    if (!k) return ''
    const r = prodRecords.find(x => String(x.lote || '').trim() === k)
    if (r?.producto) return r.producto
    const o = ordenes.find(x => String(x.lote || '').trim() === k)
    return o?.producto || ''
  }
  const autoSurtido = (base, loteMezcla) => { const otro = productoDeLote(loteMezcla); return otro ? componerSurtido(base, otro) : '' }
  // Lote de la caja del surtido = el ÚLTIMO lote con el que se empacó (no la fecha de rotulado)
  const loteCaja = (mezcla) => { const ts = String(mezcla || '').split(/[,;]/).map(s => s.trim()).filter(Boolean); return ts[ts.length - 1] || '' }
  const reiniciarNumeracion = async () => {
    const r = await pedir('Número inicial para la numeración de órdenes (la primera orden mostrará este número):', { defaultValue: String(ordenStartNum) })
    if (r == null) return
    const n = parseInt(r)
    if (isNaN(n) || n < 1) { toast('Ingresa un número válido (mayor a 0)', 'warning'); return }
    setOrdenStartNum(n); localStorage.setItem('mumi_orden_start', String(n))
    toast(`Numeración reiniciada desde ${n} ✓`)
  }

  // Si se llega desde un registro de producción con ?verOrden=, abre el detalle de esa orden
  useEffect(() => {
    const id = location.state?.verOrden
    if (id && ordenes.length) {
      const o = ordenes.find(x => x.id === id)
      if (o) setOrdenDetalle(o)
      navigate(location.pathname, { replace: true, state: {} })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, ordenes])

  // Si se llega desde la Calculadora de Recetas con datos precargados, abre Nueva Orden
  useEffect(() => {
    const n = location.state?.nuevaOrden
    if (n) {
      setForm({ ...EMPTY_ORDEN, producto: n.producto || '', origen: n.origen || 'producto', origen_id: n.origen_id || '', cantidad_plan: n.cantidad_plan || '' })
      setProdReceta(null); setIngIdx(''); setIngDisp('')
      setModalNueva(true)
      if (n.origen_id) {
        const val = `${n.origen === 'receta' ? 'recipe' : 'prod'}-${n.origen_id}`
        selectProducto(val, { ancla: n.ancla, cantidad: n.cantidad_ancla })
      }
      navigate(location.pathname, { replace: true, state: {} })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])
  const { data: productos = [] } = useQuery({
    queryKey: ['products_costing'],
    queryFn: async () => { const { data } = await supabase.from('products_costing').select('id, nombre, tipo, bache, costo_final, costo_variable').order('nombre'); return data || [] },
  })
  const { data: recetas = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: async () => { const { data } = await supabase.from('recipes').select('id, nombre').order('nombre'); return data || [] },
  })
  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('estado','activo'); return data || [] },
  })
  const { data: mps = [] } = useQuery({
    queryKey: ['raw_materials'],
    queryFn: async () => { const { data } = await supabase.from('raw_materials').select('id, nombre').order('nombre'); return data || [] },
  })
  // Registros de producción vinculados a órdenes (para habilitar "Enviar y cerrar")
  const { data: prodRecords = [] } = useQuery({
    queryKey: ['production_records'],
    queryFn: async () => { const { data } = await supabase.from('production_records').select('id, orden_id, completado, cantidad, lote'); return data || [] },
  })
  const recordsDeOrden = (id) => prodRecords.filter(r => r.orden_id === id)
  // Últimos 5 lotes guardados (para empaque surtido/mezclado)
  const ultimos5Lotes = [...new Set(ordenes.map(o => o.lote).concat(prodRecords.map(r => r.lote)).filter(Boolean))].slice(0, 5)
  const tieneLoteCompletado = (id) => recordsDeOrden(id).some(r => r.completado)

  // Eliminar orden (solo admin). Si tiene registros vinculados, avisa que también se borran.
  const confirmarEliminarOrden = (o) => {
    // Una orden ya enviada/cerrada consumió MP definitivamente → no se puede eliminar
    if (o.estado === 'ejecutada' || o.estado === 'aprobada') {
      toast('No se puede eliminar una orden ya enviada/cerrada (la materia prima ya fue consumida). Solo puedes rechazarla.', 'warning')
      return
    }
    const n = recordsDeOrden(o.id).length
    const msg = n > 0
      ? `Esta orden ya tiene ${n} registro(s) de producción vinculados.\nSi la eliminas, también se eliminarán esos registros de producción.\n\n¿Eliminar la orden y sus registros?`
      : '¿Eliminar esta orden de producción?'
    confirmar(msg, { title: 'Eliminar orden', confirmText: 'Sí, eliminar' }).then(ok => ok && eliminarOrden.mutate(o))
  }

  // Descargar la ficha técnica del producto
  const descargarFicha = async (storagePath, nombre) => {
    if (!storagePath) { toast('Este producto no tiene ficha técnica', 'warning'); return }
    try {
      const { data, error } = await supabase.storage.from('technical-sheets').download(storagePath)
      if (error) throw error
      const url = URL.createObjectURL(data)
      const a = document.createElement('a'); a.href = url; a.download = nombre || 'ficha_tecnica'
      document.body.appendChild(a); a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 300)
    } catch (err) { toast('Error al descargar: ' + err.message, 'error') }
  }

  // Calcula los datos previstos (mezcla, peso, unidades, costos) a partir de los ingredientes escalados
  const calcDatosPrevistos = (ings, rend, desp, pu) => {
    const totalMezcla = ings.reduce((s, i) => s + (i.gramos || 0), 0)
    const totalCostoMP = ings.reduce((s, i) => s + (i.costo || 0), 0)
    const pesoEsperado = totalMezcla * (rend / 100)
    const pesoDesp = pesoEsperado * (desp / 100)
    const pesoFinal = pesoEsperado - pesoDesp
    const unidades = pu > 0 ? pesoFinal / pu : 0
    const costoMPunidad = unidades > 0 ? totalCostoMP / unidades : 0
    return { totalMezcla, totalCostoMP, pesoEsperado, pesoDesp, pesoFinal, unidades, costoMPunidad, rend, desp, pu }
  }

  // Carga datos de la orden (ingredientes calculados + lote/vence/fecha/procesos)
  const prepararDatos = async (o) => {
    setOrdenPrep(o); setPrepIngs([]); setPrepInfo(null); setPrepDatos(null); setPrepFicha(null)
    setPrepLote(o.lote || ''); setPrepVence(o.vence || '')
    setPrepFechaInicio(o.fecha_inicio || '')
    setPrepDestajo(Array.isArray(o.destajo) ? o.destajo : [])
    // Para recetas (sin ficha) se usan los tiempos guardados; para productos se arman desde la ficha más abajo
    setPrepProcesos(Array.isArray(o.procesos_tiempos) ? o.procesos_tiempos : [])
    const cantidad = parseFloat(o.cantidad_plan) || 0
    const parse = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return [] } }
    if (o.origen === 'producto' && o.origen_id) {
      const { data: prod } = await supabase.from('products_costing').select('bache, peso_unidad, rendimiento, desperdicio, ingredientes, procesos, porciona, peso_subporcion, ficha_url, ficha_nombre').eq('id', o.origen_id).single()
      if (prod) {
        setPrepPorciona(!!prod.porciona)
        setPrepPesoSubp(o.peso_subporcion || prod.peso_subporcion || '')
        // Subprocesos = ÚNICAMENTE los de la mano de obra de la ficha; se conservan las horas ya guardadas (por nombre)
        const saved = Array.isArray(o.procesos_tiempos) ? o.procesos_tiempos : []
        const fichaProcs = parse(prod.procesos).filter(p => (p.nombre || '').trim())
        if (saved.length) {
          // Respeta el ORDEN guardado (incluido el reordenamiento por arrastre) y sus datos
          const result = saved.map(s => ({ nombre: s.nombre, inicio: s.inicio || '', fin: s.fin || '', fecha: s.fecha || '' }))
          fichaProcs.forEach(f => { if (!result.some(r => r.nombre === f.nombre)) result.push({ nombre: f.nombre, inicio: '', fin: '', fecha: '' }) })
          setPrepProcesos(result)
        } else {
          setPrepProcesos(fichaProcs.map(p => ({ nombre: p.nombre, inicio: '', fin: '', fecha: '' })))
        }
        const rend = parseFloat(prod.rendimiento) || 62, desp = parseFloat(prod.desperdicio) || 2, pu = parseFloat(prod.peso_unidad) || 1000
        const ingsRaw = parse(prod.ingredientes)
        // Unidades NETAS que rinde un bache, teniendo en cuenta rendimiento y desperdicio
        const totalMezclaBache = ingsRaw.reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0)
        const unidsBacheNet = pu > 0 ? (totalMezclaBache * (rend / 100) * (1 - desp / 100)) / pu : (parseFloat(prod.bache) || 0)
        // Si la orden se planeó por ingrediente disponible, se usan los baches exactos guardados
        // (evita desajustes por redondeo). Si no, se calculan desde la cantidad pedida.
        const bachesPlan = parseFloat(o.baches_plan) || 0
        const baches = bachesPlan > 0 ? bachesPlan : (unidsBacheNet > 0 ? cantidad / unidsBacheNet : ((parseFloat(prod.bache) || 0) > 0 ? cantidad / parseFloat(prod.bache) : 0))
        const ings = ingsRaw.map(i => {
          const gramos = (parseFloat(i.cantidad) || 0) * baches
          const costo = ((parseFloat(i.precio) || 0) / (parseFloat(i.presentacion) || 1000)) * gramos
          return { nombre: i.nombre, gramos, costo }
        })
        setPrepIngs(ings)
        setPrepInfo({ bache: unidsBacheNet, baches, pesoUnidad: pu })
        setPrepDatos(calcDatosPrevistos(ings, rend, desp, pu))
        setPrepFicha(prod.ficha_url ? { url: prod.ficha_url, nombre: prod.ficha_nombre } : null)
      }
    } else if (o.origen === 'receta' && o.origen_id) {
      const { data: rec } = await supabase.from('recipes').select('ingredientes, rendimiento, desperdicio, peso_unidad, porciona, peso_subporcion, ficha_url, ficha_nombre').eq('id', o.origen_id).single()
      if (rec) {
        setPrepPorciona(!!rec.porciona)
        setPrepPesoSubp(o.peso_subporcion || rec.peso_subporcion || '')
        const rend = parseFloat(rec.rendimiento) || 62, desp = parseFloat(rec.desperdicio) || 2, pu = parseFloat(rec.peso_unidad) || 1000
        const denom = (rend / 100) * (1 - desp / 100)
        // Si se planeó por ingrediente disponible, se usan los baches exactos (mezcla = baches × base) para que la cantidad del ingrediente salga EXACTA
        const bachesPlan = parseFloat(o.baches_plan) || 0
        const totalMezcla = bachesPlan > 0 ? bachesPlan * BASE_RECETA : (denom > 0 ? (cantidad * pu) / denom : 0)
        const ings = parse(rec.ingredientes).map(i => {
          const gramos = totalMezcla * ((parseFloat(i.pct) || 0) / 100)
          const costo = ((parseFloat(i.precio) || 0) / 1000) * gramos
          return { nombre: i.nombre, gramos, costo }
        })
        setPrepIngs(ings)
        setPrepInfo({ totalMezcla, pesoUnidad: pu })
        setPrepDatos(calcDatosPrevistos(ings, rend, desp, pu))
        setPrepFicha(rec.ficha_url ? { url: rec.ficha_url, nombre: rec.ficha_nombre } : null)
      }
    }
  }

  // Abre el modal de Ingredientes (cálculo + impresión)
  const openPreparar = async (o) => { await prepararDatos(o); setModalPrep(true) }
  // Abre el modal de Iniciar proceso (fecha de inicio + tiempos por subproceso, con autoguardado)
  const openProceso = async (o) => {
    setAutoSavedAt('')
    setPrepUnidades(o.cantidad_result || ''); setPrepPesoFinal(o.peso_final || ''); setPrepPesoDesp(o.peso_desperdicio || '')
    setPrepObs(o.obs_result || ''); setPrepResp(o.operario || profile?.nombre || ''); setPrepConforme(true)
    setPrepSurtido(!!o.surtido); setPrepLoteMezcla(o.lote_mezcla || ''); setPrepProductoSurtido(o.producto_surtido || '')
    setPrepPorciona(false); setPrepCantSubp(o.cant_subporciones || '')
    setPrepFotoFile(null); setPrepFotoPrev(o.foto_url || '')
    setPrepLotesExtra([])
    setPrepHaySobrante(!!o.hay_sobrante); setPrepSobrantePeso(o.sobrante_peso || ''); setPrepSobranteUnidad(o.sobrante_unidad || 'g')
    setPrepSurtidoCantidad(o.surtido_cantidad != null ? String(o.surtido_cantidad) : '')
    await prepararDatos(o); setModalProceso(true)
  }

  // El admin diligencia el proceso de una orden abierta. Si aún está pendiente, la pone en
  // proceso y reserva la MP (PEPS) antes de abrir el modal; al confirmar se auto-aprueba.
  const adminDiligenciar = async (o) => {
    try {
      if (o.estado === 'pendiente') {
        const { error } = await supabase.from('production_orders').update({ estado: 'en_proceso' }).eq('id', o.id)
        if (error) throw error
        try { await reservarMP(o) } catch (e) { console.warn('No se pudo reservar MP:', e) }
        qc.invalidateQueries({ queryKey: ['production_orders'] }); qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] })
        o = { ...o, estado: 'en_proceso' }
      }
    } catch (e) { toast(e.message, 'error'); return }
    await openProceso(o)
  }

  // Imprimir la orden con los ingredientes — ajustado a UNA sola página
  // Guarda TODOS los campos del proceso (datos + resultado) en la orden
  const guardarProcesoData = async (silent = true) => {
    if (!ordenPrep) return
    const procs = prepProcesos.filter(p => p.nombre?.trim() || p.inicio || p.fin || p.fecha)
    const inicios = procs.map(p => p.inicio).filter(Boolean).sort()
    const fines = procs.map(p => p.fin).filter(Boolean).sort()
    try {
      const r = await writeOrQueue({ table: 'production_orders', action: 'update', match: { id: ordenPrep.id }, payload: {
        lote: prepLote, vence: prepVence || null, fecha_inicio: prepFechaInicio || null,
        inicio: inicios[0] || null, fin: fines.length ? fines[fines.length - 1] : null,
        procesos_tiempos: procs,
        cantidad_result: prepUnidades !== '' ? (parseFloat(prepUnidades) || 0) : null,
        peso_final: prepPesoFinal !== '' ? (parseFloat(prepPesoFinal) || 0) : null,
        peso_desperdicio: prepPesoDesp !== '' ? (parseFloat(prepPesoDesp) || 0) : null,
        peso_subporcion: prepPorciona && prepPesoSubp !== '' ? (parseFloat(prepPesoSubp) || 0) : null,
        cant_subporciones: prepPorciona && prepCantSubp !== '' ? (parseFloat(prepCantSubp) || 0) : null,
        obs_result: prepObs || null, surtido: prepSurtido, lote_mezcla: prepSurtido ? (prepLoteMezcla || null) : null, producto_surtido: prepSurtido ? (prepProductoSurtido || null) : null,
        surtido_cantidad: prepSurtido && prepSurtidoCantidad !== '' ? (parseFloat(prepSurtidoCantidad) || 0) : null,
        hay_sobrante: prepHaySobrante, sobrante_peso: prepHaySobrante && prepSobrantePeso !== '' ? (parseFloat(prepSobrantePeso) || 0) : null, sobrante_unidad: prepHaySobrante ? prepSobranteUnidad : null,
        destajo: prepDestajo.filter(d => d.nombre?.trim() || d.cantidad || d.tarifa),
      } })
      setAutoSavedAt(new Date().toLocaleTimeString('es-CO'))
      qc.invalidateQueries({ queryKey: ['production_orders'] })
      if (!silent) toast(r.queued ? 'Progreso guardado sin conexión — se sincronizará 📴' : 'Guardado ✓')
    } catch (e) { if (!silent) toast(e.message, 'error') }
  }

  // Autoguardado (debounce) de TODOS los campos del modal de proceso
  useEffect(() => {
    if (!modalProceso || !autoguardar || !ordenPrep) return
    const t = setTimeout(() => guardarProcesoData(true), 1200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepLote, prepVence, prepFechaInicio, prepProcesos, prepUnidades, prepPesoFinal, prepPesoDesp, prepPesoSubp, prepCantSubp, prepObs, prepSurtido, prepLoteMezcla, prepProductoSurtido, prepSurtidoCantidad, prepHaySobrante, prepSobrantePeso, prepSobranteUnidad, prepResp, prepConforme, prepLotesExtra, prepDestajo, autoguardar, modalProceso])

  // Registra la orden en el libro "Orden de Producción" (PTZ-OR-01) con la evidencia firmada.
  const registrarOrdenEnLibro = async (o, file, firma) => {
    const { data: plant } = await supabase.from('registro_plantillas').select('*').or('codigo.eq.PTZ-OR-01,nombre.ilike.%orden de produc%').limit(1).maybeSingle()
    if (!plant) { toast('No existe el libro PTZ-OR-01. Pídele al admin "Cargar plantillas base" en Libros de Registro.', 'warning'); return false }
    let storage_path = null, storage_url = null, archivo_nombre = null
    if (file) {
      const ext = file.name.split('.').pop()
      storage_path = `registros/${plant.id}/orden_${o.id}_${Date.now()}.${ext}`
      storage_url = await uploadFile('documentos', storage_path, file)
      archivo_nombre = file.name
    }
    const today = new Date().toISOString().split('T')[0]
    const map = {
      producto: o.producto, cantidad: o.cantidad_plan, cantidad_plan: o.cantidad_plan, unidad: o.unidad,
      operario: o.operario, responsable: o.operario, lote: o.lote || '', notas: o.notas_orden || '', fecha: today,
    }
    const datos = { orden_id: o.id, codigo_orden: `OP-${opNum(o.id)}` }
    ;(Array.isArray(plant.campos) ? plant.campos : []).forEach(c => { datos[c.key] = map[c.key] ?? '' })
    if (firma) datos.firma_digital = firma
    // Evitar duplicados: si ya existe registro de esta orden, actualiza la evidencia
    const { data: existe } = await supabase.from('registro_entradas').select('id').eq('plantilla_id', plant.id).filter('datos->>orden_id', 'eq', String(o.id)).limit(1)
    if (existe && existe.length) {
      await supabase.from('registro_entradas').update({ datos, storage_path, storage_url, archivo_nombre, observaciones: firma ? `Firma digital: ${firma}` : `Evidencia adjunta` }).eq('id', existe[0].id)
    } else {
      await supabase.from('registro_entradas').insert({
        plantilla_id: plant.id, fecha: today, datos, responsable: o.operario || '',
        observaciones: firma ? `Firma digital: ${firma}` : `Evidencia adjunta`, storage_path, storage_url, archivo_nombre, creado_por: profile?.nombre || '',
      })
    }
    qc.invalidateQueries({ queryKey: ['registro_entradas'] })
    return true
  }

  const confirmarEvidencia = async () => {
    if (!evidFile && !firmaDigital.trim()) { toast('Sube el archivo escaneado y firmado, o registra la firma digital', 'warning'); return }
    setSavingEvid(true)
    try {
      const ok = await registrarOrdenEnLibro(evidOrden, evidFile, firmaDigital.trim())
      if (ok) { toast('Orden registrada con evidencia en PTZ-OR-01 ✓'); setModalEvid(false) }
    } catch (e) { toast(e.message, 'error') } finally { setSavingEvid(false) }
  }

  const imprimirOrden = () => {
    const o = ordenPrep; if (!o) return
    const g = (n) => (n || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })
    const filas = prepIngs.map(i => `<tr><td>${i.nombre}</td><td class="r">${g(i.gramos)} g</td></tr>`).join('')
    const totalG = prepIngs.reduce((s, i) => s + (i.gramos || 0), 0)
    const d = prepDatos
    const datosHtml = d ? `
      <div class="datos">
        <span>Mezcla total: <b>${g(d.totalMezcla)} g</b></span>
        <span>Peso esperado: <b>${g(d.pesoEsperado)} g</b></span>
        <span>Desperdicio: <b>${g(d.pesoDesp)} g</b></span>
        <span>Unidades estimadas: <b>${(d.unidades||0).toFixed(1)}</b></span>
        <span>Costo MP: <b>$ ${Math.round(d.totalCostoMP).toLocaleString('es-CO')}</b></span>
      </div>` : ''
    const fecha = new Date().toLocaleDateString('es-CO')
    const emision = o.created_at ? new Date(o.created_at).toLocaleDateString('es-CO') : fecha
    const fabIni = prepFechaInicio || o.fecha_inicio || ''
    const fabricacion = fabIni ? new Date(fabIni + 'T00:00:00').toLocaleDateString('es-CO') : ''
    const cfg = getConfig()
    // Rótulo del producto final (incluye el caso de empaque surtido / combinado con otro lote)
    const ddmmaa = (s) => { if (!s) return 'ddmmaa'; const [y, m, dd] = s.split('-'); return `${dd}${m}${y.slice(2)}` }
    const rotLote = prepLote || o.lote || ''
    const rotVence = prepVence || o.vence || ''
    const esSurtido = prepSurtido || o.surtido
    const loteMezcla = prepLoteMezcla || o.lote_mezcla || ''
    const rotuladoHtml = `
      <div class="seccion">ROTULADO DEL PRODUCTO FINAL</div>
      <table class="campos">
        ${esSurtido ? `
          <tr><td class="lbl">Lote producto</td><td><b>${rotLote || '(lote original)'}</b> — mantiene el formato del lote original</td></tr>
          <tr><td class="lbl">Lote de la caja</td><td><b>${loteCaja(loteMezcla) || rotLote || '(sin especificar)'}</b> (último lote del surtido)</td></tr>
          <tr><td class="lbl">Empacado surtido con lote(s)</td><td><b>${loteMezcla || '(sin especificar)'}</b></td></tr>
          <tr><td class="lbl">Vence (Exp.)</td><td><b>${ddmmaa(rotVence)}</b> (ddmmaa)</td></tr>
        ` : `
          <tr><td class="lbl">Lote (Lot.)</td><td><b>${rotLote || '(el lote ingresado)'}</b></td></tr>
          <tr><td class="lbl">Vence (Exp.)</td><td><b>${ddmmaa(rotVence)}</b> (ddmmaa)</td></tr>
        `}
      </table>`
    const filasPrev = d ? `
      <table class="prev"><tbody>
        <tr><td>Mezcla total</td><td class="r"><b>${g(d.totalMezcla)} g</b></td><td>Peso esperado</td><td class="r"><b>${g(d.pesoEsperado)} g</b></td></tr>
        <tr><td>Desperdicio</td><td class="r"><b>${g(d.pesoDesp)} g</b></td><td>Unidades estimadas</td><td class="r"><b>${(d.unidades||0).toFixed(1)}</b></td></tr>
        <tr><td>Costo MP</td><td class="r"><b>$ ${Math.round(d.totalCostoMP||0).toLocaleString('es-CO')}</b></td><td>Peso obtenido</td><td class="r" style="min-width:60px"></td></tr>
      </tbody></table>` : ''
    const procRows = (prepProcesos || []).filter(p => p.nombre?.trim() || p.inicio || p.fin)
    const fmtF = (f) => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-CO') : ''
    const filasProc = procRows.length ? `<div class="seccion">TIEMPOS POR PROCESO / SUBPROCESO</div>
      <table class="ingr"><thead><tr><th>Proceso / Subproceso</th><th>Fecha</th><th>Hora inicio</th><th>Hora fin</th></tr></thead>
      <tbody>${procRows.map(p => `<tr><td>${p.nombre || ''}</td><td>${fmtF(p.fecha)}</td><td>${p.inicio || ''}</td><td>${p.fin || ''}</td></tr>`).join('')}</tbody></table>` : ''
    const w = window.open('', '_blank')
    w.document.write(`<html><head><title>PTZ-OR-01 Orden #${opNum(o.id)}</title><style>
      @page { size: letter; margin: 10mm; }
      * { box-sizing: border-box; }
      html,body { margin:0; }
      body { font-family: Arial, sans-serif; color:#222; font-size:11px; }
      #content { padding-bottom:10px; }
      table { width:100%; border-collapse:collapse; }
      td,th { border:1px solid #555; padding:4px 8px; vertical-align:top; }
      th { background:#e9efe7; text-align:left; }
      .r { text-align:right; }
      /* Encabezado tipo formato controlado */
      .hdr td { padding:4px 8px; }
      .hdr .logo { width:26%; text-align:center; font-weight:bold; color:#2d5a3d; font-size:13px; }
      .hdr .titulo { text-align:center; font-weight:bold; font-size:14px; }
      .hdr .codbox td { border:1px solid #555; font-size:10px; }
      .seccion { background:#2d5a3d; color:#fff; font-weight:bold; padding:3px 8px; margin-top:10px; font-size:11px; }
      .campos td { border:1px solid #555; }
      .lbl { background:#f3f6f1; font-weight:bold; width:18%; }
      .prev td { border:1px solid #555; }
      .firmas { margin-top:0; padding-top:26px; }
      .firmas td { border:none; text-align:center; padding-top:28px; }
      .firmas .linea { border-top:1px solid #555; padding-top:3px; }
      tbody tr:nth-child(even) td { background:#fafafa; }
      .ingr tbody tr:nth-child(even) td { background:#fafafa; }
    </style></head><body><div id="content">

      <!-- Encabezado del formato -->
      <table class="hdr">
        <tr>
          <td class="logo" rowspan="3">${cfg.logo_url ? `<img src="${cfg.logo_url}" style="max-width:90px;max-height:54px;object-fit:contain" />` : '🌿'}<div>${cfg.empresa || ''}</div></td>
          <td class="titulo" rowspan="3">ORDEN DE PRODUCCIÓN${o.es_prueba ? '<div style="color:#c0392b;font-size:11px;font-weight:bold">★ PRUEBA ★</div>' : ''}</td>
          <td>Código: <b>PTZ-OR-01</b></td>
        </tr>
        <tr><td>Versión: <b>1</b></td></tr>
        <tr><td>Fecha emisión: <b>${emision}</b></td></tr>
      </table>
      ${cfg.nit || cfg.direccion || cfg.telefono ? `<div style="font-size:9px;text-align:center;margin-bottom:6px;color:#555">${[cfg.nit && 'NIT: ' + cfg.nit, cfg.direccion, cfg.ciudad, cfg.telefono && 'Tel: ' + cfg.telefono].filter(Boolean).join(' · ')}</div>` : ''}
      ${o.es_prueba ? '<div style="text-align:center;background:#c0392b;color:#fff;font-weight:bold;padding:4px;border-radius:4px;margin-bottom:6px;letter-spacing:2px">ORDEN DE PRUEBA — NO COMERCIALIZAR</div>' : ''}

      <div class="seccion">DATOS DE LA ORDEN</div>
      <table class="campos">
        <tr><td class="lbl">Orden de Producción N°</td><td>OP-${opNum(o.id)}</td><td class="lbl">Lote</td><td>${o.lote || ''}</td></tr>
        <tr><td class="lbl">Nombre comercial</td><td>${o.producto || ''}</td><td class="lbl">Presentación</td><td>${prepInfo?.pesoUnidad ? g(prepInfo.pesoUnidad) + ' gr' : ''}</td></tr>
        <tr><td class="lbl">Fecha de fabricación</td><td>${fabricacion}</td><td class="lbl">Fecha de vencimiento</td><td>${rotVence ? new Date(rotVence + 'T00:00:00').toLocaleDateString('es-CO') : ''}</td></tr>
        <tr><td class="lbl">Unidades a producir</td><td>${o.cantidad_plan || ''} ${o.unidad || ''}</td><td class="lbl">Operario</td><td>${o.operario || ''}</td></tr>
        <tr><td class="lbl">Unidades producidas</td><td style="height:22px"></td><td class="lbl">Cant. empaque utilizado</td><td></td></tr>
        ${prepPorciona ? `<tr><td class="lbl">Peso subporción</td><td>${prepPesoSubp ? g(prepPesoSubp) + ' g' : ''}</td><td class="lbl">Cant. subporciones</td><td>${prepCantSubp ? fNum(prepCantSubp) : ''}</td></tr>` : ''}
        <tr><td class="lbl">¿Empacó surtido?</td><td>${esSurtido ? `Sí — lote(s): <b>${loteMezcla || '(sin especificar)'}</b>` : 'No'}</td><td class="lbl">¿Sobró producción?</td><td>${prepHaySobrante ? `Sí — ${prepSobrantePeso || ''} ${prepSobranteUnidad || ''}` : 'No'}</td></tr>
      </table>

      <div class="seccion">LISTA DE INGREDIENTES</div>
      <table class="ingr"><thead><tr><th>Ingrediente</th><th class="r">Porcentaje</th><th class="r">Cantidad (gr)</th><th>Lote MP</th></tr></thead>
        <tbody>${filas ? prepIngs.map(i => `<tr><td>${i.nombre}</td><td class="r">${totalG > 0 ? (i.gramos / totalG * 100).toFixed(1) : '0'}%</td><td class="r">${g(i.gramos)}</td><td></td></tr>`).join('') + `<tr><td><b>TOTAL</b></td><td class="r"><b>100%</b></td><td class="r"><b>${g(totalG)}</b></td><td></td></tr>` : '<tr><td colspan="4">Sin receta vinculada</td></tr>'}</tbody>
      </table>

      ${d ? `<div class="seccion">DATOS PREVISTOS</div>${filasPrev}` : ''}

      ${filasProc}

      ${rotuladoHtml}

      <div class="seccion">OBSERVACIONES</div>
      <table class="campos"><tr><td id="obsbox" style="height:90px; vertical-align:top">${o.notas_orden || ''}</td></tr></table>

      <table class="firmas">
        <tr>
          <td><div class="linea">ENTREGADO POR</div></td>
          <td><div class="linea">RECIBIDO POR</div></td>
        </tr>
      </table>

      </div>
      <script>window.addEventListener('load',function(){setTimeout(function(){
        var c=document.getElementById('content');
        // Alto util conservador de una hoja carta (cubre los margenes que el navegador agrega)
        var availH=900;
        function alto(){ return Math.max(c.scrollHeight, c.offsetHeight, c.getBoundingClientRect().height); }
        var h=alto();
        // 1) Si sobra espacio: agranda Observaciones para llenar la hoja y bajar las firmas
        if(h<availH){
          var box=document.getElementById('obsbox');
          var extra=availH-h-10;
          if(box && extra>0){ box.style.height=(box.offsetHeight + extra)+'px'; }
        }
        // 2) Ajuste final garantizado: si por lo que sea quedo mas alto, reduce para que SIEMPRE
        //    entre en una sola hoja (la firma nunca pasa a la 2a pagina).
        var hf=alto();
        if(hf>availH){ document.body.style.zoom=availH/hf; }
        window.focus();window.print();
      },200)})</script>
      </body></html>`)
    w.document.close()
  }

  // Ir al módulo de Producción a registrar los lotes (precargado desde la orden)
  // Calcula inicio/fin global desde los procesos
  const tiemposGlobal = () => {
    const procs = prepProcesos.filter(p => p.nombre?.trim() || p.inicio || p.fin)
    const inicios = procs.map(p => p.inicio).filter(Boolean).sort()
    const fines = procs.map(p => p.fin).filter(Boolean).sort()
    return { procs, inicioGlobal: inicios[0] || '', finGlobal: fines.length ? fines[fines.length - 1] : '' }
  }

  // Validar y mostrar el modal de confirmación antes de enviar
  const abrirConfirmEnvio = () => {
    if (!prepLote.trim()) { toast('Completa el LOTE', 'warning'); return }
    if (!prepVence) { toast('Completa la FECHA DE VENCIMIENTO', 'warning'); return }
    if (!prepFechaInicio) { toast('Completa la FECHA DE INICIO DE FABRICACIÓN', 'warning'); return }
    if (!(parseFloat(prepUnidades) >= 0) || prepUnidades === '') { toast('Ingresa las unidades obtenidas', 'warning'); return }
    if (prepPorciona && !(parseFloat(prepCantSubp) > 0)) { toast('Ingresa la CANTIDAD DE SUBPORCIONES', 'warning'); return }
    if (prepSurtido && !(parseFloat(prepSurtidoCantidad) > 0)) { toast('Ingresa la CANTIDAD EMPACADA SURTIDA', 'warning'); return }
    if (prepHaySobrante && !(parseFloat(prepSobrantePeso) > 0)) { toast('Marcaste que sobró: ingresa la CANTIDAD SOBRANTE', 'warning'); return }
    setModalConfirmEnvio(true)
  }

  // Confirmar y enviar: crea el registro de producción y cierra la orden (a aprobación)
  const confirmarEnviar = async () => {
    const o = ordenPrep; if (!o) return
    if (!navigator.onLine && prepFotoFile) {
      toast('Sin conexión: la foto requiere internet. Quítala para enviar la orden offline.', 'warning'); return
    }
    setSavingEvid(true)
    try {
      const { procs, inicioGlobal, finGlobal } = tiemposGlobal()
      const fechaIni = prepFechaInicio || hoyISO()
      let foto_url = prepFotoPrev || ''
      if (prepFotoFile) {
        const ext = prepFotoFile.name.split('.').pop()
        foto_url = await uploadFile('production-photos', `produccion/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`, prepFotoFile)
      }
      const unidades = parseFloat(prepUnidades) || 0
      const estado = prepConforme && unidades > 0 ? 'conforme' : 'no conforme'
      // Lotes empacados adicionales (saldos de mezcla / partes empacadas con otro lote)
      const extras = prepLotesExtra.filter(e => (parseFloat(e.unidades) || 0) > 0)
      const extrasUnid = extras.reduce((s, e) => s + (parseFloat(e.unidades) || 0), 0)
      const unidadesTotal = unidades + extrasUnid
      // Si quien cierra y envía es un admin, la orden se aprueba automáticamente (no requiere otra aprobación)
      const autoAprob = esAdmin
      // 1) Crear/actualizar el registro de producción vinculado a la orden
      const recExist = recordsDeOrden(o.id)[0]
      const regData = {
        producto: o.producto, fecha: fechaIni, lote: prepLote, vence: prepVence || null,
        empaque: o.unidad || 'UNIDADES', cantidad: unidades, inicio: inicioGlobal || null, fin: finGlobal || null,
        labor: 'PRODUCCION', responsable: prepResp || o.operario || '', obs: prepObs || '',
        peso_final: parseFloat(prepPesoFinal) || 0, peso_desperdicio: parseFloat(prepPesoDesp) || 0,
        estado, completado: true, foto_url, orden_id: o.id, aprobado: autoAprob,
        tipo_registro: o.es_subproducto ? 'subproducto' : 'final', subprocesos: procs,
        peso_subporcion: prepPorciona ? (parseFloat(prepPesoSubp) || 0) : null,
        cant_subporciones: prepPorciona ? (parseFloat(prepCantSubp) || 0) : null,
        surtido: prepSurtido, lote_mezcla: prepSurtido ? (prepLoteMezcla || null) : null,
        producto_surtido: prepSurtido ? (prepProductoSurtido || null) : null,
        lotes_origen: prepSurtido ? (prepLoteMezcla || '') : '',
      }
      if (recExist) await writeOrQueue({ table: 'production_records', action: 'update', match: { id: recExist.id }, payload: regData })
      else await writeOrQueue({ table: 'production_records', action: 'insert', payload: regData })
      // 1b) Un registro de producción por cada lote empacado adicional (con su propio conforme)
      for (const ex of extras) {
        const exUnid = parseFloat(ex.unidades) || 0
        await writeOrQueue({ table: 'production_records', action: 'insert', payload: {
          producto: o.producto, fecha: fechaIni, lote: ex.lote || prepLote, vence: ex.vence || prepVence || null,
          empaque: o.unidad || 'UNIDADES', cantidad: exUnid, inicio: inicioGlobal || null, fin: finGlobal || null,
          labor: 'PRODUCCION', responsable: prepResp || o.operario || '', obs: (prepObs ? prepObs + ' · ' : '') + (ex.saldo_id ? 'Empacado de saldo en proceso' : 'Lote empacado adicional'),
          estado: ex.conforme && exUnid > 0 ? 'conforme' : 'no conforme', completado: true, foto_url, orden_id: o.id, aprobado: autoAprob,
          tipo_registro: o.es_subproducto ? 'subproducto' : 'final', subprocesos: procs,
          surtido: !!ex.surtido, lote_mezcla: ex.surtido ? (ex.lote_mezcla || null) : null,
          producto_surtido: ex.surtido ? (autoSurtido(o.producto, ex.lote_mezcla) || prepProductoSurtido || null) : null,
          lotes_origen: ex.surtido ? (ex.lote_mezcla || '') : '',
        } })
      }
      // 2) Cerrar la orden con todos los datos del proceso.
      //    Admin: pasa directo a 'aprobada' (auto-aprobación). Operario: 'ejecutada' (espera aprobación).
      const r = await writeOrQueue({ table: 'production_orders', action: 'update', match: { id: o.id }, payload: {
        estado: autoAprob ? 'aprobada' : 'ejecutada',
        ...(autoAprob ? { aprobado_por: profile?.nombre || 'admin', fecha_aprob: new Date().toISOString() } : {}),
        cantidad_result: unidadesTotal, lote: prepLote, vence: prepVence || null,
        fecha_inicio: fechaIni, inicio: inicioGlobal || null, fin: finGlobal || null, procesos_tiempos: procs,
        peso_final: parseFloat(prepPesoFinal) || 0, peso_desperdicio: parseFloat(prepPesoDesp) || 0,
        peso_subporcion: prepPorciona ? (parseFloat(prepPesoSubp) || 0) : null,
        cant_subporciones: prepPorciona ? (parseFloat(prepCantSubp) || 0) : null,
        surtido: prepSurtido, lote_mezcla: prepSurtido ? (prepLoteMezcla || null) : null,
        producto_surtido: prepSurtido ? (prepProductoSurtido || null) : null,
        surtido_cantidad: prepSurtido && prepSurtidoCantidad !== '' ? (parseFloat(prepSurtidoCantidad) || 0) : null,
        hay_sobrante: prepHaySobrante, sobrante_peso: prepHaySobrante ? (parseFloat(prepSobrantePeso) || 0) : null, sobrante_unidad: prepHaySobrante ? prepSobranteUnidad : null,
        obs_result: prepObs || '', foto_url, fecha_envio: new Date().toISOString(),
        destajo: prepDestajo.filter(d => d.nombre?.trim() || d.cantidad || d.tarifa),
      } })
      // (8) Si se empacó surtido con otro(s) lote(s), marca también ESA orden como empacada surtida
      //     con este lote — aunque ya esté cerrada. Solo en línea.
      if (!r.queued && prepSurtido && prepLoteMezcla) {
        try {
          const lotesComb = String(prepLoteMezcla).split(/[,;]/).map(s => s.trim()).filter(Boolean)
          for (const lt of lotesComb) {
            const otras = ordenes.filter(x => x.id !== o.id && String(x.lote || '').trim() === lt)
            for (const ot of otras) {
              await supabase.from('production_orders').update({ surtido: true, lote_mezcla: prepLote || ot.lote_mezcla || null }).eq('id', ot.id)
            }
          }
        } catch (e) { console.warn('No se pudo marcar el lote combinado como surtido:', e) }
      }
      // Consumo definitivo de la MP reservada (solo en línea; offline se reconcilia al sincronizar)
      if (!r.queued) { try { await consumirMP(o) } catch (e) { console.warn('No se pudo consumir MP:', e) } }
      // Si un subproducto se auto-aprueba (admin), genera la entrada de inventario MP igual que al aprobar
      if (!r.queued && autoAprob && o.es_subproducto && o.mp_id) {
        try {
          await supabase.from('inventory_movements').insert({
            mp_id: o.mp_id, tipo: 'entrada', cantidad: unidades, fecha: fechaIni,
            responsable: o.operario || profile?.nombre || '', obs: `Orden de producción #${opNum(o.id)} (subproducto)`, lote: prepLote || '', vencimiento: prepVence || null,
          })
          const { data: mpRow } = await supabase.from('raw_materials').select('stock').eq('id', o.mp_id).single()
          const upd = { stock: (mpRow?.stock || 0) + unidades }
          if (prepLote) upd.lote = prepLote
          if (prepVence) upd.vencimiento = prepVence
          await supabase.from('raw_materials').update(upd).eq('id', o.mp_id)
        } catch (e) { console.warn('No se pudo sumar el subproducto a inventario:', e) }
      }
      // Si el admin auto-aprueba un producto terminado, súmalo al inventario de terminados.
      // En surtido: el stock es la cantidad empacada surtida y el lote de la caja = último lote combinado.
      if (!r.queued && autoAprob) {
        const esSurt = prepSurtido && prepProductoSurtido
        const cantStock = esSurt ? (parseFloat(prepSurtidoCantidad) || 0) : unidadesTotal
        await sumarProductoTerminado(o, cantStock, esSurt ? prepProductoSurtido : o.producto, esSurt ? (loteCaja(prepLoteMezcla) || prepLote) : prepLote)
      }
      // Saldos de mezcla en proceso (solo en línea): descontar los consumidos y crear el sobrante nuevo
      if (!r.queued) {
        try {
          // a) Descontar de los saldos consumidos (cualquier fila con saldo y consumo, tenga o no unidades)
          for (const ex of prepLotesExtra) {
            if (!ex.saldo_id) continue
            const consumido = parseFloat(ex.peso_consumido) || 0
            if (consumido <= 0) continue
            const { data: sal } = await supabase.from('mezcla_saldos').select('peso').eq('id', ex.saldo_id).single()
            const restante = Math.max(0, (sal?.peso || 0) - consumido)
            await supabase.from('mezcla_saldos').update({ peso: restante, estado: restante <= 0 ? 'agotado' : 'disponible' }).eq('id', ex.saldo_id)
          }
          // b) Crear el saldo nuevo con el sobrante de esta orden
          const sobrante = parseFloat(prepSobrantePeso) || 0
          if (prepHaySobrante && sobrante > 0) {
            await supabase.from('mezcla_saldos').insert({
              producto: o.producto, origen_id: o.origen_id || null, lote: prepLote || '', vencimiento: prepVence || null,
              peso: sobrante, unidad: prepSobranteUnidad, orden_origen: o.id, estado: 'disponible', creado_por: profile?.nombre || '',
            })
          }
        } catch (e) { console.warn('No se pudieron actualizar los saldos de mezcla:', e) }
      }
      if (!r.queued) {
        if (autoAprob) { if (o.operario && o.operario !== profile?.nombre) await notificar({ destinatario: o.operario, tipo: 'orden_aprobada', mensaje: `La orden #${opNum(o.id)} (${o.producto}) fue cerrada y aprobada por ${profile?.nombre || 'admin'} ✓`, link: '/ordenes', ref_id: o.id }) }
        else await notificar({ destinatario: 'admin', tipo: 'orden_enviada', mensaje: `Orden #${opNum(o.id)} (${o.producto}) enviada para aprobación por ${profile?.nombre || 'operario'}`, link: '/ordenes', ref_id: o.id })
      }
      qc.invalidateQueries({ queryKey: ['production_orders'] }); qc.invalidateQueries({ queryKey: ['production_records'] }); qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] }); qc.invalidateQueries({ queryKey: ['inventory_movements'] }); qc.invalidateQueries({ queryKey: ['mezcla_saldos'] }); qc.invalidateQueries({ queryKey: ['products_costing'] }); qc.invalidateQueries({ queryKey: ['finished_movements'] })
      setModalConfirmEnvio(false); setModalProceso(false)
      toast(r.queued ? 'Orden guardada sin conexión — se enviará al sincronizar 📴' : (autoAprob ? 'Producción registrada, cerrada y aprobada ✓' : 'Producción registrada y orden enviada a aprobación ✓'))
    } catch (e) { toast(e.message, 'error') } finally { setSavingEvid(false) }
  }

  // Enviar y cerrar: requiere lotes completados; toma la cantidad de los registros vinculados
  const enviarYCerrar = useMutation({
    mutationFn: async (o) => {
      const recs = recordsDeOrden(o.id).filter(r => r.completado)
      if (!recs.length) throw new Error('Primero registra y completa los lotes en Producción')
      const cantidad = recs.reduce((s, r) => s + (r.cantidad || 0), 0)
      const { error } = await supabase.from('production_orders').update({
        estado: 'ejecutada', cantidad_result: cantidad, lote: recs[0]?.lote || o.lote || '', fecha_envio: new Date().toISOString(),
      }).eq('id', o.id)
      if (error) throw error
      try { await consumirMP(o) } catch (e) { console.warn('No se pudo consumir MP:', e) }
      await notificar({ destinatario: 'admin', tipo: 'orden_enviada', mensaje: `Orden #${opNum(o.id)} (${o.producto}) enviada para aprobación por ${profile?.nombre || 'operario'}`, link: '/ordenes', ref_id: o.id })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production_orders'] }); qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] }); toast('Orden enviada y cerrada ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  // ---- Crear / editar orden (admin) ----
  const crearOrden = useMutation({
    mutationFn: async () => {
      if (!form.producto.trim()) throw new Error('Indica el producto/receta')
      if (!(parseFloat(form.cantidad_plan) > 0)) throw new Error('Ingresa la cantidad planificada')
      if (!form.operario) throw new Error('Asigna un operario')
      if (form.es_subproducto && !form.mp_id) throw new Error('Indica qué materia prima alimenta el subproducto')
      const campos = {
        producto: form.producto, origen: form.origen, origen_id: form.origen_id ? parseInt(form.origen_id) : null,
        es_subproducto: form.es_subproducto, mp_id: form.es_subproducto && form.mp_id ? parseInt(form.mp_id) : null,
        cantidad_plan: parseFloat(form.cantidad_plan) || 0, unidad: form.unidad,
        operario: form.operario, notas_orden: form.notas_orden,
        lote: form.lote || '', vence: form.vence || null, baches_plan: parseFloat(form.baches_plan) || null, inicio: form.inicio || null,
        es_prueba: form.origen === 'receta', forzar_sin_lote: !!form.forzar_sin_lote,
        lotes_preferidos: form.lotes_elegidos && Object.keys(form.lotes_elegidos).length ? form.lotes_elegidos : null,
      }
      if (editOrdenId) {
        // Editar una orden aún PENDIENTE (no tomada)
        const orig = ordenes.find(o => o.id === editOrdenId)
        if (orig && orig.estado !== 'pendiente') throw new Error('Solo se pueden modificar órdenes pendientes (sin tomar)')
        const { error } = await supabase.from('production_orders').update(campos).eq('id', editOrdenId)
        if (error) throw error
        if (orig && orig.operario !== form.operario) {
          await notificar({ destinatario: form.operario, tipo: 'orden_asignada', mensaje: `Se te asignó la orden de producción: ${form.producto}`, link: '/ordenes', ref_id: editOrdenId })
        }
        return
      }
      const { data, error } = await supabase.from('production_orders').insert({
        ...campos, estado: 'pendiente', creado_por: profile?.nombre || '',
      }).select().single()
      if (error) throw error
      // Notificar al operario asignado
      await notificar({ destinatario: form.operario, tipo: 'orden_asignada', mensaje: `Nueva orden de producción asignada: ${form.producto}`, link: '/ordenes', ref_id: data?.id })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production_orders'] }); setModalNueva(false); setForm(EMPTY_ORDEN); toast(editOrdenId ? 'Orden actualizada ✓' : 'Orden creada y asignada ✓'); setEditOrdenId(null) },
    onError: (e) => toast(e.message, 'error'),
  })

  const tomarOrden = useMutation({
    mutationFn: async (o) => {
      const { error } = await supabase.from('production_orders').update({ estado: 'en_proceso' }).eq('id', o.id); if (error) throw error
      // Reserva la MP de los lotes (PEPS) al iniciar producción
      try { await reservarMP(o) } catch (e) { console.warn('No se pudo reservar MP:', e) }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production_orders'] }); qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] }); toast('Orden en proceso — MP reservada ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  // El operario puede anular/editar su envío dentro de 1 día hábil (no cuenta sábado/domingo)
  const dentroVentanaEdicion = (o) => {
    if (!o.fecha_envio) return false
    const envio = new Date(o.fecha_envio)
    let limite = new Date(envio); let agregados = 0
    while (agregados < 1) { limite.setDate(limite.getDate() + 1); const d = limite.getDay(); if (d !== 0 && d !== 6) agregados++ }
    return new Date() <= limite
  }

  // Anular envío → vuelve a 'en_proceso' para corregir y reenviar (solo dentro de la ventana)
  const anularEnvio = useMutation({
    mutationFn: async (o) => {
      if (!dentroVentanaEdicion(o)) throw new Error('Ya pasó el plazo de 1 día hábil para anular el envío')
      const { error } = await supabase.from('production_orders').update({ estado: 'en_proceso' }).eq('id', o.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production_orders'] }); toast('Envío anulado — puedes corregir y reenviar') },
    onError: (e) => toast(e.message, 'error'),
  })

  const eliminarOrden = useMutation({
    mutationFn: async (o) => {
      const id = typeof o === 'object' ? o.id : o
      // Devuelve al inventario la MP reservada que no se consumió (orden no ejecutada)
      if (typeof o === 'object') { try { await liberarMP(o) } catch (e) { console.warn('No se pudo liberar MP:', e) } }
      // Si la orden tiene registros de producción vinculados, se eliminan también
      await supabase.from('production_records').delete().eq('orden_id', id)
      const { error } = await supabase.from('production_orders').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production_orders'] })
      qc.invalidateQueries({ queryKey: ['production_records'] })
      qc.invalidateQueries({ queryKey: ['raw_materials'] })
      qc.invalidateQueries({ queryKey: ['raw_material_lots'] })
      toast('Orden eliminada — MP reservada devuelta al inventario')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  // ---- Enviar resultados (operario) ----
  const enviarResultados = async () => {
    if (!ordenActiva) return
    if (!(parseFloat(ejec.cantidad_result) >= 0)) { toast('Ingresa la cantidad resultante', 'warning'); return }
    setSaving(true)
    try {
      let fotoUrl = ordenActiva.foto_url || ''
      if (fotoFile) {
        const ext = fotoFile.name.split('.').pop()
        fotoUrl = await uploadFile('production-photos', `ordenes/${Date.now()}.${ext}`, fotoFile)
      }
      const { error } = await supabase.from('production_orders').update({
        estado: 'ejecutada',
        cantidad_result: parseFloat(ejec.cantidad_result) || 0,
        lote: ejec.lote, vence: ejec.vence || null, fecha_prod: ejec.fecha_prod || null,
        inicio: ejec.inicio || null, fin: ejec.fin || null,
        empaque: ejec.empaque, obs_result: ejec.obs_result, foto_url: fotoUrl,
        fecha_envio: new Date().toISOString(),
      }).eq('id', ordenActiva.id)
      if (error) throw error
      try { await consumirMP(ordenActiva) } catch (e) { console.warn('No se pudo consumir MP:', e) }
      await notificar({ destinatario: 'admin', tipo: 'orden_enviada', mensaje: `Orden #${opNum(ordenActiva.id)} (${ordenActiva.producto}) enviada para aprobación por ${profile?.nombre || 'operario'}`, link: '/ordenes', ref_id: ordenActiva.id })
      qc.invalidateQueries({ queryKey: ['production_orders'] }); qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] })
      setModalEjec(false); setFotoFile(null); setFotoPrev(''); toast('Resultados enviados a aprobación ✓')
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  // Calcula el consumo previsto de MP de una orden (según receta del producto y baches planeados).
  // Devuelve [{ mpId, nombre, unidad, consumo, esEmp }].
  const calcularConsumoOrden = async (o) => {
    if (o.origen !== 'producto' || !o.origen_id) return []
    const { data: prod } = await supabase.from('products_costing').select('bache, ingredientes').eq('id', o.origen_id).single()
    if (!prod) return []
    const ings = (() => { try { return Array.isArray(prod.ingredientes) ? prod.ingredientes : JSON.parse(prod.ingredientes || '[]') } catch { return [] } })()
    const bache = parseFloat(prod.bache) || 0
    if (bache <= 0) return []
    const baches = parseFloat(o.baches_plan) > 0 ? parseFloat(o.baches_plan) : (parseFloat(o.cantidad_plan) || 0) / bache
    const out = []
    for (const ing of ings) {
      if (!ing.mpId) continue
      const gramos = (parseFloat(ing.cantidad) || 0) * baches
      if (gramos <= 0) continue
      const mpId = parseInt(ing.mpId)
      const { data: mpRow } = await supabase.from('raw_materials').select('nombre, stock, unidad, categoria').eq('id', mpId).single()
      const consumo = ['Kg', 'Litro'].includes(mpRow?.unidad) ? gramos / 1000 : gramos
      out.push({ mpId, nombre: mpRow?.nombre || '', unidad: mpRow?.unidad || '', stock: mpRow?.stock || 0, consumo, esEmp: /empaque|envase/i.test(mpRow?.categoria || '') })
    }
    return out
  }

  // 1) RESERVAR la MP cuando la orden INICIA producción (sale de "disponible" → "reservado")
  const reservarMP = async (o) => {
    if (o.origen !== 'producto' || !o.origen_id) return
    if (Array.isArray(o.lotes_reservados) && o.lotes_reservados.length) return  // ya reservado (idempotente)
    const items = await calcularConsumoOrden(o)
    if (!items.length) return
    const sinLote = !!o.forzar_sin_lote   // forzar: no descontar de lotes, solo del stock
    const preferidos = (o.lotes_preferidos && typeof o.lotes_preferidos === 'object') ? o.lotes_preferidos : {}
    const reservas = []
    for (const it of items) {
      let lotes = []
      if (!it.esEmp && !sinLote) { const r = await reservarPEPS({ mp_id: it.mpId, cantidad: it.consumo, preferLoteId: preferidos[it.mpId] || preferidos[String(it.mpId)] || null }); lotes = r.reservados }
      // El stock (disponible) baja al reservar (con o sin lote)
      await supabase.from('raw_materials').update({ stock: it.stock - it.consumo }).eq('id', it.mpId)
      reservas.push({ mp_id: it.mpId, nombre: it.nombre, unidad: it.unidad, consumo: it.consumo, lotes, sin_lote: sinLote })
    }
    await supabase.from('production_orders').update({ lotes_reservados: reservas }).eq('id', o.id)
  }

  // 2) LIBERAR la reserva si la orden se elimina / no se ejecuta (vuelve a "disponible")
  const liberarMP = async (o) => {
    const reservas = Array.isArray(o.lotes_reservados) ? o.lotes_reservados : null
    if (!reservas) return
    for (const it of reservas) {
      await liberarReservaLotes(it.lotes || [])
      const { data: mpRow } = await supabase.from('raw_materials').select('stock').eq('id', it.mp_id).single()
      await supabase.from('raw_materials').update({ stock: (mpRow?.stock || 0) + (it.consumo || 0) }).eq('id', it.mp_id)
    }
    await supabase.from('production_orders').update({ lotes_reservados: null }).eq('id', o.id)
  }

  // 3) CONSUMIR definitivo cuando la orden se CIERRA/ENVÍA (de "reservado" → consumido; el stock ya bajó)
  const consumirMP = async (o) => {
    const reservas = Array.isArray(o.lotes_reservados) ? o.lotes_reservados : null
    if (!reservas) return
    const hoy = o.fecha_prod || new Date().toISOString().split('T')[0]
    for (const it of reservas) {
      await consumirReservaLotes(it.lotes || [])
      const sinLote = it.sin_lote || !(it.lotes && it.lotes.length)
      await supabase.from('inventory_movements').insert({
        mp_id: it.mp_id, tipo: 'salida', cantidad: it.consumo, fecha: hoy,
        responsable: o.operario || '', obs: `Consumo orden #${opNum(o.id)} (${o.producto})${sinLote ? ' — salida sin lote' : ''}`,
        extra: { lotes_consumidos: it.lotes || [], orden_id: o.id, sin_lote: sinLote },
      })
    }
    // Pasa la trazabilidad a lotes_mp y limpia la reserva (ya es consumo definitivo)
    await supabase.from('production_orders').update({ lotes_mp: reservas, lotes_reservados: null }).eq('id', o.id)
  }

  // SUMA stock de PRODUCTO TERMINADO al aprobar una producción (fuente de verdad del inventario
  // que luego Alegra descuenta al facturar). No aplica a subproductos (van a MP) ni a pruebas.
  const sumarProductoTerminado = async (o, cantidad, nombreDestino, loteOverride) => {
    if (o.es_subproducto || o.es_prueba) return
    if (o.origen !== 'producto' || !o.origen_id) return
    if (!(cantidad > 0)) return
    try {
      // Resuelve el producto terminado del catálogo: por nombre (incluye surtidos) o por ficha base
      const nombre = (nombreDestino || o.producto || '').trim()
      let fp = null
      if (nombre) { const { data } = await supabase.from('finished_products').select('id, stock').eq('nombre', nombre).maybeSingle(); fp = data }
      if (!fp) { const { data } = await supabase.from('finished_products').select('id, stock').eq('product_id', o.origen_id).maybeSingle(); fp = data }
      if (!fp) { console.warn('Producto terminado no encontrado en el catálogo:', nombre); return }
      await supabase.from('finished_products').update({ stock: (Number(fp.stock) || 0) + cantidad }).eq('id', fp.id)
      await supabase.from('finished_movements').insert({
        finished_id: fp.id, product_id: o.origen_id, tipo: 'entrada', cantidad, lote: loteOverride || o.lote || '',
        fecha: o.fecha_prod || new Date().toISOString().split('T')[0],
        origen: 'produccion', ref: String(o.id), obs: `OP-${opNum(o.id)} (${nombre || o.producto})`, creado_por: profile?.nombre || '',
      })
      // Empuja el nuevo stock a Alegra (si está enlazado). No bloquea si falla.
      try { await supabase.functions.invoke('alegra-push-stock', { body: { finished_id: fp.id } }) } catch (e) { console.warn('No se pudo sincronizar stock con Alegra:', e) }
    } catch (e) { console.warn('No se pudo sumar producto terminado:', e) }
  }

  // ---- Aprobar / Rechazar (admin) ----
  const aprobar = useMutation({
    mutationFn: async (o) => {
      // 1. Marcar aprobada
      const { error } = await supabase.from('production_orders').update({
        estado: 'aprobada', aprobado_por: profile?.nombre || 'admin', fecha_aprob: new Date().toISOString(),
      }).eq('id', o.id)
      if (error) throw error

      // El consumo de MP ya ocurrió al ENVIAR la orden (reserva → consumido). Aquí solo se aprueba.

      if (o.es_subproducto && o.mp_id) {
        // 2a. Subproducto → entrada de inventario MP
        await supabase.from('inventory_movements').insert({
          mp_id: o.mp_id, tipo: 'entrada', cantidad: o.cantidad_result || 0, fecha: o.fecha_prod || new Date().toISOString().split('T')[0],
          responsable: o.operario, obs: `Orden de producción #${opNum(o.id)} (subproducto)`, lote: o.lote || '', vencimiento: o.vence || null,
        })
        // actualizar stock leyendo valor actual
        const { data: mpRow } = await supabase.from('raw_materials').select('stock').eq('id', o.mp_id).single()
        const nuevo = (mpRow?.stock || 0) + (o.cantidad_result || 0)
        const upd = { stock: nuevo }
        if (o.lote) upd.lote = o.lote
        if (o.vence) upd.vencimiento = o.vence
        await supabase.from('raw_materials').update(upd).eq('id', o.mp_id)
      } else {
        // 2b. Producto terminado → registro de producción
        // Si el operario ya registró el lote desde el módulo de Producción (vinculado a la orden),
        // no se crea uno nuevo para evitar duplicados.
        const yaRegistrado = prodRecords.some(r => r.orden_id === o.id)
        if (yaRegistrado) {
          // El operario ya registró el lote → al aprobar la orden se aprueba también ese registro
          await supabase.from('production_records').update({ aprobado: true }).eq('orden_id', o.id)
        } else {
          await supabase.from('production_records').insert({
            producto: o.producto, fecha: o.fecha_prod || new Date().toISOString().split('T')[0],
            lote: o.lote || '', vence: o.vence || null, empaque: o.empaque || 'UNIDADES',
            cantidad: o.cantidad_result || 0, inicio: o.inicio || null, fin: o.fin || null,
            labor: 'PRODUCCION', responsable: o.operario, obs: o.obs_result || '',
            foto_url: o.foto_url || '', estado: (o.cantidad_result || 0) > 0 ? 'conforme' : 'no conforme',
            orden_id: o.id, aprobado: true,
          })
        }
        // Suma al inventario de producto terminado (lo que Alegra descuenta al facturar)
        {
          const esSurt = o.surtido && o.producto_surtido
          const cantStock = esSurt ? (Number(o.surtido_cantidad) || 0) : (o.cantidad_result || 0)
          await sumarProductoTerminado(o, cantStock, esSurt ? o.producto_surtido : o.producto, esSurt ? (loteCaja(o.lote_mezcla) || o.lote) : o.lote)
        }
      }
      // Notificar al operario que su orden fue aprobada
      if (o.operario) await notificar({ destinatario: o.operario, tipo: 'orden_aprobada', mensaje: `Tu orden #${opNum(o.id)} (${o.producto}) fue aprobada ✓`, link: '/ordenes', ref_id: o.id })
    },
    onSuccess: (_d, o) => {
      qc.invalidateQueries({ queryKey: ['production_orders'] })
      qc.invalidateQueries({ queryKey: ['production_records'] })
      qc.invalidateQueries({ queryKey: ['raw_materials'] })
      qc.invalidateQueries({ queryKey: ['inventory_movements'] })
      qc.invalidateQueries({ queryKey: ['products_costing'] })
      qc.invalidateQueries({ queryKey: ['finished_movements'] })
      toast(o.es_subproducto ? 'Aprobada → sumada a Inventario MP ✓' : 'Aprobada → registrada en Producción ✓')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const rechazar = useMutation({
    mutationFn: async ({ o, motivo = '' }) => {
      const { error } = await supabase.from('production_orders').update({ estado: 'rechazada', motivo_rechazo: motivo }).eq('id', o.id)
      if (error) throw error
      if (o.operario) await notificar({ destinatario: o.operario, tipo: 'orden_rechazada', mensaje: `Tu orden #${opNum(o.id)} (${o.producto}) fue rechazada${motivo ? ': ' + motivo : ''}`, link: '/ordenes', ref_id: o.id })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production_orders'] }); toast('Orden rechazada') },
    onError: (e) => toast(e.message, 'error'),
  })

  const handleFoto = (e) => { const f = e.target.files[0]; if (!f) return; setFotoFile(f); setFotoPrev(URL.createObjectURL(f)) }

  const openEjecutar = (o) => {
    setOrdenActiva(o)
    setEjec({ cantidad_result: o.cantidad_result || '', lote: o.lote || '', vence: o.vence || '', fecha_prod: o.fecha_prod || new Date().toISOString().split('T')[0], inicio: o.inicio || '', fin: o.fin || '', empaque: o.empaque || 'UNIDADES', obs_result: o.obs_result || '' })
    setFotoFile(null); setFotoPrev(o.foto_url || '')
    setModalEjec(true)
  }

  // Admin y operario ven todas; el auxiliar solo las que se le asignaron
  const visibles = (esAdmin || esOperario) ? ordenes : ordenes.filter(o => o.operario === profile?.nombre)
  const pendientesAprob = ordenes.filter(o => o.estado === 'ejecutada').length

  // Abrir el modal para EDITAR una orden pendiente (no tomada)
  const openEditarOrden = async (o) => {
    if (o.estado !== 'pendiente') { toast('Solo se pueden modificar órdenes pendientes (sin tomar)', 'warning'); return }
    setEditOrdenId(o.id)
    setProdReceta(null); setIngIdx(''); setIngDisp('')
    const val = o.origen_id ? `${o.origen === 'receta' ? 'recipe' : 'prod'}-${o.origen_id}` : ''
    if (val) await selectProducto(val)
    setForm(f => ({
      ...f,
      producto: o.producto || f.producto,
      origen: o.origen || 'producto', origen_id: o.origen_id ? String(o.origen_id) : '',
      es_subproducto: !!o.es_subproducto, mp_id: o.mp_id ? String(o.mp_id) : '',
      cantidad_plan: o.cantidad_plan != null ? String(o.cantidad_plan) : '',
      unidad: o.unidad || 'unidades',
      operario: o.operario || '', notas_orden: o.notas_orden || '',
      lote: o.lote || '', vence: o.vence || '', baches_plan: o.baches_plan || '', inicio: o.inicio || '', forzar_sin_lote: !!o.forzar_sin_lote,
      lotes_elegidos: (o.lotes_preferidos && typeof o.lotes_preferidos === 'object') ? o.lotes_preferidos : {},
    }))
    setModalNueva(true)
  }

  const selectProducto = async (val, prefill) => {
    // val = 'prod-{id}' | 'recipe-{id}'; prefill = { ancla, cantidad } para precargar el ingrediente disponible
    setProdReceta(null); setIngIdx(''); setIngDisp('')
    setForm(f => ({ ...f, baches_plan: '' }))
    const aplicarPrefill = (ings, unidsBacheNet) => {
      if (!prefill?.ancla) return
      const idx = ings.findIndex(x => x.nombre === prefill.ancla)
      if (idx < 0) return
      const disp = parseFloat(prefill.cantidad) || 0
      setIngIdx(String(idx)); setIngDisp(disp ? String(disp) : '')
      const porBache = parseFloat(ings[idx].cantidad) || 0
      if (porBache > 0 && disp > 0) {
        const baches = disp / porBache
        setForm(f => ({ ...f, cantidad_plan: String(Math.round(baches * unidsBacheNet)), baches_plan: baches }))
      }
    }
    if (!val) { setForm(f => ({ ...f, producto: '', origen_id: '', origen: 'producto', unidadesPorBache: 0 })); return }
    const [tipo, id] = val.split('-')
    if (tipo === 'prod') {
      const p = productos.find(x => String(x.id) === id)
      setForm(f => ({ ...f, producto: p?.nombre || '', origen: 'producto', origen_id: id, es_subproducto: p?.tipo === 'subproducto', unidadesPorBache: parseFloat(p?.bache) || 0 }))
      // Cargar la receta para permitir planear por ingrediente disponible
      const { data: full } = await supabase.from('products_costing').select('ingredientes, bache, rendimiento, desperdicio, peso_unidad').eq('id', id).single()
      if (full) {
        const parse = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return [] } }
        const ings = parse(full.ingredientes).filter(i => (parseFloat(i.cantidad) || 0) > 0)
        const totalMezcla = ings.reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0)
        const rend = parseFloat(full.rendimiento) || 62, desp = parseFloat(full.desperdicio) || 2, pu = parseFloat(full.peso_unidad) || 1000
        const unidsBacheNet = pu > 0 ? (totalMezcla * (rend / 100) * (1 - desp / 100)) / pu : (parseFloat(full.bache) || 0)
        setProdReceta({ ings, unidsBacheNet, bache: parseFloat(full.bache) || 0 })
        if (unidsBacheNet > 0) setForm(f => ({ ...f, unidadesPorBache: Math.round(unidsBacheNet) }))
        aplicarPrefill(ings, unidsBacheNet)
      }
    } else {
      const r = recetas.find(x => String(x.id) === id)
      setForm(f => ({ ...f, producto: r?.nombre || '', origen: 'receta', origen_id: id, unidadesPorBache: 0 }))
      // Cargar receta para permitir planear por ingrediente disponible (basado en % de la receta)
      const { data: full } = await supabase.from('recipes').select('ingredientes, rendimiento, desperdicio, peso_unidad').eq('id', id).single()
      if (full) {
        const parse = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return [] } }
        const ings = parse(full.ingredientes).filter(i => (parseFloat(i.pct) || 0) > 0)
          .map(i => ({ nombre: i.nombre, cantidad: (parseFloat(i.pct) || 0) / 100 * BASE_RECETA }))
        const rend = parseFloat(full.rendimiento) || 62, desp = parseFloat(full.desperdicio) || 2, pu = parseFloat(full.peso_unidad) || 1000
        const unidsBacheNet = pu > 0 ? (BASE_RECETA * (rend / 100) * (1 - desp / 100)) / pu : 0
        if (ings.length) setProdReceta({ ings, unidsBacheNet, bache: 0 })
        aplicarPrefill(ings, unidsBacheNet)
      }
    }
  }

  // Unidades que saldrían a partir de la cantidad disponible de un ingrediente
  const unidadesDesdeIngrediente = () => {
    if (!prodReceta || ingIdx === '' || !ingDisp) return 0
    const ing = prodReceta.ings[parseInt(ingIdx)]
    const porBache = parseFloat(ing?.cantidad) || 0
    if (porBache <= 0) return 0
    const baches = (parseFloat(ingDisp) || 0) / porBache
    return Math.round(baches * prodReceta.unidsBacheNet)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Órdenes de Producción</h1>
        <div className="page-actions">
          {esAdmin && pendientesAprob > 0 && <span className="badge badge-dorado" style={{ alignSelf: 'center' }}>{pendientesAprob} por aprobar</span>}
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={() => setModalAudit(true)}>📜 Registro de creación</button>}
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={reiniciarNumeracion}>🔢 Numeración</button>}
          {(esAdmin || esOperario) && <button className="btn btn-primary btn-sm" onClick={() => { setEditOrdenId(null); setForm(EMPTY_ORDEN); setProdReceta(null); setIngIdx(''); setIngDisp(''); setModalNueva(true) }}>+ Nueva Orden</button>}
        </div>
      </div>

      {saldosMezcla.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--lima)' }}>
          <div className="card-title">♻ Saldos de mezcla en proceso ({saldosMezcla.length})</div>
          <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginTop: -4 }}>Sobrantes de producción sin empacar. Se pueden empacar al diligenciar una orden del mismo producto.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th>Lote</th><th className="td-number">Disponible</th><th>Vence</th><th>Origen</th></tr></thead>
              <tbody>
                {saldosMezcla.map(s => {
                  const est = estadoLote(s.vencimiento)
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.producto}</strong></td>
                      <td>{s.lote || '(s/n)'}</td>
                      <td className="td-number">{fCant(s.peso)} {s.unidad}</td>
                      <td style={{ color: est === 'vencido' ? 'var(--rojo)' : est === 'por_vencer' ? 'var(--tierra)' : undefined }}>{fmtVence(s.vencimiento)} {est === 'vencido' ? '⛔' : est === 'por_vencer' ? '⚠' : ''}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>{s.orden_origen ? `OP-${opNum(s.orden_origen)}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">📋 {esAdmin ? 'Todas las órdenes' : 'Mis órdenes asignadas'}</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Emitida</th><th>Producto</th><th>Tipo</th><th>Cant. plan</th><th>Operario</th><th>Estado</th><th>Resultado</th><th>Acciones</th></tr></thead>
            <tbody>
              {visibles.length === 0
                ? <tr><td colSpan={9} className="empty-table">No hay órdenes</td></tr>
                : visibles.map(o => {
                  const est = ESTADO_LABEL[o.estado] || ESTADO_LABEL.pendiente
                  const esMia = o.operario === profile?.nombre
                  return (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setOrdenDetalle(o)}>
                      <td>#{opNum(o.id)}</td>
                      <td>{o.created_at ? fFecha(o.created_at.split('T')[0]) : '—'}</td>
                      <td><strong>{o.producto}</strong>{o.notas_orden && <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>{o.notas_orden}</div>}</td>
                      <td>{o.es_prueba ? <span className="badge badge-dorado">🧪 Prueba</span> : o.es_subproducto ? <span className="badge badge-dorado">Subproducto</span> : <span className="badge badge-azul">Terminado</span>}</td>
                      <td className="td-number">{fNum(o.cantidad_plan)} {o.unidad}</td>
                      <td>{o.operario}</td>
                      <td><span className={`badge ${est.badge}`}>{est.txt}</span>{o.estado === 'rechazada' && o.motivo_rechazo && <div style={{ fontSize: '0.72rem', color: 'var(--rojo)' }}>{o.motivo_rechazo}</div>}</td>
                      <td className="td-number">{o.cantidad_result != null ? `${fNum(o.cantidad_result)}` : '—'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-xs btn-secondary" onClick={() => setOrdenDetalle(o)}>👁 Detalles</button>
                          {/* Quien ejecuta la orden: el operario dueño */}
                          {esMia && o.estado === 'pendiente' && <button className="btn btn-xs btn-primary" onClick={() => tomarOrden.mutate(o)}>▶ Tomar</button>}
                          {esMia && (o.estado === 'en_proceso' || o.estado === 'rechazada') && <>
                            <button className="btn btn-xs btn-secondary" onClick={() => openPreparar(o)}>🧮 Ingredientes</button>
                            <button className="btn btn-xs btn-primary" onClick={() => openProceso(o)}>▶ Iniciar proceso</button>
                          </>}
                          {/* El admin puede imprimir cualquier orden sin tomarla */}
                          {esAdmin && !esMia && <button className="btn btn-xs btn-dorado" title="Imprimir orden" onClick={() => openPreparar(o)}>🖨 Imprimir</button>}
                          {/* El admin puede diligenciar el proceso de órdenes de OTROS (en las suyas ya tiene "Iniciar proceso") */}
                          {esAdmin && !esMia && (o.estado === 'pendiente' || o.estado === 'en_proceso' || o.estado === 'rechazada') && (
                            <button className="btn btn-xs btn-primary" title="Diligenciar proceso, cerrar y enviar (se aprueba automáticamente)" onClick={() => adminDiligenciar(o)}>▶ Diligenciar proceso</button>
                          )}
                          {/* Editar la orden mientras esté pendiente (no tomada) */}
                          {(esAdmin || esOperario) && o.estado === 'pendiente' && <button className="btn btn-xs btn-secondary" title="Modificar orden" onClick={() => openEditarOrden(o)}>✏ Editar</button>}
                          {/* Ventana de 1 día hábil para corregir el envío (no-admin) */}
                          {!esAdmin && esMia && o.estado === 'ejecutada' && dentroVentanaEdicion(o) && (
                            <button className="btn btn-xs btn-secondary" title="Anular el envío para corregirlo (1 día hábil)" onClick={() => confirmar('¿Anular el envío para corregir el registro?').then(ok => ok && anularEnvio.mutate(o))}>↩ Anular envío</button>
                          )}
                          {!esAdmin && esMia && o.estado === 'ejecutada' && !dentroVentanaEdicion(o) && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>En revisión (plazo de edición vencido)</span>
                          )}
                          {/* Admin */}
                          {esAdmin && o.estado === 'ejecutada' && <>
                            <button className="btn btn-xs btn-success" onClick={() => aprobar.mutate(o)} disabled={aprobar.isPending}>✓ Aprobar</button>
                            <button className="btn btn-xs btn-danger" onClick={() => pedir('Motivo del rechazo:', { title: 'Rechazar orden' }).then(motivo => { if (motivo !== null) rechazar.mutate({ o, motivo: motivo || '' }) })}>✕ Rechazar</button>
                          </>}
                          {esAdmin && o.estado !== 'ejecutada' && o.estado !== 'aprobada' && <button className="btn btn-xs btn-danger" title="Eliminar orden (solo admin)" onClick={() => confirmarEliminarOrden(o)}>🗑</button>}
                          {(o.estado === 'aprobada' || (esAdmin && o.estado !== 'ejecutada')) && o.foto_url && <button className="btn btn-xs btn-secondary" onClick={() => openEjecutar(o)}>📷</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nueva / Editar Orden (admin) */}
      <Modal open={modalNueva} onClose={() => { setModalNueva(false); setEditOrdenId(null) }} title={editOrdenId ? '✏ Editar Orden de Producción' : '🏭 Nueva Orden de Producción'} size="modal-lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => { setModalNueva(false); setEditOrdenId(null) }}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => crearOrden.mutate()} disabled={crearOrden.isPending}>{editOrdenId ? 'Guardar cambios' : 'Crear y asignar'}</button>
        </>}
      >
        <div className="form-group">
          <label className="form-label">Receta / Producto</label>
          <select className="form-control" value={form.origen_id ? `${form.origen === 'receta' ? 'recipe' : 'prod'}-${form.origen_id}` : ''} onChange={e => selectProducto(e.target.value)}>
            <option value="">Seleccionar...</option>
            {productos.length > 0 && <optgroup label="⭐ Productos">{productos.map(p => <option key={p.id} value={`prod-${p.id}`}>{p.nombre}{p.tipo === 'subproducto' ? ' (subproducto)' : ''}</option>)}</optgroup>}
            {recetas.length > 0 && <optgroup label="💾 Recetas rápidas">{recetas.map(r => <option key={r.id} value={`recipe-${r.id}`}>{r.nombre}</option>)}</optgroup>}
          </select>
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Cantidad planificada (unidades) *</label><input type="number" className="form-control" value={form.cantidad_plan} onChange={e => setForm(f => ({ ...f, cantidad_plan: e.target.value, baches_plan: '' }))} min={0} /></div>
          <div className="form-group"><label className="form-label">Unidad</label>
            <select className="form-control" value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}>
              <option value="unidades">unidades</option><option value="cajas">cajas</option><option value="kilos">kilos</option><option value="bolsas">bolsas</option>
            </select>
          </div>
        </div>
        {/* Guía: equivalencia de un bache según el producto elegido */}
        {form.unidadesPorBache > 0 && (
          <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
            ℹ Para este producto, <strong>1 bache ≈ {fNum(form.unidadesPorBache)} unidades</strong>.
            {parseFloat(form.cantidad_plan) > 0 && <> Tu cantidad ({fNum(parseFloat(form.cantidad_plan))} unid) equivale a <strong>{(parseFloat(form.cantidad_plan) / form.unidadesPorBache).toFixed(2)}</strong> bache(s).</>}
          </div>
        )}
        {/* Planear según la cantidad disponible de un ingrediente */}
        {prodReceta && prodReceta.ings.length > 0 && (
          <div className="form-group" style={{ background: 'rgba(124,179,66,0.06)', padding: 10, borderRadius: 'var(--radio)' }}>
            <label className="form-label">🧮 Planear por ingrediente disponible</label>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>Ingrediente</label>
                <select className="form-control" style={{ maxWidth: 200 }} value={ingIdx} onChange={e => setIngIdx(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {prodReceta.ings.map((i, k) => <option key={k} value={k}>{i.nombre} ({fNum(i.cantidad)} g/bache)</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>Disponible (g)</label>
                <input type="number" className="form-control" style={{ maxWidth: 130 }} value={ingDisp} onChange={e => setIngDisp(e.target.value)} placeholder="Ej: 5000" min={0} />
              </div>
              {ingIdx !== '' && ingDisp && (
                <>
                  <span style={{ fontSize: '0.85rem', color: 'var(--texto-suave)', paddingBottom: 8 }}>= <strong>{fNum(unidadesDesdeIngrediente())}</strong> unidades</span>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => {
                    const ing = prodReceta.ings[parseInt(ingIdx)]
                    const baches = (parseFloat(ingDisp) || 0) / (parseFloat(ing?.cantidad) || 1)
                    setForm(f => ({ ...f, cantidad_plan: String(unidadesDesdeIngrediente()), baches_plan: baches }))
                  }}>Usar esta cantidad</button>
                </>
              )}
            </div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Calcula cuántas unidades saldrían con la cantidad que tienes de ese ingrediente (considera rendimiento y desperdicio).</small>
          </div>
        )}
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Lote <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(N°+año, ej. {siguienteLoteSugerido})</small></label><input className="form-control" value={form.lote} onChange={e => setForm(f => ({ ...f, lote: e.target.value }))} placeholder={`Ej: ${siguienteLoteSugerido}`} />
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.73rem', display: 'block', marginTop: 4 }}>
              {ultimoLoteOrden && <>Último lote usado: <strong>{ultimoLoteOrden}</strong> · </>}
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => setForm(f => ({ ...f, lote: siguienteLoteSugerido }))}>Usar siguiente: {siguienteLoteSugerido}</button>
            </small>
          </div>
          <div className="form-group"><label className="form-label">Fecha de vencimiento</label>
            <input type="date" className="form-control" value={form.vence} onChange={e => setForm(f => ({ ...f, vence: e.target.value }))} />
            <QuickVence opts={venceOpts} onEdit={editarVenceOpts} onPick={(v) => setForm(f => ({ ...f, vence: v }))} />
          </div>
        </div>
        {/* Lotes de MP en stock: sugerencia PEPS (cuál gastar primero) + alertas de vencimiento */}
        {form.origen === 'producto' && prodReceta && prodReceta.ings.some(i => i.mpId) && (
          <div className="form-group" style={{ background: 'rgba(124,179,66,0.06)', padding: 10, borderRadius: 'var(--radio)' }}>
            <label className="form-label">📦 Lotes de MP en stock (orden PEPS sugerido)</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer', marginBottom: 8, color: 'var(--tierra)' }}>
              <input type="checkbox" checked={!!form.forzar_sin_lote} onChange={e => setForm(f => ({ ...f, forzar_sin_lote: e.target.checked }))} />
              ⚠ Forzar salida sin lote (no descontar de lotes específicos; solo del stock total)
            </label>
            {form.forzar_sin_lote
              ? <div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>El consumo se registrará como <strong>salida sin lote</strong>; los lotes no se modifican.</div>
              : prodReceta.ings.filter(i => i.mpId).map((ing, k) => {
              const lts = lotesDeMP(ing.mpId)
              const elegido = form.lotes_elegidos?.[ing.mpId] || form.lotes_elegidos?.[String(ing.mpId)] || ''
              const descLote = (l) => {
                const est = estadoLote(l.vencimiento)
                const etq = est === 'vencido' ? ' ⛔ Vencido' : est === 'por_vencer' ? ' ⚠ Por vencer' : ''
                return `Lote ${l.lote || '(s/n)'} · ${fNum(l.cantidad_actual)} disp. · Vence ${fmtVence(l.vencimiento)}${etq}`
              }
              return (
                <div key={k} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--selva)' }}>{ing.nombre}</div>
                  {lts.length === 0
                    ? <div style={{ fontSize: '0.78rem', color: 'var(--rojo)' }}>⚠ Sin lotes en stock</div>
                    : lts.length === 1
                      ? (() => {
                          const l = lts[0], est = estadoLote(l.vencimiento)
                          const c = est === 'vencido' ? 'var(--rojo)' : est === 'por_vencer' ? 'var(--tierra)' : 'var(--texto-suave)'
                          return <div style={{ fontSize: '0.78rem', color: c, padding: '2px 0' }}>👉 {descLote(l)}</div>
                        })()
                      : <select className="form-control" style={{ fontSize: '0.8rem', marginTop: 2 }}
                          value={elegido}
                          onChange={e => setForm(f => ({ ...f, lotes_elegidos: { ...f.lotes_elegidos, [ing.mpId]: e.target.value } }))}>
                          <option value="">👉 Automático (PEPS sugerido): {descLote(lts[0])}</option>
                          {lts.map(l => <option key={l.id} value={l.id}>{descLote(l)}</option>)}
                        </select>
                  }
                </div>
              )
            })}
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>👉 = lote sugerido a consumir primero (más próximo a vencer / más antiguo). Si hay 2+ lotes vigentes puedes elegir cuál usar; «Automático (PEPS)» reserva el sugerido. Al iniciar la orden se reserva el lote elegido (y PEPS para el resto si falta).</small>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Operario asignado</label>
          <select className="form-control" value={form.operario} onChange={e => setForm(f => ({ ...f, operario: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {esAdmin && profile?.nombre && <option value={profile.nombre}>🧑‍💼 {profile.nombre} (yo — ejecutar yo mismo)</option>}
            {empleados.filter(e => e.nombre !== profile?.nombre).map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
          </select>
        </div>
        {form.origen === 'receta' && (
          <div className="alert" style={{ fontWeight: 600, color: 'var(--selva)', background: 'rgba(124,179,66,0.10)', border: '1px solid var(--lima)', padding: 10, borderRadius: 'var(--radio)', marginBottom: 10, fontSize: '0.85rem' }}>
            🧪 Esta orden es de <strong>PRUEBA</strong> por provenir de una receta rápida.
          </div>
        )}
        <div className="form-group" style={{ background: 'rgba(200,169,74,0.08)', padding: 12, borderRadius: 'var(--radio)' }}>
          <label style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--tierra)' }}>
            <input type="checkbox" checked={form.es_subproducto} onChange={e => setForm(f => ({ ...f, es_subproducto: e.target.checked }))} style={{ marginRight: 6 }} />
            Es un subproducto interno (alimenta Inventario MP, no el registro de producción)
          </label>
          {form.es_subproducto && (
            <div style={{ marginTop: 10 }}>
              <label className="form-label">Materia prima que alimenta</label>
              <select className="form-control" value={form.mp_id} onChange={e => setForm(f => ({ ...f, mp_id: e.target.value }))}>
                <option value="">Seleccionar MP...</option>
                {mps.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="form-group"><label className="form-label">Notas para el operario</label><textarea className="form-control" rows={2} value={form.notas_orden} onChange={e => setForm(f => ({ ...f, notas_orden: e.target.value }))} /></div>
      </Modal>

      {/* Modal Ejecutar / Ver resultados */}
      <Modal open={modalEjec} onClose={() => setModalEjec(false)} title={`${ordenActiva?.estado === 'ejecutada' || ordenActiva?.estado === 'aprobada' ? '👁 Resultados' : '✓ Registrar Resultados'} — ${ordenActiva?.producto || ''}`} size="modal-lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalEjec(false)}>Cerrar</button>
          {ordenActiva && (ordenActiva.estado === 'en_proceso' || ordenActiva.estado === 'rechazada') && !esAdmin && (
            <button className="btn btn-primary" onClick={enviarResultados} disabled={saving}>{saving ? 'Enviando...' : 'Enviar a aprobación'}</button>
          )}
        </>}
      >
        {ordenActiva && (() => {
          const soloLectura = esAdmin || !(ordenActiva.estado === 'en_proceso' || ordenActiva.estado === 'rechazada')
          return (
          <>
            <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>
              {ordenActiva.es_subproducto ? 'Subproducto: al aprobar, la cantidad se sumará al Inventario MP.' : 'Producto terminado: al aprobar, se registrará en Producción.'}
              {ordenActiva.notas_orden && <><br /><strong>Notas:</strong> {ordenActiva.notas_orden}</>}
            </div>
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Cantidad resultante</label><input type="number" className="form-control" value={ejec.cantidad_result} onChange={e => setEjec(s => ({ ...s, cantidad_result: e.target.value }))} disabled={soloLectura} /></div>
              <div className="form-group"><label className="form-label">Fecha producción</label><input type="date" className="form-control" value={ejec.fecha_prod || ''} onChange={e => setEjec(s => ({ ...s, fecha_prod: e.target.value }))} disabled={soloLectura} /></div>
            </div>
            <div className="form-grid-3">
              <div className="form-group"><label className="form-label">Lote</label><input className="form-control" value={ejec.lote} onChange={e => setEjec(s => ({ ...s, lote: e.target.value }))} disabled={soloLectura} /></div>
              <div className="form-group"><label className="form-label">Vencimiento</label><input type="date" className="form-control" value={ejec.vence || ''} onChange={e => setEjec(s => ({ ...s, vence: e.target.value }))} disabled={soloLectura} /></div>
              <div className="form-group"><label className="form-label">Empaque</label>
                <select className="form-control" value={ejec.empaque} onChange={e => setEjec(s => ({ ...s, empaque: e.target.value }))} disabled={soloLectura}>
                  <option>UNIDADES</option><option>CAJAS</option><option>BOLSAS</option><option>KILOS</option>
                </select>
              </div>
            </div>
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Hora inicio</label><input type="time" className="form-control" value={ejec.inicio || ''} onChange={e => setEjec(s => ({ ...s, inicio: e.target.value }))} disabled={soloLectura} /></div>
              <div className="form-group"><label className="form-label">Hora final</label><input type="time" className="form-control" value={ejec.fin || ''} onChange={e => setEjec(s => ({ ...s, fin: e.target.value }))} disabled={soloLectura} /></div>
            </div>
            <div className="form-group"><label className="form-label">Observaciones</label><textarea className="form-control" rows={2} value={ejec.obs_result} onChange={e => setEjec(s => ({ ...s, obs_result: e.target.value }))} disabled={soloLectura} /></div>
            <div className="form-group">
              <label className="form-label">Registro fotográfico</label>
              {soloLectura
                ? (ordenActiva.foto_url ? <img src={ordenActiva.foto_url} alt="resultado" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 4 }} /> : <span style={{ color: 'var(--texto-suave)' }}>Sin foto</span>)
                : <div className="foto-upload" onClick={() => fotoRef.current?.click()}>
                    <input type="file" accept="image/*" ref={fotoRef} onChange={handleFoto} style={{ display: 'none' }} />
                    {fotoPrev ? <img src={fotoPrev} className="foto-preview" alt="preview" /> : <><div style={{ fontSize: '2rem' }}>📸</div><div style={{ color: 'var(--texto-suave)', fontSize: '0.9rem' }}>Toca para agregar foto</div></>}
                  </div>
              }
            </div>
            {ordenActiva.estado === 'aprobada' && <div className="alert alert-success" style={{ fontSize: '0.85rem' }}>Aprobada por {ordenActiva.aprobado_por} el {fFecha((ordenActiva.fecha_aprob||'').split('T')[0])}</div>}
          </>
          )
        })()}
      </Modal>

      {/* Modal Preparar — calcula ingredientes con la cantidad de la orden */}
      {/* Modal: evidencia firmada de la orden impresa */}
      <Modal open={modalEvid} onClose={() => setModalEvid(false)} title="📎 Evidencia de la orden impresa"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalEvid(false)}>Más tarde</button>
          <button className="btn btn-primary" onClick={confirmarEvidencia} disabled={savingEvid}>{savingEvid ? 'Guardando...' : 'Registrar evidencia'}</button>
        </>}>
        <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>
          Imprimiste la <strong>Orden OP-{evidOrden?.id}</strong>. Para dejar la trazabilidad completa (BPM), adjunta el <strong>formato escaneado y firmado</strong> o registra la <strong>firma digital</strong>.
        </div>
        <div className="form-group">
          <label className="form-label">📄 Archivo escaneado y firmado</label>
          <input type="file" accept="image/*,.pdf" onChange={e => setEvidFile(e.target.files[0] || null)} />
          {evidFile && <div style={{ fontSize: '0.8rem', color: 'var(--selva)', marginTop: 4 }}>📎 {evidFile.name}</div>}
        </div>
        <div style={{ textAlign: 'center', color: 'var(--texto-suave)', fontSize: '0.8rem', margin: '6px 0' }}>— o —</div>
        <div className="form-group">
          <label className="form-label">✍ Firma digital (nombre de quien firma)</label>
          <input className="form-control" value={firmaDigital} onChange={e => setFirmaDigital(e.target.value)} placeholder="Ej: Juan Pérez — Operario" />
          <small style={{ color: 'var(--texto-suave)' }}>Quedará registrado con tu usuario y la fecha/hora como firma electrónica.</small>
        </div>
      </Modal>

      <Modal open={modalPrep} onClose={() => setModalPrep(false)} title={`🧮 Ingredientes — ${ordenPrep?.producto || ''}`} size="modal-lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalPrep(false)}>Cerrar</button>
          {prepFicha && <button className="btn btn-secondary" onClick={() => descargarFicha(prepFicha.url, prepFicha.nombre)}>⬇ Ficha técnica</button>}
          <button className="btn btn-dorado" onClick={imprimirOrden}>🖨 Imprimir orden</button>
          {ordenPrep?.operario === profile?.nombre && <button className="btn btn-primary" onClick={() => { setModalPrep(false); openProceso(ordenPrep) }}>▶ Iniciar proceso</button>}
        </>}
      >
        {ordenPrep && (
          <>
            <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>
              Cantidad solicitada en la orden: <strong>{fNum(ordenPrep.cantidad_plan)} {ordenPrep.unidad}</strong>.
              Estos son los ingredientes a utilizar (precargados). Imprime la orden y usa <strong>▶ Iniciar proceso</strong> para registrar tiempos y luego producción.
            </div>
            {prepInfo?.baches != null && (
              <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>Equivale a <strong>{prepInfo.baches.toFixed(2)}</strong> bache(s) de {fNum(prepInfo.bache)} unidades.</p>
            )}

            {/* Datos previstos */}
            {prepDatos && (
              <div style={{ background: 'var(--selva)', color: 'var(--crema)', borderRadius: 'var(--radio)', padding: 14, marginBottom: 14 }}>
                <div style={{ fontFamily: "'Playfair Display', serif", color: 'var(--dorado)', marginBottom: 10 }}>📦 Datos Previstos</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: '0.85rem' }}>
                  <div><div style={{ opacity: 0.6, fontSize: '0.72rem' }}>Mezcla total</div><strong>{fNum(prepDatos.totalMezcla)} g</strong></div>
                  <div><div style={{ opacity: 0.6, fontSize: '0.72rem' }}>Peso esperado</div><strong>{fNum(prepDatos.pesoEsperado)} g</strong></div>
                  <div><div style={{ opacity: 0.6, fontSize: '0.72rem' }}>Desperdicio ({prepDatos.desp}%)</div><strong>{fNum(prepDatos.pesoDesp)} g</strong></div>
                  <div><div style={{ opacity: 0.6, fontSize: '0.72rem' }}>Unidades estimadas</div><strong style={{ fontSize: '1.2rem', color: 'var(--dorado)' }}>{prepDatos.unidades.toFixed(1)}</strong></div>
                  <div><div style={{ opacity: 0.6, fontSize: '0.72rem' }}>Costo MP total</div><strong>{fCOP(prepDatos.totalCostoMP)}</strong></div>
                  <div><div style={{ opacity: 0.6, fontSize: '0.72rem' }}>Costo MP / unidad</div><strong>{fCOP(prepDatos.costoMPunidad)}</strong></div>
                </div>
              </div>
            )}

            <div className="table-wrap">
              <table>
                <thead><tr><th>Ingrediente</th><th className="td-number">Cantidad a usar</th></tr></thead>
                <tbody>
                  {prepIngs.length === 0
                    ? <tr><td colSpan={2} className="empty-table">Sin receta vinculada a esta orden (o aún cargando).</td></tr>
                    : prepIngs.map((i, k) => <tr key={k}><td>{i.nombre}</td><td className="td-number">{(i.gramos || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })} g</td></tr>)}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginTop: 10 }}>
              Cuando registres y completes los lotes en Producción, vuelve aquí y usa <strong>✅ Enviar y cerrar</strong> en la fila de la orden.
            </p>
          </>
        )}
      </Modal>

      {/* Modal Iniciar proceso — fecha de inicio + tiempos por subproceso (autoguardado) */}
      <Modal open={modalProceso} onClose={() => setModalProceso(false)} title={`▶ Proceso — ${ordenPrep?.producto || ''}`} size="modal-lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalProceso(false)}>Cerrar</button>
          <button className="btn btn-secondary" onClick={() => guardarProcesoData(false)}>💾 Guardar</button>
          <button className="btn btn-dorado" onClick={imprimirOrden}>🖨 Imprimir</button>
          <button className="btn btn-success" onClick={abrirConfirmEnvio}>✅ Enviar y cerrar</button>
        </>}>
        {ordenPrep && (
          <>
            <div className="form-grid-2" style={{ background: 'rgba(124,179,66,0.06)', padding: 10, borderRadius: 'var(--radio)', marginBottom: 12 }}>
              <div className="form-group" style={{ margin: 0 }}><label className="form-label">Lote *</label><input className="form-control" value={prepLote} onChange={e => setPrepLote(e.target.value)} placeholder="Ej: L-2026-001" /></div>
              <div className="form-group" style={{ margin: 0 }}><label className="form-label">Fecha de vencimiento *</label><input type="date" className="form-control" value={prepVence} onChange={e => setPrepVence(e.target.value)} /><QuickVence opts={venceOpts} onEdit={editarVenceOpts} onPick={setPrepVence} base={prepFechaInicio} /></div>
              <div className="form-group" style={{ margin: 0 }}><label className="form-label">Fecha de inicio de fabricación *</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="date" className="form-control" value={prepFechaInicio} onChange={e => setPrepFechaInicio(e.target.value)} />
                  <button type="button" className="btn btn-xs btn-secondary" onClick={() => setPrepFechaInicio(hoyISO())}>Hoy</button>
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.02)', padding: 10, borderRadius: 'var(--radio)', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem' }}>⏱ Tiempos por proceso / subproceso</strong>
                <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                  <input type="checkbox" checked={autoguardar} onChange={e => setAutoguardar(e.target.checked)} /> Autoguardar
                </label>
                {autoSavedAt && autoguardar && <span style={{ fontSize: '0.7rem', color: 'var(--selva)' }}>✓ guardado {autoSavedAt}</span>}
                <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setPrepProcesos(p => [...p, { nombre: '', inicio: '', fin: '' }])}>+ Proceso</button>
              </div>
              {prepProcesos.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--texto-suave)' }}>Sin procesos definidos en la ficha. Usa "+ Proceso" para agregar.</p>}
              {prepProcesos.map((p, i) => {
                const upd = (k, v) => setPrepProcesos(arr => arr.map((x, idx) => idx === i ? { ...x, [k]: v } : x))
                return (
                  <div key={i} className={ordProc.rowClassName(i)} {...ordProc.rowProps(i)} style={{ display: 'grid', gridTemplateColumns: 'auto 1.3fr 1.2fr 1.1fr 1.1fr auto', gap: 8, alignItems: 'end', marginBottom: 8, borderBottom: '1px dashed var(--crema-oscuro)', paddingBottom: 8 }}>
                    <span {...ordProc.handleProps(i)} style={{ ...ordProc.handleProps(i).style, alignSelf: 'center', paddingBottom: 0 }}>⠿</span>
                    <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Proceso/subproceso</label><input className="form-control" value={p.nombre} onChange={e => upd('nombre', e.target.value)} placeholder="Ej: Mezclado, Horneo..." /></div>
                    <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Fecha</label><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="date" className="form-control" value={p.fecha || ''} onChange={e => upd('fecha', e.target.value)} /><button type="button" className="btn btn-xs btn-secondary" title="Hoy" onClick={() => upd('fecha', hoyISO())}>Hoy</button></div></div>
                    <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Inicio</label><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><TimeField value={p.inicio} onChange={v => upd('inicio', v)} /><button type="button" className="btn btn-xs btn-secondary" title="Ahora" onClick={() => upd('inicio', horaAhora())}>⏱</button></div></div>
                    <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Fin</label><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><TimeField value={p.fin} onChange={v => upd('fin', v)} /><button type="button" className="btn btn-xs btn-secondary" title="Ahora" onClick={() => upd('fin', horaAhora())}>⏱</button></div></div>
                    <button type="button" className="btn btn-xs btn-danger" onClick={() => setPrepProcesos(arr => arr.filter((_, idx) => idx !== i))}>✕</button>
                  </div>
                )
              })}
              <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Usa ⏱ para fijar la hora actual. Se guarda automáticamente.</small>
            </div>

            {/* Resultado de producción */}
            <div style={{ background: 'rgba(200,169,74,0.08)', padding: 10, borderRadius: 'var(--radio)' }}>
              <strong style={{ fontSize: '0.9rem' }}>📦 Resultado de producción</strong>
              <div className="form-grid-2" style={{ marginTop: 8 }}>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Unidades obtenidas *</label><input type="number" className="form-control" value={prepUnidades} onChange={e => setPrepUnidades(e.target.value)} min={0} step="0.01" placeholder={`Planificado: ${fNum(ordenPrep.cantidad_plan)}`} /></div>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Responsable</label><input className="form-control" value={prepResp} onChange={e => setPrepResp(e.target.value)} /></div>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Peso final (g/Kg)</label><input type="number" className="form-control" value={prepPesoFinal} onChange={e => setPrepPesoFinal(e.target.value)} min={0} placeholder="Peso conforme obtenido" /></div>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Peso desperdicio</label><input type="number" className="form-control" value={prepPesoDesp} onChange={e => setPrepPesoDesp(e.target.value)} min={0} placeholder="Dañado / quemado" /></div>
                {prepPorciona && <>
                  <div className="form-group" style={{ margin: 0 }}><label className="form-label">Peso subporción (g) <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(de la ficha)</small></label><input type="number" className="form-control" value={prepPesoSubp} readOnly style={{ background: 'var(--crema)' }} /></div>
                  <div className="form-group" style={{ margin: 0 }}><label className="form-label">Cantidad subporciones *</label><input type="number" className="form-control" value={prepCantSubp} onChange={e => {
                    const v = e.target.value; setPrepCantSubp(v)
                    const pu = parseFloat(prepInfo?.pesoUnidad) || 0, psub = parseFloat(prepPesoSubp) || 0
                    if (pu > 0 && psub > 0 && v !== '') setPrepUnidades(String(Math.round((parseFloat(v) || 0) * psub / pu)))
                  }} min={0} /></div>
                </>}
              </div>
              <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">Observaciones</label><textarea className="form-control" rows={2} value={prepObs} onChange={e => setPrepObs(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={prepConforme} onChange={e => setPrepConforme(e.target.checked)} /> Lote principal conforme
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={prepSurtido} onChange={e => setPrepSurtido(e.target.checked)} /> 📦 Empacado surtido / mezclado con otro lote
                </label>
              </div>
              {prepSurtido && (
                <div className="form-group" style={{ background: 'rgba(200,169,74,0.10)', borderRadius: 'var(--radio)', padding: 10 }}>
                  <label className="form-label">¿Con qué lote(s) se mezcló?</label>
                  <input className="form-control" list="dl-lotes-mezcla" value={prepLoteMezcla}
                    onChange={e => { const v = e.target.value; setPrepLoteMezcla(v); const auto = autoSurtido(ordenPrep.producto, v); if (auto) setPrepProductoSurtido(auto) }}
                    placeholder="Elige de la lista o escribe (ej: 160626, 170626)" />
                  <datalist id="dl-lotes-mezcla">{ultimos5Lotes.map(l => <option key={l} value={l} />)}</datalist>
                  <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Últimos lotes: {ultimos5Lotes.join(', ') || '—'}</small>
                  <label className="form-label" style={{ marginTop: 8 }}>Producto surtido resultante <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(elige del catálogo de Producto Terminado; se sugiere según el lote)</small></label>
                  <select className="form-control" value={prepProductoSurtido} onChange={e => setPrepProductoSurtido(e.target.value)}>
                    <option value="">Seleccionar producto terminado...</option>
                    {terminados.map(t => <option key={t.id} value={t.nombre}>{t.tipo === 'surtido' ? '🔀 ' : ''}{t.nombre}</option>)}
                    {prepProductoSurtido && !terminados.some(t => t.nombre === prepProductoSurtido) && <option value={prepProductoSurtido}>⚠ {prepProductoSurtido} (sin registrar)</option>}
                  </select>
                  {prepProductoSurtido && !terminados.some(t => t.nombre === prepProductoSurtido) && (
                    <small style={{ color: 'var(--rojo)', fontSize: '0.72rem' }}>⚠ "{prepProductoSurtido}" no existe en el catálogo. Créalo en <strong>Producto Terminado</strong> para no afectar el stock.</small>
                  )}
                  <label className="form-label" style={{ marginTop: 8 }}>Cantidad empacada surtida (unidades/cajas) *</label>
                  <input type="number" className="form-control" value={prepSurtidoCantidad} onChange={e => setPrepSurtidoCantidad(e.target.value)} min={0} placeholder="Unidades o cajas empacadas surtidas" />
                  <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
                    Es el <strong>stock</strong> que se suma al producto terminado surtido. El <strong>lote de la caja</strong> será el último lote del surtido: <strong>{loteCaja(prepLoteMezcla) || '(elige el lote arriba)'}</strong>.
                  </small>
                </div>
              )}

              {/* ♻ Empacar saldo de mezcla en proceso (sobrante de lotes anteriores) */}
              {(() => {
                const saldos = saldosDeProducto(ordenPrep.producto, ordenPrep.origen_id)
                if (!saldos.length && !prepLotesExtra.length) return null
                const updExtra = (i, k, v) => setPrepLotesExtra(arr => arr.map((x, idx) => idx === i ? { ...x, [k]: v } : x))
                return (
                  <div className="form-group" style={{ background: 'rgba(124,179,66,0.07)', borderRadius: 'var(--radio)', padding: 10 }}>
                    <label className="form-label">♻ Empacar saldo de mezcla en proceso (lotes anteriores)</label>
                    {saldos.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {saldos.map(s => (
                          <button key={s.id} type="button" className="btn btn-xs btn-secondary"
                            disabled={prepLotesExtra.some(e => e.saldo_id === s.id)}
                            onClick={() => setPrepLotesExtra(arr => [...arr, { lote: s.lote || '', vence: s.vencimiento || '', unidades: '', conforme: true, saldo_id: s.id, peso_consumido: '', surtido: false, lote_mezcla: '' }])}>
                            + Lote {s.lote || '(s/n)'} · {fCant(s.peso)} {s.unidad} · vence {fmtVence(s.vencimiento)}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Lote nuevo extra (sin saldo, p.ej. parte que se empaca con otro lote) */}
                    <button type="button" className="btn btn-xs btn-secondary" style={{ marginBottom: 8 }}
                      onClick={() => setPrepLotesExtra(arr => [...arr, { lote: '', vence: prepVence || '', unidades: '', conforme: true, saldo_id: null, peso_consumido: '', surtido: false, lote_mezcla: '' }])}>+ Otro lote empacado</button>
                    {prepLotesExtra.map((ex, i) => {
                      const saldo = ex.saldo_id ? saldos.find(s => s.id === ex.saldo_id) : null
                      return (
                        <div key={i} style={{ border: '1px dashed var(--crema-oscuro)', borderRadius: 6, padding: 8, marginBottom: 6 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.8fr auto', gap: 6, alignItems: 'end' }}>
                            <div><label style={{ fontSize: '0.68rem', color: 'var(--texto-suave)' }}>Lote empacado</label><input className="form-control" value={ex.lote} onChange={e => updExtra(i, 'lote', e.target.value)} placeholder="Lote" /></div>
                            <div><label style={{ fontSize: '0.68rem', color: 'var(--texto-suave)' }}>Vence</label><input type="date" className="form-control" value={ex.vence || ''} onChange={e => updExtra(i, 'vence', e.target.value)} /></div>
                            <div><label style={{ fontSize: '0.68rem', color: 'var(--texto-suave)' }}>Unidades</label><input type="number" className="form-control" value={ex.unidades} onChange={e => updExtra(i, 'unidades', e.target.value)} min={0} /></div>
                            <button type="button" className="btn btn-xs btn-danger" onClick={() => setPrepLotesExtra(arr => arr.filter((_, idx) => idx !== i))}>✕</button>
                          </div>
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                            {saldo && <div style={{ fontSize: '0.75rem' }}><label style={{ color: 'var(--texto-suave)' }}>Consumido del saldo ({saldo.unidad}, disp. {fCant(saldo.peso)}): </label>
                              <input type="number" className="form-control" style={{ display: 'inline-block', width: 100 }} value={ex.peso_consumido} onChange={e => updExtra(i, 'peso_consumido', e.target.value)} min={0} max={saldo.peso} step="any" /></div>}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                              <input type="checkbox" checked={ex.conforme} onChange={e => updExtra(i, 'conforme', e.target.checked)} /> Conforme
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                              <input type="checkbox" checked={ex.surtido} onChange={e => updExtra(i, 'surtido', e.target.checked)} /> Surtido
                            </label>
                            {ex.surtido && <input className="form-control" style={{ width: 180 }} value={ex.lote_mezcla} onChange={e => updExtra(i, 'lote_mezcla', e.target.value)} placeholder="Lotes mezclados" />}
                          </div>
                        </div>
                      )
                    })}
                    <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Cada lote empacado genera su propio registro de producción (con su conforme/no conforme). El saldo elegido se descuenta por el peso consumido.</small>
                  </div>
                )
              })()}

              {/* 📦 ¿Sobró producción? → check que despliega el acordeón para registrar el saldo */}
              <div className="form-group" style={{ background: 'rgba(200,169,74,0.06)', borderRadius: 'var(--radio)', padding: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
                  <input type="checkbox" checked={prepHaySobrante} onChange={e => setPrepHaySobrante(e.target.checked)} /> ¿Sobró producción para después?
                </label>
                {prepHaySobrante && (
                  <div style={{ marginTop: 10 }}>
                    <label className="form-label">Cantidad sobrante *</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="number" className="form-control" style={{ maxWidth: 140 }} value={prepSobrantePeso} onChange={e => setPrepSobrantePeso(e.target.value)} min={0} step="any" placeholder="Cantidad sobrante" />
                      <select className="form-control" style={{ maxWidth: 140 }} value={prepSobranteUnidad} onChange={e => setPrepSobranteUnidad(e.target.value)}>
                        <option value="g">g</option>
                        <option value="Kg">Kg</option>
                        {prepPorciona && <option value="porciones">porciones</option>}
                        {prepPorciona && <option value="subporciones">subporciones</option>}
                        <option value="unidades">unidades</option>
                      </select>
                    </div>
                    <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
                      Elige la unidad real del sobrante: mezcla a granel en <strong>g/Kg</strong> (aunque el producto se porcione), o en porciones/unidades. Se guardará como saldo con el lote <strong>{prepLote || '(principal)'}</strong> y vencimiento {fmtVence(prepVence) || '—'}.
                    </small>
                  </div>
                )}
              </div>
              {/* Mano de obra por destajo (operarios extra de un día puntual) */}
              <div className="form-group" style={{ background: 'rgba(124,179,66,0.07)', borderRadius: 'var(--radio)', padding: 10 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  💰 Mano de obra por destajo (operarios extra de este día)
                  <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }}
                    onClick={() => setPrepDestajo(d => [...d, { nombre: '', modo: 'unidad', cantidad: '', tarifa: '' }])}>+ Agregar</button>
                </label>
                {prepDestajo.length === 0
                  ? <small style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>Solo si contrataste personal extra por destajo para esta producción. No afecta la nómina mensual.</small>
                  : (
                    <>
                      {prepDestajo.map((d, i) => {
                        const upd = (campo, val) => setPrepDestajo(arr => arr.map((x, k) => k === i ? { ...x, [campo]: val } : x))
                        const totalL = (parseFloat(d.cantidad) || 0) * (parseFloat(d.tarifa) || 0)
                        const uniLabel = d.modo === 'dia' ? 'personas/días' : d.modo === 'kg' ? 'kg' : 'unidades'
                        const tarLabel = d.modo === 'dia' ? '$/día' : d.modo === 'kg' ? '$/kg' : '$/unidad'
                        return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr 0.8fr 0.9fr auto auto', gap: 6, alignItems: 'center', marginTop: 6 }}>
                            <input className="form-control" placeholder="Nombre / descripción" value={d.nombre} onChange={e => upd('nombre', e.target.value)} />
                            <select className="form-control" value={d.modo} onChange={e => upd('modo', e.target.value)}>
                              <option value="unidad">Por unidad</option>
                              <option value="dia">Por persona/día</option>
                              <option value="kg">Por kg</option>
                            </select>
                            <input type="number" className="form-control" placeholder={uniLabel} title={uniLabel} value={d.cantidad} onChange={e => upd('cantidad', e.target.value)} min={0} />
                            <input type="number" className="form-control" placeholder={tarLabel} title={tarLabel} value={d.tarifa} onChange={e => upd('tarifa', e.target.value)} min={0} />
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--selva)', whiteSpace: 'nowrap' }}>{fCOP(totalL)}</span>
                            <button type="button" className="btn btn-xs btn-danger" onClick={() => setPrepDestajo(arr => arr.filter((_, k) => k !== i))}>✕</button>
                          </div>
                        )
                      })}
                      <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 700, color: 'var(--selva)' }}>
                        Total destajo: <span style={{ color: 'var(--dorado)' }}>{fCOP(destajoTotal())}</span>
                      </div>
                    </>
                  )}
              </div>
              {/* Guía de rotulado */}
              {(() => {
                const ddmmaa = (s) => { if (!s) return 'ddmmaa'; const [y, m, d] = s.split('-'); return `${d}${m}${y.slice(2)}` }
                const fab = prepFechaInicio
                return (
                  <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
                    <strong>Rotula así:</strong><br />
                    {prepSurtido ? (
                      <>
                        <strong>Lot. producto:</strong> {prepLote || '(lote original)'} <span style={{ color: 'var(--texto-suave)' }}>— mantiene el formato del lote original</span><br />
                        <strong>Lot. empaque final:</strong> {ddmmaa(fab)} <span style={{ color: 'var(--texto-suave)' }}>(fecha de fabricación, formato ddmmaa)</span><br />
                      </>
                    ) : (
                      <><strong>Lot.</strong> {prepLote || '(el lote ingresado al inicio)'} <span style={{ color: 'var(--texto-suave)' }}>— mismo lote de la producción</span><br /></>
                    )}
                    <strong>Exp.</strong> {ddmmaa(prepVence)} <span style={{ color: 'var(--texto-suave)' }}>(fecha de vencimiento, formato ddmmaa)</span>
                  </div>
                )
              })()}
              <div className="form-group">
                <label className="form-label">📷 Registro fotográfico</label>
                <div className="foto-upload" onClick={() => prepFotoRef.current?.click()} style={{ minHeight: 100 }}>
                  <input type="file" accept="image/*" ref={prepFotoRef} onChange={e => { const f = e.target.files[0]; if (f) { setPrepFotoFile(f); setPrepFotoPrev(URL.createObjectURL(f)) } }} style={{ display: 'none' }} />
                  {prepFotoPrev ? <img src={prepFotoPrev} className="foto-preview" alt="preview" /> : <><div style={{ fontSize: '1.6rem' }}>📸</div><div style={{ color: 'var(--texto-suave)', fontSize: '0.85rem' }}>Toca para agregar foto</div></>}
                </div>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* Modal Confirmar envío (resumen + confirmar/editar) */}
      <Modal open={modalConfirmEnvio} onClose={() => setModalConfirmEnvio(false)} title="✅ Confirmar y enviar producción"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalConfirmEnvio(false)}>✏ Editar</button>
          <button className="btn btn-success" onClick={confirmarEnviar} disabled={savingEvid}>{savingEvid ? 'Enviando...' : 'Confirmar y enviar'}</button>
        </>}>
        {ordenPrep && (
          <div style={{ fontSize: '0.9rem' }}>
            <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>{esAdmin ? <>Revisa los datos. Al confirmar se registra la producción y la orden queda <strong>cerrada y aprobada</strong> (no requiere otra aprobación).</> : <>Revisa los datos. Al confirmar se registra la producción y la orden pasa a <strong>aprobación</strong>.</>}</div>
            <table><tbody>
              <tr><td><b>Orden N°</b></td><td>OP-{opNum(ordenPrep.id)}{ordenPrep.es_prueba ? ' · 🧪 PRUEBA' : ''}</td></tr>
              <tr><td><b>Producto</b></td><td>{ordenPrep.producto}</td></tr>
              <tr><td><b>Operario</b></td><td>{ordenPrep.operario || '—'}</td></tr>
              <tr><td><b>Cantidad planificada</b></td><td>{fNum(ordenPrep.cantidad_plan)} {ordenPrep.unidad}</td></tr>
              <tr><td><b>Lote</b></td><td>{prepLote}</td></tr>
              <tr><td><b>Vencimiento</b></td><td>{prepVence ? fFecha(prepVence) : '—'}</td></tr>
              <tr><td><b>Fecha inicio fabricación</b></td><td>{prepFechaInicio ? fFecha(prepFechaInicio) : '—'}</td></tr>
              <tr><td><b>Horario</b></td><td>{tiemposGlobal().inicioGlobal || '—'} a {tiemposGlobal().finGlobal || '—'}</td></tr>
              <tr><td><b>Subprocesos</b></td><td>{tiemposGlobal().procs.length ? tiemposGlobal().procs.map(p => `${p.nombre}${p.inicio ? ' (' + p.inicio + (p.fin ? '–' + p.fin : '') + ')' : ''}`).join(' · ') : '—'}</td></tr>
              <tr><td><b>Unidades obtenidas</b></td><td>{fNum(parseFloat(prepUnidades) || 0)}</td></tr>
              <tr><td><b>Peso final / desperdicio</b></td><td>{fNum(parseFloat(prepPesoFinal) || 0)} / {fNum(parseFloat(prepPesoDesp) || 0)}</td></tr>
              {prepPorciona && <tr><td><b>Subporciones</b></td><td>{fNum(parseFloat(prepCantSubp) || 0)} de {fNum(parseFloat(prepPesoSubp) || 0)} g c/u</td></tr>}
              <tr><td><b>Empaque surtido</b></td><td>{prepSurtido ? `Sí — mezclado con: ${prepLoteMezcla || '(sin especificar)'}` : 'No'}</td></tr>
              <tr><td><b>Responsable</b></td><td>{prepResp || '—'}</td></tr>
              <tr><td><b>Estado</b></td><td>{prepConforme ? 'Conforme' : 'No conforme'}</td></tr>
              <tr><td><b>Observaciones</b></td><td>{prepObs || '—'}</td></tr>
              <tr><td><b>Foto</b></td><td>{prepFotoFile || prepFotoPrev ? '✓ adjunta' : '—'}</td></tr>
            </tbody></table>
          </div>
        )}
      </Modal>

      {/* Modal Detalles de la orden */}
      <Modal open={!!ordenDetalle} onClose={() => setOrdenDetalle(null)} title={`📋 Orden #${ordenDetalle ? opNum(ordenDetalle.id) : ''} — ${ordenDetalle?.producto || ''}`} size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={() => setOrdenDetalle(null)}>Cerrar</button>}
      >
        {ordenDetalle && (() => {
          const o = ordenDetalle
          const est = ESTADO_LABEL[o.estado] || ESTADO_LABEL.pendiente
          const recs = recordsDeOrden(o.id)
          const D = ({ et, children }) => <div><strong style={{ color: 'var(--selva)' }}>{et}:</strong> {children}</div>
          return (
            <>
              <div className="grid-resp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.88rem', marginBottom: 14 }}>
                <D et="Estado"><span className={`badge ${est.badge}`}>{est.txt}</span></D>
                <D et="Tipo">{o.es_subproducto ? 'Subproducto interno' : 'Producto terminado'}</D>
                <D et="Cantidad planificada">{fNum(o.cantidad_plan)} {o.unidad}</D>
                <D et="Cantidad resultante">{o.cantidad_result != null ? fNum(o.cantidad_result) : '—'}</D>
                <D et="Operario">{o.operario || '—'}</D>
                <D et="Origen">{o.origen === 'receta' ? 'Receta rápida' : 'Producto / ficha'}</D>
                <D et="Lote">{o.lote || '—'}</D>
                <D et="Vencimiento">{o.vence ? fFecha(o.vence) : '—'}</D>
                <D et="Fecha producción">{o.fecha_prod ? fFecha(o.fecha_prod) : '—'}</D>
                <D et="Empaque">{o.empaque || '—'}</D>
                <D et="Horario">{(o.inicio || '—')} a {(o.fin || '—')}</D>
                <D et="Enviada">{o.fecha_envio ? fFecha(o.fecha_envio.split('T')[0]) : '—'}</D>
              </div>
              {/* Auditoría de creación — solo visible para administradores */}
              {esAdmin && (
                <div style={{ fontSize: '0.8rem', color: 'var(--texto-suave)', background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--radio)', padding: '6px 10px', marginBottom: 10 }}>
                  🧾 Creada por <strong>{o.creado_por || '—'}</strong>
                  {o.created_at && <> el <strong>{new Date(o.created_at).toLocaleString('es-CO')}</strong></>}
                </div>
              )}
              {o.notas_orden && <p style={{ fontSize: '0.85rem' }}><strong>Notas de la orden:</strong> {o.notas_orden}</p>}
              {o.obs_result && <p style={{ fontSize: '0.85rem' }}><strong>Observaciones del resultado:</strong> {o.obs_result}</p>}
              {o.estado === 'rechazada' && o.motivo_rechazo && <p style={{ fontSize: '0.85rem', color: 'var(--rojo)' }}><strong>Motivo de rechazo:</strong> {o.motivo_rechazo}</p>}
              {o.estado === 'aprobada' && <p style={{ fontSize: '0.85rem', color: 'var(--selva)' }}><strong>Aprobada por:</strong> {o.aprobado_por} · {o.fecha_aprob ? fFecha(o.fecha_aprob.split('T')[0]) : ''}</p>}
              {o.foto_url && <div style={{ marginTop: 8 }}><img src={o.foto_url} alt="resultado" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 4 }} /></div>}

              {/* Costos del lote (solo admin) */}
              {esAdmin && (() => {
                const prod = productos.find(p => String(p.id) === String(o.origen_id))
                if (!prod) return null
                const cvu = parseFloat(prod.costo_variable) || 0
                const totalU = parseFloat(prod.costo_final) || 0
                const overhead = Math.max(0, totalU - cvu)
                const planificadas = parseFloat(o.cantidad_plan) || 0
                const obtenidas = parseFloat(o.cantidad_result) || 0
                const destOrden = Array.isArray(o.destajo) ? o.destajo.reduce((s, d) => s + (parseFloat(d.cantidad) || 0) * (parseFloat(d.tarifa) || 0), 0) : 0
                const costoLoteFicha = totalU * (planificadas > 0 ? planificadas : obtenidas)
                const costoLote = costoLoteFicha + destOrden                       // costo real del lote (incluye destajo)
                const costoUnitReal = obtenidas > 0 ? costoLote / obtenidas : totalU
                const desv = totalU > 0 ? (costoUnitReal - totalU) / totalU * 100 : 0
                const alerta = obtenidas <= 0 ? null : Math.abs(desv) <= 5
                  ? { txt: '✅ Alineado con la ficha', badge: 'badge-verde' }
                  : desv > 5 ? { txt: `⚠ Más costoso de lo esperado (+${desv.toFixed(1)}%)`, badge: 'badge-rojo' }
                  : { txt: `Más barato de lo esperado (${desv.toFixed(1)}%)`, badge: 'badge-dorado' }
                return (
                  <>
                    <div className="card-title" style={{ fontSize: '0.95rem', marginTop: 12 }}>💰 Costos del lote (solo admin)</div>
                    {(() => { const q = obtenidas > 0 ? obtenidas : planificadas; return (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Concepto</th><th className="td-number">Por unidad</th><th className="td-number">Total lote ({fNum(q)} u)</th></tr></thead>
                        <tbody>
                          <tr><td>MP + empaque</td><td className="td-number">{fCOP(cvu)}</td><td className="td-number">{fCOP(cvu * q)}</td></tr>
                          <tr><td>Mano de obra / CIF</td><td className="td-number">{fCOP(overhead)}</td><td className="td-number">{fCOP(overhead * q)}</td></tr>
                          <tr style={{ fontWeight: 700, background: 'rgba(124,179,66,0.08)' }}><td>Costo total (ficha)</td><td className="td-number">{fCOP(totalU)}</td><td className="td-number">{fCOP(totalU * q)}</td></tr>
                          {destOrden > 0 && <tr><td>💰 Destajo (día especial)</td><td className="td-number">{q > 0 ? fCOP(destOrden / q) : '—'}</td><td className="td-number">{fCOP(destOrden)}</td></tr>}
                          {obtenidas > 0 && <tr style={{ fontWeight: 700, background: 'rgba(200,169,74,0.10)' }}><td>Costo REAL (producción{destOrden > 0 ? ' + destajo' : ''})</td><td className="td-number">{fCOP(costoUnitReal)}</td><td className="td-number">{fCOP(costoLote)}</td></tr>}
                          {planificadas > 0 && <tr><td>Planificadas → obtenidas</td><td className="td-number" colSpan={2}>{fNum(planificadas)} → {fNum(obtenidas)}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    )})()}
                    {alerta && <div style={{ marginTop: 6 }}><span className={`badge ${alerta.badge}`}>{alerta.txt}</span></div>}
                  </>
                )
              })()}

              {/* Trazabilidad lote-a-lote: lotes de MP consumidos */}
              {Array.isArray(o.lotes_mp) && o.lotes_mp.length > 0 && (
                <>
                  <div className="card-title" style={{ fontSize: '0.95rem', marginTop: 12 }}>🔗 Trazabilidad — Lotes de MP consumidos</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Materia prima</th><th className="td-number">Consumo</th><th>Lotes usados (PEPS)</th></tr></thead>
                      <tbody>
                        {o.lotes_mp.map((t, i) => (
                          <tr key={i}>
                            <td>{t.nombre}</td>
                            <td className="td-number">{fNum(t.consumo)} {t.unidad}</td>
                            <td style={{ fontSize: '0.8rem' }}>
                              {(t.lotes || []).length
                                ? t.lotes.map((l, k) => `${l.lote || 's/lote'}${l.vencimiento ? ' (vence ' + fFecha(l.vencimiento) + ')' : ''}: ${fNum(l.cantidad)}`).join(' · ')
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="card-title" style={{ fontSize: '0.95rem', marginTop: 12 }}>🧾 Lotes de producción vinculados ({recs.length})</div>
              {recs.length === 0
                ? <p className="empty-table">Aún no hay registros de producción para esta orden.</p>
                : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Lote</th><th>Cantidad</th><th>Avance</th></tr></thead>
                      <tbody>
                        {recs.map(r => (
                          <tr key={r.id}>
                            <td>{r.lote || '—'}</td>
                            <td className="td-number">{fNum(r.cantidad || 0)}</td>
                            <td>{r.completado ? <span className="badge badge-verde">Completado</span> : <span className="badge badge-dorado">En proceso</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </>
          )
        })()}
      </Modal>

      {/* Registro de creación de órdenes — solo admin */}
      <Modal open={modalAudit} onClose={() => setModalAudit(false)} title="📜 Registro de creación de órdenes" size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={() => setModalAudit(false)}>Cerrar</button>}
      >
        <div className="alert alert-info" style={{ fontSize: '0.83rem' }}>Auditoría interna: qué usuario creó cada orden y cuándo. Solo visible para administradores.</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Producto</th><th>Creada por</th><th>Fecha y hora</th></tr></thead>
            <tbody>
              {ordenes.length === 0
                ? <tr><td colSpan={4} className="empty-table">Sin órdenes</td></tr>
                : [...ordenes].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).map(o => (
                  <tr key={o.id}>
                    <td>#{opNum(o.id)}</td>
                    <td>{o.producto}</td>
                    <td><strong>{o.creado_por || '—'}</strong></td>
                    <td>{o.created_at ? new Date(o.created_at).toLocaleString('es-CO') : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  )
}

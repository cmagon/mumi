import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile, beginSilentWrites, endSilentWrites } from '../lib/supabase'
import { startDownload, updateDownload, endDownload, isDownloadCanceled } from '../lib/downloadProgress'
import { reservarPEPS, liberarReservaLotes, consumirReservaLotes, estadoLote, crearLoteEntrada, costoPEPS, revertirLotesDeOrden } from '../lib/lotes'
import { writeOrQueue } from '../lib/offlineQueue'
import { getConfig } from '../lib/appConfig'
import { useReorder } from '../hooks/useReorder'
import TimeField from '../components/ui/TimeField'
import BuscadorSelect from '../components/ui/BuscadorSelect'
import { fFecha, fNum, fCOP, componerSurtido } from '../lib/businessLogic'
import { setBusy } from '../lib/busy'
import Cargando from '../components/ui/Cargando'
import { useToast } from '../hooks/useToast'
import { useConfirm, usePrompt } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { notificar } from '../lib/notificaciones'
import {
  Recycle, ClipboardList, DollarSign, Link2, ReceiptText, Factory, Pencil, Printer, Share2,
  Undo2, Trash2, Camera, Check, X, Play, Download, Send, Package, Shuffle, Plus, Save,
  Eye, Calculator, FlaskConical, Hash, Clock, CheckCircle2, ScrollText, Image as ImageIcon,
  AlertTriangle, FileText,
} from 'lucide-react'

// Icono inline para usar dentro de títulos/botones manteniendo alineación con el texto
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

// Selector SI / NO reutilizable. value puede ser true, false o null (sin marcar).
function SiNo({ value, onChange }) {
  return (
    <span style={{ display: 'inline-flex', border: `1px solid ${value === null ? 'var(--rojo)' : 'var(--crema-oscuro)'}`, borderRadius: 8, overflow: 'hidden' }}>
      {[['SI', true], ['NO', false]].map(([txt, val]) => (
        <button key={txt} type="button" onClick={() => onChange(val)}
          style={{ padding: '5px 16px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', border: 'none',
            background: value === val ? (val ? 'var(--selva)' : 'var(--tierra)') : 'transparent',
            color: value === val ? '#fff' : 'var(--texto-suave)' }}>{txt}</button>
      ))}
    </span>
  )
}
import Modal from '../components/ui/Modal'
import Select from '../components/ui/Select'

const ESTADO_LABEL = {
  pendiente:  { txt: 'Pendiente',  badge: 'badge-gris' },
  en_proceso: { txt: 'En proceso', badge: 'badge-azul' },
  ejecutada:  { txt: 'Enviada a aprobación', badge: 'badge-dorado' },
  aprobada:   { txt: 'Aprobada',   badge: 'badge-verde' },
  rechazada:  { txt: 'Rechazada',  badge: 'badge-rojo' },
  cancelada:  { txt: 'Cerrada sin ejecutar', badge: 'badge-gris' },
}
// Días desde la creación de la orden a partir de los cuales se puede CERRAR sin ejecutarla
// (para órdenes atascadas: pendientes o en proceso que quedaron abiertas mucho tiempo).
const DIAS_CIERRE_SIN_EJECUTAR = 20
const diasAbierta = (o) => o?.created_at ? Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000) : 0

const EMPTY_ORDEN = {
  producto: '', origen: 'producto', origen_id: '', es_subproducto: false, es_mp: false, mp_id: '',
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
// Vencimiento a partir de la "vida útil" configurada en la ficha del producto (días o meses)
const desdeFechaVidaUtil = (base, valor, unidad) => {
  const d = base ? new Date(base + 'T00:00:00') : new Date()
  if (unidad === 'dias') d.setDate(d.getDate() + valor)
  else d.setMonth(d.getMonth() + valor)
  return fechaLocalISO(d)
}
const horaAhora = () => new Date().toTimeString().slice(0, 5)
// ¿La unidad de inventario se mide por peso/volumen (se produce por gramaje/kilos), no por conteo?
const esUnidadPeso = (u) => /kg|kilo|gramo|^g$|^gr$|litro|^l$|^ml$|mili|onza|lb|libra/i.test(String(u || '').trim())
const hoyISO = () => fechaLocalISO()
const labelMeses = (m) => m % 12 === 0 ? `${m / 12} año${m / 12 > 1 ? 's' : ''}` : `${m} mes${m > 1 ? 'es' : ''}`
const VENCE_OPTS_DEFAULT = [1, 2, 3, 6, 12, 24]
const getVenceOpts = () => { try { const v = JSON.parse(localStorage.getItem('mumi_vence_opts')); return Array.isArray(v) && v.length ? v : VENCE_OPTS_DEFAULT } catch { return VENCE_OPTS_DEFAULT } }
// Botones rápidos (configurables) para fijar la fecha de vencimiento
function QuickVence({ onPick, opts, onEdit, base, disabled }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, alignItems: 'center' }}>
      {opts.map(m => (
        <button key={m} type="button" className="btn btn-xs btn-secondary" disabled={disabled} onClick={() => onPick(desdeFechaMeses(base, m))}>+{labelMeses(m)}</button>
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
  // ¿Móvil/tablet? → se muestra el botón "Compartir" (imprimir suele hacerse por apps de terceros)
  const [esMovil, setEsMovil] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse), (max-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse), (max-width: 1024px)')
    const on = () => setEsMovil(mq.matches)
    if (mq.addEventListener) { mq.addEventListener('change', on); return () => mq.removeEventListener('change', on) }
    mq.addListener(on); return () => mq.removeListener(on)
  }, [])
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
  // Vida útil configurada en la ficha del producto de la orden en curso (para precargar/sugerir el vencimiento)
  const [prepVidaUtil, setPrepVidaUtil] = useState(null)   // { valor, unidad } | null
  const [prepProcesos, setPrepProcesos] = useState([{ nombre: '', inicio: '', fin: '' }])
  const ordProc = useReorder(setPrepProcesos)
  // Modo de tiempos: básico (solo hora inicio/fin) o avanzado (todos los procesos)
  const [prepModoAvanzado, setPrepModoAvanzado] = useState(false)
  const [prepHoraInicio, setPrepHoraInicio] = useState('')
  const [prepHoraFin, setPrepHoraFin] = useState('')
  const [autoguardar, setAutoguardar] = useState(true)
  const [autoSavedAt, setAutoSavedAt] = useState('')
  const [modalProceso, setModalProceso] = useState(false)
  // Resultado de producción capturado en el modal de proceso
  const [prepUnidades, setPrepUnidades] = useState('')
  const [prepPesoFinal, setPrepPesoFinal] = useState('')
  const [prepPesoDesp, setPrepPesoDesp] = useState('')
  const [prepObs, setPrepObs] = useState('')
  const [prepResp, setPrepResp] = useState('')
  const [prepConforme, setPrepConforme] = useState(null)   // null = sin marcar (obligatorio antes de enviar)
  const [prepSurtido, setPrepSurtido] = useState(null)   // null = sin marcar (obligatorio)
  const [prepLoteMezcla, setPrepLoteMezcla] = useState('')
  const [nuevoLoteMezcla, setNuevoLoteMezcla] = useState('')
  const [prepProductoSurtido, setPrepProductoSurtido] = useState('')
  // Subporciones (solo si el producto "se porciona")
  const [prepPorciona, setPrepPorciona] = useState(false)
  const [prepPesoSubp, setPrepPesoSubp] = useState('')
  const [prepCantSubp, setPrepCantSubp] = useState('')
  // Lotes empacados ADICIONALES (sobrantes/saldos de mezcla empacados aparte del lote principal).
  // Cada uno: { lote, vence, unidades, conforme, saldo_id, surtido, lote_mezcla }
  const [prepLotesExtra, setPrepLotesExtra] = useState([])
  // Campos adicionales personalizados de la orden (MP vendibles: Productor, Finca, etc.)
  const [prepCamposExtra, setPrepCamposExtra] = useState([])
  const [prepEsMpVend, setPrepEsMpVend] = useState(false)
  // Unidad de INVENTARIO de la MP interna vinculada (Kg, Gramo, Litro…). Cuando es por peso, el
  // resultado de la orden se captura y acredita al stock en ESA unidad, no en "unidades".
  const [prepMpUnidad, setPrepMpUnidad] = useState('')
  const [prepCamposOpen, setPrepCamposOpen] = useState(false)   // acordeón de campos adicionales (arriba)
  // Sobrante de mezcla que NO se empacó y queda como saldo en proceso (en peso)
  const [prepHaySobrante, setPrepHaySobrante] = useState(null)   // null = sin marcar (obligatorio)
  const [prepSobrantePeso, setPrepSobrantePeso] = useState('')
  const [prepSobranteUnidad, setPrepSobranteUnidad] = useState('g')
  const [prepSobranteManual, setPrepSobranteManual] = useState(false)   // el usuario tocó el sobrante → no auto-sugerir
  // Cantidad de unidades/cajas empacadas surtidas (stock del producto terminado surtido)
  const [prepSurtidoCantidad, setPrepSurtidoCantidad] = useState('')
  // Consumo del saldo de cada lote combinado en el surtido { saldoId: cantidad }
  const [prepSurtidoConsumos, setPrepSurtidoConsumos] = useState({})
  // Mano de obra por destajo (operarios extra de un día puntual): [{ nombre, modo, cantidad, tarifa }]
  const [prepDestajo, setPrepDestajo] = useState([])
  const destajoTotal = (arr = prepDestajo) => arr.reduce((s, d) => s + (parseFloat(d.cantidad) || 0) * (parseFloat(d.tarifa) || 0), 0)
  const [prepFotoFile, setPrepFotoFile] = useState(null)
  const [prepFotoPrev, setPrepFotoPrev] = useState('')
  const [modalConfirmEnvio, setModalConfirmEnvio] = useState(false)
  const [empaquePrevio, setEmpaquePrevio] = useState(null)   // { plan, faltantes } para el previo en el cierre
  // Insumos imprimibles de la ficha (etiquetas/rótulos en PDF) para que el operario los imprima
  const [prepImprimibles, setPrepImprimibles] = useState([])
  const [impBusy, setImpBusy] = useState('')
  // Ajuste de cantidades de ingredientes en planta: se guarda la cantidad ORIGINAL de la receta
  // para poder calcular la diferencia y ajustar el stock de MP al enviar la orden.
  const [prepIngsBase, setPrepIngsBase] = useState([])   // snapshot de la receta, no se toca
  const [editIngs, setEditIngs] = useState(false)        // modo edición habilitado (tras advertir)
  const prepFotoRef = useRef()
  // Receta del producto seleccionado en Nueva Orden (para planear por ingrediente disponible)
  const [prodReceta, setProdReceta] = useState(null)   // { ings, unidsBacheNet, bache, pesoUnidad, pesoSubp }
  // Empaque de saldo pendiente al crear la orden: null = sin preguntar aún, true/false = decisión
  const [empacarSaldo, setEmpacarSaldo] = useState(null)
  const [saldoSelId, setSaldoSelId] = useState('')
  const [saldoCant, setSaldoCant] = useState('')
  const [ingIdx, setIngIdx] = useState('')
  const [ingDisp, setIngDisp] = useState('')
  // Opciones rápidas de vencimiento (personalizables, en meses)
  const [venceOpts, setVenceOpts] = useState(getVenceOpts)
  const [ordenStartNum, setOrdenStartNum] = useState(() => parseInt(localStorage.getItem('mumi_orden_start')) || 1)
  // Ajustes GLOBALES desde SQL (app_config): numeración de órdenes y opciones de vencimiento.
  // Antes vivían solo en localStorage → cada dispositivo veía numeración/opciones distintas.
  // localStorage queda únicamente como respaldo offline (se refresca con el valor de la BD).
  useQuery({
    queryKey: ['app_config_ordenes'],
    queryFn: async () => {
      const { data } = await supabase.from('app_config').select('key, value').in('key', ['orden_start', 'vence_opts'])
      const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
      if (map.orden_start != null) {
        const n = parseInt(map.orden_start); if (!isNaN(n) && n > 0) { setOrdenStartNum(n); localStorage.setItem('mumi_orden_start', String(n)) }
      }
      if (Array.isArray(map.vence_opts) && map.vence_opts.length) {
        setVenceOpts(map.vence_opts); localStorage.setItem('mumi_vence_opts', JSON.stringify(map.vence_opts))
      }
      return map
    },
    staleTime: 5 * 60 * 1000,
  })
  const guardarCfgGlobal = async (key, value) => {
    const { error } = await supabase.from('app_config').upsert({ key, value }, { onConflict: 'key' })
    if (error) toast('No se pudo guardar el ajuste global: ' + error.message, 'error')
  }
  const editarVenceOpts = async () => {
    const actual = venceOpts.join(', ')
    const r = await pedir('Opciones de vencimiento en MESES, separadas por coma (ej: 1, 2, 3, 6, 12, 24):', { defaultValue: actual })
    if (r == null) return
    const arr = r.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
    if (!arr.length) { toast('Ingresa al menos un número de meses válido', 'warning'); return }
    setVenceOpts(arr); localStorage.setItem('mumi_vence_opts', JSON.stringify(arr))
    await guardarCfgGlobal('vence_opts', arr)
    toast('Opciones de vencimiento actualizadas (todos los dispositivos) ✓')
  }
  const [modalEjec, setModalEjec]   = useState(false)
  const [ordenPrep, setOrdenPrep]   = useState(null)
  const [prepIngs, setPrepIngs]     = useState([])
  const [prepTraza, setPrepTraza]   = useState([])   // trazabilidad de lotes de MP de la orden abierta
  // Detalle de un lote de MP (clic en "Lotes usados"): trae del inventario cuándo se compró,
  // a qué proveedor, costo, etc. — trazabilidad completa hacia atrás (pulpas de campesinos).
  const [detalleLoteMp, setDetalleLoteMp] = useState(null)   // { mpNombre, lote, unidad, cargando, filas: [...] }
  const abrirDetalleLoteMp = async (t, l) => {
    // Unidad REAL desde el inventario (la traza de órdenes antiguas puede traerla vacía)
    const mpInv = mps.find(m => String(m.id) === String(t.mp_id)) || mps.find(m => (m.nombre || '').trim().toLowerCase() === (t.nombre || '').trim().toLowerCase())
    const unidad = mpInv?.unidad || t.unidad || ''
    setDetalleLoteMp({ mpNombre: t.nombre, lote: l.lote || '', unidad, cargando: true, filas: [] })
    try {
      let data
      if (l.id) {
        // La reserva PEPS guarda el id exacto del lote → búsqueda precisa
        const r = await supabase.from('raw_material_lots').select('*').eq('id', l.id)
        data = r.data
      } else {
        let q = supabase.from('raw_material_lots').select('*').order('fecha_entrada', { ascending: false })
        if (t.mp_id) q = q.eq('mp_id', t.mp_id)
        q = (l.lote || '').trim() ? q.eq('lote', l.lote.trim()) : q.eq('lote', '')
        const r = await q; data = r.data
      }
      setDetalleLoteMp({ mpNombre: t.nombre, lote: l.lote || '', unidad, cargando: false, filas: data || [] })
    } catch {
      setDetalleLoteMp({ mpNombre: t.nombre, lote: l.lote || '', unidad, cargando: false, filas: [] })
    }
  }
  // Cantidades de lote: se guardan en la unidad de PRECIO de la MP (Kg/Litro=÷1000) — se muestran
  // en la unidad BASE en que se ingresan (gramos/ml); "Unidad" y otros quedan como conteo.
  const fmtCantLote = (v, unidad) => {
    const n = Number(v) || 0
    const un = String(unidad || '').toLowerCase()
    if (un.startsWith('kg') || un.startsWith('kilo')) return `${fCant(n * 1000)} g`
    if (un.startsWith('gramo') || un === 'g') return `${fCant(n)} g`
    if (un.startsWith('litro') || un === 'l') return `${fCant(n * 1000)} ml`
    if (un.startsWith('mililitro') || un === 'ml') return `${fCant(n)} ml`
    return `${fNum(n)} ${unidad || 'u'}`
  }
  const [prepInfo, setPrepInfo]     = useState(null)
  const [prepDatos, setPrepDatos]   = useState(null)   // datos previstos (mezcla, unidades, costos)
  const [prepFicha, setPrepFicha]   = useState(null)   // { url, nombre } ficha técnica
  const [ordenDetalle, setOrdenDetalle] = useState(null)   // orden para ver detalles
  const [detalleIngs, setDetalleIngs] = useState([])       // ingredientes calculados de la orden en detalle
  const [detalleFicha, setDetalleFicha] = useState(null)   // { rend, desp, pu } de la ficha (para el rendimiento)
  const [alistado, setAlistado] = useState({})             // check LOCAL de "alistar ingredientes" en el modal de proceso
  const [modalAudit, setModalAudit] = useState(false)      // registro de creación (solo admin)
  const [form, setForm]             = useState(EMPTY_ORDEN)
  const [ordenActiva, setOrdenActiva] = useState(null)
  const [ejec, setEjec] = useState({ cantidad_result: '', lote: '', vence: '', fecha_prod: new Date().toISOString().split('T')[0], inicio: '', fin: '', empaque: 'UNIDADES', obs_result: '' })
  const [fotoFile, setFotoFile] = useState(null)
  const [fotoPrev, setFotoPrev] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: ordenes = [], isLoading: loadingOrdenes, isFetching: fetchingOrdenes, isSuccess: okOrdenes } = useQuery({
    queryKey: ['production_orders'],
    queryFn: async () => { const { data } = await supabase.from('production_orders').select('*').order('created_at', { ascending: false }); return data || [] },
  })
  const cargandoOrdenes = loadingOrdenes || (fetchingOrdenes && !okOrdenes)

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
  // Reservado de un saldo por otras órdenes EN PROCESO (aún no cerradas). Se excluye la orden actual.
  const reservadoDeSaldo = (saldoId, exceptId) => (ordenes || [])
    .filter(o => o.estado === 'en_proceso' && o.id !== exceptId && Array.isArray(o.saldos_reservados))
    .reduce((s, o) => s + o.saldos_reservados.filter(x => String(x.saldo_id) === String(saldoId)).reduce((a, b) => a + (Number(b.cantidad) || 0), 0), 0)
  // Peso DISPONIBLE de un saldo = peso total − reservado por órdenes en proceso.
  const dispSaldo = (s, exceptId) => Math.max(0, (Number(s?.peso) || 0) - reservadoDeSaldo(s?.id, exceptId))
  // Orden ABIERTA (pendiente o en proceso, aún no cerrada) que ya está usando/empacando este saldo
  // (por reserva o por saldo_pack). Si existe, el saldo NO se puede meter a otra orden hasta cerrar esa.
  const ordenEnProcesoDeSaldo = (saldoId, exceptId) => (ordenes || []).find(o =>
    (o.estado === 'en_proceso' || o.estado === 'pendiente') && o.id !== exceptId && (
      (Array.isArray(o.saldos_reservados) && o.saldos_reservados.some(x => String(x.saldo_id) === String(saldoId))) ||
      (Array.isArray(o.saldo_pack) && o.saldo_pack.some(x => String(x.saldo_id) === String(saldoId)))
    ))
  // Saldos disponibles de un producto (por nombre y/o origen_id) con peso ya descontado por reservas.
  const saldosDeProducto = (nombre, origenId, exceptId) => saldosMezcla
    .filter(s => (origenId && String(s.origen_id) === String(origenId)) || (s.producto && nombre && s.producto === nombre))
    .map(s => ({ ...s, peso: dispSaldo(s, exceptId), pesoTotal: Number(s.peso) || 0 }))
    .filter(s => s.peso > 0 || (ordenPrep && prepLotesExtra.some(e => e.saldo_id === s.id)))

  // Devuelve el/los lote(s) de MP usados por un ingrediente, cruzando por mp_id (o nombre) contra la trazabilidad.
  // ---- Ajustes de ingredientes en planta ----
  // Reaplica sobre la receta los ajustes que ya estaban guardados en la orden, para que al
  // reabrir el modal se vean las cantidades reales y no las teóricas.
  const aplicarAjustesGuardados = (ings, ajustes) => {
    if (!Array.isArray(ajustes) || !ajustes.length) return ings
    return ings.map(i => {
      const a = ajustes.find(x => (i.mpId != null && String(x.mp_id) === String(i.mpId))
        || String(x.nombre || '').trim().toLowerCase() === String(i.nombre || '').trim().toLowerCase())
      return a && a.real != null ? { ...i, gramos: Number(a.real) || 0 } : i
    })
  }
  // Diferencias vigentes entre lo que se va a usar y lo que pedía la receta
  const calcAjustes = () => prepIngs.map((i, k) => {
    const previsto = Number(prepIngsBase[k]?.gramos) || 0
    const real = Number(i.gramos) || 0
    const delta = real - previsto
    return Math.abs(delta) < 0.01 ? null : { mp_id: i.mpId ?? null, nombre: i.nombre, previsto, real, delta }
  }).filter(Boolean)

  // La MP guarda su stock en SU unidad (Kg, Litro, Gramo…); la receta trabaja en gramos/ml
  // Texto de ayuda de la equivalencia entre unidades y subporciones (ej. "1 unidad = 8 subporciones")
  const psubUnidHint = (pesoUnidad, pesoSubp) => {
    const pu = parseFloat(pesoUnidad) || 0, ps = parseFloat(pesoSubp) || 0
    if (!(pu > 0) || !(ps > 0)) return 'según el peso de la subporción de la ficha'
    const n = pu / ps
    return `1 unidad = ${Number.isInteger(n) ? n : n.toFixed(1)} subporción(es) de ${fNum(ps)} g`
  }

  const gramosAUnidadMP = (gramos, unidad) => {
    const u = String(unidad || '').trim().toLowerCase()
    return (u === 'kg' || u.startsWith('kilo') || u === 'litro' || u.startsWith('lit')) ? gramos / 1000 : gramos
  }

  // 1ª advertencia: cambiar la receta en planta no es lo habitual, así que se pide confirmación
  // ANTES de dejar editar. Evita ediciones accidentales al tocar la pantalla en la tablet.
  const habilitarEdicionIngs = async () => {
    const ok = await confirmar(
      'Vas a cambiar las cantidades de ingredientes de este lote.\n\n' +
      'No es lo recomendable: lo normal es respetar la receta de la ficha. Hazlo solo si en planta ' +
      'realmente se gastó una cantidad distinta (se derramó, sobró, la fruta rindió diferente...).\n\n' +
      '¿Continuar?',
      { title: 'Corregir cantidades de la receta', confirmText: 'Sí, corregir' })
    if (ok) setEditIngs(true)
  }
  const cancelarEdicionIngs = () => { setPrepIngs(prepIngsBase.map(i => ({ ...i }))); setEditIngs(false) }

  // 2ª advertencia: al aplicar se detalla exactamente qué se descuenta y qué se devuelve.
  // El ajuste de stock ocurre al ENVIAR la orden, no aquí (si no, cancelar dejaría el stock movido).
  const confirmarAjustesIngs = async () => {
    const ajustes = calcAjustes()
    if (!ajustes.length) { setEditIngs(false); return }
    const detalle = ajustes.map(a => {
      const mp = a.mp_id != null ? mps.find(m => String(m.id) === String(a.mp_id)) : null
      const sufijo = mp ? '' : '  (sin materia prima enlazada: NO ajusta stock)'
      return a.delta > 0
        ? `• ${a.nombre}: se DESCUENTAN ${fCant(a.delta)} g adicionales del inventario${sufijo}`
        : `• ${a.nombre}: se DEVUELVEN ${fCant(-a.delta)} g al inventario${sufijo}`
    }).join('\n')
    const ok = await confirmar(
      `Confirma el movimiento de inventario que se hará al enviar la orden:\n\n${detalle}\n\n` +
      'Estos cambios quedan registrados en la orden y se le avisará al administrador.',
      { title: 'Confirmar ajuste de materia prima', confirmText: 'Confirmar ajuste' })
    if (ok) { setEditIngs(false); toast(`${ajustes.length} ajuste(s) registrados — se aplicarán al enviar la orden`, 'success') }
  }

  const loteDeTraza = (traza, ing) => {
    const key = String(ing?.nombre || '').trim().toLowerCase()
    const t = (traza || []).find(x => (ing?.mpId != null && String(x.mp_id) === String(ing.mpId)) || String(x.nombre || '').trim().toLowerCase() === key)
    return t && Array.isArray(t.lotes) ? t.lotes.map(l => l.lote).filter(Boolean).join(' · ') : ''
  }
  const lotesDeMP = (mpId) => lotesMP.filter(l => String(l.mp_id) === String(mpId))
    .sort((a, b) => ((a.vencimiento || '9999-99-99') < (b.vencimiento || '9999-99-99') ? -1 : a.vencimiento === b.vencimiento ? ((a.fecha_entrada || '') < (b.fecha_entrada || '') ? -1 : 1) : 1))
  // Formatea una cantidad de MP a una unidad legible. OJO: el stock/lotes se guardan en la UNIDAD de la MP
  // (Kg si la MP es Kg, gramos si es Gramo, etc.). Se normaliza a gramos/ml y se muestra:
  //   peso → gramos si <1 Kg, Kg (con decimales) si ≥1 Kg;  volumen → ml/L igual;  conteo → unidades.
  const fMP = (val, unidad) => {
    const v = Math.max(0, Number(val) || 0)
    const u = String(unidad || '').trim().toLowerCase()
    const fKg = (g) => g >= 1000 ? `${(g / 1000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} Kg` : `${Math.round(g).toLocaleString('es-CO')} g`
    const fL = (ml) => ml >= 1000 ? `${(ml / 1000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} L` : `${Math.round(ml).toLocaleString('es-CO')} ml`
    if (u === 'kg' || u.startsWith('kilo')) return fKg(v * 1000)   // guardado en Kg
    if (u.startsWith('g')) return fKg(v)                            // guardado en gramos
    if (u === 'l' || u.startsWith('litro')) return fL(v * 1000)     // guardado en litros
    if (u.startsWith('m')) return fL(v)                             // guardado en mililitros
    return `${fNum(v)} und`
  }
  const fmtVence = (v) => v ? new Date(v + 'T00:00:00').toLocaleDateString('es-CO') : '—'

  // Estructura del lote: NN+AA (consecutivo del año + año a 2 dígitos). Ej: 0126 = lote 01 de 2026.
  const ultimoLoteOrden = (ordenes.find(o => (o.lote || '').trim()) || {}).lote || ''
  const anioYY = String(new Date().getFullYear()).slice(2)
  // Mayor consecutivo del año actual entre los lotes de las órdenes (formato NN+AA).
  // Se EXCLUYE la orden que se está diligenciando: así, al usar/guardar su propio lote, la
  // sugerencia no salta al siguiente número (sigue sugiriendo el mismo hasta crear otra orden).
  const maxSeqAnio = ordenes
    .filter(o => o.id !== ordenPrep?.id)
    .map(o => (o.lote || '').trim())
    .filter(l => /^\d{3,4}$/.test(l) && l.slice(-2) === anioYY)
    .map(l => parseInt(l.slice(0, -2)))
    .filter(n => !isNaN(n))
    .reduce((mx, n) => Math.max(mx, n), 0)
  const siguienteLoteSugerido = String(maxSeqAnio + 1).padStart(2, '0') + anioYY
  // Lote por FECHA (ddmmaa) para materias primas / subproductos internos
  const loteFechaHoy = (() => { const d = new Date(), p2 = (n) => String(n).padStart(2, '0'); return p2(d.getDate()) + p2(d.getMonth() + 1) + String(d.getFullYear()).slice(2) })()

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
  // Lote de la caja (rótulo final) = el lote MÁS RECIENTE entre el propio y los combinados.
  // Formato NNAA (numeroaño): los últimos 2 dígitos son el año y el resto el consecutivo.
  // Ej.: entre 6926 y 7026 → 7026 (mayor consecutivo en el mismo año).
  // Si la cantidad planeada equivale (±10%) a un número entero de baches, lo redondea a entero
  // para que los ingredientes calculen exacto (ej: poner 87 = 1 bache → baches = 1, no 1.0035).
  const snapBaches = (b) => { if (!(b > 0)) return b; const r = Math.round(b); return Math.abs(b - r) <= 0.1 ? r : b }
  const loteCaja = (mezcla, principal) => {
    const ts = [principal, ...String(mezcla || '').split(/[,;]/)].map(s => String(s || '').trim()).filter(Boolean)
    if (!ts.length) return ''
    const rank = (l) => { const m = l.match(/^(\d+)(\d{2})$/); return m ? (parseInt(m[2]) * 100000 + parseInt(m[1])) : -1 }
    return ts.slice().sort((a, b) => { const ra = rank(a), rb = rank(b); if (ra !== rb) return rb - ra; return a < b ? 1 : -1 })[0]
  }
  const reiniciarNumeracion = async () => {
    const r = await pedir('Número inicial para la numeración de órdenes (la primera orden mostrará este número):', { defaultValue: String(ordenStartNum) })
    if (r == null) return
    const n = parseInt(r)
    if (isNaN(n) || n < 1) { toast('Ingresa un número válido (mayor a 0)', 'warning'); return }
    setOrdenStartNum(n); localStorage.setItem('mumi_orden_start', String(n))
    await guardarCfgGlobal('orden_start', n)
    toast(`Numeración reiniciada desde ${n} (todos los dispositivos) ✓`)
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
    queryFn: async () => { const { data } = await supabase.from('products_costing').select('id, nombre, tipo, bache, costo_final, costo_variable, activo, mp_id').order('nombre'); return data || [] },
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
    queryFn: async () => { const { data } = await supabase.from('raw_materials').select('id, nombre, unidad, stock').order('nombre'); return data || [] },
  })
  // Registros de producción vinculados a órdenes (para habilitar "Enviar y cerrar")
  const { data: prodRecords = [] } = useQuery({
    queryKey: ['production_records'],
    queryFn: async () => { const { data } = await supabase.from('production_records').select('id, orden_id, completado, cantidad, lote, producto, empaque, vence, surtido, producto_surtido, lote_mezcla, cant_subporciones, peso_subporcion'); return data || [] },
  })
  const recordsDeOrden = (id) => prodRecords.filter(r => r.orden_id === id)
  // Últimos 5 lotes guardados (para empaque surtido/mezclado)
  const ultimos5Lotes = [...new Set(ordenes.map(o => o.lote).concat(prodRecords.map(r => r.lote)).filter(Boolean))].slice(0, 5)
  // Mapa lote → producto (para el surtido: filtrar por tipo de producto y mostrar el nombre).
  const productoDeLoteMap = (() => {
    const m = {}
    const put = (lote, prod) => { const k = String(lote || '').trim(); if (k && prod && !m[k]) m[k] = prod }
    prodRecords.forEach(r => put(r.lote, r.producto))
    ordenes.forEach(o => put(o.lote, o.producto))
    saldosMezcla.forEach(s => put(s.lote, s.producto))
    return m
  })()
  // "Tipo" de producto = primera palabra (ej. "Bocadillo de seje" → "bocadillo") para agrupar sabores
  const tipoProducto = (nombre) => String(nombre || '').trim().toLowerCase().split(/\s+/)[0] || ''
  // Lotes sugeridos para el surtido: SOLO los que tienen SALDO PENDIENTE por empacar (mezcla_saldos),
  // del mismo TIPO que el producto actual, con su nombre y cantidad disponible. Excluye el lote propio.
  const lotesSurtidoDe = (productoActual, loteActual) => {
    const tipo = tipoProducto(productoActual)
    const la = String(loteActual || '').trim()
    const porLote = {}
    saldosMezcla.forEach(s => {
      const lote = String(s.lote || '').trim()
      const disp = dispSaldo(s, ordenPrep?.id)   // descuenta lo reservado por otras órdenes en proceso
      if (!lote || lote === la || !(disp > 0)) return
      if (tipoProducto(s.producto) !== tipo) return
      if (!porLote[lote]) porLote[lote] = { lote, prod: s.producto, peso: 0, unidad: s.unidad || 'g' }
      porLote[lote].peso += disp
    })
    return Object.values(porLote).slice(0, 20)
  }
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
    // Al abrir otra orden se descarta cualquier edición de ingredientes a medio hacer
    setOrdenPrep(o); setPrepIngs([]); setPrepIngsBase([]); setEditIngs(false)
    setPrepInfo(null); setPrepDatos(null); setPrepFicha(null)
    // No se auto-asigna el lote: se deja el que ya tuviera la orden (si venía de una edición previa);
    // en el modal de proceso solo se SUGIERE (placeholder + botón "Usar sugerido").
    setPrepLote(o.lote || ''); setPrepVence(o.vence || '')
    setPrepFechaInicio(o.fecha_inicio || '')
    setPrepVidaUtil(null)
    setPrepModoAvanzado(!!o.modo_avanzado); setPrepHoraInicio(o.inicio || ''); setPrepHoraFin(o.fin || '')
    setPrepDestajo(Array.isArray(o.destajo) ? o.destajo : [])
    // Para recetas (sin ficha) se usan los tiempos guardados; para productos se arman desde la ficha más abajo
    setPrepProcesos(Array.isArray(o.procesos_tiempos) ? o.procesos_tiempos : [])
    const cantidad = parseFloat(o.cantidad_plan) || 0
    const parse = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return [] } }
    setPrepEsMpVend(false)
    // Cualquier orden que acredite una MP al inventario (MP vendible o subproducto) usa la unidad
    // de esa MP. Si es por peso (Kg/Gramo…), el resultado se captura en esa unidad, no en "unidades".
    setPrepMpUnidad((o.es_mp || o.es_subproducto) && o.mp_id ? (mps.find(m => String(m.id) === String(o.mp_id))?.unidad || '') : '')
    if (o.origen === 'producto' && o.origen_id) {
      // `imprimibles` es de la migración v130: si la columna no existe, se reintenta sin ella
      let prod = null
      {
        const sel = 'bache, peso_unidad, rendimiento, desperdicio, ingredientes, procesos, porciona, peso_subporcion, ficha_url, ficha_nombre, tipo, vida_util_valor, vida_util_unidad'
        const r1 = await supabase.from('products_costing').select(sel + ', imprimibles').eq('id', o.origen_id).single()
        if (r1.error && /imprimibles/i.test(r1.error.message || '')) {
          const r2 = await supabase.from('products_costing').select(sel).eq('id', o.origen_id).single()
          prod = r2.data
        } else prod = r1.data
      }
      setPrepImprimibles(parse(prod?.imprimibles))
      if (prod) {
        setPrepEsMpVend((prod.tipo || '') === 'mp')
        if (prod.vida_util_valor) setPrepVidaUtil({ valor: parseFloat(prod.vida_util_valor), unidad: prod.vida_util_unidad || 'meses' })
        setPrepPorciona(!!prod.porciona)
        setPrepPesoSubp(o.peso_subporcion || prod.peso_subporcion || '')
        // Subprocesos = ÚNICAMENTE los de la mano de obra de la ficha; se conservan las horas ya guardadas (por nombre)
        const saved = Array.isArray(o.procesos_tiempos) ? o.procesos_tiempos : []
        const fichaProcs = parse(prod.procesos).filter(p => (p.nombre || '').trim())
        if (saved.length) {
          // Ya se diligenció: se respetan EXACTAMENTE los procesos guardados (orden + datos).
          // NO se re-agregan los de la ficha, para que los que el usuario ELIMINÓ no reaparezcan.
          setPrepProcesos(saved.map(s => ({ nombre: s.nombre, inicio: s.inicio || '', fin: s.fin || '', fecha: s.fecha || '' })))
        } else {
          // Primera vez: se arma desde la ficha (mano de obra) como punto de partida.
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
        const baches = bachesPlan > 0 ? bachesPlan : snapBaches(unidsBacheNet > 0 ? cantidad / unidsBacheNet : ((parseFloat(prod.bache) || 0) > 0 ? cantidad / parseFloat(prod.bache) : 0))
        const ings = ingsRaw.map(i => {
          const gramos = (parseFloat(i.cantidad) || 0) * baches
          const costo = ((parseFloat(i.precio) || 0) / (parseFloat(i.presentacion) || 1000)) * gramos
          return { nombre: i.nombre, mpId: i.mpId || null, gramos, costo }
        })
        // Snapshot de la receta ANTES de cualquier ajuste manual, y reaplicación de los
        // ajustes ya guardados en la orden (si el operario reabre el modal).
        setPrepIngsBase(ings)
        setPrepIngs(aplicarAjustesGuardados(ings, o.ajustes_ingredientes))
        // mezclaPorUnid = gramos de MEZCLA que consume cada unidad final (= totalMezclaBache/unidsBacheNet).
        // Es el factor correcto para convertir unidades empacadas ↔ gramos de saldo gastados.
        setPrepInfo({ bache: unidsBacheNet, baches, pesoUnidad: pu, mezclaPorUnid: unidsBacheNet > 0 ? totalMezclaBache / unidsBacheNet : pu })
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
          // Las recetas rápidas no siempre guardan el mpId: se resuelve por nombre para poder
          // mostrar el stock disponible de cada ingrediente igual que en los productos.
          const mpId = i.mpId || mps.find(m => (m.nombre || '').trim().toLowerCase() === (i.nombre || '').trim().toLowerCase())?.id || null
          return { nombre: i.nombre, mpId, gramos, costo }
        })
        // Snapshot de la receta ANTES de cualquier ajuste manual, y reaplicación de los
        // ajustes ya guardados en la orden (si el operario reabre el modal).
        setPrepIngsBase(ings)
        setPrepIngs(aplicarAjustesGuardados(ings, o.ajustes_ingredientes))
        setPrepInfo({ totalMezcla, pesoUnidad: pu, mezclaPorUnid: denom > 0 ? pu / denom : pu })
        setPrepDatos(calcDatosPrevistos(ings, rend, desp, pu))
        setPrepFicha(rec.ficha_url ? { url: rec.ficha_url, nombre: rec.ficha_nombre } : null)
      }
    }
  }

  // Calcula SOLO la lista de ingredientes (nombre + gramos) de una orden, sin tocar el estado del
  // modal de proceso. Se usa para mostrar los ingredientes dentro del modal de Detalles.
  const calcIngredientesOrden = async (o) => {
    const parse = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return [] } }
    const cantidad = parseFloat(o.cantidad_plan) || 0
    if (o.origen === 'producto' && o.origen_id) {
      const { data: prod } = await supabase.from('products_costing').select('bache, peso_unidad, rendimiento, desperdicio, ingredientes').eq('id', o.origen_id).single()
      if (!prod) return { ings: [], ficha: null }
      const rend = parseFloat(prod.rendimiento) || 62, desp = parseFloat(prod.desperdicio) || 2, pu = parseFloat(prod.peso_unidad) || 1000
      const ingsRaw = parse(prod.ingredientes)
      const totalMezclaBache = ingsRaw.reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0)
      const unidsBacheNet = pu > 0 ? (totalMezclaBache * (rend / 100) * (1 - desp / 100)) / pu : (parseFloat(prod.bache) || 0)
      const bachesPlan = parseFloat(o.baches_plan) || 0
      const baches = bachesPlan > 0 ? bachesPlan : snapBaches(unidsBacheNet > 0 ? cantidad / unidsBacheNet : ((parseFloat(prod.bache) || 0) > 0 ? cantidad / parseFloat(prod.bache) : 0))
      return { ings: ingsRaw.map(i => ({ nombre: i.nombre, mpId: i.mpId || null, gramos: (parseFloat(i.cantidad) || 0) * baches })), ficha: { rend, desp, pu } }
    } else if (o.origen === 'receta' && o.origen_id) {
      const { data: rec } = await supabase.from('recipes').select('ingredientes, rendimiento, desperdicio, peso_unidad').eq('id', o.origen_id).single()
      if (!rec) return { ings: [], ficha: null }
      const rend = parseFloat(rec.rendimiento) || 62, desp = parseFloat(rec.desperdicio) || 2, pu = parseFloat(rec.peso_unidad) || 1000
      const denom = (rend / 100) * (1 - desp / 100)
      const bachesPlan = parseFloat(o.baches_plan) || 0
      const totalMezcla = bachesPlan > 0 ? bachesPlan * BASE_RECETA : (denom > 0 ? (cantidad * pu) / denom : 0)
      return { ings: parse(rec.ingredientes).map(i => ({ nombre: i.nombre, gramos: totalMezcla * ((parseFloat(i.pct) || 0) / 100) })), ficha: { rend, desp, pu } }
    }
    return { ings: [], ficha: null }
  }

  // Trazabilidad de lotes de MP de la orden abierta (fresca de la BD, por si ordenPrep está desactualizada)
  useEffect(() => {
    if (!modalProceso || !ordenPrep?.id) { setPrepTraza([]); return }
    let cancel = false
    supabase.from('production_orders').select('lotes_mp, lotes_reservados').eq('id', ordenPrep.id).single()
      .then(({ data }) => { if (!cancel) setPrepTraza((Array.isArray(data?.lotes_mp) && data.lotes_mp) || (Array.isArray(data?.lotes_reservados) && data.lotes_reservados) || []) })
      .catch(() => {})
    return () => { cancel = true }
  }, [modalProceso, ordenPrep?.id])

  // Carga los ingredientes cada vez que se abre el modal de Detalles
  useEffect(() => {
    let cancel = false
    if (!ordenDetalle) { setDetalleIngs([]); setDetalleFicha(null); return }
    calcIngredientesOrden(ordenDetalle).then(res => { if (!cancel) { setDetalleIngs(res.ings || []); setDetalleFicha(res.ficha || null) } }).catch(() => { if (!cancel) { setDetalleIngs([]); setDetalleFicha(null) } })
    return () => { cancel = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenDetalle?.id])

  // Al abrir el modal de proceso, carga el checklist de "alistar ingredientes" guardado en la orden
  useEffect(() => { if (modalProceso) setAlistado((ordenPrep?.alistado && typeof ordenPrep.alistado === 'object') ? ordenPrep.alistado : {}) }, [modalProceso, ordenPrep?.id])

  // Precarga la fecha de vencimiento con la "vida útil" configurada en la ficha del producto,
  // apenas se llena la fecha de fabricación (solo si el usuario aún no la ha escrito).
  useEffect(() => {
    if (!prepFechaInicio || prepVence || !prepVidaUtil?.valor) return
    setPrepVence(desdeFechaVidaUtil(prepFechaInicio, prepVidaUtil.valor, prepVidaUtil.unidad))
    toast(`Vencimiento precargado: este producto tiene ${prepVidaUtil.valor} ${prepVidaUtil.unidad === 'dias' ? 'día(s)' : 'mes(es)'} de vida útil configurada en su ficha.`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepFechaInicio, prepVidaUtil])

  // Marca/desmarca un ingrediente como alistado y lo GUARDA en la orden (soporta offline)
  const toggleAlistado = (k, val) => {
    setAlistado(prev => {
      const next = { ...prev, [k]: val }
      if (!val) delete next[k]
      if (ordenPrep?.id) {
        writeOrQueue({ table: 'production_orders', action: 'update', match: { id: ordenPrep.id }, payload: { alistado: next } })
          .then(() => qc.invalidateQueries({ queryKey: ['production_orders'] }))
          .catch(() => {})
      }
      return next
    })
  }

  // Abre el modal de Iniciar proceso (fecha de inicio + tiempos por subproceso, con autoguardado)
  const openProceso = async (o) => {
    setAutoSavedAt('')
    // Empaque de saldo: la salida real son las unidades empacadas del saldo (van como "lote empacado"),
    // por eso la producción principal queda en 0 y el saldo se pre-carga listo para consumir.
    const packInfo = (o.empaque_saldo && Array.isArray(o.saldo_pack) && o.saldo_pack[0]) ? o.saldo_pack[0] : null
    // Respuestas SI/NO guardadas tal cual (si existe el borrador); si no, sin marcar
    const ps = (o.prep_sino && typeof o.prep_sino === 'object') ? o.prep_sino : {}
    const triState = (v) => (v === true || v === false) ? v : null
    // Empaque de saldo: las unidades obtenidas de la producción SON las unidades empacadas del saldo.
    setPrepUnidades(o.empaque_saldo ? String(o.cantidad_result || o.cantidad_plan || '') : (o.cantidad_result || '')); setPrepPesoFinal(o.peso_final || ''); setPrepPesoDesp(o.peso_desperdicio || '')
    setPrepObs(o.obs_result || ''); setPrepResp(o.operario || profile?.nombre || ''); setPrepConforme(triState(ps.conforme))
    // Surtido y sobrante SIEMPRE arrancan sin marcar (el usuario debe elegir); solo se restauran si ya se respondieron en el borrador.
    setPrepSurtido(triState(ps.surtido)); setPrepLoteMezcla(o.lote_mezcla || ''); setPrepProductoSurtido(o.producto_surtido || '')
    setPrepPorciona(false); setPrepCantSubp(o.cant_subporciones || '')
    setPrepFotoFile(null); setPrepFotoPrev(o.foto_url || '')
    if (packInfo) {
      const s = saldosMezcla.find(x => String(x.id) === String(packInfo.saldo_id))
      setPrepLotesExtra([{ lote: s?.lote || o.lote || '', vence: s?.vencimiento || o.vence || '', unidades: String(o.cantidad_plan || ''), conforme: true, saldo_id: packInfo.saldo_id, peso_consumido: String(packInfo.cantidad || ''), surtido: false, lote_mezcla: '' }])
    } else setPrepLotesExtra([])
    setPrepHaySobrante(triState(ps.hay_sobrante)); setPrepSobrantePeso(o.sobrante_peso || ''); setPrepSobranteUnidad(o.sobrante_unidad || 'g')
    // Siempre arranca en NO-manual para que RECALCULE la sugerencia en cada apertura. (Antes, como el
    // autoguardado persiste el sobrante, quedaba "manual" para siempre y ya no volvía a sugerir nada.)
    setPrepSobranteManual(false)
    setPrepSurtidoCantidad(o.surtido_cantidad != null ? String(o.surtido_cantidad) : '')
    setPrepSurtidoConsumos({})
    setPrepCamposExtra(Array.isArray(o.campos_extra) ? o.campos_extra.map(c => ({ ...c, _id: Date.now() + Math.random() })) : [])
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
        // Trae la orden FRESCA (con lotes_reservados ya escrito por reservarMP) — si se usa la copia
        // local vieja, al cerrar la orden consumirMP no encuentra nada que pasar a lotes_mp.
        try { const { data: fresh } = await supabase.from('production_orders').select('*').eq('id', o.id).single(); if (fresh) o = fresh } catch { o = { ...o, estado: 'en_proceso' } }
      }
    } catch (e) { toast(e.message, 'error'); return }
    await openProceso(o)
  }

  // Imprimir la orden con los ingredientes — ajustado a UNA sola página
  // Consumo PREVISTO de saldos de mezcla por esta orden (surtido + empaque de saldo).
  // Se usa tanto para la RESERVA (mientras la orden está abierta) como para reponer al devolverla.
  const calcSaldosConsumidos = () => {
    const surt = []
    if (prepSurtido) {
      const tokens = String(prepLoteMezcla).split(/[,;]/).map(s => s.trim()).filter(Boolean)
      const matchSaldos = saldosMezcla.filter(s => (s.peso > 0) && tokens.includes(String(s.lote || '').trim()))
      for (const s of matchSaldos) {
        const v = prepSurtidoConsumos[s.id]
        const cant = (v !== undefined && v !== '') ? (parseFloat(v) || 0) : (matchSaldos.length === 1 ? (parseFloat(prepSurtidoCantidad) || 0) : 0)
        if (cant > 0) surt.push({ saldo_id: s.id, cantidad: cant })
      }
    }
    return [
      ...surt,
      ...prepLotesExtra.filter(e => e.saldo_id && (parseFloat(e.peso_consumido) || 0) > 0).map(e => ({ saldo_id: e.saldo_id, cantidad: parseFloat(e.peso_consumido) || 0 })),
    ]
  }

  // Guarda TODOS los campos del proceso (datos + resultado) en la orden
  const guardarProcesoData = async (silent = true) => {
    if (!ordenPrep) return
    const { procs, inicioGlobal, finGlobal } = tiemposGlobal()
    // El autoguardado de fondo (silent) NO muestra el overlay "Guardando…" para no interrumpir la escritura.
    if (silent) beginSilentWrites()
    try {
      const r = await writeOrQueue({ table: 'production_orders', action: 'update', match: { id: ordenPrep.id }, payload: {
        lote: prepLote, vence: prepVence || null, fecha_inicio: prepFechaInicio || null,
        modo_avanzado: prepModoAvanzado,
        inicio: inicioGlobal || null, fin: finGlobal || null,
        procesos_tiempos: procs,
        cantidad_result: prepUnidades !== '' ? (parseFloat(prepUnidades) || 0) : null,
        peso_final: prepPesoFinal !== '' ? (parseFloat(prepPesoFinal) || 0) : null,
        peso_desperdicio: prepPesoDesp !== '' ? (parseFloat(prepPesoDesp) || 0) : null,
        peso_subporcion: prepPorciona && prepPesoSubp !== '' ? (parseFloat(prepPesoSubp) || 0) : null,
        cant_subporciones: prepPorciona && prepCantSubp !== '' ? (parseFloat(prepCantSubp) || 0) : null,
        obs_result: prepObs || null, surtido: prepSurtido, lote_mezcla: prepSurtido ? (prepLoteMezcla || null) : null, producto_surtido: prepSurtido ? (prepProductoSurtido || null) : null,
        surtido_cantidad: prepSurtido && prepSurtidoCantidad !== '' ? (parseFloat(prepSurtidoCantidad) || 0) : null,
        hay_sobrante: !!prepHaySobrante, sobrante_peso: prepHaySobrante && prepSobrantePeso !== '' ? (parseFloat(prepSobrantePeso) || 0) : null, sobrante_unidad: prepHaySobrante ? prepSobranteUnidad : null,
        destajo: prepDestajo.filter(d => d.nombre?.trim() || d.cantidad || d.tarifa),
      } })
      // Respuestas SI/NO tal cual (tri-estado true/false/null) — escritura aparte y tolerante:
      // si la columna prep_sino aún no existe (falta migración v82), no rompe el autoguardado.
      try { await supabase.from('production_orders').update({ prep_sino: { conforme: prepConforme, surtido: prepSurtido, hay_sobrante: prepHaySobrante } }).eq('id', ordenPrep.id) } catch { /* columna opcional */ }
      // Reserva del saldo mientras la orden esté abierta (escritura aparte y tolerante si falta la columna v83).
      try { await supabase.from('production_orders').update({ saldos_reservados: calcSaldosConsumidos() }).eq('id', ordenPrep.id) } catch { /* columna opcional */ }
      // Campos adicionales personalizados (MP vendibles) — escritura aparte y tolerante (columna v85 opcional).
      try { await supabase.from('production_orders').update({ campos_extra: prepCamposExtra.filter(c => (c.nombre || '').trim()).map(c => ({ nombre: c.nombre, valor: c.valor || '' })) }).eq('id', ordenPrep.id) } catch { /* columna opcional */ }
      setAutoSavedAt(new Date().toLocaleTimeString('es-CO'))
      qc.invalidateQueries({ queryKey: ['production_orders'] })
      if (!silent) toast(r.queued ? 'Progreso guardado sin conexión — se sincronizará 📴' : 'Guardado ✓')
    } catch (e) { if (!silent) toast(e.message, 'error') }
    finally { if (silent) endSilentWrites() }
  }

  // Autoguardado (debounce) de TODOS los campos del modal de proceso
  useEffect(() => {
    if (!modalProceso || !autoguardar || !ordenPrep) return
    const t = setTimeout(() => guardarProcesoData(true), 1200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepLote, prepVence, prepFechaInicio, prepModoAvanzado, prepHoraInicio, prepHoraFin, prepProcesos, prepUnidades, prepPesoFinal, prepPesoDesp, prepPesoSubp, prepCantSubp, prepObs, prepSurtido, prepLoteMezcla, prepProductoSurtido, prepSurtidoCantidad, prepHaySobrante, prepSobrantePeso, prepSobranteUnidad, prepResp, prepConforme, prepLotesExtra, prepDestajo, prepCamposExtra, autoguardar, modalProceso])

  // Prellena la CANTIDAD del sobrante (solo como ayuda) — NUNCA marca el SÍ/NO, eso es siempre manual.
  // Solo actúa si el usuario ya marcó "¿Sobró? = SÍ" y no ha editado la cantidad a mano.
  useEffect(() => {
    if (!modalProceso || prepSobranteManual || prepSurtido) return
    if (prepHaySobrante !== true) return   // no auto-marca; solo sugiere el valor cuando el usuario eligió SÍ
    const pu = parseFloat(prepInfo?.pesoUnidad) || 0
    const mezclaPorUnid = parseFloat(prepInfo?.mezclaPorUnid) || pu
    const packed = parseFloat(prepUnidades) || 0
    const producedSub = parseFloat(prepCantSubp) || 0
    let leftover = 0, unidad = 'g'
    if (ordenPrep?.empaque_saldo) {
      let u = 'g'
      leftover = prepLotesExtra.reduce((acc, ex) => {
        if (ex.saldo_id == null) return acc
        const s = saldosMezcla.find(x => String(x.id) === String(ex.saldo_id)); if (!s) return acc
        u = s.unidad || 'g'
        return acc + (dispSaldo(s, ordenPrep.id) - (parseFloat(ex.peso_consumido) || 0))
      }, 0)
      unidad = u
    } else if (prepPorciona && producedSub > 0) {
      const psub = parseFloat(prepPesoSubp) || 0
      const subPorUnid = psub > 0 ? pu / psub : 1
      leftover = producedSub - packed * subPorUnid
      unidad = 'subporciones'
    } else {
      leftover = (parseFloat(prepPesoFinal) || 0) - packed * mezclaPorUnid
      unidad = 'g'
    }
    leftover = Math.round(leftover * 100) / 100
    if (leftover >= 1) { setPrepSobrantePeso(String(leftover)); setPrepSobranteUnidad(unidad) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalProceso, prepSobranteManual, prepSurtido, prepHaySobrante, prepPorciona, prepUnidades, prepCantSubp, prepPesoFinal, prepPesoSubp, prepInfo, prepLotesExtra, saldosMezcla])

  // Empaque que se descontará (bolsas/cajas) — se calcula en vivo mientras el modal está abierto,
  // para verlo en el diligenciamiento y llevarlo a la impresión.
  useEffect(() => {
    if (!modalProceso || !ordenPrep) { return }
    let cancel = false
    const t = setTimeout(() => {
      const uni = parseFloat(prepUnidades) || 0
      const extrasU = ordenPrep.empaque_saldo ? 0 : prepLotesExtra.filter(e => (parseFloat(e.unidades) || 0) > 0).reduce((s, e) => s + (parseFloat(e.unidades) || 0), 0)
      prepararEmpaque(ordenPrep, { unidadesEmpacadas: uni + extrasU, subpTotal: parseFloat(prepCantSubp) || 0, surtidoUnid: parseFloat(prepSurtidoCantidad) || 0, esPorcionado: prepPorciona, esSurtido: !!prepSurtido })
        .then(r => { if (!cancel) setEmpaquePrevio(r) }).catch(() => {})
    }, 400)
    return () => { cancel = true; clearTimeout(t) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalProceso, prepUnidades, prepCantSubp, prepSurtidoCantidad, prepPorciona, prepSurtido, prepLotesExtra, ordenPrep])

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

  // Ajusta el documento a UNA sola hoja carta desde el componente (no depende de un script dentro del
  // iframe, que en Edge a veces no corre). Comprime la tipografía (paddings en em bajan en proporción)
  // hasta que el contenido quepa, manteniendo el ancho completo (sin zoom → sin márgenes anchos).
  const ajustarAUnaHoja = (win) => {
    try {
      const doc = win.document
      const c = doc.getElementById('content'); if (!c) return
      const availH = 965           // alto objetivo: llena la hoja carta (imprimible ≈ 990px) sin pasarse
      const MIN_FONT = 10          // en órdenes largas no baja de 10px
      const MAX_FONT = 16          // en órdenes cortas/medianas agranda hasta 16px para llenar la hoja
      const TOL = 18
      const alto = () => Math.max(c.scrollHeight, c.offsetHeight, doc.body.scrollHeight, doc.documentElement.scrollHeight, c.getBoundingClientRect().height)
      // Ajuste BIDIRECCIONAL: agranda si sobra espacio, reduce si falta — hasta llenar la hoja.
      let tries = 0
      while (tries < 80) {
        const cur = parseFloat(win.getComputedStyle(doc.body).fontSize) || 11
        const a = alto()
        if (a > availH && cur > MIN_FONT) { doc.body.style.fontSize = Math.max(MIN_FONT, cur * Math.min(availH / a, 0.97)) + 'px' }
        else if (a < availH - TOL && cur < MAX_FONT) { doc.body.style.fontSize = Math.min(MAX_FONT, cur * Math.max(availH / a, 1.03)) + 'px' }
        else break
        tries++
      }
      // Relleno fino del remanente con la casilla de Observaciones (baja las firmas al pie).
      const h = alto()
      if (h < availH) { const box = doc.getElementById('obsbox'); const extra = availH - h - 8; if (box && extra > 0) box.style.height = (box.offsetHeight + extra) + 'px' }
    } catch { /* noop */ }
  }

  // Imprime un documento HTML SIN abrir pestaña: iframe oculto → ajuste a una hoja → diálogo del navegador.
  const printViaIframe = (html) => {
    const iframe = document.createElement('iframe')
    Object.assign(iframe.style, { position: 'fixed', left: '-10000px', top: '0', width: '216mm', height: '279mm', border: '0' })
    document.body.appendChild(iframe)
    let limpiado = false
    const limpiar = () => { if (limpiado) return; limpiado = true; setTimeout(() => { try { document.body.removeChild(iframe) } catch { /* ya removido */ } }, 800) }
    const doc = iframe.contentWindow.document
    doc.open(); doc.write(html); doc.close()
    try { iframe.contentWindow.onafterprint = limpiar } catch { /* noop */ }
    // Ajusta, espera el reflow y luego imprime (si no, el navegador imprime con la tipografía sin reducir).
    setTimeout(() => {
      ajustarAUnaHoja(iframe.contentWindow)
      setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch { /* noop */ } }, 200)
    }, 350)
    setTimeout(limpiar, 60000)
  }

  // Genera y DESCARGA el PDF directamente (sin diálogo del navegador): renderiza el HTML en un iframe
  // oculto (a 196mm = ancho útil de una hoja carta), lo captura con html2canvas y lo arma con jsPDF.
  // Renderiza el HTML en un iframe oculto, lo ajusta a una hoja y lo captura como canvas.
  const renderContentCanvas = async (html) => {
    const { default: html2canvas } = await import('html2canvas')
    const iframe = document.createElement('iframe')
    Object.assign(iframe.style, { position: 'fixed', left: '-10000px', top: '0', width: '210mm', height: '297mm', border: '0', background: '#fff' })
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentWindow.document
      doc.open(); doc.write(html); doc.close()
      await new Promise(r => setTimeout(r, 500))
      // Ajuste suave (con piso de fuente) — el escalado final a la hoja lo hace jsPDF, así no queda ilegible.
      ajustarAUnaHoja(iframe.contentWindow)
      await new Promise(r => setTimeout(r, 150))
      const content = doc.getElementById('content') || doc.body
      return await html2canvas(content, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: content.scrollWidth })
    } finally { try { document.body.removeChild(iframe) } catch { /* noop */ } }
  }

  // IMPRIME el documento como imagen ajustada (una sola hoja, texto legible por el piso de 7px).
  // La imagen se muestra a ANCHO COMPLETO (no se vuelve a encoger), así se ve al mismo tamaño ajustado.
  const imprimirImagen = async (html) => {
    const canvas = await renderContentCanvas(html)
    const dataURL = canvas.toDataURL('image/jpeg', 0.95)
    const imgHtml = `<html><head><style>
      @page{size:letter;margin:8mm}
      html,body{margin:0;padding:0}
      img{width:100%;max-height:262mm;object-fit:contain;display:block;margin:0 auto}
    </style></head><body><img src="${dataURL}"/></body></html>`
    printViaIframe(imgHtml)
  }

  // Construye el PDF (imagen escalada a UNA hoja carta) y devuelve la instancia jsPDF.
  const construirPDF = async (html) => {
    const canvas = await renderContentCanvas(html)
    const jspdfMod = await import('jspdf')
    const jsPDF = jspdfMod.jsPDF || jspdfMod.default
    const pdf = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' })
    const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight()
    const margin = 8, availW = pageW - 2 * margin, availH = pageH - 2 * margin
    let w = availW, h = canvas.height * (w / canvas.width)
    if (h > availH) { h = availH; w = canvas.width * (h / canvas.height) }
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pageW - w) / 2, margin, w, h)
    return pdf
  }

  // DESCARGA el PDF (imagen escalada a UNA hoja carta).
  const descargarComoPDF = async (html, nombre) => { (await construirPDF(html)).save(`${nombre}.pdf`) }

  // COMPARTE el PDF por el menú nativo del dispositivo (WhatsApp, correo, otra impresora/app, etc.).
  // Útil en móvil/tablet, donde imprimir suele hacerse vía apps de terceros. Si el dispositivo no
  // soporta compartir archivos, cae a descargar el PDF.
  const compartirComoPDF = async (html, nombre) => {
    const pdf = await construirPDF(html)
    const file = new File([pdf.output('blob')], `${nombre}.pdf`, { type: 'application/pdf' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nombre }) }
      catch (e) { if (e.name !== 'AbortError') throw e }
    } else {
      pdf.save(`${nombre}.pdf`)
      toast('Tu dispositivo no permite compartir archivos; se descargó el PDF.', 'info')
    }
  }

  // Genera el PDF de una orden y lo comparte (para el botón "Compartir" en móvil/tablet)
  // Sin argumento: comparte la orden VIVA del modal de proceso (estado prep*). Con `o`: la orden guardada.
  const compartirOrden = async (o = null) => {
    try { setBusy(true); const { html, archivoNombre } = await imprimirOrden('html', o); await compartirComoPDF(html, archivoNombre) }
    catch (e) { toast('No se pudo compartir: ' + (e.message || e), 'error') }
    finally { setBusy(false) }
  }


  // mode: 'print' | 'pdf' | 'html'. ordenArg: si se pasa, imprime esa orden GUARDADA (cerrada) en vez de la del modal.
  const imprimirOrden = async (mode = 'print', ordenArg = null) => {
    const esPdf = mode === 'pdf'
    const live = !ordenArg
    const o = ordenArg || ordenPrep; if (!o) return
    const g = (n) => (n || 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })
    // Valores: si es la orden viva del modal, del estado prep*; si es guardada, de los campos de la orden.
    const ps = (o.prep_sino && typeof o.prep_sino === 'object') ? o.prep_sino : {}
    const tri = (x) => (x === true || x === false) ? x : null
    const vLote = live ? prepLote : (o.lote || '')
    const vVence = live ? prepVence : (o.vence || '')
    const vFechaIni = live ? prepFechaInicio : (o.fecha_inicio || '')
    const vUnidades = live ? prepUnidades : (o.cantidad_result != null ? String(o.cantidad_result) : '')
    const vModoAvanzado = live ? prepModoAvanzado : !!o.modo_avanzado
    const vProcesos = live ? prepProcesos : (Array.isArray(o.procesos_tiempos) ? o.procesos_tiempos : [])
    const vHoraInicio = live ? prepHoraInicio : (o.inicio || '')
    const vHoraFin = live ? prepHoraFin : (o.fin || '')
    const vPorciona = live ? prepPorciona : (o.peso_subporcion != null || o.cant_subporciones != null)
    const vPesoSubp = live ? prepPesoSubp : (o.peso_subporcion || '')
    const vCantSubp = live ? prepCantSubp : (o.cant_subporciones || '')
    const vConforme = live ? prepConforme : tri(ps.conforme)
    const vSurtido = live ? prepSurtido : tri(ps.surtido ?? o.surtido)
    const vSurtidoCant = live ? prepSurtidoCantidad : (o.surtido_cantidad != null ? String(o.surtido_cantidad) : '')
    const vHaySobrante = live ? prepHaySobrante : tri(o.hay_sobrante)
    const vSobrantePeso = live ? prepSobrantePeso : (o.sobrante_peso != null ? String(o.sobrante_peso) : '')
    const vSobranteUnidad = live ? prepSobranteUnidad : (o.sobrante_unidad || 'g')
    const vLoteMezcla = live ? prepLoteMezcla : (o.lote_mezcla || '')
    const vCamposExtra = live ? prepCamposExtra : (Array.isArray(o.campos_extra) ? o.campos_extra : [])
    // Ingredientes / peso unidad / datos previstos: del estado si es viva; de la ficha si es guardada.
    let ings = prepIngs, pesoUnidad = prepInfo?.pesoUnidad, d = prepDatos
    if (!live) {
      try { const r = await calcIngredientesOrden(o); ings = r.ings || []; pesoUnidad = r.ficha?.pu } catch { ings = []; pesoUnidad = null }
      d = null
    }
    // Empaque que se usa (bolsas/cajas) según lo empacado — se calcula al vuelo para la impresión.
    let empaqueTxt = ''
    try {
      const uni = parseFloat(vUnidades) || 0
      const extrasU = (live && !o.empaque_saldo) ? prepLotesExtra.filter(e => (parseFloat(e.unidades) || 0) > 0).reduce((s, e) => s + (parseFloat(e.unidades) || 0), 0) : 0
      const { plan } = await prepararEmpaque(o, { unidadesEmpacadas: uni + extrasU, subpTotal: parseFloat(vCantSubp) || 0, surtidoUnid: parseFloat(vSurtidoCant) || 0, esPorcionado: vPorciona, esSurtido: !!vSurtido })
      empaqueTxt = (plan || []).filter(p => (p.qty || 0) > 0).map(p => `${fNum(p.qty)} ${p.mp?.nombre || p.tipo}`).join(' · ')
    } catch { /* si no se puede calcular, se deja vacío */ }
    const unidProducidas = vUnidades !== '' ? `${fNum(parseFloat(vUnidades) || 0)} ${o.unidad || ''}` : ''
    // Marca SI/NO compacta (casilla pequeña con X según el valor tri-estado)
    const chk = (v) => `SI <span class="bx">${v === true ? 'X' : ''}</span> NO <span class="bx">${v === false ? 'X' : ''}</span>`
    // Trazabilidad de lotes de MP usados por ingrediente (para la columna "Lote MP" de la impresión).
    let traza = (live && prepTraza.length) ? prepTraza : (Array.isArray(o.lotes_mp) ? o.lotes_mp : (Array.isArray(o.lotes_reservados) ? o.lotes_reservados : []))
    if (!traza.length) { try { const { data } = await supabase.from('production_orders').select('lotes_mp, lotes_reservados').eq('id', o.id).single(); traza = (Array.isArray(data?.lotes_mp) && data.lotes_mp) || (Array.isArray(data?.lotes_reservados) && data.lotes_reservados) || [] } catch { /* sin traza */ } }
    const loteIng = (ing) => loteDeTraza(traza, ing)
    const filas = ings.map(i => `<tr><td>${i.nombre}</td><td class="r">${g(i.gramos)} g</td></tr>`).join('')
    const totalG = ings.reduce((s, i) => s + (i.gramos || 0), 0)
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
    const fabIni = vFechaIni || ''
    const fabricacion = fabIni ? new Date(fabIni + 'T00:00:00').toLocaleDateString('es-CO') : ''
    const cfg = getConfig()
    // Rótulo del producto final (incluye el caso de empaque surtido / combinado con otro lote)
    const ddmmaa = (s) => { if (!s) return 'ddmmaa'; const [y, m, dd] = s.split('-'); return `${dd}${m}${y.slice(2)}` }
    const rotLote = vLote || ''
    const rotVence = vVence || ''
    const esSurtido = vSurtido || o.surtido
    const loteMezcla = vLoteMezcla || ''
    const rotuladoHtml = `
      <div class="seccion">ROTULADO DEL PRODUCTO FINAL</div>
      <table class="campos">
        ${esSurtido ? `
          <tr><td class="lbl">Lote producto</td><td><b>${rotLote || '(lote original)'}</b> — mantiene el formato del lote original</td></tr>
          <tr><td class="lbl">Lote de la caja</td><td><b>${loteCaja(loteMezcla, rotLote) || rotLote || '(sin especificar)'}</b> (lote más reciente del surtido)</td></tr>
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
    const procRows = (vProcesos || []).filter(p => p.nombre?.trim() || p.inicio || p.fin)
    const fmtF = (f) => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-CO') : ''
    // Modo básico: solo hora inicio/fin. Modo avanzado: tabla de procesos con fecha y horas.
    const filasProc = vModoAvanzado
      ? (procRows.length ? `<div class="seccion">TIEMPOS POR PROCESO / SUBPROCESO</div>
          <table class="ingr"><thead><tr><th>Proceso / Subproceso</th><th>Fecha</th><th>Hora inicio</th><th>Hora fin</th></tr></thead>
          <tbody>${procRows.map(p => `<tr><td>${p.nombre || ''}</td><td>${fmtF(p.fecha)}</td><td>${p.inicio || ''}</td><td>${p.fin || ''}</td></tr>`).join('')}</tbody></table>` : '')
      : `<div class="seccion">TIEMPOS</div>
          <table class="campos"><tr><td class="lbl" style="width:22%">Hora inicio</td><td style="width:28%">${vHoraInicio || ''}</td><td class="lbl" style="width:22%">Hora fin</td><td style="width:28%">${vHoraFin || ''}</td></tr></table>`
    // Campos adicionales personalizados (MP vendibles): Productor, Finca, etc. — 2 por fila para ahorrar espacio.
    const camposEx = (vCamposExtra || []).filter(c => (c.nombre || '').trim())
    let camposExtraHtml = ''
    if (camposEx.length) {
      let celdas = ''
      camposEx.forEach((c, idx) => { celdas += `<td class="lbl">${c.nombre}</td><td>${c.valor || ''}</td>${idx % 2 === 1 ? '</tr><tr>' : ''}` })
      camposExtraHtml = `<div class="seccion">DATOS ADICIONALES</div><table class="campos"><tr>${celdas}</tr></table>`
    }
    const archivoNombre = `OP-${opNum(o.id)} - ${(o.producto || 'PRODUCTO').toUpperCase()} - PTZ-OR-01`
    const html = `<html><head><title>${archivoNombre}</title><style>
      @page { size: letter; margin: 10mm; }
      * { box-sizing: border-box; }
      html,body { margin:0; }
      body { font-family: Arial, sans-serif; color:#222; font-size:11px; }
      /* Ancho útil real de una hoja carta (215.9mm − 2×10mm de margen). Así la medición en pantalla
         coincide con la impresión y el auto-ajuste a una sola hoja es exacto. */
      #content { width:196mm; margin:0 auto; padding-bottom:10px; position:relative; }
      .marca-agua { position:absolute; top:45%; left:50%; transform:translate(-50%,-50%) rotate(-32deg); font-size:64px; font-weight:900; color:rgba(192,57,43,0.28); letter-spacing:4px; white-space:nowrap; z-index:999; pointer-events:none; }
      table { width:100%; border-collapse:collapse; }
      /* Paddings en em: al reducir la tipografía para ajustar a una hoja, TODO se comprime en
         proporción (sin usar zoom, que dejaría márgenes anchos). El ancho se mantiene 100%. */
      td,th { border:1px solid #555; padding:0.32em 0.65em; vertical-align:top; }
      th { background:#e9efe7; text-align:left; }
      .r { text-align:right; }
      /* Casilla SI/NO compacta */
      .bx { display:inline-block; width:1em; height:1em; border:1px solid #555; text-align:center; line-height:1em; font-size:0.9em; vertical-align:middle; margin:0 0.15em; }
      /* Encabezado tipo formato controlado */
      .hdr td { padding:0.32em 0.65em; }
      .hdr .logo { width:26%; text-align:center; font-weight:bold; color:#2d5a3d; font-size:1.2em; }
      .hdr .titulo { text-align:center; vertical-align:middle; font-weight:bold; font-size:1.55em; line-height:1.15; }
      .hdr .codbox td { border:1px solid #555; font-size:0.9em; }
      .seccion { background:#2d5a3d; color:#fff; font-weight:bold; padding:0.28em 0.65em; margin-top:0.7em; font-size:1em; }
      .campos td { border:1px solid #555; }
      .lbl { background:#f3f6f1; font-weight:bold; width:18%; }
      .prev td { border:1px solid #555; }
      .firmas { margin-top:0; padding-top:1.6em; }
      .firmas td { border:none; text-align:center; padding-top:2.2em; }
      .firmas .linea { border-top:1px solid #555; padding-top:0.3em; }
      tbody tr:nth-child(even) td { background:#fafafa; }
      .ingr tbody tr:nth-child(even) td { background:#fafafa; }
    </style></head><body><div id="content">
      ${o.estado === 'cancelada' ? '<div class="marca-agua">NO EJECUTADA</div>' : ''}

      <!-- Encabezado del formato -->
      <table class="hdr">
        <tr>
          <td class="logo" rowspan="3">${cfg.logo_url ? `<img src="${cfg.logo_url}" style="max-width:90px;max-height:54px;object-fit:contain" />` : '🌿'}<div>${cfg.empresa || ''}</div></td>
          <td class="titulo" rowspan="3">ORDEN DE PRODUCCIÓN N° OP-${opNum(o.id)}${o.es_prueba ? '<div style="color:#c0392b;font-size:0.7em;font-weight:bold">★ PRUEBA ★</div>' : ''}</td>
          <td>Código: <b>PTZ-OR-01</b></td>
        </tr>
        <tr><td>Versión: <b>1</b></td></tr>
        <tr><td>Fecha emisión: <b>${emision}</b></td></tr>
      </table>
      ${cfg.nit || cfg.direccion || cfg.telefono ? `<div style="font-size:9px;text-align:center;margin-bottom:6px;color:#555">${[cfg.nit && 'NIT: ' + cfg.nit, cfg.direccion, cfg.ciudad, cfg.telefono && 'Tel: ' + cfg.telefono].filter(Boolean).join(' · ')}</div>` : ''}
      ${o.es_prueba ? '<div style="text-align:center;background:#c0392b;color:#fff;font-weight:bold;padding:4px;border-radius:4px;margin-bottom:6px;letter-spacing:2px">ORDEN DE PRUEBA — NO COMERCIALIZAR</div>' : ''}

      <div class="seccion">DATOS DE LA ORDEN</div>
      <table class="campos">
        <tr><td class="lbl">Nombre comercial</td><td colspan="3" style="font-size:1.35em;font-weight:bold;background:#fff7e6;color:#2d5a3d">${o.producto || ''}</td></tr>
        <tr><td class="lbl">Lote</td><td>${rotLote || ''}</td><td class="lbl">Presentación</td><td>${pesoUnidad ? g(pesoUnidad) + ' gr' : ''}</td></tr>
        <tr><td class="lbl">Fecha de fabricación</td><td>${fabricacion}</td><td class="lbl">Fecha de vencimiento</td><td>${rotVence ? new Date(rotVence + 'T00:00:00').toLocaleDateString('es-CO') : ''}</td></tr>
        <tr><td class="lbl">Unidades a producir</td><td>${o.cantidad_plan || ''} ${o.unidad || ''}</td><td class="lbl">Operario</td><td>${o.operario || ''}</td></tr>
        <tr><td class="lbl">Unidades producidas</td><td>${unidProducidas}</td><td class="lbl">Cant. empaque utilizado</td><td>${empaqueTxt}</td></tr>
        ${vPorciona ? `<tr><td class="lbl">Peso subporción</td><td>${vPesoSubp ? g(vPesoSubp) + ' g' : ''}</td><td class="lbl">Cant. subporciones</td><td>${vCantSubp ? fNum(vCantSubp) : ''}</td></tr>` : ''}
        <tr><td class="lbl">¿Producto conforme?</td><td style="width:20%">${chk(vConforme)}</td><td class="lbl">¿Empacó surtido?</td><td>${chk(vSurtido)}${vSurtido && vSurtidoCant ? ` · CANT: <b>${fNum(vSurtidoCant)}</b>` : ''}</td></tr>
        <tr><td class="lbl">¿Quedó sin empacar?</td><td colspan="3">${chk(vHaySobrante)}${vHaySobrante && vSobrantePeso ? ` · CANT: <b>${fNum(vSobrantePeso)} ${vSobranteUnidad || ''}</b>` : ''}</td></tr>
      </table>

      <div class="seccion">LISTA DE INGREDIENTES</div>
      <table class="ingr"><thead><tr><th>Ingrediente</th><th class="r">Porcentaje</th><th class="r">Cantidad (gr)</th><th>Lote MP</th></tr></thead>
        <tbody>${filas ? ings.map(i => `<tr><td>${i.nombre}</td><td class="r">${totalG > 0 ? (i.gramos / totalG * 100).toFixed(1) : '0'}%</td><td class="r">${g(i.gramos)}</td><td>${loteIng(i)}</td></tr>`).join('') + `<tr><td><b>TOTAL</b></td><td class="r"><b>100%</b></td><td class="r"><b>${g(totalG)}</b></td><td></td></tr>` : '<tr><td colspan="4">Sin receta vinculada</td></tr>'}</tbody>
      </table>

      ${d ? `<div class="seccion">DATOS PREVISTOS</div>${filasPrev}` : ''}

      ${filasProc}

      ${rotuladoHtml}

      ${camposExtraHtml}

      <div class="seccion">OBSERVACIONES</div>
      <table class="campos"><tr><td id="obsbox" style="height:5em; vertical-align:top">${o.notas_orden || ''}</td></tr></table>

      <table class="firmas">
        <tr>
          <td><div class="linea">ENTREGADO POR</div></td>
          <td><div class="linea">RECIBIDO POR</div></td>
        </tr>
      </table>

      </div>
      </body></html>`
    if (mode === 'html') return { html, archivoNombre }
    try {
      if (esPdf) await descargarComoPDF(html, archivoNombre)
      else await imprimirImagen(html)
    } catch (e) { toast('No se pudo generar el documento: ' + e.message, 'error') }
  }

  // Descarga UN PDF con VARIAS órdenes (cada una en su propia hoja, mismo formato).
  const descargarOrdenesPDF = async (lista) => {
    if (!lista || !lista.length) { toast('No hay órdenes para descargar', 'warning'); return }
    // Orden ascendente: de la #1 hasta la actual (por numeración de orden).
    const ordenadas = [...lista].sort((a, b) => opNum(a.id) - opNum(b.id))
    // Progreso en widget fijo (no bloquea la vista, sigue en 2º plano aunque cambie de módulo).
    startDownload('Descargando registros', ordenadas.length)
    try {
      const jspdfMod = await import('jspdf')
      const jsPDF = jspdfMod.jsPDF || jspdfMod.default
      const pdf = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' })
      const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight()
      const margin = 8, availW = pageW - 2 * margin, availH = pageH - 2 * margin
      let primera = true, hechas = 0, cancelado = false
      for (const o of ordenadas) {
        if (isDownloadCanceled()) { cancelado = true; break }
        const res = await imprimirOrden('html', o)
        if (res) {
          const canvas = await renderContentCanvas(res.html)
          let w = availW, h = canvas.height * (w / canvas.width)
          if (h > availH) { h = availH; w = canvas.width * (h / canvas.height) }
          if (!primera) pdf.addPage()
          primera = false
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageW - w) / 2, margin, w, h)
        }
        updateDownload(++hechas)
      }
      if (cancelado) { toast('Descarga cancelada', 'warning'); return }
      pdf.save(`Ordenes de Produccion - ${new Date().toLocaleDateString('es-CO')}.pdf`)
    } catch (e) { toast('No se pudo generar el PDF: ' + e.message, 'error') } finally { endDownload() }
  }

  // Ir al módulo de Producción a registrar los lotes (precargado desde la orden)
  // Calcula inicio/fin global desde los procesos
  const tiemposGlobal = () => {
    // Modo básico: hora inicio/fin globales, sin procesos detallados
    if (!prepModoAvanzado) return { procs: [], inicioGlobal: prepHoraInicio || '', finGlobal: prepHoraFin || '' }
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
    if (!(parseFloat(prepUnidades) >= 0) || prepUnidades === '') { toast(esUnidadPeso(prepMpUnidad) ? `Ingresa los ${prepMpUnidad} obtenidos` : 'Ingresa las unidades obtenidas', 'warning'); return }
    if (prepPorciona && !(parseFloat(prepCantSubp) > 0)) { toast('Ingresa la CANTIDAD DE SUBPORCIONES', 'warning'); return }
    if (prepSurtido && !(parseFloat(prepSurtidoCantidad) > 0)) { toast('Ingresa la CANTIDAD EMPACADA SURTIDA', 'warning'); return }
    if (prepSurtido) {
      const toks = String(prepLoteMezcla).split(/[,;]/).map(s => s.trim()).filter(Boolean)
      const selSaldos = saldosMezcla.filter(s => (dispSaldo(s, ordenPrep?.id) > 0) && toks.includes(String(s.lote || '').trim()))
      const maxSurt = selSaldos.length ? Math.min(...selSaldos.map(s => dispSaldo(s, ordenPrep?.id))) : undefined
      if (maxSurt !== undefined && (parseFloat(prepSurtidoCantidad) || 0) > maxSurt) { toast(`No puedes empacar más de ${fCant(maxSurt)} — es lo disponible por empacar del lote elegido.`, 'warning'); return }
    }
    if (prepHaySobrante && !(parseFloat(prepSobrantePeso) > 0)) { toast('Marcaste que quedó sin empacar: ingresa la CANTIDAD', 'warning'); return }
    if (prepHaySobrante && prepPorciona && (prepSobranteUnidad === 'subporciones') && parseFloat(prepSobrantePeso) > (parseFloat(prepCantSubp) || 0)) { toast('La cantidad sin empacar no puede superar las subporciones producidas', 'warning'); return }
    if (prepConforme === null) { toast('Marca si la producción es CONFORME o NO CONFORME', 'warning'); return }
    if (prepSurtido === null) { toast('Indica si EMPACÓ SURTIDO (SI/NO)', 'warning'); return }
    if (prepHaySobrante === null) { toast('Indica si SOBRÓ PRODUCCIÓN / quedó sin empacar (SI/NO)', 'warning'); return }
    // Previo del empaque a descontar (bolsas/cajas) según lo empacado
    setEmpaquePrevio(null)
    if (ordenPrep) {
      const unidades = parseFloat(prepUnidades) || 0
      // En empaque de saldo, las unidades del saldo ya están en la producción principal (no se suman aparte).
      const extrasUnid = ordenPrep.empaque_saldo ? 0 : prepLotesExtra.filter(e => (parseFloat(e.unidades) || 0) > 0).reduce((s, e) => s + (parseFloat(e.unidades) || 0), 0)
      prepararEmpaque(ordenPrep, {
        unidadesEmpacadas: unidades + extrasUnid,
        subpTotal: parseFloat(prepCantSubp) || 0,
        surtidoUnid: parseFloat(prepSurtidoCantidad) || 0,
        esPorcionado: prepPorciona, esSurtido: !!prepSurtido,
      }).then(setEmpaquePrevio).catch(() => setEmpaquePrevio(null))
    }
    setModalConfirmEnvio(true)
  }

  // Confirmar y enviar: crea el registro de producción y cierra la orden (a aprobación)
  const confirmarEnviar = async () => {
    const o = ordenPrep; if (!o) return
    if (!navigator.onLine && prepFotoFile) {
      toast('Sin conexión: la foto requiere internet. Quítala para enviar la orden offline.', 'warning'); return
    }
    setSavingEvid(true); setBusy(true)
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
      // Consumo de saldos de los lotes combinados en el surtido.
      // Si el campo quedó vacío y hay UN solo lote combinado, por defecto se consume la cantidad surtida.
      const surtidoConsumos = []
      if (prepSurtido) {
        const tokens = String(prepLoteMezcla).split(/[,;]/).map(s => s.trim()).filter(Boolean)
        // El lote combinado puede ser de OTRO producto (surtido de sabores): se busca por lote en cualquier producto
        const matchSaldos = saldosMezcla.filter(s => (s.peso > 0) && tokens.includes(String(s.lote || '').trim()))
        for (const s of matchSaldos) {
          const v = prepSurtidoConsumos[s.id]
          const cant = (v !== undefined && v !== '') ? (parseFloat(v) || 0) : (matchSaldos.length === 1 ? (parseFloat(prepSurtidoCantidad) || 0) : 0)
          if (cant > 0) surtidoConsumos.push({ saldo_id: s.id, cantidad: cant })
        }
      }
      // Saldos consumidos por esta orden (para poder reponerlos al devolverla): surtido + empaque de saldo
      const saldosConsumidos = [
        ...surtidoConsumos,
        ...prepLotesExtra.filter(e => e.saldo_id && (parseFloat(e.peso_consumido) || 0) > 0).map(e => ({ saldo_id: e.saldo_id, cantidad: parseFloat(e.peso_consumido) || 0 })),
      ]
      // Lotes empacados adicionales (saldos de mezcla / partes empacadas con otro lote).
      // En empaque de saldo NO se cuentan aparte: sus unidades ya están en la producción principal
      // (evita duplicar el registro y el stock). El saldo igual se descuenta por su peso más abajo.
      const extras = ordenPrep.empaque_saldo ? [] : prepLotesExtra.filter(e => (parseFloat(e.unidades) || 0) > 0)
      const extrasUnid = extras.reduce((s, e) => s + (parseFloat(e.unidades) || 0), 0)
      const unidadesTotal = unidades + extrasUnid
      // ===== EMPAQUE a descontar (se permite stock negativo, igual que los ingredientes; no bloquea).
      // Bolsas = TOTAL de subporciones producidas (cada una lleva su bolsa aunque quede como saldo).
      const { plan: empaquePlan } = await prepararEmpaque(o, {
        unidadesEmpacadas: unidadesTotal, subpTotal: parseFloat(prepCantSubp) || 0,
        surtidoUnid: parseFloat(prepSurtidoCantidad) || 0,
        esPorcionado: prepPorciona, esSurtido: !!prepSurtido,
      })
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
        surtido: !!prepSurtido, lote_mezcla: prepSurtido ? (prepLoteMezcla || null) : null,
        producto_surtido: prepSurtido ? (prepProductoSurtido || null) : null,
        surtido_cantidad: prepSurtido && prepSurtidoCantidad !== '' ? (parseFloat(prepSurtidoCantidad) || 0) : null,
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
          estado: prepConforme && exUnid > 0 ? 'conforme' : 'no conforme', completado: true, foto_url, orden_id: o.id, aprobado: autoAprob,
          tipo_registro: o.es_subproducto ? 'subproducto' : 'final', subprocesos: procs,
          surtido: !!ex.surtido, lote_mezcla: ex.surtido ? (ex.lote_mezcla || null) : null,
          producto_surtido: ex.surtido ? (autoSurtido(o.producto, ex.lote_mezcla) || prepProductoSurtido || null) : null,
          surtido_cantidad: ex.surtido ? exUnid : null,
          lotes_origen: ex.surtido ? (ex.lote_mezcla || '') : '',
        } })
      }
      // 2) Cerrar la orden con todos los datos del proceso.
      //    Admin: pasa directo a 'aprobada' (auto-aprobación). Operario: 'ejecutada' (espera aprobación).
      const r = await writeOrQueue({ table: 'production_orders', action: 'update', match: { id: o.id }, payload: {
        estado: autoAprob ? 'aprobada' : 'ejecutada',
        ...(autoAprob ? { aprobado_por: profile?.nombre || 'admin', fecha_aprob: new Date().toISOString() } : {}),
        cantidad_result: unidadesTotal, lote: prepLote, vence: prepVence || null,
        fecha_inicio: fechaIni, modo_avanzado: prepModoAvanzado, inicio: inicioGlobal || null, fin: finGlobal || null, procesos_tiempos: procs,
        peso_final: parseFloat(prepPesoFinal) || 0, peso_desperdicio: parseFloat(prepPesoDesp) || 0,
        peso_subporcion: prepPorciona ? (parseFloat(prepPesoSubp) || 0) : null,
        cant_subporciones: prepPorciona ? (parseFloat(prepCantSubp) || 0) : null,
        surtido: !!prepSurtido, lote_mezcla: prepSurtido ? (prepLoteMezcla || null) : null,
        producto_surtido: prepSurtido ? (prepProductoSurtido || null) : null,
        surtido_cantidad: prepSurtido && prepSurtidoCantidad !== '' ? (parseFloat(prepSurtidoCantidad) || 0) : null,
        hay_sobrante: !!prepHaySobrante, sobrante_peso: prepHaySobrante ? (parseFloat(prepSobrantePeso) || 0) : null, sobrante_unidad: prepHaySobrante ? prepSobranteUnidad : null,
        saldos_consumidos: saldosConsumidos.length ? saldosConsumidos : null,
        obs_result: prepObs || '', foto_url, fecha_envio: new Date().toISOString(),
        destajo: prepDestajo.filter(d => d.nombre?.trim() || d.cantidad || d.tarifa),
      } })
      // Al cerrar ya se descuenta el saldo (más abajo): se limpia la RESERVA para no restarlo doble
      // si la orden volviera a proceso. Escritura aparte y tolerante (columna v83 opcional).
      if (!r.queued) { try { await supabase.from('production_orders').update({ saldos_reservados: null }).eq('id', o.id) } catch { /* columna opcional */ } }
      try { await supabase.from('production_orders').update({ campos_extra: prepCamposExtra.filter(c => (c.nombre || '').trim()).map(c => ({ nombre: c.nombre, valor: c.valor || '' })) }).eq('id', o.id) } catch { /* columna opcional */ }
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
      // Ajustes de ingredientes hechos en planta: la reserva descontó lo que decía la receta,
      // así que aquí solo se mueve la DIFERENCIA (se gastó de más → se descuenta; sobró → se
      // devuelve). Se registra un movimiento de inventario por cada ajuste, para que quede
      // el rastro de por qué el stock no cuadra con la receta.
      const ajustesIngs = calcAjustes()
      if (!r.queued && ajustesIngs.length) {
        try {
          for (const a of ajustesIngs) {
            if (a.mp_id == null) continue   // ingrediente sin MP enlazada: no hay stock que mover
            const mp = mps.find(m => String(m.id) === String(a.mp_id))
            const deltaMP = gramosAUnidadMP(a.delta, mp?.unidad)   // a la unidad en que se guarda el stock
            await supabase.rpc('ajustar_stock_mp', { p_mp_id: a.mp_id, p_delta: -deltaMP })
            const movBase = {
              mp_id: a.mp_id, tipo: a.delta > 0 ? 'salida' : 'entrada', cantidad: Math.abs(deltaMP),
              fecha: fechaIni, responsable: prepResp || o.operario || '',
              obs: `Ajuste en planta · orden #${opNum(o.id)} (${o.producto}) — receta ${fCant(a.previsto)} g, usado ${fCant(a.real)} g`,
              extra: { orden_id: o.id, ajuste_ingrediente: true, previsto: a.previsto, real: a.real },
            }
            const { error: mErr } = await supabase.from('inventory_movements').insert({ ...movBase, costo_unitario: mp?.precio || 0 })
            if (mErr) await supabase.from('inventory_movements').insert(movBase)
          }
          // Se guardan en la orden para poder auditarlos y para reabrir el modal con las cantidades reales
          try { await supabase.from('production_orders').update({ ajustes_ingredientes: ajustesIngs }).eq('id', o.id) } catch { /* columna v131 opcional */ }
        } catch (e) { console.warn('No se pudieron aplicar los ajustes de ingredientes:', e) }
      }
      // Descuento del EMPAQUE realmente usado (bolsas por porción, cajas por surtido). Ya se verificó stock.
      if (!r.queued) { try { await aplicarEmpaque(o, empaquePlan) } catch (e) { console.warn('No se pudo descontar empaque:', e) } }
      // Si un subproducto se auto-aprueba (admin), genera la entrada de inventario MP igual que al aprobar
      if (!r.queued && autoAprob && o.es_subproducto && o.mp_id) {
        try {
          // Misma rutina que al aprobar: movimiento + lote PEPS + stock atómico + costo ponderado.
          // Se usa `unidadesTotal` (incluye lotes empacados adicionales), igual que cantidad_result.
          await registrarEntradaSubproducto(o, {
            cantidad: unidadesTotal, lote: prepLote, vence: prepVence,
            fecha: fechaIni, responsable: o.operario || profile?.nombre || '',
          })
        } catch (e) { console.warn('No se pudo sumar el subproducto a inventario:', e) }
      }
      // Si el admin auto-aprueba un producto terminado, súmalo al inventario de terminados.
      // En surtido: el stock es la cantidad empacada surtida y el lote de la caja = último lote combinado.
      if (!r.queued && autoAprob) {
        const esSurt = prepSurtido && prepProductoSurtido
        let cantStock, nombreStock, loteStock
        if (esSurt) { cantStock = parseFloat(prepSurtidoCantidad) || 0; nombreStock = prepProductoSurtido; loteStock = loteCaja(prepLoteMezcla, prepLote) || prepLote }
        // Producto base/porcionado: se suma la CANTIDAD FINAL (unidades/cajas), igual que el
        // registro diario (cantidad_result). Para porcionados, prepUnidades ya viene convertido a
        // cajas/unidades de venta; el sobrante de mezcla va a saldo aparte (no descuenta cajas).
        else { cantStock = unidadesTotal; nombreStock = o.producto; loteStock = prepLote }
        await sumarProductoTerminado(o, cantStock, nombreStock, loteStock)
      }
      // Saldos de mezcla en proceso (solo en línea): descontar los consumidos y crear el sobrante nuevo
      if (!r.queued) {
        try {
          // a) Descontar de los saldos consumidos (cualquier fila con saldo y consumo, tenga o no unidades)
          for (const ex of prepLotesExtra) {
            if (!ex.saldo_id) continue
            const consumido = parseFloat(ex.peso_consumido) || 0
            if (consumido <= 0) continue
            const { data: sal } = await supabase.from('mezcla_saldos').select('peso, lote, producto').eq('id', ex.saldo_id).single()
            const restante = Math.max(0, (sal?.peso || 0) - consumido)
            await supabase.from('mezcla_saldos').update({ peso: restante, estado: restante <= 0 ? 'agotado' : 'disponible' }).eq('id', ex.saldo_id)
            // Si este lote extra (que estaba en saldo, de una orden ya cerrada) se empaca surtido,
            // se marca y enlaza automáticamente su registro original con esta caja surtida.
            if (ex.surtido && sal?.lote) {
              try {
                const nombreSurtido = autoSurtido(o.producto, ex.lote_mezcla) || prepProductoSurtido || null
                let q = supabase.from('production_records').update({
                  surtido: true, producto_surtido: nombreSurtido, lote_mezcla: prepLote || null,
                }).eq('lote', sal.lote)
                if (sal.producto) q = q.eq('producto', sal.producto)
                await q
              } catch (e) { console.warn('No se pudo enlazar el lote extra en saldo con el surtido:', e) }
            }
          }
          // a2) Descontar de los saldos de los lotes combinados en el surtido
          for (const sc of surtidoConsumos) {
            const { data: sal } = await supabase.from('mezcla_saldos').select('peso, lote, producto, orden_origen').eq('id', sc.saldo_id).single()
            const rest = Math.max(0, (sal?.peso || 0) - sc.cantidad)
            await supabase.from('mezcla_saldos').update({ peso: rest, estado: rest <= 0 ? 'agotado' : 'disponible' }).eq('id', sc.saldo_id)
            // Conectar el lote YA CERRADO (que estaba en saldo) con este surtido: aunque su orden ya
            // estuviera cerrada y enviada, se marca automáticamente que TAMBIÉN se empacó surtido y se
            // enlaza con esta caja, para que ambos queden conectados en el registro de producción.
            if (sal?.lote) {
              try {
                let q = supabase.from('production_records').update({
                  surtido: true, producto_surtido: prepProductoSurtido || null, lote_mezcla: prepLote || null,
                }).eq('lote', sal.lote)
                if (sal.producto) q = q.eq('producto', sal.producto)
                await q
              } catch (e) { console.warn('No se pudo enlazar el lote en saldo con el surtido:', e) }
            }
          }
          // b) Crear el saldo nuevo con el sobrante de esta orden.
          //    En empaque de saldo NO se crea: el remanente ya quedó en el lote original (paso a), sería duplicar.
          const sobrante = parseFloat(prepSobrantePeso) || 0
          if (prepHaySobrante && sobrante > 0 && !o.empaque_saldo) {
            const saldoBase = {
              producto: o.producto, origen_id: o.origen_id || null, lote: prepLote || '', vencimiento: prepVence || null,
              peso: sobrante, unidad: prepSobranteUnidad, orden_origen: o.id, estado: 'disponible', creado_por: profile?.nombre || '',
            }
            // Valor del producto en proceso: la mezcla ya costó MP + mano de obra + CIF
            const cu = await costoUnitSaldo(o.origen_id, prepSobranteUnidad)
            const { error: sErr } = await supabase.from('mezcla_saldos').insert({ ...saldoBase, costo_unitario: cu })
            // La columna es de la migración v128; si no está, se guarda el saldo sin valorar
            if (sErr && /costo_unitario/i.test(sErr.message || '')) await supabase.from('mezcla_saldos').insert(saldoBase)
          }
        } catch (e) { console.warn('No se pudieron actualizar los saldos de mezcla:', e) }
      }
      if (!r.queued) {
        // Si hubo cambios de receta en planta, el admin debe enterarse SIN tener que abrir la orden:
        // es la información que explica por qué el inventario no cuadra con la ficha.
        const avisoAjustes = ajustesIngs.length
          ? ` ⚠ Se ajustaron ${ajustesIngs.length} ingrediente(s) en planta: ` +
            ajustesIngs.map(a => `${a.nombre} ${a.delta > 0 ? '+' : ''}${fCant(a.delta)} g`).join(', ') + '.'
          : ''
        if (autoAprob) { if (o.operario && o.operario !== profile?.nombre) await notificar({ destinatario: o.operario, tipo: 'orden_aprobada', mensaje: `La orden #${opNum(o.id)} (${o.producto}) fue cerrada y aprobada por ${profile?.nombre || 'admin'} ✓${avisoAjustes}`, link: '/ordenes', ref_id: o.id }) }
        else await notificar({ destinatario: 'admin', tipo: 'orden_enviada', mensaje: `Orden #${opNum(o.id)} (${o.producto}) enviada para aprobación por ${profile?.nombre || 'operario'}.${avisoAjustes}`, link: '/ordenes', ref_id: o.id })
      }
      qc.invalidateQueries({ queryKey: ['production_orders'] }); qc.invalidateQueries({ queryKey: ['production_records'] }); qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] }); qc.invalidateQueries({ queryKey: ['inventory_movements'] }); qc.invalidateQueries({ queryKey: ['mezcla_saldos'] }); qc.invalidateQueries({ queryKey: ['products_costing'] }); qc.invalidateQueries({ queryKey: ['finished_movements'] })
      setModalConfirmEnvio(false); setModalProceso(false)
      toast(r.queued ? 'Orden guardada sin conexión — se enviará al sincronizar 📴' : (autoAprob ? 'Producción registrada, cerrada y aprobada ✓' : 'Producción registrada y orden enviada a aprobación ✓'))
    } catch (e) { toast(e.message, 'error') } finally { setSavingEvid(false); setBusy(false) }
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
  // Ingredientes cuyo consumo excede el STOCK REAL de la MP (no solo los lotes). Se usa para
  // avisar antes de crear la orden: producir igual es válido (el stock puede reponerse), pero el
  // usuario debe saberlo — no descubrirlo cuando el inventario quede negativo.
  const faltantesStock = () => {
    if (!prodReceta || form.origen !== 'producto' || form.forzar_sin_lote) return []
    return (prodReceta.ings || []).filter(i => i.mpId).map(i => {
      const mp = mps.find(m => String(m.id) === String(i.mpId))
      const unidad = mp?.unidad || ''
      const necesita = gramosAUnidadMP(Number(i.gramos) || 0, unidad)
      const stock = Number(mp?.stock) || 0
      return necesita > stock + 0.001 ? { nombre: i.nombre, falta: necesita - stock, unidad } : null
    }).filter(Boolean)
  }
  // Envoltura del botón crear: si falta stock, confirma antes de continuar.
  const intentarCrearOrden = async () => {
    const faltan = faltantesStock()
    if (faltan.length) {
      const ok = await confirmar(
        'No hay stock suficiente para producir esto:\n\n' +
        faltan.map(f => `• ${f.nombre}: faltan ${fMP(f.falta, f.unidad)}`).join('\n') +
        '\n\nPuedes crear la orden igual, pero al consumir la materia prima el inventario quedará en negativo. ¿Continuar?',
        { title: 'Stock insuficiente', confirmText: 'Crear de todas formas' })
      if (!ok) return
    }
    crearOrden.mutate()
  }

  const crearOrden = useMutation({
    mutationFn: async () => {
      if (!form.producto.trim()) throw new Error('Indica el producto/receta')
      if (!(parseFloat(form.cantidad_plan) > 0)) throw new Error('Ingresa la cantidad planificada')
      if (!form.operario) throw new Error('Asigna un operario')
      if (form.es_subproducto && !form.mp_id) throw new Error(form.es_mp ? 'Esta MP vendible no está vinculada a una materia prima (revísala en la ficha)' : 'Indica qué materia prima alimenta el subproducto')
      const esEmp = empacarSaldo === true
      if (esEmp && !(saldoSelId && parseFloat(saldoCant) > 0)) throw new Error('Elige el saldo y la cantidad a empacar')
      if (esEmp) { const enProc = ordenEnProcesoDeSaldo(saldoSelId, editOrdenId); if (enProc) throw new Error(`Ese saldo ya está reservado por la orden #${opNum(enProc.id)} (${enProc.estado === 'pendiente' ? 'pendiente, sin cerrar' : 'en proceso'}). Ciérrala y envíala primero para poder empacarlo en otra orden.`) }
      const saldoUnidad = saldosMezcla.find(s => String(s.id) === String(saldoSelId))?.unidad || 'g'
      const campos = {
        producto: form.producto, origen: form.origen, origen_id: form.origen_id ? parseInt(form.origen_id) : null,
        es_subproducto: form.es_subproducto, mp_id: form.es_subproducto && form.mp_id ? parseInt(form.mp_id) : null,
        cantidad_plan: parseFloat(form.cantidad_plan) || 0, unidad: form.unidad,
        operario: form.operario, notas_orden: form.notas_orden,
        lote: form.lote || '', vence: form.vence || null, baches_plan: parseFloat(form.baches_plan) || null, inicio: form.inicio || null,
        es_prueba: form.origen === 'receta', forzar_sin_lote: !!form.forzar_sin_lote,
        lotes_preferidos: form.lotes_elegidos && Object.keys(form.lotes_elegidos).length ? form.lotes_elegidos : null,
        empaque_saldo: esEmp,
        saldo_pack: esEmp ? [{ saldo_id: saldoSelId, cantidad: parseFloat(saldoCant) || 0, unidad: saldoUnidad }] : null,
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production_orders'] }); qc.invalidateQueries({ queryKey: ['mezcla_saldos'] }); setModalNueva(false); setForm(EMPTY_ORDEN); setEmpacarSaldo(null); setSaldoSelId(''); setSaldoCant(''); toast(editOrdenId ? 'Orden actualizada ✓' : 'Orden creada y asignada ✓'); setEditOrdenId(null) },
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

  // Devolver orden (admin): elimina el registro de producción, DEVUELVE el stock terminado que sumó
  // y regresa la orden a 'en_proceso' para reeditarla.
  const devolverOrden = useMutation({
    meta: { label: 'Revirtiendo orden y devolviendo stock…' },
    mutationFn: async (o) => {
      // 1) Devolver el stock terminado sumado por esta orden (entradas de producción)
      const { data: movs } = await supabase.from('finished_movements').select('finished_id, cantidad, tipo').eq('ref', String(o.id)).eq('origen', 'produccion')
      const porFp = {}
      for (const m of (movs || [])) { if (m.tipo === 'entrada' && m.finished_id) porFp[m.finished_id] = (porFp[m.finished_id] || 0) + Number(m.cantidad || 0) }
      for (const fpId of Object.keys(porFp)) {
        const { data: fp } = await supabase.from('finished_products').select('stock, alegra_item_id').eq('id', fpId).maybeSingle()
        const nuevo = Math.max(0, Number(fp?.stock || 0) - porFp[fpId])
        await supabase.from('finished_products').update({ stock: nuevo }).eq('id', fpId)
        if (fp?.alegra_item_id) { try { await supabase.functions.invoke('alegra-push-stock', { body: { finished_id: fpId } }) } catch { /* offline */ } }
      }
      await supabase.from('finished_movements').delete().eq('ref', String(o.id)).eq('origen', 'produccion')
      // 2) Eliminar el saldo (sobrante) que creó esta orden
      await supabase.from('mezcla_saldos').delete().eq('orden_origen', o.id)
      // 2b) Reponer los saldos que esta orden había CONSUMIDO (surtido / empaque de saldo)
      if (Array.isArray(o.saldos_consumidos)) {
        for (const sc of o.saldos_consumidos) {
          if (!sc.saldo_id || !(Number(sc.cantidad) > 0)) continue
          const { data: sal } = await supabase.from('mezcla_saldos').select('peso').eq('id', sc.saldo_id).maybeSingle()
          if (sal) await supabase.from('mezcla_saldos').update({ peso: Number(sal.peso || 0) + Number(sc.cantidad), estado: 'disponible' }).eq('id', sc.saldo_id)
        }
      }
      // 3) Borrar los registros de producción de la orden
      await supabase.from('production_records').delete().eq('orden_id', o.id)
      // 4) Devolver la MP a estado RESERVADA (revierte el consumo definitivo, para que al reeditar no se duplique)
      let lotesReservados = null
      if (Array.isArray(o.lotes_mp) && o.lotes_mp.length) {
        for (const it of o.lotes_mp) {
          for (const l of (it.lotes || [])) {
            if (!l.id) continue
            const { data: lote } = await supabase.from('raw_material_lots').select('cantidad_reservada').eq('id', l.id).single()
            await supabase.from('raw_material_lots').update({ cantidad_reservada: (lote?.cantidad_reservada || 0) + (l.cantidad || 0) }).eq('id', l.id)
          }
        }
        lotesReservados = o.lotes_mp
      }
      // 4b) Reponer el EMPAQUE que descontó esta orden. A diferencia de la MP, el empaque no se
      // reserva: sale directo del stock al cerrar. Antes solo se borraba el movimiento y el stock
      // no volvía, así que al reeditar y cerrar de nuevo se descontaba por segunda vez.
      // 4c) Si era un SUBPRODUCTO, revertir también la entrada que sumó a inventario de MP.
      try {
        const { data: movsOrden } = await supabase.from('inventory_movements')
          .select('mp_id, cantidad, tipo, extra').eq('extra->>orden_id', String(o.id))
        for (const m of (movsOrden || [])) {
          if (!m.mp_id) continue
          const cant = Number(m.cantidad) || 0
          if (m.tipo === 'salida' && m.extra?.empaque) {
            await supabase.rpc('ajustar_stock_mp', { p_mp_id: m.mp_id, p_delta: cant })          // devuelve el empaque
          } else if (m.tipo === 'entrada' && o.es_subproducto) {
            await supabase.rpc('ajustar_stock_mp', { p_mp_id: m.mp_id, p_delta: -cant })         // retira el subproducto
          }
        }
      } catch (e) { console.warn('No se pudo revertir el stock de la orden:', e) }
      // Elimina los lotes que generó la orden (subproducto) y avisa si ya se consumieron
      if (o.es_subproducto) {
        try {
          const { noRevertible } = await revertirLotesDeOrden(o.id)
          if (noRevertible > 0) toast(`Atención: ${fNum(noRevertible)} del lote producido ya se había consumido y no se pudo revertir`, 'warning')
        } catch (e) { console.warn('No se pudieron revertir los lotes de la orden:', e) }
      }
      // Elimina los movimientos de inventario que generó esta orden (MP, empaque y subproducto)
      try { await supabase.from('inventory_movements').delete().eq('extra->>orden_id', String(o.id)) } catch { /* sin soporte de filtro jsonb */ }
      // 5) Regresar la orden a 'en_proceso' para reeditarla, con la MP de nuevo reservada
      const { error } = await supabase.from('production_orders').update({
        estado: 'en_proceso', fecha_envio: null, aprobado_por: null, fecha_aprob: null,
        lotes_reservados: lotesReservados, lotes_mp: null,
      }).eq('id', o.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production_orders'] }); qc.invalidateQueries({ queryKey: ['production_records'] })
      qc.invalidateQueries({ queryKey: ['finished_products'] }); qc.invalidateQueries({ queryKey: ['finished_movements'] }); qc.invalidateQueries({ queryKey: ['mezcla_saldos'] })
      toast('Orden devuelta — registro eliminado y stock devuelto ✓')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  // Cierra una orden ATASCADA (pendiente o en proceso, sin ejecutar) que lleva mucho tiempo abierta.
  // A diferencia de "Eliminar", conserva el registro (queda como "Cerrada sin ejecutar") y libera la MP reservada.
  const cerrarSinEjecutar = useMutation({
    mutationFn: async (o) => {
      if (o.estado === 'en_proceso') { try { await liberarMP(o) } catch (e) { console.warn('No se pudo liberar MP:', e) } }
      const { error } = await supabase.from('production_orders').update({ estado: 'cancelada' }).eq('id', o.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production_orders'] }); qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] })
      toast('Orden cerrada sin ejecutar — MP reservada devuelta al inventario ✓')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const eliminarOrden = useMutation({
    mutationFn: async (o) => {
      if (typeof o === 'object' && o.estado === 'cancelada') throw new Error('Esta orden ya está cerrada ("Cerrada sin ejecutar") y no se puede eliminar.')
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

  // Reconciliación manual: para órdenes que quedaron EN PROCESO sin reserva de MP (ej. por el bug
  // histórico de reservarPEPS), permite reservarla ahora sin tener que devolver/recrear la orden.
  const reservarMPManual = useMutation({
    mutationFn: async (o) => { await reservarMP(o) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production_orders'] }); qc.invalidateQueries({ queryKey: ['raw_materials'] }); qc.invalidateQueries({ queryKey: ['raw_material_lots'] }); toast('MP reservada ✓') },
    onError: (e) => toast('No se pudo reservar: ' + e.message, 'error'),
  })

  // 1) RESERVAR la MP cuando la orden INICIA producción (sale de "disponible" → "reservado")
  const reservarMP = async (o) => {
    if (o.empaque_saldo) return   // empaque de saldo: no consume MP (ya está producido)
    if (o.origen !== 'producto' || !o.origen_id) return
    if (Array.isArray(o.lotes_reservados) && o.lotes_reservados.length) return  // ya reservado (idempotente)
    const items = await calcularConsumoOrden(o)
    if (!items.length) return
    const sinLote = !!o.forzar_sin_lote   // forzar: no descontar de lotes, solo del stock
    const preferidos = (o.lotes_preferidos && typeof o.lotes_preferidos === 'object') ? o.lotes_preferidos : {}
    const reservas = []
    for (const it of items) {
      let lotes = [], faltanteLotes = 0
      if (!it.esEmp && !sinLote) {
        const r = await reservarPEPS({ mp_id: it.mpId, cantidad: it.consumo, preferLoteId: preferidos[it.mpId] || preferidos[String(it.mpId)] || null })
        lotes = r.reservados; faltanteLotes = r.faltante || 0
      }
      // El stock (disponible) baja al reservar (con o sin lote). Ajuste atómico en BD (evita
      // condición de carrera con otro movimiento de inventario simultáneo).
      await supabase.rpc('ajustar_stock_mp', { p_mp_id: it.mpId, p_delta: -it.consumo })
      // Si los lotes no cubrieron todo el consumo (sin lotes cargados, o insuficientes), se registra
      // explícitamente cuánto salió del stock GENERAL sin trazabilidad de lote — para no perderlo en silencio.
      reservas.push({ mp_id: it.mpId, nombre: it.nombre, unidad: it.unidad, consumo: it.consumo, lotes, sin_lote: sinLote, ...(faltanteLotes > 0 ? { sin_lote_cantidad: faltanteLotes } : {}) })
    }
    await supabase.from('production_orders').update({ lotes_reservados: reservas }).eq('id', o.id)
  }

  // 2) LIBERAR la reserva si la orden se elimina / no se ejecuta (vuelve a "disponible")
  const liberarMP = async (o) => {
    const reservas = Array.isArray(o.lotes_reservados) ? o.lotes_reservados : null
    if (!reservas) return
    for (const it of reservas) {
      await liberarReservaLotes(it.lotes || [])
      await supabase.rpc('ajustar_stock_mp', { p_mp_id: it.mp_id, p_delta: it.consumo || 0 })
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
      // Costo real PEPS de esta salida (cada lote a su propio costo); lo no cubierto por lotes
      // se valora al precio promedio de la MP, que es la única referencia disponible.
      const precioRef = mps.find(m => String(m.id) === String(it.mp_id))?.precio || 0
      const cp = costoPEPS(it.lotes || [], it.sin_lote_cantidad || (sinLote ? it.consumo : 0), precioRef)
      const movBase = {
        mp_id: it.mp_id, tipo: 'salida', cantidad: it.consumo, fecha: hoy,
        responsable: o.operario || '', obs: `Consumo orden #${opNum(o.id)} (${o.producto})${sinLote ? ' — salida sin lote' : ''}`,
        extra: { lotes_consumidos: it.lotes || [], orden_id: o.id, sin_lote: sinLote, costo_peps_total: Math.round(cp.costoTotal) },
      }
      let { error: mErr } = await supabase.from('inventory_movements').insert({ ...movBase, costo_unitario: cp.costoUnitario })
      if (mErr && /costo_unitario/i.test(mErr.message || '')) await supabase.from('inventory_movements').insert(movBase)
    }
    // Pasa la trazabilidad a lotes_mp y limpia la reserva (ya es consumo definitivo)
    await supabase.from('production_orders').update({ lotes_mp: reservas, lotes_reservados: null }).eq('id', o.id)
  }

  // ===== EMPAQUE (bolsas/cajas) — descuento según lo producido/empacado =====
  // Se identifica por nombre/categoría de la MP. Relación 1:1:
  //  · Bolsa → 1 por CADA subporción PRODUCIDA (cada subporción se envuelve en su bolsa de
  //            polipropileno, aunque parte quede como saldo para empacar después). Si no es
  //            porcionado (p.ej. infusiones), por unidad × relación de la ficha (12 filtros/caja).
  //  · Caja  → 1 por unidad empacada como surtido (o por unidad si no es surtido).
  //  · Otro empaque → por unidad × relación de la ficha.
  const KW_BOLSA = /bolsa|filtro|metaliz|sobre|sachet|doypack|funda|flexible/i
  const KW_CAJA  = /caja|estuche|display|corrugad|plegadiz|cart(o|ó)n/i
  const tipoEmpaque = (mp) => { const t = `${mp?.nombre || ''} ${mp?.categoria || ''}`; return KW_BOLSA.test(t) ? 'bolsa' : (KW_CAJA.test(t) ? 'caja' : 'otro') }

  // Calcula el plan de descuento y VERIFICA stock (lanza error si falta → bloquea el cierre).
  const prepararEmpaque = async (o, { unidadesEmpacadas = 0, subpTotal = 0, surtidoUnid = 0, esPorcionado = false, esSurtido = false }) => {
    // SIEMPRE devuelve { plan, faltantes }. Antes retornaba [] para subproductos/pruebas, y como
    // el resultado se guarda en `empaquePrevio` y luego se lee `.plan.length`, iniciar una orden
    // de MP interna reventaba con "Cannot read properties of undefined (reading 'length')".
    if (o.es_subproducto || o.es_prueba || o.origen !== 'producto' || !o.origen_id) return { plan: [], faltantes: [] }
    const { data: prod } = await supabase.from('products_costing').select('empaque, bache, merma').eq('id', o.origen_id).single()
    let emps = []; try { emps = Array.isArray(prod?.empaque) ? prod.empaque : JSON.parse(prod?.empaque || '[]') } catch { emps = [] }
    // Unidades netas por bache (para deducir la relación empaque-por-unidad de la ficha, p.ej. 12 filtros/caja)
    const unidsBache = (parseFloat(prod?.bache) || 0) * (1 - (parseFloat(prod?.merma) || 0) / 100)
    const plan = []
    for (const e of emps.filter(x => x.mpId)) {
      const { data: mp } = await supabase.from('raw_materials').select('id, nombre, categoria, stock, unidad').eq('id', parseInt(e.mpId)).single()
      if (!mp) continue
      const tipo = tipoEmpaque(mp)
      // Relación de la ficha: empaques por unidad producida = cantidad(por bache) ÷ unidades por bache.
      // Ej: infusión con 12 filtros/caja → ratio 12; caja → ratio 1.
      const ratio = unidsBache > 0 ? (parseFloat(e.cantidad) || 0) / unidsBache : 1
      const porRatio = unidadesEmpacadas * ratio
      // Bocadillos: bolsa = subporciones reales, caja = surtido real (exacto, 1:1).
      // Infusiones y demás: por unidades empacadas × relación de la ficha (respeta 12 filtros/caja, etc.).
      let qty = tipo === 'bolsa' ? (esPorcionado ? subpTotal : porRatio)
        : tipo === 'caja' ? (esSurtido ? surtidoUnid : porRatio)
        : porRatio
      qty = Math.round(qty)
      if (qty <= 0) continue
      plan.push({ mp, qty, tipo, stock: Math.round(Number(mp.stock) || 0) })
    }
    const faltantes = plan.filter(p => (Number(p.mp.stock) || 0) < p.qty)
    return { plan, faltantes }
  }
  // ---- Insumos imprimibles: abrir para imprimir, o compartir con apps del dispositivo ----
  // En tablet/móvil se ofrece primero "Compartir": así el operario manda el PDF a la app de
  // impresión, a WhatsApp o a Drive sin descargarlo ni salir de la orden. En PC se abre en una
  // pestaña, donde el visor ya trae el botón de imprimir.
  const urlFirmadaArchivo = async (bucket, path) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
    if (error) throw error
    return data.signedUrl
  }
  // doc = { bucket, path, nombre }
  const imprimirInsumo = async (doc) => {
    setImpBusy(doc.path)
    try {
      const url = await urlFirmadaArchivo(doc.bucket, doc.path)
      window.open(url, '_blank', 'noopener')
    } catch (e) { toast('No se pudo abrir el archivo: ' + e.message, 'error') }
    finally { setImpBusy('') }
  }
  const compartirInsumo = async (doc) => {
    setImpBusy(doc.path)
    try {
      const url = await urlFirmadaArchivo(doc.bucket, doc.path)
      const blob = await (await fetch(url)).blob()
      const file = new File([blob], doc.nombre || 'documento', { type: blob.type || 'application/octet-stream' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: doc.nombre })
      } else {
        window.open(url, '_blank', 'noopener')   // sin soporte para compartir: se abre el visor
      }
    } catch (e) {
      if (e?.name !== 'AbortError') toast('No se pudo compartir: ' + e.message, 'error')
    } finally { setImpBusy('') }
  }
  // Hay API de compartir archivos (tablets y móviles); en escritorio casi nunca
  const puedeCompartirArchivos = typeof navigator !== 'undefined' && !!navigator.canShare

  const errorEmpaque = (faltantes) => 'Empaque insuficiente para cerrar: ' + faltantes.map(p => `${p.mp.nombre} (necesita ${fNum(p.qty)}, hay ${fNum(p.stock)})`).join(' · ')
  // Descuenta el empaque del stock (+ movimiento de salida). Se llama tras cerrar la orden.
  const aplicarEmpaque = async (o, plan) => {
    if (!plan || !plan.length) return
    const hoy = o.fecha_prod || new Date().toISOString().split('T')[0]
    for (const p of plan) {
      await supabase.rpc('ajustar_stock_mp', { p_mp_id: p.mp.id, p_delta: -p.qty })
      await supabase.from('inventory_movements').insert({
        mp_id: p.mp.id, tipo: 'salida', cantidad: p.qty, fecha: hoy,
        responsable: o.operario || '', obs: `Empaque (${p.tipo}) orden #${opNum(o.id)} (${o.producto})`,
        extra: { orden_id: o.id, empaque: true, tipo: p.tipo },
      })
    }
  }

  // COSTO por unidad de peso de un saldo de mezcla (producto EN PROCESO).
  // La mezcla ya absorbió materia prima, mano de obra y CIF, pero todavía no lleva empaque:
  // por eso se descuenta el empaque del costo unitario de la ficha antes de repartirlo por peso.
  //   costo/peso = (costo unitario de la ficha − empaque por unidad) ÷ peso de una unidad
  const costoUnitSaldo = async (origenId, unidadSaldo) => {
    if (!origenId) return 0
    const { data: f } = await supabase.from('products_costing')
      .select('costo_final, empaque, bache, merma, peso_unidad').eq('id', origenId).maybeSingle()
    if (!f) return 0
    const pesoUnidad = parseFloat(f.peso_unidad) || 0      // gramos que pesa una unidad vendible
    if (!(pesoUnidad > 0)) return 0
    let emps = []; try { emps = Array.isArray(f.empaque) ? f.empaque : JSON.parse(f.empaque || '[]') } catch { emps = [] }
    const unidsBache = (parseFloat(f.bache) || 0) * (1 - (parseFloat(f.merma) || 0) / 100)
    const empBache = emps.reduce((s, e) => s + ((parseFloat(e.precio) || 0) / (parseFloat(e.presentacion) || 1)) * (parseFloat(e.cantidad) || 0), 0)
    const empUnit = unidsBache > 0 ? empBache / unidsBache : 0
    const sinEmpaque = Math.max(0, (parseFloat(f.costo_final) || 0) - empUnit)
    const porGramo = sinEmpaque / pesoUnidad
    return unidadSaldo === 'Kg' ? porGramo * 1000 : porGramo   // el saldo se guarda en g o en Kg
  }

  // ENTRADA a inventario de MP de un SUBPRODUCTO fabricado (mermelada, pulpa...).
  // Única implementación usada tanto al APROBAR como al cerrar con auto-aprobación de admin:
  // antes la ruta de auto-aprobación era una copia degradada que no creaba el lote PEPS (dejando
  // el stock general descuadrado frente a la suma de lotes para siempre), no actualizaba el costo
  // de la MP y escribía el stock sin el RPC atómico.
  const registrarEntradaSubproducto = async (o, { cantidad, lote, vence, fecha, responsable }) => {
    const obtenidas = parseFloat(cantidad) || 0
    if (!(o.es_subproducto && o.mp_id) || obtenidas <= 0) return
    const fechaEnt = fecha || new Date().toISOString().split('T')[0]

    // ---- Costo real del lote producido ----
    const prodFicha = productos.find(p => String(p.id) === String(o.origen_id))
    const planificadas = parseFloat(o.cantidad_plan) || 0
    const destOrden = Array.isArray(o.destajo) ? o.destajo.reduce((s, d) => s + (parseFloat(d.cantidad) || 0) * (parseFloat(d.tarifa) || 0), 0) : 0
    const totalU = prodFicha ? (parseFloat(prodFicha.costo_final) || 0) : 0
    const varU   = prodFicha ? (parseFloat(prodFicha.costo_variable) || 0) : 0
    const conversionU = Math.max(0, totalU - varU)   // mano de obra + CIF por unidad (de la ficha)
    const base = planificadas > 0 ? planificadas : obtenidas
    // Materiales al costo REAL de los lotes PEPS consumidos (cada uno a su costo de entrada).
    // Al cerrar, `lotes_mp` aún no está en el objeto local: se usa la reserva, que tiene los mismos lotes.
    const lotesUsados = Array.isArray(o.lotes_mp) ? o.lotes_mp : (Array.isArray(o.lotes_reservados) ? o.lotes_reservados : [])
    const mpRealTotal = lotesUsados.reduce((s, it) => {
      const precioRef = mps.find(m => String(m.id) === String(it.mp_id))?.precio || 0
      return s + costoPEPS(it.lotes || [], it.sin_lote_cantidad || 0, precioRef).costoTotal
    }, 0)
    const materialesLote = mpRealTotal > 0 ? mpRealTotal : varU * base   // sin lotes: costo teórico de la ficha
    const costoLote = materialesLote + conversionU * base + destOrden
    const costoUnitReal = obtenidas > 0 ? costoLote / obtenidas : totalU

    // ---- Movimiento de entrada ----
    const movBase = {
      mp_id: o.mp_id, tipo: 'entrada', cantidad: obtenidas, fecha: fechaEnt,
      responsable: responsable || o.operario || '', obs: `Orden de producción #${opNum(o.id)} (subproducto)`,
      lote: lote || '', vencimiento: vence || null, extra: { costo_unitario_real: costoUnitReal, orden_id: o.id },
    }
    let { error: movErr } = await supabase.from('inventory_movements').insert({ ...movBase, costo_unitario: costoUnitReal })
    if (movErr && /costo_unitario/i.test(movErr.message || '')) await supabase.from('inventory_movements').insert(movBase)

    // ---- Lote PEPS (sin esto la cantidad queda sin trazabilidad y descuadra el stock) ----
    try {
      await crearLoteEntrada({
        mp_id: o.mp_id, lote: lote || '', vencimiento: vence || null, fecha: fechaEnt,
        cantidad: obtenidas, costo_unitario: costoUnitReal, creado_por: responsable || o.operario || '',
        orden_id: o.id,   // permite revertir este lote si la orden se devuelve
      })
    } catch (e) { console.warn('No se pudo crear lote del subproducto:', e) }

    // ---- Stock (atómico) + costo promedio ponderado con el stock remanente ----
    const { data: mpRow } = await supabase.from('raw_materials').select('stock, precio').eq('id', o.mp_id).single()
    const stockPrevio = Math.max(0, Number(mpRow?.stock) || 0)
    const precioPrevio = Number(mpRow?.precio) || 0
    const nuevo = stockPrevio + obtenidas
    const precioPonderado = nuevo > 0 ? (stockPrevio * precioPrevio + obtenidas * costoUnitReal) / nuevo : costoUnitReal
    await supabase.rpc('ajustar_stock_mp', { p_mp_id: o.mp_id, p_delta: obtenidas })
    const upd = { precio: precioPonderado }
    if (lote) upd.lote = lote
    if (vence) upd.vencimiento = vence
    await supabase.from('raw_materials').update(upd).eq('id', o.mp_id)

    // ---- Si esa MP se publica como producto vendible, refleja stock y lo empuja a Alegra ----
    try {
      const { data: fp } = await supabase.from('finished_products').select('id, alegra_item_id').eq('mp_id', o.mp_id).maybeSingle()
      if (fp) {
        await supabase.from('finished_products').update({ stock: nuevo }).eq('id', fp.id)
        if (fp.alegra_item_id) { try { await supabase.functions.invoke('alegra-push-stock', { body: { finished_id: fp.id } }) } catch { /* no bloquea */ } }
      }
    } catch { /* sin producto vendible enlazado */ }
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
      const loteMov = loteOverride || o.lote || ''
      // Idempotencia: si esta orden ya sumó stock para este producto y lote, no lo repite.
      // Protege ante reintentos, doble clic o una aprobación que se ejecute dos veces.
      const { data: yaSumado } = await supabase.from('finished_movements')
        .select('id').eq('ref', String(o.id)).eq('origen', 'produccion').eq('tipo', 'entrada')
        .eq('finished_id', fp.id).eq('lote', loteMov).maybeSingle()
      if (yaSumado) { console.warn('El stock de esta orden ya se había sumado; se omite.'); return }
      // Ajuste atómico en BD (evita perder unidades si dos aprobaciones ocurren a la vez).
      // Si la función aún no está desplegada (migración v127), cae al método anterior.
      const { error: rpcErr } = await supabase.rpc('ajustar_stock_finished', { p_finished_id: fp.id, p_delta: cantidad })
      if (rpcErr) await supabase.from('finished_products').update({ stock: (Number(fp.stock) || 0) + cantidad }).eq('id', fp.id)
      await supabase.from('finished_movements').insert({
        finished_id: fp.id, product_id: o.origen_id, tipo: 'entrada', cantidad, lote: loteMov,
        fecha: o.fecha_prod || new Date().toISOString().split('T')[0],
        origen: 'produccion', ref: String(o.id), obs: `OP-${opNum(o.id)} (${nombre || o.producto})`, creado_por: profile?.nombre || '',
      })
      // Empuja el nuevo stock a Alegra (si está enlazado). No bloquea si falla.
      try { await supabase.functions.invoke('alegra-push-stock', { body: { finished_id: fp.id } }) } catch (e) { console.warn('No se pudo sincronizar stock con Alegra:', e) }
    } catch (e) { console.warn('No se pudo sumar producto terminado:', e) }
  }

  // ---- Aprobar / Rechazar (admin) ----
  const aprobar = useMutation({
    meta: { label: 'Aprobando orden y sincronizando inventario…' },
    mutationFn: async (o) => {
      // 1. Marcar aprobada
      const { error } = await supabase.from('production_orders').update({
        estado: 'aprobada', aprobado_por: profile?.nombre || 'admin', fecha_aprob: new Date().toISOString(),
      }).eq('id', o.id)
      if (error) throw error

      // El consumo de MP ya ocurrió al ENVIAR la orden (reserva → consumido). Aquí solo se aprueba.

      if (o.es_subproducto && o.mp_id) {
        // 2a. Subproducto → entrada de inventario MP (movimiento + lote PEPS + stock + costo).
        // Misma rutina que usa el cierre con auto-aprobación del admin.
        await registrarEntradaSubproducto(o, {
          cantidad: o.cantidad_result || 0, lote: o.lote, vence: o.vence,
          fecha: o.fecha_prod, responsable: o.operario,
        })
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
          const unpackedSub = (o.hay_sobrante && o.sobrante_unidad === 'subporciones') ? (Number(o.sobrante_peso) || 0) : 0
          const porciona = o.cant_subporciones != null
          let cantStock, nombreStock, loteStock
          if (esSurt) { cantStock = Number(o.surtido_cantidad) || 0; nombreStock = o.producto_surtido; loteStock = loteCaja(o.lote_mezcla, o.lote) || o.lote }
          else if (porciona) { cantStock = Math.max(0, (Number(o.cant_subporciones) || 0) - unpackedSub); nombreStock = o.producto; loteStock = o.lote }
          else { cantStock = o.cantidad_result || 0; nombreStock = o.producto; loteStock = o.lote }
          await sumarProductoTerminado(o, cantStock, nombreStock, loteStock)
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
    setEmpacarSaldo(null); setSaldoSelId(''); setSaldoCant('')
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
      // MP vendible: se comporta como subproducto (suma a stock de MP), con su mp_id ya vinculado
      const esMpFicha = p?.tipo === 'mp'
      // Para una MP interna medida por peso, la orden se cuenta en la unidad de la MP (Kg, Gramo…),
      // no en "unidades": así el resultado se captura y acredita al inventario en esa unidad.
      const unidadMpFicha = esMpFicha ? (mps.find(m => String(m.id) === String(p?.mp_id))?.unidad || '') : ''
      setForm(f => ({ ...f, producto: p?.nombre || '', origen: 'producto', origen_id: id, es_subproducto: p?.tipo === 'subproducto' || esMpFicha, es_mp: esMpFicha, mp_id: esMpFicha ? String(p?.mp_id || '') : f.mp_id, unidad: (esMpFicha && esUnidadPeso(unidadMpFicha)) ? unidadMpFicha : 'unidades', unidadesPorBache: parseFloat(p?.bache) || 0 }))
      // Cargar la receta para permitir planear por ingrediente disponible
      const { data: full } = await supabase.from('products_costing').select('ingredientes, bache, rendimiento, desperdicio, peso_unidad, peso_subporcion').eq('id', id).single()
      if (full) {
        const parse = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return [] } }
        const ings = parse(full.ingredientes).filter(i => (parseFloat(i.cantidad) || 0) > 0)
        const totalMezcla = ings.reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0)
        const rend = parseFloat(full.rendimiento) || 62, desp = parseFloat(full.desperdicio) || 2, pu = parseFloat(full.peso_unidad) || 1000
        const unidsBacheNet = pu > 0 ? (totalMezcla * (rend / 100) * (1 - desp / 100)) / pu : (parseFloat(full.bache) || 0)
        setProdReceta({ ings, unidsBacheNet, bache: parseFloat(full.bache) || 0, pesoUnidad: pu, pesoSubp: parseFloat(full.peso_subporcion) || 0 })
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
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={() => setModalAudit(true)}><Ico as={ScrollText} size={14} />Registro de creación</button>}
          <button className="btn btn-secondary btn-sm" title="Descargar un PDF con todas las órdenes visibles (cada una en su hoja)" onClick={() => descargarOrdenesPDF(visibles)}><Ico as={Download} size={14} />Descargar órdenes</button>
          {(esAdmin || esOperario) && <button className="btn btn-primary btn-sm" onClick={() => { setEditOrdenId(null); setForm({ ...EMPTY_ORDEN, operario: esOperario ? (profile?.nombre || '') : '' }); setProdReceta(null); setIngIdx(''); setIngDisp(''); setEmpacarSaldo(null); setSaldoSelId(''); setSaldoCant(''); setModalNueva(true) }}><Ico as={Plus} size={14} />Nueva Orden</button>}
        </div>
      </div>

      {saldosMezcla.length > 0 && (
        <details className="acordeon-item" style={{ borderLeft: '4px solid var(--lima)' }}>
          <summary>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Recycle size={16} aria-hidden="true" /> Saldos de mezcla en proceso
              <span className="badge badge-dorado">{saldosMezcla.length}</span>
            </span>
          </summary>
          <div className="acordeon-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', margin: 0 }}>Sobrantes de producción sin empacar. Se pueden empacar al diligenciar una orden del mismo producto.</p>
              <button className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => navigate('/porempacar')}>Gestionar productos por empacar</button>
            </div>
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
        </details>
      )}

      <div className="card">
        <div className="card-title"><Ico as={ClipboardList} size={16} />{esAdmin ? 'Todas las órdenes' : 'Mis órdenes asignadas'}</div>
        {cargandoOrdenes ? <Cargando texto="Cargando órdenes…" /> : (
        <div className="table-wrap">
          <table className="tabla-ordenes">
            <thead><tr><th>#</th><th className="col-opcional">Emitida</th><th>Producto</th><th>Lote</th><th>Vence</th><th className="col-opcional movil-hide">Tipo</th><th className="movil-hide">Cant. plan</th><th className="col-opcional-2 movil-hide">Operario</th><th>Estado</th><th className="col-opcional-2 movil-hide">Resultado</th><th>Acciones</th></tr></thead>
            <tbody>
              {visibles.length === 0
                ? <tr><td colSpan={11} className="empty-table">No hay órdenes</td></tr>
                : visibles.map(o => {
                  const est = ESTADO_LABEL[o.estado] || ESTADO_LABEL.pendiente
                  const esMia = o.operario === profile?.nombre
                  return (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setOrdenDetalle(o)}>
                      <td>#{opNum(o.id)}</td>
                      <td className="col-opcional">{o.created_at ? fFecha(o.created_at.split('T')[0]) : '—'}</td>
                      <td><strong>{o.producto}</strong>{o.notas_orden && <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>{o.notas_orden}</div>}</td>
                      <td>{o.lote || '—'}{o.surtido && o.lote_mezcla && <div style={{ fontSize: '0.7rem', color: 'var(--tierra)', display: 'flex', alignItems: 'center', gap: 3 }}><Shuffle size={11} aria-hidden="true" /> {o.lote_mezcla}</div>}</td>
                      <td style={{ color: o.vence ? (estadoLote(o.vence) === 'vencido' ? 'var(--rojo)' : estadoLote(o.vence) === 'por_vencer' ? 'var(--tierra)' : undefined) : undefined }}>{o.vence ? fmtVence(o.vence) : '—'}</td>
                      <td className="col-opcional movil-hide">{o.es_prueba ? <span className="badge badge-dorado" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><FlaskConical size={11} aria-hidden="true" /> Prueba</span> : o.es_subproducto ? <span className="badge badge-dorado">Subproducto</span> : <span className="badge badge-azul">Terminado</span>}</td>
                      <td className="td-number movil-hide">{fNum(o.cantidad_plan)} {o.unidad}</td>
                      <td className="col-opcional-2 movil-hide">{o.operario}</td>
                      <td><span className={`badge ${est.badge}`}>{est.txt}</span>{o.estado === 'rechazada' && o.motivo_rechazo && <div style={{ fontSize: '0.72rem', color: 'var(--rojo)' }}>{o.motivo_rechazo}</div>}</td>
                      <td className="td-number col-opcional-2 movil-hide">{o.cantidad_result != null ? `${fNum(o.cantidad_result)}` : '—'}</td>
                      <td className="celda-acciones" onClick={e => e.stopPropagation()}>
                        <div className="ordenes-acciones" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-xs btn-secondary" title="Ver detalles" onClick={() => setOrdenDetalle(o)}><Eye size={13} aria-hidden="true" />Detalles</button>
                          {/* Imprimir la orden ya cerrada/enviada (mismo formato) — solo ícono */}
                          {(o.estado === 'ejecutada' || o.estado === 'aprobada' || o.estado === 'cancelada') && <>
                            <button className="btn btn-xs btn-secondary" title="Imprimir orden" onClick={() => imprimirOrden('print', o)}><Printer size={13} aria-hidden="true" /></button>
                            {esMovil && <button className="btn btn-xs btn-secondary" title="Compartir orden (PDF)" aria-label="Compartir orden (PDF)" onClick={() => compartirOrden(o)}><Share2 size={13} aria-hidden="true" /></button>}
                          </>}
                          {/* Imprimir / compartir órdenes ABIERTAS que no son propias (incluidos operarios) */}
                          {!esMia && (o.estado === 'pendiente' || o.estado === 'en_proceso') && <>
                            <button className="btn btn-xs btn-secondary" title="Imprimir orden" aria-label="Imprimir orden" onClick={() => imprimirOrden('print', o)}><Printer size={13} aria-hidden="true" /></button>
                            {esMovil && <button className="btn btn-xs btn-secondary" title="Compartir orden (PDF)" aria-label="Compartir orden (PDF)" onClick={() => compartirOrden(o)}><Share2 size={13} aria-hidden="true" /></button>}
                          </>}
                          {/* Quien ejecuta la orden: el operario dueño */}
                          {esMia && o.estado === 'pendiente' && <button className="btn btn-xs btn-primary" onClick={() => tomarOrden.mutate(o)}><Ico as={Play} size={13} />Tomar</button>}
                          {/* Los ingredientes se ven en "Detalles" y en el modal de proceso, por eso ya no hay botón aparte */}
                          {esMia && (o.estado === 'en_proceso' || o.estado === 'rechazada') && (
                            <button className="btn btn-xs btn-primary" onClick={() => openProceso(o)}><Ico as={Play} size={13} />Iniciar proceso</button>
                          )}
                          {/* (El botón "Imprimir" se quitó de aquí: los ingredientes se ven en Detalles y en el modal de proceso) */}
                          {/* El admin puede diligenciar el proceso de órdenes de OTROS (en las suyas ya tiene "Iniciar proceso") */}
                          {esAdmin && !esMia && (o.estado === 'pendiente' || o.estado === 'en_proceso' || o.estado === 'rechazada') && (
                            <button className="btn btn-xs btn-primary" title="Diligenciar proceso, cerrar y enviar (se aprueba automáticamente)" onClick={() => adminDiligenciar(o)}><Ico as={Play} size={13} />Diligenciar proceso</button>
                          )}
                          {/* Editar la orden mientras esté pendiente (no tomada) */}
                          {(esAdmin || esOperario) && o.estado === 'pendiente' && <button className="btn btn-xs btn-secondary" title="Modificar orden" onClick={() => openEditarOrden(o)}><Pencil size={13} aria-hidden="true" />Editar</button>}
                          {/* Ventana de 1 día hábil para corregir el envío (no-admin) */}
                          {!esAdmin && esMia && o.estado === 'ejecutada' && dentroVentanaEdicion(o) && (
                            <button className="btn btn-xs btn-secondary" title="Anular el envío para corregirlo (1 día hábil)" onClick={() => confirmar('¿Anular el envío para corregir el registro?').then(ok => ok && anularEnvio.mutate(o))}><Ico as={Undo2} size={13} />Anular envío</button>
                          )}
                          {!esAdmin && esMia && o.estado === 'ejecutada' && !dentroVentanaEdicion(o) && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>En revisión (plazo de edición vencido)</span>
                          )}
                          {/* Admin */}
                          {esAdmin && o.estado === 'ejecutada' && <>
                            <button className="btn btn-xs btn-success" onClick={() => aprobar.mutate(o)} disabled={aprobar.isPending}><Ico as={Check} size={13} />Aprobar</button>
                            <button className="btn btn-xs btn-danger" onClick={() => pedir('Motivo del rechazo:', { title: 'Rechazar orden' }).then(motivo => { if (motivo !== null) rechazar.mutate({ o, motivo: motivo || '' }) })}><Ico as={X} size={13} />Rechazar</button>
                          </>}
                          {esAdmin && (o.estado === 'ejecutada' || o.estado === 'aprobada') && (
                            <button className="btn btn-xs btn-secondary" title="Devolver orden: elimina el registro, devuelve el stock terminado y vuelve a 'en proceso' para reeditarla" disabled={devolverOrden.isPending} onClick={() => confirmar(`¿Devolver la orden #${opNum(o.id)}?\n\nSe ELIMINA su registro de producción, se DEVUELVE el stock que sumó al producto terminado y vuelve a "en proceso" para reeditarla.`).then(ok => ok && devolverOrden.mutate(o))}><Ico as={Undo2} size={13} />Devolver</button>
                          )}
                          {/* Cierre por antigüedad: orden atascada (pendiente/en proceso) sin ejecutar hace tiempo */}
                          {esAdmin && (o.estado === 'pendiente' || o.estado === 'en_proceso') && diasAbierta(o) >= DIAS_CIERRE_SIN_EJECUTAR && (
                            <button className="btn btn-xs btn-danger" disabled={cerrarSinEjecutar.isPending} title={`Lleva ${diasAbierta(o)} días abierta sin ejecutarse`} onClick={() => confirmar(`¿Cerrar la orden #${opNum(o.id)} SIN EJECUTAR?\n\nLleva ${diasAbierta(o)} días abierta. Se libera la MP reservada (si aplica) y la orden queda marcada como "Cerrada sin ejecutar" (no se elimina).`).then(ok => ok && cerrarSinEjecutar.mutate(o))}><Ico as={X} size={13} />Cerrar sin ejecutar</button>
                          )}
                          {/* Reconciliación: orden EN PROCESO sin reserva de MP registrada (ej. quedó así por un bug ya corregido) */}
                          {esAdmin && o.estado === 'en_proceso' && o.origen === 'producto' && o.origen_id && !o.empaque_saldo && !(Array.isArray(o.lotes_reservados) && o.lotes_reservados.length) && (
                            <button className="btn btn-xs btn-secondary" title="Esta orden está en proceso pero no tiene la MP reservada — resérvala ahora" disabled={reservarMPManual.isPending} onClick={() => reservarMPManual.mutate(o)}><Ico as={Package} size={13} />Reservar MP</button>
                          )}
                          {esAdmin && o.estado !== 'ejecutada' && o.estado !== 'aprobada' && o.estado !== 'cancelada' && <button className="btn btn-xs btn-danger" title="Eliminar orden (solo admin)" onClick={() => confirmarEliminarOrden(o)}><Trash2 size={13} aria-hidden="true" />Eliminar</button>}
                          {(o.estado === 'aprobada' || (esAdmin && o.estado !== 'ejecutada')) && o.foto_url && <button className="btn btn-xs btn-secondary" title="Ver/registrar foto" onClick={() => openEjecutar(o)}><Camera size={13} aria-hidden="true" />Foto</button>}
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

      {/* Modal Nueva / Editar Orden (admin) */}
      <Modal open={modalNueva} onClose={() => { setModalNueva(false); setEditOrdenId(null) }} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{editOrdenId ? <Pencil size={18} aria-hidden="true" /> : <Factory size={18} aria-hidden="true" />}{editOrdenId ? 'Editar Orden de Producción' : 'Nueva Orden de Producción'}</span>} size="modal-lg"
        footer={<>
          <button className="btn btn-secondary" onClick={() => { setModalNueva(false); setEditOrdenId(null) }}>Cancelar</button>
          <button className="btn btn-primary" onClick={intentarCrearOrden} disabled={crearOrden.isPending || (empacarSaldo === true && saldoSelId && !!ordenEnProcesoDeSaldo(saldoSelId, editOrdenId))}>{editOrdenId ? 'Guardar cambios' : 'Crear y asignar'}</button>
        </>}
      >
        <div className="form-group">
          <label className="form-label">Receta / Producto</label>
          {(() => {
            // Buscador propio de la app (no el desplegable del navegador): permite escribir para
            // filtrar y distingue por color el tipo de lo que se va a producir.
            const activos = productos.filter(p => p.activo !== false)
            const opciones = [
              ...activos.filter(p => p.tipo !== 'mp' && p.tipo !== 'subproducto')
                .map(p => ({ value: `prod-${p.id}`, label: p.nombre, grupo: 'Productos terminados', color: 'var(--selva)', icono: '📦' })),
              ...activos.filter(p => p.tipo === 'subproducto' || p.tipo === 'mp')
                .map(p => ({ value: `prod-${p.id}`, label: p.nombre, grupo: 'Productos internos (se usan en otras recetas)', color: 'var(--tierra)', icono: '🧪',
                  sub: p.tipo === 'mp' ? 'Materia prima que fabricas' : 'Subproducto interno' })),
              ...recetas.map(r => ({ value: `recipe-${r.id}`, label: r.nombre, grupo: 'Recetas rápidas (pruebas)', color: 'var(--dorado)', icono: '💾' })),
            ]
            return (
              <>
                <BuscadorSelect
                  opciones={opciones}
                  value={form.origen_id ? `${form.origen === 'receta' ? 'recipe' : 'prod'}-${form.origen_id}` : ''}
                  onSelect={(v) => selectProducto(v)}
                  placeholder="Escribe para buscar el producto o la receta..."
                />
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: '0.72rem', color: 'var(--texto-suave)' }}>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--selva)', marginRight: 4 }} />Terminado</span>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--tierra)', marginRight: 4 }} />Interno</span>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--dorado)', marginRight: 4 }} />Receta rápida</span>
                </div>
              </>
            )
          })()}
        </div>
        {/* Empaque de saldo pendiente: si el producto elegido tiene saldos, se ofrece empacarlos */}
        {(() => {
          const saldosProd = form.origen === 'producto' && form.origen_id ? saldosDeProducto(form.producto, form.origen_id).filter(s => (s.peso || 0) > 0) : []
          if (!saldosProd.length) return null
          const ordenados = [...saldosProd].sort((a, b) => String(a.vencimiento || '9').localeCompare(String(b.vencimiento || '9')))
          const sel = ordenados.find(s => String(s.id) === String(saldoSelId)) || null
          const esSubp = (sel?.unidad || '').toLowerCase().includes('subp')
          const cant = parseFloat(saldoCant) || 0
          const pesoEquiv = esSubp && (prodReceta?.pesoSubp > 0) ? cant * prodReceta.pesoSubp : cant
          const unids = (prodReceta?.pesoUnidad > 0) ? Math.round(pesoEquiv / prodReceta.pesoUnidad) : 0
          return (
            <div className="form-group" style={{ background: 'rgba(200,169,74,0.12)', border: '1px solid rgba(200,169,74,0.45)', borderRadius: 'var(--radio)', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--tierra)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Recycle size={16} aria-hidden="true" /> Hay {ordenados.length} saldo(s) de mezcla anteriores por empacar</strong>
                <span>¿Deseas empacarlo?</span>
                <SiNo value={empacarSaldo} onChange={setEmpacarSaldo} />
              </div>
              {empacarSaldo === true && (
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>Saldo a empacar (ordenado por vencimiento)</label>
                    <Select className="form-control" value={saldoSelId} onChange={e => {
                      const id = e.target.value
                      setSaldoSelId(id); setSaldoCant('')
                      // Precargar SOLO el vencimiento del saldo (misma mezcla). El lote debe ser NUEVO para no confundir.
                      const sSel = ordenados.find(x => String(x.id) === String(id))
                      if (sSel && sSel.vencimiento) setForm(f => ({ ...f, vence: sSel.vencimiento }))
                    }}>
                      <option value="">Seleccionar saldo...</option>
                      {ordenados.map(s => { const enP = ordenEnProcesoDeSaldo(s.id); return <option key={s.id} value={s.id}>Lote {s.lote || '(s/n)'} · disp. {fCant(s.peso)} {s.unidad}{s.vencimiento ? ` · vence ${s.vencimiento}` : ''}{enP ? ` · ⏳ en orden #${opNum(enP.id)} (ciérrala primero)` : ''}</option> })}
                    </Select>
                    {/* Alerta naranja si el saldo elegido ya está en una orden abierta: se deshabilita "Crear y asignar" */}
                    {(() => { const enProc = saldoSelId ? ordenEnProcesoDeSaldo(saldoSelId) : null; return enProc ? (
                      <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(230,126,34,0.12)', border: '1px solid rgba(230,126,34,0.5)', color: '#c0620f', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={14} aria-hidden="true" /> Este saldo ya está reservado por la orden #{opNum(enProc.id)} ({enProc.estado === 'pendiente' ? 'pendiente, sin cerrar' : 'en proceso'}). Ciérrala y envíala primero para poder empacarlo aquí.
                      </div>
                    ) : null })()}
                  </div>
                  {sel && (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>Cantidad a empacar ({sel.unidad})</label>
                        <input type="number" className="form-control" style={{ maxWidth: 150 }} value={saldoCant} onChange={e => setSaldoCant(e.target.value)} min={0} max={sel.peso} />
                      </div>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setSaldoCant(String(sel.peso))}>Todo ({fCant(sel.peso)})</button>
                      <span style={{ paddingBottom: 8, fontSize: '0.9rem' }}>= <strong>{fNum(unids)}</strong> unidades a salir</span>
                      <button type="button" className="btn btn-sm btn-primary" disabled={!(cant > 0) || !(unids > 0)} onClick={() => setForm(f => ({ ...f, cantidad_plan: String(unids), baches_plan: '' }))}>Usar cantidad</button>
                    </div>
                  )}
                  <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>No consume MP (ya está producido). En el diligenciamiento se cargan los ingredientes de referencia y asignas el nuevo lote.</small>
                </div>
              )}
            </div>
          )
        })()}
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Cantidad planificada (unidades) *</label><input type="number" className="form-control" value={form.cantidad_plan} onChange={e => {
            const v = e.target.value
            setForm(f => ({ ...f, cantidad_plan: v, baches_plan: '' }))
            // Empaque de saldo: al escribir las UNIDADES, se calcula automáticamente cuánto del saldo corresponde.
            const sSel = saldosMezcla.find(x => String(x.id) === String(saldoSelId))
            if (empacarSaldo && sSel && (prodReceta?.pesoUnidad > 0) && (parseFloat(v) || 0) > 0) {
              const units = parseFloat(v) || 0
              const esSubp = (sSel.unidad || '').toLowerCase().includes('subp')
              const amount = esSubp && prodReceta.pesoSubp > 0
                ? Math.round(units * prodReceta.pesoUnidad / prodReceta.pesoSubp)
                : Math.round(units * prodReceta.pesoUnidad)
              setSaldoCant(String(Math.min(amount, sSel.peso)))
            }
          }} min={0} /></div>
          <div className="form-group"><label className="form-label">Unidad</label>
            <Select className="form-control" value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}>
              <option value="unidades">unidades</option><option value="cajas">cajas</option><option value="kilos">kilos</option><option value="bolsas">bolsas</option>
            </Select>
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
        {!empacarSaldo && prodReceta && prodReceta.ings.length > 0 && (
          <div className="form-group" style={{ background: 'rgba(124,179,66,0.06)', padding: 10, borderRadius: 'var(--radio)' }}>
            <label className="form-label">🧮 Planear por ingrediente disponible</label>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>Ingrediente</label>
                <Select className="form-control" style={{ maxWidth: 200 }} value={ingIdx} onChange={e => setIngIdx(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {prodReceta.ings.map((i, k) => <option key={k} value={k}>{i.nombre} ({fNum(i.cantidad)} g/bache)</option>)}
                </Select>
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
        <div className="alert alert-info" style={{ fontSize: '0.8rem' }}>El <strong>lote</strong> y la <strong>fecha de vencimiento</strong> se definen al <strong>diligenciar el proceso</strong> (el sistema <strong>sugiere</strong> el lote, pero no lo asigna: lo confirmas tú).</div>
        {/* Lotes de MP en stock: sugerencia PEPS (cuál gastar primero) + alertas de vencimiento */}
        {!empacarSaldo && form.origen === 'producto' && prodReceta && prodReceta.ings.some(i => i.mpId) && (
          <div className="form-group" style={{ background: 'rgba(124,179,66,0.06)', padding: 10, borderRadius: 'var(--radio)' }}>
            <label className="form-label"><Ico as={Package} size={14} />Lotes de MP en stock (orden PEPS sugerido)</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer', marginBottom: 8, color: 'var(--tierra)' }}>
              <input type="checkbox" checked={!!form.forzar_sin_lote} onChange={e => setForm(f => ({ ...f, forzar_sin_lote: e.target.checked }))} />
              ⚠ Forzar salida sin lote (no descontar de lotes específicos; solo del stock total)
            </label>
            {form.forzar_sin_lote
              ? <div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>El consumo se registrará como <strong>salida sin lote</strong>; los lotes no se modifican.</div>
              : prodReceta.ings.filter(i => i.mpId).map((ing, k) => {
              const lts = lotesDeMP(ing.mpId)
              const mpRow = mps.find(m => String(m.id) === String(ing.mpId))
              const mpUnidad = mpRow?.unidad || ''
              // Stock REAL de la MP (fuente de verdad en Inventario), independiente de si tiene lotes cargados.
              const stockReal = Number(mpRow?.stock) || 0
              // Cuánto se necesita para esta orden, en la unidad de la MP (la receta trae gramos/ml).
              const necesita = gramosAUnidadMP(Number(ing.gramos) || 0, mpUnidad)
              // Suma de los lotes disponibles y reservados (lo que la trazabilidad "conoce").
              const dispLotes = lts.reduce((s, l) => s + (Number(l.cantidad_actual) || 0), 0)
              const totalLotes = lts.reduce((s, l) => s + (Number(l.cantidad_actual) || 0) + (Number(l.cantidad_reservada) || 0), 0)
              // Descuadre: la suma de lotes no puede superar el stock real de la MP. Si pasa, es que
              // los lotes y el stock quedaron desincronizados (una entrada directa, un ajuste manual…)
              // y hay que revisar el inventario antes de producir.
              const descuadre = totalLotes - stockReal > 0.001
              // Falta de stock real para cubrir el consumo (aunque haya lotes que digan lo contrario).
              const faltaStock = necesita > stockReal + 0.001
              const elegido = form.lotes_elegidos?.[ing.mpId] || form.lotes_elegidos?.[String(ing.mpId)] || ''
              const descLote = (l) => {
                const est = estadoLote(l.vencimiento)
                const etq = est === 'vencido' ? ' ⛔ Vencido' : est === 'por_vencer' ? ' ⚠ Por vencer' : ''
                // Disponible EXACTO: cantidad_actual YA excluye lo reservado (al reservar se mueve a cantidad_reservada).
                const disp = Number(l.cantidad_actual) || 0
                return `Lote ${l.lote || '(s/n)'} · ${fMP(disp, mpUnidad)} disp. · Vence ${fmtVence(l.vencimiento)}${etq}`
              }
              return (
                <div key={k} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--selva)', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span>{ing.nombre}</span>
                    {necesita > 0 && (
                      <span style={{ fontWeight: 400, color: faltaStock ? 'var(--rojo)' : 'var(--texto-suave)', fontSize: '0.76rem' }}>
                        necesita {fMP(necesita, mpUnidad)} · stock real {fMP(stockReal, mpUnidad)}
                      </span>
                    )}
                  </div>
                  {/* Alertas de coherencia entre lotes y stock real */}
                  {faltaStock && (
                    <div style={{ fontSize: '0.76rem', color: 'var(--rojo)', marginTop: 2 }}>
                      ⚠ Stock insuficiente: faltan <strong>{fMP(necesita - stockReal, mpUnidad)}</strong> de {ing.nombre}.
                    </div>
                  )}
                  {descuadre && (
                    <div style={{ fontSize: '0.76rem', color: 'var(--tierra)', marginTop: 2 }}>
                      ⚠ Los lotes suman <strong>{fMP(totalLotes, mpUnidad)}</strong> pero el stock real es {fMP(stockReal, mpUnidad)}: revisa el inventario, están descuadrados.
                    </div>
                  )}
                  {lts.length === 0
                    ? (stockReal > 0
                        // Hay stock real, pero sin lotes PEPS cargados (se entró directo en la MP, no por "Entrada").
                        // No es un error de falta de stock: se consumirá del stock general, sin trazabilidad por lote.
                        ? <div style={{ fontSize: '0.78rem', color: 'var(--tierra)' }}>ℹ Sin lotes registrados — hay <strong>{fMP(stockReal, mpUnidad)}</strong> en stock general (sin trazabilidad por lote); se descontará del stock total.</div>
                        : <div style={{ fontSize: '0.78rem', color: 'var(--rojo)' }}>⚠ Sin stock disponible</div>)
                    : lts.length === 1
                      ? (() => {
                          const l = lts[0], est = estadoLote(l.vencimiento)
                          const c = est === 'vencido' ? 'var(--rojo)' : est === 'por_vencer' ? 'var(--tierra)' : 'var(--texto-suave)'
                          return <div style={{ fontSize: '0.78rem', color: c, padding: '2px 0' }}>👉 {descLote(l)}</div>
                        })()
                      : <Select className="form-control" style={{ fontSize: '0.8rem', marginTop: 2 }}
                          value={elegido}
                          onChange={e => setForm(f => ({ ...f, lotes_elegidos: { ...f.lotes_elegidos, [ing.mpId]: e.target.value } }))}>
                          <option value="">👉 Automático (PEPS sugerido): {descLote(lts[0])}</option>
                          {lts.map(l => <option key={l.id} value={l.id}>{descLote(l)}</option>)}
                        </Select>
                  }
                </div>
              )
            })}
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>👉 = lote sugerido a consumir primero (más próximo a vencer / más antiguo). Si hay 2+ lotes vigentes puedes elegir cuál usar; «Automático (PEPS)» reserva el sugerido. Al iniciar la orden se reserva el lote elegido (y PEPS para el resto si falta).</small>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Operario asignado</label>
          <Select className="form-control" value={form.operario} onChange={e => setForm(f => ({ ...f, operario: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {(esAdmin || esOperario) && profile?.nombre && <option value={profile.nombre}>🧑‍💼 {profile.nombre} (yo — asignármela / ejecutar yo mismo)</option>}
            {empleados.filter(e => e.nombre !== profile?.nombre).map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
          </Select>
        </div>
        {form.origen === 'receta' && (
          <div className="alert" style={{ fontWeight: 600, color: 'var(--selva)', background: 'rgba(124,179,66,0.10)', border: '1px solid var(--lima)', padding: 10, borderRadius: 'var(--radio)', marginBottom: 10, fontSize: '0.85rem' }}>
            <FlaskConical size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} /> Esta orden es de <strong>PRUEBA</strong> por provenir de una receta rápida.
          </div>
        )}
        {/* El tipo (MP interna vs producto base) se determina automáticamente por el producto elegido; ya no hay check manual */}
        {form.es_mp && (
          <div className="form-group" style={{ background: 'rgba(124,179,66,0.10)', padding: 12, borderRadius: 'var(--radio)', fontSize: '0.85rem', color: 'var(--selva)' }}>
            <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><FlaskConical size={14} aria-hidden="true" /> Materia prima vendible</strong> — al producirla suma al <strong>stock de Inventario MP</strong> ({mps.find(m => String(m.id) === String(form.mp_id))?.nombre || 'MP vinculada'}); el lote se asigna por <strong>fecha (ddmmaa)</strong> al diligenciar.
            {!form.mp_id && <div style={{ color: 'var(--rojo)', marginTop: 4 }}>⚠ Esta ficha MP no está vinculada a una materia prima; vincúlala en la ficha.</div>}
          </div>
        )}
        {/* Subproducto interno (ficha tipo subproducto): solo pide a qué MP alimenta, sin check manual */}
        {!form.es_mp && form.es_subproducto && (
          <div className="form-group" style={{ background: 'rgba(200,169,74,0.08)', padding: 12, borderRadius: 'var(--radio)' }}>
            <label className="form-label">Subproducto interno — materia prima que alimenta</label>
            <Select className="form-control" value={form.mp_id} onChange={e => setForm(f => ({ ...f, mp_id: e.target.value }))}>
              <option value="">Seleccionar MP...</option>
              {mps.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </Select>
          </div>
        )}
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
                <Select className="form-control" value={ejec.empaque} onChange={e => setEjec(s => ({ ...s, empaque: e.target.value }))} disabled={soloLectura}>
                  <option>UNIDADES</option><option>CAJAS</option><option>BOLSAS</option><option>KILOS</option>
                </Select>
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

      {/* Modal Iniciar proceso — fecha de inicio + tiempos por subproceso (autoguardado) */}
      <Modal open={modalProceso} onClose={() => setModalProceso(false)} guard={false}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' }}><Play size={18} aria-hidden="true" /> Proceso — {ordenPrep?.producto || ''}
          {puedeCompartirArchivos && (
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Compartir orden (PDF)" onClick={() => compartirOrden()}><Share2 size={16} aria-hidden="true" /> Compartir</button>
          )}
          <button type="button" className="btn btn-dorado btn-sm" style={{ marginLeft: puedeCompartirArchivos ? 0 : 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Imprimir orden" onClick={() => imprimirOrden()}><Printer size={16} aria-hidden="true" /> Imprimir</button></span>}
        size="modal-lg"
        footer={<>
          <button className="btn btn-secondary" onClick={async () => { await guardarProcesoData(false); setModalProceso(false) }}><Ico as={Save} size={14} />Guardar</button>
          <button className="btn btn-secondary" onClick={() => imprimirOrden('pdf')}><Ico as={Download} size={14} />Descargar PDF</button>
          <button className="btn btn-success" onClick={abrirConfirmEnvio}><Ico as={Send} size={14} />Enviar</button>
        </>}>
        {ordenPrep && (
          <>
            {/* Campos adicionales (MP vendibles): acordeón arriba, oculto por defecto. Salen en la impresión. */}
            {prepEsMpVend && (
              <details className="acordeon-item" open={prepCamposOpen} onToggle={e => setPrepCamposOpen(e.target.open)} style={{ marginBottom: 12, borderLeft: '4px solid var(--dorado)' }}>
                <summary>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <FlaskConical size={16} aria-hidden="true" /> Campos adicionales {prepCamposExtra.filter(c => (c.nombre || '').trim()).length > 0 ? `(${prepCamposExtra.filter(c => (c.nombre || '').trim()).length})` : ''}
                    <small style={{ fontWeight: 400, color: 'var(--texto-suave)' }}>— Productor, Finca, Variedad… (salen en la impresión)</small>
                  </span>
                </summary>
                <div style={{ padding: '10px 4px' }}>
                  {prepCamposExtra.length === 0
                    ? <small style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>Agrega datos propios de esta MP vendible (ej. "Productor": Juan Pérez).</small>
                    : prepCamposExtra.map((c, i) => (
                      <div key={c._id || i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 6, marginBottom: 6 }}>
                        <input className="form-control" value={c.nombre || ''} onChange={e => setPrepCamposExtra(arr => arr.map((x, idx) => idx === i ? { ...x, nombre: e.target.value } : x))} placeholder="Campo (ej. Productor)" />
                        <input className="form-control" value={c.valor || ''} onChange={e => setPrepCamposExtra(arr => arr.map((x, idx) => idx === i ? { ...x, valor: e.target.value } : x))} placeholder="Valor (ej. Finca La Esperanza)" />
                        <button type="button" className="btn btn-xs btn-danger" onClick={() => setPrepCamposExtra(arr => arr.filter((_, idx) => idx !== i))}>✕</button>
                      </div>
                    ))}
                  <button type="button" className="btn btn-xs btn-secondary" style={{ marginTop: 4 }} onClick={() => setPrepCamposExtra(a => [...a, { _id: Date.now() + Math.random(), nombre: '', valor: '' }])}><Ico as={Plus} size={13} /> Agregar campo</button>
                </div>
              </details>
            )}
            {/* Documentos de la ficha: instrucciones de elaboración + etiquetas/rótulos.
                El operario los abre o imprime aquí mismo, sin salir de la orden ni buscarlos. */}
            {(() => {
              const docs = [
                ...(prepFicha?.url ? [{ bucket: 'technical-sheets', path: prepFicha.url, nombre: prepFicha.nombre || 'Ficha técnica', esFicha: true }] : []),
                ...prepImprimibles.map(i => ({ bucket: 'ficha-imprimibles', path: i.path, nombre: i.nombre })),
              ]
              if (!docs.length) return null
              return (
                <details className="acordeon-item" style={{ marginBottom: 12, borderLeft: '4px solid var(--dorado)' }} open>
                  <summary>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Printer size={16} aria-hidden="true" /> Documentos e imprimibles
                      <span className="badge badge-dorado">{docs.length}</span>
                    </span>
                  </summary>
                  <div className="acordeon-body">
                    <div style={{ fontSize: '0.8rem', color: 'var(--texto-suave)', marginBottom: 8 }}>
                      Instrucciones de elaboración y etiquetas de este producto. {puedeCompartirArchivos
                        ? 'Toca “Compartir” para enviarlo a la impresora o a otra app del dispositivo.'
                        : 'Se abre en una pestaña nueva; imprime desde el visor (Ctrl+P).'}
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {docs.map((d, i) => {
                        const cargando = impBusy === d.path
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: d.esFicha ? 'rgba(124,179,66,0.10)' : 'var(--crema)', borderRadius: 'var(--radio)', flexWrap: 'wrap' }}>
                            {d.esFicha ? <ScrollText size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
                            <span style={{ flex: 1, minWidth: 120, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {d.nombre}
                              {d.esFicha && <small style={{ color: 'var(--texto-suave)', marginLeft: 6 }}>· cómo se elabora</small>}
                            </span>
                            {puedeCompartirArchivos && (
                              <button type="button" className="btn btn-sm btn-dorado" disabled={cargando} onClick={() => compartirInsumo(d)}>
                                {cargando ? 'Abriendo…' : '📤 Compartir / Imprimir'}
                              </button>
                            )}
                            <button type="button" className="btn btn-sm btn-secondary" disabled={cargando} onClick={() => imprimirInsumo(d)}>
                              <Ico as={Printer} size={14} />{cargando ? 'Abriendo…' : 'Abrir'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </details>
              )
            })()}

            {/* Alistar ingredientes: acordeón con checklist LOCAL (no se guarda; solo ayuda al operario).
                No aplica a MP vendibles (no llevan receta de ingredientes que alistar). */}
            {!prepEsMpVend && (
            <details className="acordeon-item" style={{ marginBottom: 12, borderLeft: '4px solid var(--lima)' }}>
              <summary>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <FlaskConical size={16} aria-hidden="true" /> Alistar ingredientes
                  {prepIngs.length > 0 && <span className="badge badge-dorado">{Object.values(alistado).filter(Boolean).length}/{prepIngs.length}</span>}
                </span>
              </summary>
              <div className="acordeon-body">
                {prepIngs.length === 0
                  ? <p className="empty-table" style={{ margin: 0 }}>Sin receta vinculada a esta orden (o aún cargando).</p>
                  : (() => {
                      const totalG = prepIngs.reduce((s, i) => s + (i.gramos || 0), 0)
                      // La MP guarda stock en SU unidad (Kg, Gramo, Litro…), pero la receta pide
                      // gramos/ml: se convierte antes de comparar, si no un "2 Kg" parecería
                      // insuficiente frente a "1500 g".
                      const aUnidadMP = (gramos, unidad) => {
                        const u = String(unidad || '').trim().toLowerCase()
                        return (u === 'kg' || u.startsWith('kilo') || u === 'litro' || u.startsWith('lit')) ? gramos / 1000 : gramos
                      }
                      return (
                        <div className="table-wrap">
                          <table>
                            <thead><tr><th style={{ width: 40 }}>✓</th><th>Ingrediente</th><th className="td-number">Cantidad a usar</th><th className="td-number">Queda en stock</th><th>Lote MP</th></tr></thead>
                            <tbody>
                              {prepIngs.map((i, k) => {
                                const ok = !!alistado[k]
                                const loteMp = loteDeTraza(prepTraza, i)
                                const mp = i.mpId ? mps.find(m => String(m.id) === String(i.mpId)) : null
                                // El stock que muestra la app YA tiene descontada la reserva de esta
                                // orden (se reserva al iniciar producción), así que es lo que queda
                                // realmente disponible para otras órdenes.
                                const queda = mp ? (Number(mp.stock) || 0) : null
                                const usa = mp ? aUnidadMP(i.gramos || 0, mp.unidad) : 0
                                const negativo = queda != null && queda < 0
                                const justo = queda != null && !negativo && queda < usa
                                return (
                                  <tr key={k} style={{ background: ok ? 'rgba(124,179,66,0.16)' : 'transparent', transition: 'background 0.2s ease' }}>
                                    <td data-label="✓" style={{ textAlign: 'center' }}>
                                      <input type="checkbox" checked={ok} onChange={e => toggleAlistado(k, e.target.checked)}
                                        aria-label={`Alistado: ${i.nombre}`} style={{ width: 20, height: 20, cursor: 'pointer', accentColor: 'var(--selva)' }} />
                                    </td>
                                    <td style={{ fontWeight: ok ? 600 : 400, color: ok ? 'var(--selva)' : 'inherit' }}>{i.nombre}</td>
                                    <td className="td-number">
                                      {editIngs ? (() => {
                                        const previsto = Number(prepIngsBase[k]?.gramos) || 0
                                        const delta = (Number(i.gramos) || 0) - previsto
                                        return (
                                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                            <input type="number" className="form-control" style={{ width: 110, textAlign: 'right', padding: '3px 6px' }}
                                              value={i.gramos} min={0} step="any"
                                              onChange={e => setPrepIngs(arr => arr.map((x, j) => j === k ? { ...x, gramos: parseFloat(e.target.value) || 0 } : x))} />
                                            {Math.abs(delta) >= 0.01 && (
                                              <small style={{ color: delta > 0 ? 'var(--rojo)' : 'var(--selva)', fontSize: '0.7rem' }}>
                                                {delta > 0 ? '+' : ''}{fCant(delta)} g vs receta ({fCant(previsto)} g)
                                              </small>
                                            )}
                                          </div>
                                        )
                                      })() : <>{fCant(i.gramos)} g</>}
                                    </td>
                                    <td className="td-number" style={{ color: negativo ? 'var(--rojo)' : justo ? 'var(--tierra)' : 'var(--texto-suave)', fontSize: '0.84rem' }}>
                                      {queda == null
                                        ? <span title="Este ingrediente no está enlazado a una materia prima del inventario">—</span>
                                        : <>{fMP(queda, mp.unidad)}{negativo && ' ⚠'}</>}
                                    </td>
                                    <td style={{ fontSize: '0.82rem', color: loteMp ? 'var(--selva)' : 'var(--texto-suave)' }}>{loteMp || '—'}</td>
                                  </tr>
                                )
                              })}
                              <tr style={{ fontWeight: 700, background: 'rgba(124,179,66,0.08)' }}><td></td><td>TOTAL</td><td className="td-number">{fCant(totalG)} g</td><td></td><td></td></tr>
                            </tbody>
                          </table>
                          <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
                            Marca cada ingrediente a medida que lo pesas (ayuda visual, no se guarda).
                            <strong> "Queda en stock"</strong> es lo que resta en inventario <em>después</em> de apartar lo de esta orden;
                            en rojo significa que el inventario quedó en negativo y hay que revisarlo.
                          </small>

                          {/* Corrección de cantidades en planta: se gastó de más o sobró */}
                          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--crema-oscuro)' }}>
                            {!editIngs ? (
                              <button type="button" className="btn btn-xs btn-secondary" onClick={habilitarEdicionIngs}>
                                <Ico as={Pencil} size={13} />Corregir cantidades realmente usadas
                              </button>
                            ) : (() => {
                              const ajustes = calcAjustes()
                              return (
                                <div>
                                  <div className="alert alert-warning" style={{ fontSize: '0.8rem' }}>
                                    ⚠ Estás cambiando la receta <strong>solo para este lote</strong>. Al enviar la orden, la diferencia
                                    se descontará o se devolverá al inventario de materia prima. La ficha del producto no cambia.
                                  </div>
                                  {ajustes.length > 0 && (
                                    <div style={{ fontSize: '0.8rem', marginBottom: 8 }}>
                                      <strong>Cambios pendientes:</strong>
                                      <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                                        {ajustes.map((a, n) => (
                                          <li key={n} style={{ color: a.delta > 0 ? 'var(--rojo)' : 'var(--selva)' }}>
                                            {a.nombre}: {a.delta > 0 ? 'se gastan' : 'sobran'} <strong>{fCant(Math.abs(a.delta))} g</strong>
                                            {a.delta > 0 ? ' de más → se descuentan del stock' : ' → se devuelven al stock'}
                                            {a.mp_id == null && <em style={{ color: 'var(--tierra)' }}> (sin MP enlazada: no ajusta stock)</em>}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    <button type="button" className="btn btn-xs btn-primary" disabled={!ajustes.length} onClick={confirmarAjustesIngs}>
                                      <Ico as={Check} size={13} />Aplicar {ajustes.length > 0 ? `(${ajustes.length})` : ''}
                                    </button>
                                    <button type="button" className="btn btn-xs btn-secondary" onClick={cancelarEdicionIngs}>Cancelar y volver a la receta</button>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      )
                    })()}
              </div>
            </details>
            )}

            <div className="form-grid-2" style={{ background: 'rgba(124,179,66,0.06)', padding: 10, borderRadius: 'var(--radio)', marginBottom: 12 }}>
              <div className="form-group" style={{ margin: 0 }}><label className="form-label">Fecha de inicio de fabricación *</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="date" className="form-control" value={prepFechaInicio} onChange={e => setPrepFechaInicio(e.target.value)} />
                  <button type="button" className="btn btn-xs btn-secondary" disabled={!!prepFechaInicio} onClick={() => setPrepFechaInicio(hoyISO())}>Hoy</button>
                </div>
              </div>
              {(() => { const loteSug = ordenPrep?.es_subproducto ? loteFechaHoy : siguienteLoteSugerido; return (
              <div className="form-group" style={{ margin: 0 }}><label className="form-label">Lote *</label><input className="form-control" value={prepLote} onChange={e => setPrepLote(e.target.value)} placeholder={`Sugerido: ${loteSug}`} />
                {/* La sugerencia SOLO aparece si el lote está vacío. Si ya se puso un lote, no se sugiere
                    (evita confusión cuando hay varias órdenes en proceso). */}
                <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 3 }}>
                  {prepLote.trim() === ''
                    ? <button type="button" className="btn btn-xs btn-secondary" onClick={() => setPrepLote(loteSug)}>Usar sugerido: {loteSug}</button>
                    : <span style={{ color: 'var(--selva)' }}>✓ Lote: {prepLote.trim()}</span>}
                </small>
              </div>
              )})()}
              <div className="form-group" style={{ margin: 0 }}><label className="form-label">Fecha de vencimiento *</label><input type="date" className="form-control" value={prepVence} onChange={e => setPrepVence(e.target.value)} disabled={!prepFechaInicio} />
                {prepVidaUtil?.valor && <small style={{ display: 'block', color: 'var(--selva)', fontSize: '0.72rem', marginTop: 2 }}>ℹ Según su ficha, este producto tiene {prepVidaUtil.valor} {prepVidaUtil.unidad === 'dias' ? 'día(s)' : 'mes(es)'} de vida útil.</small>}
                {prepFechaInicio ? <QuickVence opts={venceOpts} onEdit={editarVenceOpts} onPick={setPrepVence} base={prepFechaInicio} disabled={!!prepVence} /> : <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Llena primero la fecha de fabricación.</small>}
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.02)', padding: 10, borderRadius: 'var(--radio)', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem' }}><Ico as={Clock} size={15} />Tiempos</strong>
                {/* Toggle modo básico / avanzado */}
                <div style={{ display: 'flex', border: '1px solid var(--crema-oscuro)', borderRadius: 6, overflow: 'hidden', marginLeft: 4 }}>
                  {[['basico', 'Básico'], ['avanzado', 'Avanzado']].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setPrepModoAvanzado(k === 'avanzado')} style={{ padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: (prepModoAvanzado === (k === 'avanzado')) ? 'var(--selva)' : 'transparent', color: (prepModoAvanzado === (k === 'avanzado')) ? 'var(--crema)' : 'var(--texto-suave)' }}>{l}</button>
                  ))}
                </div>
                <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                  <input type="checkbox" checked={autoguardar} onChange={e => setAutoguardar(e.target.checked)} /> Autoguardar
                </label>
                {autoSavedAt && autoguardar && <span style={{ fontSize: '0.7rem', color: 'var(--selva)' }}>✓ guardado {autoSavedAt}</span>}
                {prepModoAvanzado && <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setPrepProcesos(p => [...p, { nombre: '', inicio: '', fin: '' }])}>+ Proceso</button>}
              </div>
              {/* MODO BÁSICO: solo hora inicio y hora fin */}
              {!prepModoAvanzado && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div><label style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>Hora inicio</label><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><TimeField value={prepHoraInicio} onChange={setPrepHoraInicio} /><button type="button" className="btn btn-xs btn-secondary" title="Ahora" disabled={!!prepHoraInicio} onClick={() => setPrepHoraInicio(horaAhora())}><Clock size={13} aria-hidden="true" /></button></div></div>
                  <div><label style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>Hora fin</label><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><TimeField value={prepHoraFin} onChange={setPrepHoraFin} /><button type="button" className="btn btn-xs btn-secondary" title="Ahora" disabled={!!prepHoraFin} onClick={() => setPrepHoraFin(horaAhora())}><Clock size={13} aria-hidden="true" /></button></div></div>
                </div>
              )}
              {/* MODO AVANZADO: todos los procesos con fecha, hora inicio y fin */}
              {prepModoAvanzado && prepProcesos.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--texto-suave)' }}>Sin procesos definidos en la ficha. Usa "+ Proceso" para agregar.</p>}
              {prepModoAvanzado && prepProcesos.map((p, i) => {
                const upd = (k, v) => setPrepProcesos(arr => arr.map((x, idx) => idx === i ? { ...x, [k]: v } : x))
                return (
                  <div key={i} className={ordProc.rowClassName(i)} {...ordProc.rowProps(i)} style={{ display: 'grid', gridTemplateColumns: 'auto 1.3fr 1.2fr 1.1fr 1.1fr auto', gap: 8, alignItems: 'end', marginBottom: 8, borderBottom: '1px dashed var(--crema-oscuro)', paddingBottom: 8 }}>
                    <span {...ordProc.handleProps(i)} style={{ ...ordProc.handleProps(i).style, alignSelf: 'center', paddingBottom: 0 }}>⠿</span>
                    <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Proceso/subproceso</label><input className="form-control" value={p.nombre} onChange={e => upd('nombre', e.target.value)} placeholder="Ej: Mezclado, Horneo..." /></div>
                    <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Fecha</label><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="date" className="form-control" value={p.fecha || ''} onChange={e => upd('fecha', e.target.value)} /><button type="button" className="btn btn-xs btn-secondary" title="Hoy" disabled={!!p.fecha} onClick={() => upd('fecha', hoyISO())}>Hoy</button></div></div>
                    <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Inicio</label><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><TimeField value={p.inicio} onChange={v => upd('inicio', v)} /><button type="button" className="btn btn-xs btn-secondary" title="Ahora" disabled={!!p.inicio} onClick={() => upd('inicio', horaAhora())}><Clock size={13} aria-hidden="true" /></button></div></div>
                    <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Fin</label><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><TimeField value={p.fin} onChange={v => upd('fin', v)} /><button type="button" className="btn btn-xs btn-secondary" title="Ahora" disabled={!!p.fin} onClick={() => upd('fin', horaAhora())}><Clock size={13} aria-hidden="true" /></button></div></div>
                    <button type="button" className="btn btn-xs btn-danger" onClick={() => setPrepProcesos(arr => arr.filter((_, idx) => idx !== i))}>✕</button>
                  </div>
                )
              })}
              <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Usa ⏱ para fijar la hora actual. {prepModoAvanzado ? 'Avanzado: registra fecha y horas de cada proceso.' : 'Básico: solo hora de inicio y fin.'} Se guarda automáticamente.</small>
            </div>

            {/* Resultado de producción */}
            <div style={{ background: 'rgba(200,169,74,0.08)', padding: 10, borderRadius: 'var(--radio)' }}>
              <strong style={{ fontSize: '0.9rem' }}><Ico as={Package} size={15} />Resultado de producción</strong>
              <div className="form-grid-2" style={{ marginTop: 8 }}>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">{esUnidadPeso(prepMpUnidad) ? `${prepMpUnidad} obtenidos *` : 'Unidades obtenidas *'}{ordenPrep.empaque_saldo ? ' (del saldo empacado)' : ''}</label><input type="number" className="form-control" value={prepUnidades} onChange={e => {
                  const v = e.target.value; setPrepUnidades(v)
                  // Conversión inversa: al escribir las unidades (cajas) se calculan las
                  // subporciones que caben en ellas. Antes solo funcionaba de subporciones a
                  // unidades, así que quien contaba cajas tenía que hacer la cuenta a mano.
                  if (prepPorciona) {
                    const pu = parseFloat(prepInfo?.pesoUnidad) || 0, psub = parseFloat(prepPesoSubp) || 0
                    if (pu > 0 && psub > 0 && v !== '') setPrepCantSubp(String(Math.round((parseFloat(v) || 0) * pu / psub)))
                  }
                }} min={0} step="0.01" placeholder={`Planificado: ${fNum(ordenPrep.cantidad_plan)}`} readOnly={ordenPrep.empaque_saldo} style={ordenPrep.empaque_saldo ? { background: 'var(--crema)' } : undefined} /></div>
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
                  <div style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: 'var(--texto-suave)', marginTop: -4 }}>
                    ℹ Escribe <strong>unidades</strong> o <strong>subporciones</strong>: al llenar una, la otra se calcula sola
                    ({psubUnidHint(prepInfo?.pesoUnidad, prepPesoSubp)}).
                  </div>
                </>}
                {esUnidadPeso(prepMpUnidad) && (
                  <div style={{ gridColumn: '1 / -1', fontSize: '0.75rem', color: 'var(--texto-suave)', marginTop: -2 }}>
                    ℹ Esta es una <strong>materia prima interna</strong> que se mide en <strong>{prepMpUnidad}</strong>: escribe arriba
                    los <strong>{prepMpUnidad} producidos</strong> (no unidades). Ese peso es el que ingresa al inventario de MP.
                    {(parseFloat(prepPesoFinal) || 0) > 0 && (() => {
                      // El peso final se registra en gramos; si la MP está en Kg/Litro se convierte a esa unidad.
                      const enKilos = /kg|kilo|litro|^l$|lb|libra/i.test(prepMpUnidad)
                      const val = enKilos ? (parseFloat(prepPesoFinal) || 0) / 1000 : (parseFloat(prepPesoFinal) || 0)
                      const val2 = Math.round(val * 1000) / 1000
                      const val2Txt = val2.toLocaleString('es-CO', { maximumFractionDigits: 3 })
                      return <> <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft: 6 }}
                        onClick={() => setPrepUnidades(String(val2))}>Usar peso final ({val2Txt} {prepMpUnidad})</button></>
                    })()}
                  </div>
                )}
              </div>
              {/* Empaque que se descontará (bolsas/cajas) según lo empacado — informativo, sale en la impresión */}
              {empaquePrevio && empaquePrevio.plan.length > 0 && (
                <div className="form-group" style={{ background: 'rgba(124,179,66,0.07)', borderRadius: 'var(--radio)', padding: 10 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Ico as={Package} size={14} /> Empaque utilizado <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(calculado según lo empacado — se descuenta al enviar)</small></label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {empaquePrevio.plan.filter(p => (p.qty || 0) > 0).map((p, i) => (
                      <span key={i} className={`badge ${p.tipo === 'bolsa' ? 'badge-azul' : p.tipo === 'caja' ? 'badge-dorado' : 'badge-gris'}`}>{fNum(p.qty)} × {p.mp?.nombre || p.tipo}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">Observaciones</label><textarea className="form-control" rows={2} value={prepObs} onChange={e => setPrepObs(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: '1.05rem', color: 'var(--selva)' }}>¿Producción conforme? *</strong>
                  <SiNo value={prepConforme} onChange={val => {
                    setPrepConforme(val)
                    // Si NO es conforme, se asume que no hay producto bueno: unidades y subporciones a 0
                    if (val === false) { setPrepUnidades('0'); setPrepCantSubp('0') }
                  }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Shuffle size={14} aria-hidden="true" /> ¿Empacó surtido? *</span>
                  <SiNo value={prepSurtido} onChange={setPrepSurtido} />
                </div>
              </div>
              {prepSurtido && (
                <div className="form-group" style={{ background: 'rgba(200,169,74,0.10)', borderRadius: 'var(--radio)', padding: 10 }}>
                  <label className="form-label">¿Con qué lote(s) se mezcló? <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(agrega uno o varios)</small></label>
                  {(() => {
                    const tokens = String(prepLoteMezcla).split(/[,;]/).map(s => s.trim()).filter(Boolean)
                    const aplicarAuto = (next) => { setPrepLoteMezcla(next); const auto = autoSurtido(ordenPrep.producto, next); if (auto) setPrepProductoSurtido(auto) }
                    const addLote = (l) => { const v = String(l || '').trim(); if (!v || tokens.includes(v)) { setNuevoLoteMezcla(''); return } aplicarAuto([...tokens, v].join(', ')); setNuevoLoteMezcla('') }
                    const removeLote = (l) => aplicarAuto(tokens.filter(t => t !== l).join(', '))
                    return <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                        {tokens.map(t => (
                          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--selva)', color: 'var(--crema)', borderRadius: 14, padding: '2px 6px 2px 10px', fontSize: '0.78rem', fontWeight: 600 }}>
                            {t}{productoDeLoteMap[t] ? ` · ${productoDeLoteMap[t]}` : ''}<button type="button" onClick={() => removeLote(t)} style={{ border: 'none', background: 'transparent', color: 'var(--crema)', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1 }} title="Quitar">✕</button>
                          </span>
                        ))}
                        {tokens.length === 0 && <span style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>Aún no agregaste lotes.</span>}
                      </div>
                      {(() => {
                        const sug = lotesSurtidoDe(ordenPrep.producto, prepLote).filter(x => !tokens.includes(x.lote))
                        return <>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input className="form-control" list="dl-lotes-mezcla" value={nuevoLoteMezcla} onChange={e => setNuevoLoteMezcla(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLote(nuevoLoteMezcla) } }}
                              placeholder={`Lote de ${tipoProducto(ordenPrep.producto) || 'producto'} con saldo pendiente`} />
                            <datalist id="dl-lotes-mezcla">{sug.map(x => <option key={x.lote} value={x.lote}>{x.lote} — {x.prod} (disp. {fCant(x.peso)} {x.unidad})</option>)}</datalist>
                            <button type="button" className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => addLote(nuevoLoteMezcla)}>+ Agregar</button>
                          </div>
                          {sug.length > 0
                            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                {sug.map(x => <button type="button" key={x.lote} className="btn btn-xs btn-secondary" title={`Agregar lote ${x.lote} (disp. ${fCant(x.peso)} ${x.unidad})`} onClick={() => addLote(x.lote)}>{x.lote} · {x.prod} <span style={{ opacity: 0.8 }}>({fCant(x.peso)} {x.unidad})</span></button>)}
                              </div>
                            : <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>No hay lotes de {tipoProducto(ordenPrep.producto) || 'este producto'} con saldo pendiente por empacar.</small>}
                        </>
                      })()}
                    </>
                  })()}
                  <label className="form-label" style={{ marginTop: 8 }}>Producto surtido resultante <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(elige del catálogo de Producto Terminado; se sugiere según el lote)</small></label>
                  <Select className="form-control" value={prepProductoSurtido} onChange={e => setPrepProductoSurtido(e.target.value)}>
                    <option value="">Seleccionar producto terminado...</option>
                    {terminados.map(t => <option key={t.id} value={t.nombre}>{t.tipo === 'surtido' ? '🔀 ' : ''}{t.nombre}</option>)}
                    {prepProductoSurtido && !terminados.some(t => t.nombre === prepProductoSurtido) && <option value={prepProductoSurtido}>⚠ {prepProductoSurtido} (sin registrar)</option>}
                  </Select>
                  {prepProductoSurtido && !terminados.some(t => t.nombre === prepProductoSurtido) && (
                    <small style={{ color: 'var(--rojo)', fontSize: '0.72rem' }}>⚠ "{prepProductoSurtido}" no existe en el catálogo. Créalo en <strong>Producto Terminado</strong> para no afectar el stock.</small>
                  )}
                  {(() => {
                    const toks = String(prepLoteMezcla).split(/[,;]/).map(s => s.trim()).filter(Boolean)
                    const selSaldos = saldosMezcla.filter(s => (dispSaldo(s, ordenPrep?.id) > 0) && toks.includes(String(s.lote || '').trim()))
                    const maxSurt = selSaldos.length ? Math.min(...selSaldos.map(s => dispSaldo(s, ordenPrep?.id))) : undefined
                    const excede = maxSurt !== undefined && (parseFloat(prepSurtidoCantidad) || 0) > maxSurt
                    return <>
                      <label className="form-label" style={{ marginTop: 8 }}>Cantidad empacada surtida (unidades/cajas) *
                        {maxSurt !== undefined && <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}> — disponible por empacar: {fCant(maxSurt)} {selSaldos[0]?.unidad || ''}</small>}
                      </label>
                      <input type="number" className="form-control" style={excede ? { borderColor: 'var(--rojo)' } : undefined} value={prepSurtidoCantidad} onChange={e => setPrepSurtidoCantidad(e.target.value)} min={0} max={maxSurt} placeholder="Unidades o cajas empacadas surtidas" />
                      {excede && <small style={{ color: 'var(--rojo)', fontSize: '0.72rem' }}>⚠ No puedes empacar más de <strong>{fCant(maxSurt)}</strong> — es lo disponible por empacar del lote elegido.</small>}
                    </>
                  })()}
                  <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
                    Es el <strong>stock</strong> que se suma al producto terminado surtido. El <strong>lote de la caja (rótulo final)</strong> será el más reciente: <strong>{loteCaja(prepLoteMezcla, prepLote) || '(elige el lote arriba)'}</strong>.
                  </small>
                  {/* Validación de lote + consumo del saldo de cada lote combinado */}
                  {(() => {
                    const tokens = String(prepLoteMezcla).split(/[,;]/).map(s => s.trim()).filter(Boolean)
                    if (!tokens.length) return null
                    const lotesConocidos = new Set([...ordenes.map(x => String(x.lote || '').trim()), ...prodRecords.map(rr => String(rr.lote || '').trim()), ...saldosMezcla.map(s => String(s.lote || '').trim())].filter(Boolean))
                    const desconocidos = tokens.filter(t => !lotesConocidos.has(t))
                    // El lote combinado puede ser de OTRO producto (surtido de sabores): se busca por lote en cualquier producto
                    const matches = saldosMezcla.filter(s => (s.peso > 0) && tokens.includes(String(s.lote || '').trim()))
                    return (
                      <div style={{ marginTop: 8 }}>
                        {desconocidos.length > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--tierra)' }}>⚠ Lote(s) no encontrado(s) en el sistema: <strong>{desconocidos.join(', ')}</strong></div>}
                        {matches.length === 1 && (
                          <div style={{ fontSize: '0.74rem', color: 'var(--selva)', marginTop: 4 }}>
                            ↳ Se descontarán <strong>{fCant(parseFloat(prepSurtidoCantidad) || 0)}</strong> del saldo del lote <strong>{matches[0].lote}</strong> ({matches[0].unidad}, disp. {fCant(matches[0].peso)}).
                          </div>
                        )}
                        {matches.length > 1 && (
                          <>
                            {matches.map(s => (
                              <div key={s.id} style={{ fontSize: '0.78rem', marginTop: 4 }}>
                                <label style={{ color: 'var(--texto-suave)' }}>Consumido del saldo lote {s.lote} ({s.unidad}, disp. {fCant(s.peso)}): </label>
                                <input type="number" className="form-control" style={{ display: 'inline-block', width: 110 }}
                                  value={prepSurtidoConsumos[s.id] !== undefined ? prepSurtidoConsumos[s.id] : ''}
                                  onChange={e => setPrepSurtidoConsumos(m => ({ ...m, [s.id]: e.target.value }))} min={0} max={s.peso} step="any" />
                              </div>
                            ))}
                            <small style={{ color: 'var(--texto-suave)', fontSize: '0.7rem' }}>Combinaste varios lotes: indica cuántas subporciones se usaron de cada saldo.</small>
                          </>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* ♻ Empacar saldo de mezcla en proceso (sobrante de lotes anteriores) */}
              {(() => {
                const saldos = saldosDeProducto(ordenPrep.producto, ordenPrep.origen_id, ordenPrep.id)
                if (!saldos.length && !prepLotesExtra.length) return null
                const updExtra = (i, k, v) => setPrepLotesExtra(arr => arr.map((x, idx) => idx === i ? { ...x, [k]: v } : x))
                const updExtra2 = (i, patch) => setPrepLotesExtra(arr => arr.map((x, idx) => idx === i ? { ...x, ...patch } : x))
                return (
                  <div className="form-group" style={{ background: 'rgba(124,179,66,0.07)', borderRadius: 'var(--radio)', padding: 10 }}>
                    <label className="form-label"><Ico as={Recycle} size={14} />Empacar saldo de mezcla en proceso (lotes anteriores)</label>
                    {/* Los botones de agregar solo cuando NO viene ya precargado (empaque de saldo) */}
                    {!ordenPrep.empaque_saldo && saldos.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {saldos.map(s => (
                          <button key={s.id} type="button" className="btn btn-xs btn-secondary"
                            disabled={prepLotesExtra.some(e => e.saldo_id === s.id)}
                            onClick={() => {
                              setPrepLotesExtra(arr => [...arr, { lote: s.lote || '', vence: s.vencimiento || '', unidades: '', conforme: true, saldo_id: s.id, peso_consumido: '', surtido: false, lote_mezcla: '' }])
                              // La producción (lote nuevo) hereda el VENCIMIENTO del saldo que se empaca, si aún no se puso.
                              if (s.vencimiento) setPrepVence(v => v || s.vencimiento)
                            }}>
                            + Lote {s.lote || '(s/n)'} · {fCant(s.peso)} {s.unidad} · vence {fmtVence(s.vencimiento)}
                          </button>
                        ))}
                      </div>
                    )}
                    {!ordenPrep.empaque_saldo && (
                      <button type="button" className="btn btn-xs btn-secondary" style={{ marginBottom: 8 }}
                        onClick={() => setPrepLotesExtra(arr => [...arr, { lote: '', vence: prepVence || '', unidades: '', conforme: true, saldo_id: null, peso_consumido: '', surtido: false, lote_mezcla: '' }])}>+ Otro lote empacado</button>
                    )}
                    {prepLotesExtra.map((ex, i) => {
                      // Busca el saldo en TODOS (no solo disponibles) para que siempre muestre "gastado"
                      const saldo = ex.saldo_id ? (saldosMezcla.find(s => s.id === ex.saldo_id) || saldos.find(s => s.id === ex.saldo_id)) : null
                      const unidSaldo = saldo?.unidad || ex.unidad || 'g'
                      // Disponible del saldo = total − reservado por OTRAS órdenes en proceso (no la actual).
                      const dispo = saldo ? dispSaldo(saldo, ordenPrep.id) : 0
                      // Factor para autollenar lo gastado a partir de las unidades empacadas:
                      //  - saldo en subporciones → subporciones por unidad = pesoUnidad / pesoSubporción
                      //  - saldo en gramos       → gramos de mezcla por unidad ≈ pesoUnidad de la ficha
                      const puFicha = parseFloat(prepInfo?.pesoUnidad) || 0
                      const mezclaPorUnid = parseFloat(prepInfo?.mezclaPorUnid) || puFicha
                      const psubFicha = parseFloat(prepPesoSubp) || 0
                      const factorGasto = unidSaldo === 'subporciones' ? (psubFicha > 0 ? puFicha / psubFicha : 0) : mezclaPorUnid
                      // Al cambiar las UNIDADES obtenidas, se recalcula lo gastado del saldo (unidades × factor),
                      // salvo que el usuario haya ajustado "quedó" a mano. En empaque de saldo también sincroniza
                      // el campo principal "Unidades obtenidas" de arriba.
                      const setUnidades = v => {
                        setPrepLotesExtra(arr => arr.map((x, idx) => idx === i
                          // Cambiar las UNIDADES siempre recalcula lo gastado (y "quedó"), reseteando el ajuste manual.
                          ? { ...x, unidades: v, pesoManual: false, peso_consumido: (x.saldo_id != null && factorGasto > 0 && v !== '') ? String(+((parseFloat(v) || 0) * factorGasto).toFixed(2)) : x.peso_consumido }
                          : x))
                        if (ordenPrep.empaque_saldo && ex.saldo_id != null) setPrepUnidades(v)
                      }
                      // Lote y vence quedan fijos (vienen del saldo). Las unidades SÍ son editables.
                      const bloqLV = ex.saldo_id != null
                      const roStyle = bloqLV ? { background: 'var(--crema)' } : undefined
                      // "Quedó/sobró" = lo disponible menos lo gastado (lo que se mantiene en el mismo lote).
                      const gastado = parseFloat(ex.peso_consumido) || 0
                      const quedo = Math.round((dispo - gastado) * 100) / 100
                      return (
                        <div key={i} style={{ border: '1px dashed var(--crema-oscuro)', borderRadius: 6, padding: 8, marginBottom: 6 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: bloqLV ? '1.1fr 1fr 0.8fr' : '1.1fr 1fr 0.8fr auto', gap: 6, alignItems: 'end' }}>
                            <div><label style={{ fontSize: '0.68rem', color: 'var(--texto-suave)' }}>Lote empacado</label><input className="form-control" value={ex.lote} onChange={e => updExtra(i, 'lote', e.target.value)} placeholder="Lote" readOnly={bloqLV} style={roStyle} /></div>
                            <div><label style={{ fontSize: '0.68rem', color: 'var(--texto-suave)' }}>Vence</label><input type="date" className="form-control" value={ex.vence || ''} onChange={e => updExtra(i, 'vence', e.target.value)} readOnly={bloqLV} style={roStyle} /></div>
                            <div><label style={{ fontSize: '0.68rem', color: 'var(--texto-suave)' }}>Unidades obtenidas</label><input type="number" className="form-control" value={ex.unidades} onChange={e => setUnidades(e.target.value)} min={0} /></div>
                            {!bloqLV && <button type="button" className="btn btn-xs btn-danger" onClick={() => setPrepLotesExtra(arr => arr.filter((_, idx) => idx !== i))}>✕</button>}
                          </div>
                          {/* Cuánto QUEDÓ del saldo (sobró) tras empacar. Editable: al ajustarlo cambia lo gastado. */}
                          {ex.saldo_id != null && (
                            <div style={{ fontSize: '0.75rem', marginTop: 6 }}>
                              <label style={{ color: 'var(--texto-suave)' }}>Quedó / sobró del saldo ({unidSaldo === 'subporciones' ? 'subporciones' : unidSaldo}{saldo ? `, disp. ${fCant(dispo)}` : ''}): </label>
                              <input type="number" className="form-control" style={{ display: 'inline-block', width: 110 }} value={String(quedo)} onChange={e => {
                                const q = parseFloat(e.target.value)
                                const gast = isNaN(q) ? '' : String(Math.max(0, Math.round((dispo - q) * 100) / 100))
                                updExtra2(i, { peso_consumido: gast, pesoManual: true })
                              }} min={0} max={saldo ? dispo : undefined} step="any" />
                              {factorGasto > 0 && !ex.pesoManual && ex.unidades !== '' && <span style={{ marginLeft: 6, color: 'var(--texto-suave)' }}>(auto)</span>}
                              {gastado > dispo && <span style={{ marginLeft: 6, color: 'var(--rojo, #c0392b)' }}>⚠ empacaste más de lo disponible</span>}
                              {quedo > 0 && <span style={{ marginLeft: 6, color: 'var(--tierra)' }}>♻ se queda en el lote {ex.lote || saldo?.lote || '(mismo)'}</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>El saldo elegido se descuenta por lo gastado. Mientras esta orden esté abierta, ese consumo queda <strong>reservado</strong> (no disponible para otras órdenes). La conformidad se toma de "¿Producción conforme?" de arriba.</small>
                  </div>
                )
              })()}

              {/* 📦 ¿Quedó producción sin empacar? → acordeón para registrar lo que va a saldo */}
              <div className="form-group" style={{ background: 'rgba(200,169,74,0.06)', borderRadius: 'var(--radio)', padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, flexWrap: 'wrap' }}>
                  <span>¿Sobró producción / quedó sin empacar? *</span>
                  <SiNo value={prepHaySobrante} onChange={v => { setPrepSobranteManual(true); setPrepHaySobrante(v) }} />
                  {!prepSobranteManual && prepHaySobrante && <span style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--texto-suave)' }}>(sugerido automáticamente — ajústalo si sobró más o menos)</span>}
                </div>
                {prepHaySobrante && (
                  <div style={{ marginTop: 10 }}>
                    <label className="form-label">Cantidad sin empacar *</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input type="number" className="form-control" style={{ maxWidth: 140 }} value={prepSobrantePeso} onChange={e => { setPrepSobranteManual(true); setPrepSobrantePeso(e.target.value) }} min={0} max={prepPorciona && prepSobranteUnidad === 'subporciones' ? (parseFloat(prepCantSubp) || undefined) : undefined} step="any" placeholder="Cantidad" />
                      <Select className="form-control" style={{ maxWidth: 140 }} value={prepSobranteUnidad} onChange={e => { setPrepSobranteManual(true); setPrepSobranteUnidad(e.target.value) }}>
                        <option value="g">g</option>
                        <option value="Kg">Kg</option>
                        {prepPorciona && <option value="subporciones">subporciones</option>}
                        <option value="unidades">unidades</option>
                      </Select>
                      {prepPorciona && parseFloat(prepCantSubp) > 0 && (
                        <button type="button" className="btn btn-xs btn-secondary" onClick={() => { setPrepSobranteManual(true); setPrepSobrantePeso(String(prepCantSubp)); setPrepSobranteUnidad('subporciones') }}>Total ({fNum(parseFloat(prepCantSubp))})</button>
                      )}
                    </div>
                    <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
                      Lo que no se empacó va a <strong>saldo</strong> (producto por empacar) con el lote <strong>{prepLote || '(principal)'}</strong> y vence {fmtVence(prepVence) || '—'}. {prepPorciona && parseFloat(prepCantSubp) > 0 && prepSobranteUnidad === 'subporciones' && <>No puede superar las <strong>{fNum(parseFloat(prepCantSubp) || 0)}</strong> subporciones producidas; usa <strong>Total</strong> si no se empacó nada.</>} Lo empacado suma al stock.
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
                            <Select className="form-control" value={d.modo} onChange={e => upd('modo', e.target.value)}>
                              <option value="unidad">Por unidad</option>
                              <option value="dia">Por persona/día</option>
                              <option value="kg">Por kg</option>
                            </Select>
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
                return (
                  <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
                    <strong>Rotula así:</strong><br />
                    {prepSurtido ? (
                      <>
                        <strong>Lot. producto:</strong> {prepLote || '(lote original)'} <span style={{ color: 'var(--texto-suave)' }}>— mantiene el formato del lote original</span><br />
                        <strong>Lot. empaque final (caja):</strong> {loteCaja(prepLoteMezcla, prepLote) || '(elige el lote del surtido)'} <span style={{ color: 'var(--texto-suave)' }}>— el lote más reciente del surtido</span><br />
                      </>
                    ) : (
                      <><strong>Lot.</strong> {prepLote || '(el lote ingresado al inicio)'} <span style={{ color: 'var(--texto-suave)' }}>— mismo lote de la producción</span><br /></>
                    )}
                    <strong>Exp.</strong> {ddmmaa(prepVence)} <span style={{ color: 'var(--texto-suave)' }}>(fecha de vencimiento, formato ddmmaa)</span>
                  </div>
                )
              })()}
              <div className="form-group">
                <label className="form-label"><Ico as={Camera} size={14} />Registro fotográfico</label>
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
      <Modal open={modalConfirmEnvio} onClose={() => setModalConfirmEnvio(false)} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={18} aria-hidden="true" /> Confirmar y enviar producción</span>}
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
              <tr><td><b>{esUnidadPeso(prepMpUnidad) ? `${prepMpUnidad} obtenidos` : 'Unidades obtenidas'}</b></td><td>{fNum(parseFloat(prepUnidades) || 0)}{esUnidadPeso(prepMpUnidad) ? ` ${prepMpUnidad}` : ''}</td></tr>
              <tr><td><b>Peso final / desperdicio</b></td><td>{fNum(parseFloat(prepPesoFinal) || 0)} / {fNum(parseFloat(prepPesoDesp) || 0)}</td></tr>
              {prepPorciona && <tr><td><b>Subporciones</b></td><td>{fNum(parseFloat(prepCantSubp) || 0)} de {fNum(parseFloat(prepPesoSubp) || 0)} g c/u</td></tr>}
              <tr><td><b>Empaque surtido</b></td><td>{prepSurtido ? `Sí — mezclado con: ${prepLoteMezcla || '(sin especificar)'}` : 'No'}</td></tr>
              <tr><td><b>Responsable</b></td><td>{prepResp || '—'}</td></tr>
              <tr><td><b>Estado</b></td><td>{prepConforme ? 'Conforme' : 'No conforme'}</td></tr>
              <tr><td><b>Observaciones</b></td><td>{prepObs || '—'}</td></tr>
              <tr><td><b>Foto</b></td><td>{prepFotoFile || prepFotoPrev ? '✓ adjunta' : '—'}</td></tr>
            </tbody></table>

            {/* Previo del empaque a descontar */}
            {empaquePrevio && empaquePrevio.plan.length > 0 && (
              <div style={{ marginTop: 10, border: '1px solid var(--crema-oscuro)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700, color: 'var(--selva)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Package size={15} aria-hidden="true" /> Empaque que se descontará del inventario</div>
                <table><tbody>
                  {empaquePrevio.plan.map((p, i) => {
                    const falta = (p.stock < p.qty)
                    return <tr key={i} style={falta ? { color: 'var(--rojo)' } : undefined}>
                      <td>{p.mp.nombre} <span className={`badge ${p.tipo === 'bolsa' ? 'badge-azul' : p.tipo === 'caja' ? 'badge-dorado' : 'badge-gris'}`} style={{ fontSize: '0.6rem' }}>{p.tipo}</span></td>
                      <td className="td-number"><strong>{fNum(p.qty)}</strong></td>
                      <td className="td-number" style={{ color: 'var(--texto-suave)' }}>stock: {fNum(p.stock)}{falta ? ' ⚠' : ''}</td>
                    </tr>
                  })}
                </tbody></table>
                {empaquePrevio.faltantes.length > 0
                  ? <div className="alert alert-warning" style={{ marginTop: 8, fontSize: '0.82rem' }}>⚠ El stock de algún empaque quedará en <strong>negativo</strong> (no bloquea). Recarga el empaque en Inventario cuando puedas.</div>
                  : <small style={{ color: 'var(--texto-suave)' }}>Se descuenta al confirmar. Bolsas por porción · Cajas por surtido · Infusiones por la relación de la ficha.</small>}
              </div>
            )}
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
                {(o.cant_subporciones != null || o.peso_subporcion != null) && (
                  <D et="Subporciones">{fNum(parseFloat(o.cant_subporciones) || 0)}{o.peso_subporcion ? ` de ${fNum(parseFloat(o.peso_subporcion))} g c/u` : ''}</D>
                )}
                {o.surtido && (
                  <D et="Empacado surtido">{o.producto_surtido || 'Sí'}{o.surtido_cantidad != null ? ` · ${fNum(parseFloat(o.surtido_cantidad))} und` : ''}{o.lote_mezcla ? ` · lote(s) ${o.lote_mezcla}` : ''}</D>
                )}
                {o.hay_sobrante && (
                  <D et="Quedó sin empacar">{o.sobrante_peso != null ? `${fCant(o.sobrante_peso)} ${o.sobrante_unidad || ''}` : 'Sí'}</D>
                )}
                {Array.isArray(o.campos_extra) && o.campos_extra.filter(c => (c.nombre || '').trim()).map((c, i) => (
                  <D key={i} et={c.nombre}>{c.valor || '—'}</D>
                ))}
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


              {/* Rendimiento de los ingredientes vs la ficha (solo si ya hay unidades obtenidas) */}
              {detalleFicha && detalleIngs.length > 0 && o.cantidad_result != null && (() => {
                const totalG = detalleIngs.reduce((s, i) => s + (i.gramos || 0), 0)
                const pu = detalleFicha.pu || 1000
                const unidsObt = parseFloat(o.cantidad_result) || 0
                const pesoFinalReal = (parseFloat(o.peso_final) || 0) > 0 ? parseFloat(o.peso_final) : unidsObt * pu
                const rendReal = totalG > 0 ? (pesoFinalReal / totalG * 100) : 0
                const factorFicha = (detalleFicha.rend / 100) * (1 - detalleFicha.desp / 100)
                const unidsEsper = pu > 0 ? (totalG * factorFicha) / pu : 0
                const cumpl = unidsEsper > 0 ? (unidsObt / unidsEsper * 100) : 0
                const badge = cumpl >= 97 ? 'badge-verde' : cumpl >= 90 ? 'badge-dorado' : 'badge-rojo'
                return (
                  <>
                    <div className="card-title" style={{ fontSize: '0.95rem', marginTop: 12 }}><Ico as={Calculator} size={15} />Rendimiento de los ingredientes</div>
                    <div className="table-wrap"><table><tbody>
                      <tr><td>Mezcla usada (ingredientes)</td><td className="td-number">{fCant(totalG)} g</td></tr>
                      <tr><td>Peso final producido</td><td className="td-number">{fCant(pesoFinalReal)} g {(parseFloat(o.peso_final) || 0) <= 0 && <small style={{ color: 'var(--texto-suave)' }}>(estimado)</small>}</td></tr>
                      <tr style={{ fontWeight: 700, background: 'rgba(124,179,66,0.08)' }}><td>Rendimiento real (final ÷ mezcla)</td><td className="td-number">{rendReal.toFixed(1)}%</td></tr>
                      <tr><td>Rendimiento de la ficha</td><td className="td-number">{fNum(detalleFicha.rend)}% <small style={{ color: 'var(--texto-suave)' }}>(desp. {fNum(detalleFicha.desp)}%)</small></td></tr>
                      <tr><td>Unidades: obtenidas vs esperadas</td><td className="td-number"><strong>{fNum(unidsObt)}</strong> / {fNum(Math.round(unidsEsper))}</td></tr>
                    </tbody></table></div>
                    <div style={{ marginTop: 6 }}><span className={`badge ${badge}`}>Cumplimiento del rendimiento: {cumpl.toFixed(0)}%</span></div>
                  </>
                )
              })()}

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
                    <div className="card-title" style={{ fontSize: '0.95rem', marginTop: 12 }}><Ico as={DollarSign} size={15} />Costos del lote (solo admin)</div>
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
              {(() => {
                const trz = (Array.isArray(o.lotes_mp) && o.lotes_mp.length) ? o.lotes_mp : (Array.isArray(o.lotes_reservados) ? o.lotes_reservados : [])
                // Cantidades guardadas en la unidad de PRECIO de la MP (Kg/Litro) o ya en base (Gramo/Mililitro/Unidad).
                // Se muestran SIEMPRE en la unidad base (gramos/ml) para pesos y volúmenes; "Unidad" queda como conteo.
                const aBase = (v, u) => {
                  const n = Number(v) || 0
                  const un = String(u || '').toLowerCase()
                  if (un.startsWith('kg') || un.startsWith('kilo')) return `${fCant(n * 1000)} g`
                  if (un.startsWith('g')) return `${fCant(n)} g`
                  if (un.startsWith('litro') || un === 'l') return `${fCant(n * 1000)} ml`
                  if (un.startsWith('mililitro') || un === 'ml') return `${fCant(n)} ml`
                  return `${fNum(n)} ${u || ''}`
                }
                return trz.length > 0 && (
                <>
                  <div className="card-title" style={{ fontSize: '0.95rem', marginTop: 12 }}><Ico as={Link2} size={15} />Materia Prima — Trazabilidad de lotes (PEPS) {(Array.isArray(o.lotes_mp) && o.lotes_mp.length) ? 'consumidos' : 'reservados'}</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Materia prima</th><th className="td-number">Consumo</th><th>Lotes usados (PEPS)</th></tr></thead>
                      <tbody>
                        {trz.map((t, i) => (
                          <tr key={i}>
                            <td>{t.nombre}</td>
                            <td className="td-number">{aBase(t.consumo, t.unidad)}</td>
                            <td style={{ fontSize: '0.8rem' }}>
                              {(t.lotes || []).length
                                ? t.lotes.map((l, k) => (
                                    <span key={k}>
                                      {k > 0 && ' · '}
                                      <button type="button" onClick={() => abrirDetalleLoteMp(t, l)}
                                        title="Ver detalles del lote (compra, proveedor, costo)"
                                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--selva-claro)', textDecoration: 'underline', fontSize: 'inherit', fontFamily: 'inherit' }}>
                                        {l.lote || 's/lote'}
                                      </button>
                                      {l.vencimiento ? ` (vence ${fFecha(l.vencimiento)})` : ''}: {aBase(l.cantidad, t.unidad)}
                                    </span>
                                  ))
                                : (t.sin_lote_cantidad > 0 || t.sin_lote) ? '' : '—'}
                              {t.sin_lote_cantidad > 0 && <span style={{ color: 'var(--tierra)' }}>{(t.lotes || []).length ? ' · ' : ''}⚠ {aBase(t.sin_lote_cantidad, t.unidad)} sin lote (stock general)</span>}
                              {t.sin_lote && !t.sin_lote_cantidad && <span style={{ color: 'var(--texto-suave)' }}>Sin lote (forzado)</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) })()}

              <div className="card-title" style={{ fontSize: '0.95rem', marginTop: 12 }}><Ico as={ReceiptText} size={15} />Lotes de producción vinculados ({recs.length})</div>
              {recs.length === 0
                ? <p className="empty-table">Aún no hay registros de producción para esta orden.</p>
                : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Lote</th><th>Producto</th><th className="td-number">Cantidad</th><th className="td-number">Subporciones</th><th>Avance</th></tr></thead>
                      <tbody>
                        {recs.map(r => (
                          <tr key={r.id}>
                            <td><strong>{r.lote || '—'}</strong></td>
                            <td>{r.producto || '—'}{r.surtido && <div style={{ fontSize: '0.72rem', color: 'var(--tierra)', display: 'flex', alignItems: 'center', gap: 3 }}><Shuffle size={11} aria-hidden="true" /> {r.producto_surtido || 'Surtido'}{r.lote_mezcla ? ` · ${r.lote_mezcla}` : ''}</div>}</td>
                            <td className="td-number">{fNum(r.cantidad || 0)} {r.empaque || ''}</td>
                            <td className="td-number">{r.cant_subporciones != null ? `${fNum(r.cant_subporciones)}${r.peso_subporcion ? ` (${fNum(r.peso_subporcion)} g)` : ''}` : '—'}</td>
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

      {/* Modal: detalle de un lote de MP consumido (trazabilidad hacia la compra) */}
      <Modal open={!!detalleLoteMp} onClose={() => setDetalleLoteMp(null)} guard={false}
        title={`🧊 Lote "${detalleLoteMp?.lote || 's/lote'}" — ${detalleLoteMp?.mpNombre || ''}`}
        footer={<button className="btn btn-secondary" onClick={() => setDetalleLoteMp(null)}>Cerrar</button>}>
        {detalleLoteMp?.cargando && <p style={{ fontSize: '0.88rem' }}>Cargando detalles del lote…</p>}
        {detalleLoteMp && !detalleLoteMp.cargando && detalleLoteMp.filas.length === 0 && (
          <p className="empty-table">No se encontró este lote en el inventario (pudo haberse eliminado o renombrado).</p>
        )}
        {detalleLoteMp && !detalleLoteMp.cargando && detalleLoteMp.filas.map((lf) => {
          const u = detalleLoteMp.unidad
          const consumido = Math.max(0, (lf.cantidad_inicial || 0) - (lf.cantidad_actual || 0) - (lf.cantidad_reservada || 0))
          return (
          <table key={lf.id} style={{ fontSize: '0.88rem', width: '100%', marginBottom: 10 }}>
            <tbody>
              <tr><td style={{ color: 'var(--texto-suave)', width: 190 }}>Fecha de compra/entrada</td><td><strong>{fFecha(lf.fecha_entrada)}</strong></td></tr>
              <tr><td style={{ color: 'var(--texto-suave)' }}>Proveedor</td><td><strong>{lf.proveedor || '— (sin registrar)'}</strong></td></tr>
              <tr><td style={{ color: 'var(--texto-suave)' }}>Costo unitario de compra</td><td>{lf.costo_unitario ? `${fCOP(lf.costo_unitario)}${u ? ` por ${u}` : ''}` : '—'}</td></tr>
              <tr><td style={{ color: 'var(--texto-suave)' }}>Cantidad inicial</td><td>{fmtCantLote(lf.cantidad_inicial, u)}</td></tr>
              <tr><td style={{ color: 'var(--texto-suave)' }}>Ya consumido</td><td>{fmtCantLote(consumido, u)}</td></tr>
              <tr><td style={{ color: 'var(--texto-suave)' }}>Reservado (órdenes en proceso)</td><td>{(lf.cantidad_reservada || 0) > 0 ? <strong style={{ color: 'var(--tierra)' }}>{fmtCantLote(lf.cantidad_reservada, u)}</strong> : <span>0 <small style={{ color: 'var(--texto-suave)' }}>(si la orden ya se cerró, su reserva pasó a "consumido")</small></span>}</td></tr>
              <tr><td style={{ color: 'var(--texto-suave)' }}>Disponible hoy</td><td><strong>{fmtCantLote(lf.cantidad_actual, u)}</strong></td></tr>
              <tr><td style={{ color: 'var(--texto-suave)' }}>Vencimiento</td><td>{lf.vencimiento ? fFecha(lf.vencimiento) : '—'}</td></tr>
              <tr><td style={{ color: 'var(--texto-suave)' }}>Registrado por</td><td>{lf.creado_por || '—'}</td></tr>
            </tbody>
          </table>
          )
        })}
      </Modal>
    </div>
  )
}

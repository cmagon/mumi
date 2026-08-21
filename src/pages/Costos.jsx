import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { pathImgProducto, conAltProducto, urlDeImg } from '../lib/imgNombre'
import {
  fCOP, fNum, fFecha, getCIFTotalMensual, getCIFMensual, getCostoMinuto,
  calcularCostosProducto, calcularReceta, getPEqMultiproducto,
  getCostoNominaMensual, PARAMS_NOMINA_DEFAULT, GRUPOS_CIF, GRUPOS_EQUIPO, getGastosOperacionales,
  getTasaGastosOper, getPrecioSugerido, getPEqCaja, getCIFAbsorcion, presDeUnidad,
  getDepreciacionMensualEquipo, getCostoTasaEquipo, getEquipoUnitProducto,
  minutosProcesoOrden, calcularCostoProduccionOrden, codigoOrdenVisible,
} from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useReorder } from '../hooks/useReorder'
import { usePantallaChica } from '../hooks/useMediaQuery'
import { useNavTrail } from '../hooks/useNavTrail'
import { useHistoryLayer } from '../hooks/useHistoryLayer'
import { useAuth } from '../context/AuthContext'
import { puedeVerSeccion } from '../lib/permisos'
import Modal from '../components/ui/Modal'
import ImageCropper from '../components/ui/ImageCropper'
import BuscadorSelect from '../components/ui/BuscadorSelect'
import MoneyInput from '../components/ui/MoneyInput'
import { useConfirm } from '../context/ConfirmContext'
import { AccordionItem, Fila } from '../components/ui/Acordeon'
import Receta from './Receta'
import { CATALOGO_PARAMS, PARAM_UNIDAD, PRESENTACIONES } from '../lib/calidad'
import { BarChart3, ClipboardList, Clock, DollarSign, Download, FileText, FileSpreadsheet, FlaskConical, Package, Pause, Pencil, Printer, Settings, ShoppingCart, Tag, Trash2, TrendingUp, Undo2, Wrench, X, ChevronUp, ChevronDown, Plus } from 'lucide-react'
import { descargarFichaExcel } from '../lib/fichaExcel'
import { getConfig } from '../lib/appConfig'
import Select from '../components/ui/Select'
import {
  FICHAS_LOTEO,
  ATAJOS_LOTEO,
  normalizarMetodoLoteo,
  configDesdePartes,
  agregarParte,
  quitarParte,
  actualizarParte,
  etiquetaParte,
  describirPlantilla,
  ejemploLote,
  sugerirSiguienteLote,
} from '../lib/loteoProducto'
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

const EMPTY_PROD = {
  nombre: '', tipo: 'galleta', bache: 70, baches_mes: 3,
  merma: 0, comision: 3, precio_mayor: 10000, precio_detal: 15000,
  presentacion: 'Unidad', activo: true, mp_id: '',
  vida_util_valor: '', vida_util_unidad: 'meses', descripcion: '',
  empaca_surtido: false,
  // Método de loteo (v150): null = no autosugerir lote en órdenes
  metodo_loteo: null,
  // Precio: utilidad objetivo propia de este producto (vacío = usa la global) e impuestos
  // INDIRECTOS que se cobran al cliente sobre el precio (no son costo ni salen de tu utilidad).
  // ICUI se guarda en % (ad valorem); IBUA en pesos por unidad (impuesto específico por 100 ml)
  utilidad_objetivo: '', iva_pct: '', imp_saludable_pct: '', ibua_valor: '',
}
const EMPTY_ING = { mpId: '', nombre: '', modo: 'lista', precio: '', presentacion: 1000, pct: '', cantidad: '', tipo: 'normal', base: '' }

export default function Costos({ vista = 'productos' }) {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const imgInputRef = useRef()
  const location = useLocation()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const rol = profile?.rol
  // Secciones configurables en Usuarios → Permisos. Sin override, SECCIONES_POR_ROL deja a
  // operario/auxiliar solo en "receta" (comportamiento histórico).
  const puedeFicha  = vista === 'productos' && puedeVerSeccion(rol, 'productos', 'fichas')
  const puedeCif    = vista === 'costos' && puedeVerSeccion(rol, 'costos_gastos', 'configuracion')
  const tabInicial = vista === 'costos' ? 'cif' : 'lista'
  const labelModulo = vista === 'costos' ? 'Costos y Gastos' : 'Productos'
  const { pushTo, consumeArrival } = useNavTrail()

  // Secciones de la ficha: en pantalla chica se comportan como acordeón EXCLUSIVO (todas cerradas
  // al entrar y, al abrir una, el navegador cierra las demás gracias al atributo `name`). Así la
  // ficha no queda como una tira interminable en el celular. En escritorio no cambia nada: se
  // pueden tener varias secciones abiertas a la vez, que es cómodo con espacio de sobra.
  const pantallaChica = usePantallaChica()
  const secProps = (abiertaEnEscritorio) => pantallaChica
    ? { name: 'ficha-seccion' }
    : { open: abiertaEnEscritorio }

  // ---- Tabs y modo ----
  const [tab, setTab] = useState(tabInicial)
  const [costosSubtab, setCostosSubtab] = useState('costos')
  // Si el admin quita una sección, no dejar al usuario atrapado en una pestaña prohibida
  useEffect(() => {
    const ok = { lista: puedeFicha, nuevo: puedeFicha, cif: puedeCif }
    if (!ok[tab]) setTab(tabInicial)
  }, [puedeFicha, puedeCif, tab, tabInicial])
  const [editingId, setEditingId] = useState(null)   // null = nuevo, number = editando producto existente
  const [selFuente, setSelFuente] = useState('')     // valor del selector: '' | prod-{id} | recipe-{id}
  const [modoMpVend, setModoMpVend] = useState(false)   // "calcular costos de una MP vendible"

  // ---- Formulario de ficha ----
  const [formProd, setFormProd]     = useState(EMPTY_PROD)
  const [ingredientes, setIngredientes] = useState([])
  const [procesos, setProcesos]     = useState([])
  const [empaque, setEmpaque]       = useState([])
  const [calcResult, setCalcResult] = useState(null)
  // Categorías adicionales (además de "Tipo"), sobre todo para MP vendibles que caben en varias.
  const [categorias, setCategorias] = useState([])
  // Costos adicionales personalizados (depreciación de máquinas, etc.) que suman al costo final.
  const [adicionales, setAdicionales] = useState([])
  const [adicOpen, setAdicOpen] = useState(false)
  const [costosHora, setCostosHora] = useState([])
  const [equipoForm, setEquipoForm] = useState({ id:null, nombre:'', descripcion:'', valor_adquisicion:'', valor_residual:'', vida_util_anos:5, allocation_mode:'general', rate_basis:'hora', capacidad_mes:176, grupo:'cif', categorias:[] })

  // ---- Imágenes del producto (galería): la PRIMERA es la principal (imagen_url) ----
  const [imagenes, setImagenes] = useState([])   // array de URLs públicas
  // Imprimibles: PDFs (etiquetas, rótulos) que el operario imprime al ejecutar una orden.
  // [{ nombre, path, size }] — el archivo vive en el bucket privado 'ficha-imprimibles'.
  const [imprimibles, setImprimibles] = useState([])
  const [subiendoImp, setSubiendoImp] = useState(false)
  const [subiendoImg, setSubiendoImg] = useState(false)
  const [cropImg, setCropImg] = useState(null)   // archivo pendiente de recortar (ficha)

  // ---- Parámetros de producción (para ancla + guardar) ----
  const [rendimiento, setRendimiento] = useState(62)
  const [desperdicio, setDesperdicio] = useState(2)
  const [pesoUnidad, setPesoUnidad]   = useState(1000)
  const [porciona, setPorciona]           = useState(false)
  const [pesoSubporcion, setPesoSubporcion] = useState('')
  // Modo de ingreso de ingredientes: por gramos/bache o por porcentaje (con peso total del bache)
  const [modoIng, setModoIng]         = useState('gramos')   // 'gramos' | 'porcentaje'
  const [pesoBacheTotal, setPesoBacheTotal] = useState('')   // peso total de la mezcla del bache (g) en modo %
  const [brix, setBrix]               = useState(75)
  const [brixAplica, setBrixAplica]   = useState(false)
  const [paramsCalidad, setParamsCalidad] = useState([])   // [{ nombre, valor, unidad }]
  const addParamCalidad = () => setParamsCalidad(p => [...p, { nombre: '', valor: '', unidad: '' }])
  const updParamCalidad = (i, campo, val) => setParamsCalidad(p => p.map((x, idx) => {
    if (idx !== i) return x
    const next = { ...x, [campo]: val }
    if (campo === 'nombre' && PARAM_UNIDAD[val] !== undefined) next.unidad = PARAM_UNIDAD[val]   // autocompleta unidad
    return next
  }))
  const delParamCalidad = (i) => setParamsCalidad(p => p.filter((_, idx) => idx !== i))
  // Campos personalizados de la información del producto
  const [camposExtra, setCamposExtra] = useState([])   // [{ nombre, valor }]
  const addCampoExtra = () => setCamposExtra(c => [...c, { nombre: '', valor: '' }])
  const updCampoExtra = (i, campo, val) => setCamposExtra(c => c.map((x, idx) => idx === i ? { ...x, [campo]: val } : x))
  const delCampoExtra = (i) => setCamposExtra(c => c.filter((_, idx) => idx !== i))
  const presLabel = (formProd.presentacion || 'Unidad').trim() || 'Unidad'

  // ---- Ficha técnica ----
  const [fichaFile, setFichaFile]     = useState(null)
  const [fichaNombre, setFichaNombre] = useState('')
  const [fichaPath, setFichaPath]     = useState('')

  // ---- Modal ancla ----
  const [anclaModal, setAnclaModal] = useState(false)
  const [anclaId, setAnclaId]       = useState('')
  const [anclaQty, setAnclaQty]     = useState('')

  // ---- CIF fallback ----
  const [cifUnidadesFallback, setCifUnidadesFallback] = useState(600)

  // ---- Modales de lista ----
  const [verModal, setVerModal] = useState(false)
  const [verProd, setVerProd]   = useState(null)
  const [detalleCosto, setDetalleCosto] = useState(null) // { producto, items: [...], foco?: ordenId }
  const cerrarDetalleCostoRaw = useCallback(() => setDetalleCosto(null), [])
  const closeDetalleCosto = useHistoryLayer(!!detalleCosto, cerrarDetalleCostoRaw, 'detalle-costo')
  const [modalEquipos, setModalEquipos] = useState(false)
  // ---- Queries ----
  // Dueña de la clave ['raw_materials']: tabla completa ordenada por nombre. Las pantallas
  // que solo necesitan unas columnas usan sub-claves (['raw_materials','receta'], etc.).
  const { data: mps = [] } = useQuery({
    queryKey: ['raw_materials'],
    queryFn: async () => { const { data } = await supabase.from('raw_materials').select('*').order('nombre'); return data || [] },
  })
  const { data: cifItems = [], refetch: refetchCIF } = useQuery({
    queryKey: ['cif_items'],
    queryFn: async () => { const { data } = await supabase.from('cif_items').select('*').order('id'); return data || [] },
  })
  const { data: productos = [], refetch: refetchProductos } = useQuery({
    queryKey: ['products_costing'],
    queryFn: async () => { const { data } = await supabase.from('products_costing').select('*').order('nombre'); return data || [] },
  })
  const { data: equipos = [] } = useQuery({
    queryKey: ['equipment_assets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment_assets').select('*').order('nombre')
      if (error && /equipment_assets/i.test(error.message || '')) return []
      if (error) throw error
      return data || []
    },
  })
  const { data: equipoLinks = [] } = useQuery({
    queryKey: ['equipment_category_links'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment_category_links').select('*')
      if (error && /equipment_category_links/i.test(error.message || '')) return []
      if (error) throw error
      return data || []
    },
  })
  // Producción del último mes calendario cerrado basada SOLO en órdenes. Los registros no se
  // usan aquí porque pueden contener productos surtidos y distorsionar el producto base.
  const mesAnterior = useMemo(() => {
    const hoy = new Date()
    const inicioActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const inicioAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    const fecha = (d) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const dia = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${dia}`
    }
    return {
      desde: fecha(inicioAnterior),
      hasta: fecha(inicioActual),
      periodo: fecha(inicioAnterior).slice(0, 7),
      label: inicioAnterior.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
    }
  }, [])
  const { data: ordenesProduccionAnalisis = [], isPending: cargandoProduccionMes } = useQuery({
    queryKey: ['production_orders', 'costos-analisis'],
    queryFn: async () => {
      const base = 'id, producto, origen, origen_id, baches_plan, cantidad_plan, cantidad_result, fecha_prod, fecha_envio, created_at, estado, es_prueba, es_subproducto, surtido, producto_surtido, inicio, fin, procesos_tiempos, modo_avanzado, lotes_reservados'
      const r = await supabase.from('production_orders').select(base + ', costo_snapshot, lotes_mp, destajo, costos_adicionales_hora').order('created_at', { ascending: false })
      if (r.error && /costo_snapshot|costos_adicionales_hora/i.test(r.error.message || '')) {
        const fallback = await supabase.from('production_orders').select(base).order('created_at', { ascending: false })
        if (fallback.error) throw fallback.error
        return fallback.data || []
      }
      if (r.error) throw r.error
      return r.data || []
    },
  })
  // Numeración visible OP-N (misma lógica que Órdenes / Producción)
  const { data: ordenIdsData = [] } = useQuery({
    queryKey: ['orden_ids'],
    queryFn: async () => { const { data } = await supabase.from('production_orders').select('id').order('id'); return data || [] },
  })
  const { data: ordenStartCfg } = useQuery({
    queryKey: ['app_config_orden_start'],
    queryFn: async () => {
      const { data } = await supabase.from('app_config').select('key, value').in('key', ['orden_start'])
      const n = parseInt((data || []).find(r => r.key === 'orden_start')?.value)
      if (!isNaN(n) && n > 0) { localStorage.setItem('mumi_orden_start', String(n)); return n }
      return null
    },
    staleTime: 5 * 60 * 1000,
  })
  const ordenStartNum = ordenStartCfg || parseInt(localStorage.getItem('mumi_orden_start')) || 1
  const opCodigo = (id) => codigoOrdenVisible(id, ordenIdsData, ordenStartNum)
  const { data: alertasIgnoradas = [] } = useQuery({
    queryKey: ['ficha_alert_dismissals', mesAnterior.periodo],
    queryFn: async () => {
      const { data, error } = await supabase.from('ficha_alert_dismissals').select('product_id, alert_type, periodo').eq('periodo', mesAnterior.periodo)
      if (error && /ficha_alert_dismissals/i.test(error.message || '')) return []
      if (error) throw error
      return data || []
    },
  })
  const ignorarAlertaBaches = async (productId) => {
    const { error } = await supabase.from('ficha_alert_dismissals').upsert({
      product_id: productId,
      alert_type: 'baches_mes',
      periodo: mesAnterior.periodo,
      dismissed_by: profile?.nombre || '',
    }, { onConflict: 'product_id,alert_type,periodo' })
    if (error) { toast('No se pudo ignorar la alerta: ' + error.message, 'error'); return }
    qc.invalidateQueries({ queryKey: ['ficha_alert_dismissals'] })
    toast('Alerta ignorada durante este mes')
  }
  // 'activos' es una sub-clave, no la lista completa: la clave ['empleados'] la usan
  // Nómina y el tablero para TODOS los empleados. Compartirlas hacía que el tablero
  // contara como activos a todos (o Nómina perdiera a los inactivos) según cuál
  // pantalla se hubiera abierto primero. El prefijo conserva sus invalidateQueries.
  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados', 'activos'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('estado','activo'); return data || [] },
  })
  const { data: recetas = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: async () => { const { data } = await supabase.from('recipes').select('*').order('nombre'); return data || [] },
  })
  // Histórico de cambios de costos/cantidades del producto en edición
  const { data: costHistory = [] } = useQuery({
    queryKey: ['product_cost_history', editingId],
    queryFn: async () => {
      if (!editingId) return []
      const { data } = await supabase.from('product_cost_history').select('*').eq('product_id', editingId).order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!editingId,
  })
  const borrarHistorial = async (id) => {
    await supabase.from('product_cost_history').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['product_cost_history'] })
  }

  // ── Restaurar una versión del histórico (solo la RECETA: ingredientes, cantidades y costos) ──
  const [restaurarH, setRestaurarH] = useState(null)   // registro del histórico elegido
  // Convierte el snapshot guardado en filas de ingredientes del formulario. Los snapshots nuevos
  // traen mpId/modo/tipo; los antiguos solo nombre/cantidad/precio → se empareja la MP por nombre.
  const snapshotAFilas = (h) => (Array.isArray(h?.snapshot) ? h.snapshot : []).map(s => {
    const mp = s.mpId
      ? mps.find(m => String(m.id) === String(s.mpId))
      : mps.find(m => (m.nombre || '').trim().toLowerCase() === (s.nombre || '').trim().toLowerCase())
    return {
      ...EMPTY_ING, _id: Date.now() + Math.random(),
      mpId: mp ? String(mp.id) : '', nombre: s.nombre || '', modo: mp ? 'lista' : 'manual',
      precio: s.precio != null ? String(s.precio) : '', precioOverride: !!s.precioOverride,
      presentacion: s.presentacion || (mp ? presDeUnidad(mp.unidad) : 1000),
      pct: s.pct || '', cantidad: s.cantidad || '', tipo: s.tipo || 'normal', base: s.base || '',
    }
  })
  const aplicarVersionEnFormulario = (h) => {
    setIngredientes(snapshotAFilas(h))
    setRestaurarH(null)
    toast('Versión cargada en el formulario — revisa los costos y guarda la ficha para confirmar el reemplazo')
  }
  const crearCopiaDeVersion = useMutation({
    mutationFn: async (h) => {
      const p = productos.find(x => x.id === editingId)
      if (!p) throw new Error('Guarda primero la ficha para poder crear copias de sus versiones')
      const { id, created_at, ...resto } = p
      const ings = snapshotAFilas(h).map(({ _id, ...r }) => r)
      const { error } = await supabase.from('products_costing').insert({
        ...resto,
        nombre: `${p.nombre} (versión ${fFecha(h.created_at)})`,
        sku: null, alegra_item_id: null, stock_terminado: 0, activo: false,   // copia de referencia: no reparte CIF
        ingredientes: JSON.stringify(ings),
        fecha_creado: new Date().toISOString().split('T')[0],
      })
      if (error) throw error
      return h
    },
    meta: { label: 'Creando copia de la versión…' },
    onSuccess: (h) => { qc.invalidateQueries({ queryKey: ['products_costing'] }); setRestaurarH(null); toast(`Copia creada: "${productos.find(x => x.id === editingId)?.nombre} (versión ${fFecha(h.created_at)})" ✓ — quedó inactiva para no repartir CIF`) },
    onError: (e) => toast(e.message, 'error'),
  })

  // Parámetros de nómina (para calcular el costo de la nómina que entra al CIF)
  const { data: nominaParams } = useQuery({
    queryKey: ['payroll_settings'],
    queryFn: async () => { const { data } = await supabase.from('payroll_settings').select('params').eq('id', 1).maybeSingle(); return data?.params || null },
  })
  const paramsNom = nominaParams && Object.keys(nominaParams).length
    ? { ...PARAMS_NOMINA_DEFAULT, ...nominaParams,
        prestaciones: { ...PARAMS_NOMINA_DEFAULT.prestaciones, ...(nominaParams.prestaciones || {}) },
        empleador: { ...PARAMS_NOMINA_DEFAULT.empleador, ...(nominaParams.empleador || {}) },
        operacion: { ...PARAMS_NOMINA_DEFAULT.operacion, ...(nominaParams.operacion || {}) } }
    : PARAMS_NOMINA_DEFAULT
  const op = paramsNom.operacion || PARAMS_NOMINA_DEFAULT.operacion
  // Solo la nómina de PRODUCCIÓN entra al CIF/costo-minuto; administración y ventas
  // van al gasto operacional (ver bloque de Gastos abajo y AUDITORIA_COSTOS.md).
  const costoNomina = getCostoNominaMensual(empleados, paramsNom, 'produccion')
  const depreciacionesGenerales = equipos
    .filter(e => e.activo !== false && e.allocation_mode === 'general')
    .map(e => ({ grupo: e.grupo || 'cif', valor: getDepreciacionMensualEquipo(e), frecuencia: 'mensual' }))
  const gastosOp = getGastosOperacionales([...cifItems, ...depreciacionesGenerales], empleados, paramsNom)
  const esAdmin = profile?.rol === 'admin'

  // Márgenes de precios sugeridos (configurables por el admin)
  const { data: costingRow } = useQuery({
    queryKey: ['costing_settings'],
    queryFn: async () => { const { data } = await supabase.from('costing_settings').select('margenes').eq('id', 1).maybeSingle(); return data?.margenes || null },
  })
  const margenes = Array.isArray(costingRow) && costingRow.length ? costingRow : [30, 35, 40, 45, 47]
  const [editMargenes, setEditMargenes] = useState(false)
  const [margenesTmp, setMargenesTmp] = useState([])
  const abrirEditMargenes = () => { setMargenesTmp(margenes.map(String)); setEditMargenes(true) }
  const guardarMargenes = async () => {
    const arr = [...new Set(margenesTmp.map(m => parseFloat(m)).filter(m => m > 0 && m < 100))].sort((a, b) => a - b)
    if (!arr.length) { toast('Agrega al menos un margen válido (1–99)', 'warning'); return }
    const { error } = await supabase.from('costing_settings').upsert({ id: 1, margenes: arr, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) { toast(error.message, 'error'); return }
    qc.invalidateQueries({ queryKey: ['costing_settings'] }); setEditMargenes(false); toast('Márgenes guardados ✓')
  }
  // Utilidad objetivo global (fallback si la ficha no trae la suya). El ICA no se usa en la ficha:
  // es impuesto del período, no costo del producto (va en Costos y Gastos → Impuestos).
  const { data: precioParams } = useQuery({
    queryKey: ['costing_precio_params'],
    queryFn: async () => {
      try {
        const { data } = await supabase.from('costing_settings').select('utilidad_objetivo').eq('id', 1).maybeSingle()
        return data || null
      } catch { return null }
    },
  })
  const utilidadObjetivo = precioParams?.utilidad_objetivo != null ? parseFloat(precioParams.utilidad_objetivo) : 30
  const { data: tiposProducto = [] } = useQuery({
    queryKey: ['product_types'],
    queryFn: async () => { const { data } = await supabase.from('product_types').select('*').order('nombre'); return data || [] },
  })
  // Opciones del select de Tipo: gestionables + especiales fijos
  const tipoLabel = (t) => ({ subproducto: 'Subproducto interno', mp: 'Materia prima vendible', otro: 'Otro' }[t] || (t.charAt(0).toUpperCase() + t.slice(1)))
  const opcionesTipo = [...new Set([...tiposProducto.map(t => t.nombre), 'subproducto', 'mp', 'otro'])]
  const [tiposModal, setTiposModal] = useState(false)
  const [nuevoTipo, setNuevoTipo] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)   // ficha a eliminar (confirmación reforzada)
  const [delText, setDelText] = useState('')
  const [modalPapelera, setModalPapelera] = useState(false)
  const addTipo = async () => {
    const n = nuevoTipo.trim().toLowerCase()
    if (!n) { toast('Escribe un nombre', 'warning'); return }
    const { error } = await supabase.from('product_types').insert({ nombre: n })
    if (error) { toast(error.message.includes('duplicate') ? 'Ese tipo ya existe' : error.message, 'error'); return }
    qc.invalidateQueries({ queryKey: ['product_types'] }); setNuevoTipo(''); toast('Tipo creado ✓')
  }
  const delTipo = async (t) => {
    await supabase.from('product_types').delete().eq('id', t.id)
    qc.invalidateQueries({ queryKey: ['product_types'] }); toast('Tipo eliminado')
  }
  const limpiarEquipoForm = () => setEquipoForm({ id:null, nombre:'', descripcion:'', valor_adquisicion:'', valor_residual:'', vida_util_anos:5, allocation_mode:'general', rate_basis:'hora', capacidad_mes:176, grupo:'cif', categorias:[] })
  const cerrarModalEquiposRaw = useCallback(() => {
    setModalEquipos(false)
    setEquipoForm({ id:null, nombre:'', descripcion:'', valor_adquisicion:'', valor_residual:'', vida_util_anos:5, allocation_mode:'general', rate_basis:'hora', capacidad_mes:176, grupo:'cif', categorias:[] })
  }, [])
  const closeModalEquipos = useHistoryLayer(!!modalEquipos, cerrarModalEquiposRaw, 'equipos-depreciacion')
  const editarEquipo = (e) => {
    setEquipoForm({
      ...e,
      categorias: equipoLinks.filter(l => String(l.equipment_id) === String(e.id)).map(l => l.categoria),
    })
    setModalEquipos(true)
  }
  const guardarEquipo = async () => {
    if (!equipoForm.nombre.trim()) { toast('Escribe el nombre del equipo', 'warning'); return }
    const payload = {
      nombre: equipoForm.nombre.trim(), descripcion: equipoForm.descripcion || '',
      valor_adquisicion: parseFloat(equipoForm.valor_adquisicion) || 0,
      valor_residual: parseFloat(equipoForm.valor_residual) || 0,
      vida_util_anos: parseFloat(equipoForm.vida_util_anos) || 5,
      allocation_mode: equipoForm.allocation_mode,
      rate_basis: equipoForm.allocation_mode === 'categoria' ? equipoForm.rate_basis : null,
      capacidad_mes: equipoForm.allocation_mode === 'categoria' ? (parseFloat(equipoForm.capacidad_mes) || 0) : null,
      grupo: equipoForm.grupo || 'cif', activo: equipoForm.activo !== false, updated_at: new Date().toISOString(),
    }
    const r = equipoForm.id
      ? await supabase.from('equipment_assets').update(payload).eq('id', equipoForm.id).select('id').single()
      : await supabase.from('equipment_assets').insert(payload).select('id').single()
    if (r.error) { toast(r.error.message, 'error'); return }
    const id = r.data?.id || equipoForm.id
    await supabase.from('equipment_category_links').delete().eq('equipment_id', id)
    if (payload.allocation_mode === 'categoria' && equipoForm.categorias.length) {
      const { error } = await supabase.from('equipment_category_links').insert(equipoForm.categorias.map(categoria => ({ equipment_id:id, categoria })))
      if (error) { toast(error.message, 'error'); return }
    }
    qc.invalidateQueries({ queryKey: ['equipment_assets'] }); qc.invalidateQueries({ queryKey: ['equipment_category_links'] })
    limpiarEquipoForm(); toast('Equipo guardado ✓')
  }
  const eliminarEquipo = async (e) => {
    if (!await confirmar(`¿Eliminar el equipo "${e.nombre}"?`)) return
    const { error } = await supabase.from('equipment_assets').delete().eq('id', e.id)
    if (error) { toast(error.message, 'error'); return }
    qc.invalidateQueries({ queryKey: ['equipment_assets'] }); qc.invalidateQueries({ queryKey: ['equipment_category_links'] }); toast('Equipo eliminado')
  }

  // ---- CIF helpers ----
  // El CIF total = solo ítems clasificados como 'cif' (arriendo planta, servicios de producción...)
  // + nómina automática del personal de PRODUCCIÓN. Gastos admin/ventas/financieros/impuestos y
  // pasivos NO entran aquí — se ven en el bloque de Gastos operacionales más abajo.
  const cifItemsCIF = cifItems.filter(c => (c.grupo || 'cif') === 'cif')
  const cifManual = getCIFTotalMensual(cifItemsCIF)
  const depreciacionGeneral = equipos
    .filter(e => e.activo !== false && e.allocation_mode === 'general' && (e.grupo || 'cif') === 'cif')
    .reduce((s, e) => s + getDepreciacionMensualEquipo(e), 0)
  const cifTotal = cifManual + costoNomina.total + depreciacionGeneral
  const empleadosProduccion = empleados.filter(e => (e.area_costeo || 'produccion') === 'produccion')
  const operariosActivos = (parseFloat(op.numOperarios) || 0) > 0 ? parseFloat(op.numOperarios) : (empleadosProduccion.length || 3)
  const costoMin = getCostoMinuto(cifTotal, operariosActivos, op.dias, op.jornadaHoras, op.improductividad)
  // Minutos productivos disponibles al mes (denominador del costo/minuto)
  const minsDisponibles = operariosActivos * (parseFloat(op.dias) || 0) * (parseFloat(op.jornadaHoras) || 0) * 60 * (1 - (parseFloat(op.improductividad) || 0))
  // Solo los productos ACTIVOS participan en la distribución del CIF (los inactivos no producen,
  // así no desacomodan el costo/CIF de los demás).
  const productosActivos = productos.filter(p => p.activo !== false)

  // Unidades/mes totales del portafolio activo (para % CIF en vivo)
  const totalUnidsPortafolio = productosActivos.reduce((s, p) => s + (p.bache * p.baches_mes * (1 - (p.merma||0)/100)), 0)

  // Listado de fichas agrupado por tipo/categoría (orden de tipos configurados, luego alfabético)
  const productosAgrupados = useMemo(() => {
    const map = new Map()
    for (const p of productos) {
      const t = p.tipo || 'otro'
      if (!map.has(t)) map.set(t, [])
      map.get(t).push(p)
    }
    const orden = opcionesTipo
    const keys = [...map.keys()].sort((a, b) => {
      const ia = orden.indexOf(a), ib = orden.indexOf(b)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return 1
      return String(a).localeCompare(String(b), 'es')
    })
    return keys.map(tipo => ({
      tipo,
      label: tipoLabel(tipo),
      items: map.get(tipo).slice().sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')),
    }))
  }, [productos, opcionesTipo])

  // Precio vigente de un ingrediente: si viene de la lista (mpId) usa el precio ACTUAL de la MP
  // (canónico por Kg) para que el costo y el margen se actualicen solos al cambiar el precio de la MP.
  const precioActualIng = (ing) => {
    // Si el usuario editó el costo en la ficha (override), se respeta ese valor;
    // si no, se usa el precio actual de la MP del inventario.
    if (ing.mpId && !ing.precioOverride) {
      const mp = mps.find(m => String(m.id) === String(ing.mpId))
      if (mp) return mp.precio
    }
    return parseFloat(ing.precio) || 0
  }

  // Recalcula EN VIVO el costo de un producto guardado usando el portafolio y los PRECIOS de MP actuales.
  const recomputeProducto = (p) => {
    const parse = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return [] } }
    const otros = productosActivos.filter(x => x.id !== p.id)   // solo activos reparten CIF; evita doble conteo
    const ings = parse(p.ingredientes).map(i => ({ ...i, precio: precioActualIng(i) }))
    const procesosProducto = parse(p.procesos)
    const unidsBacheEquipo = (parseFloat(p.bache) || 0) * (1 - (parseFloat(p.merma) || 0) / 100)
    const equipo = getEquipoUnitProducto({
      equipos, links: equipoLinks, tipo: p.tipo, categorias: parse(p.categorias),
      procesos: procesosProducto, unidsBache: unidsBacheEquipo, jornadaHoras: op.jornadaHoras,
    })
    return calcularCostosProducto({
      bache:        parseFloat(p.bache)        || 1,
      bachesMes:    parseFloat(p.baches_mes)   || 1,
      merma:        parseFloat(p.merma)         || 0,
      comision:     parseFloat(p.comision)      || 0,
      precioMayor:  parseFloat(p.precio_mayor)  || 0,
      precioDetal:  parseFloat(p.precio_detal)  || 0,
      ingredientes: ings, procesos: procesosProducto, empaque: parse(p.empaque),
      cifTotal, productosGuardados: otros, cifUnidadesFallback, operariosActivos,
      diasHabiles: op.dias, jornadaHoras: op.jornadaHoras, improductividad: op.improductividad,
      adicionales: parse(p.costos_adicionales),
      costosHora: parse(p.costos_hora),
      equipoUnit: equipo.total,
    })
  }

  // Gastos FIJOS del período (admin, ventas, financieros). No encarecen el COSTO del producto,
  // pero sí deben recuperarse en el precio y cubrirse en el punto de equilibrio.
  // El ICA va en Impuestos del período (no en la ficha ni en este total fijo).
  // Se declara antes de los cálculos que lo usan (punto de equilibrio y precio sugerido).
  const gastosFijosOper = gastosOp.administracion.total + gastosOp.ventas.total + gastosOp.financiero.total

  // Solo fichas realmente vendibles: no entran MP ni subproductos internos (uso en planta).
  const esProductoVendible = (p) => {
    const t = String(p?.tipo || '').toLowerCase()
    return t !== 'mp' && t !== 'subproducto'
  }

  // Punto de equilibrio multiproducto (CF / MCPT × participación) sobre el portafolio vendible activo
  const peqMultiproducto = useMemo(() => {
    const items = productosActivos.filter(esProductoVendible).map(p => ({
      nombre: p.nombre, precio_mayor: parseFloat(p.precio_mayor) || 0,
      // Margen de contribución = precio − costo VARIABLE (MP + empaque). Usar el costo total
      // (que ya incluye los fijos repartidos) descontaría los costos fijos dos veces y
      // sobreestimaría el punto de equilibrio.
      cvu: recomputeProducto(p).cvu,
      bache: parseFloat(p.bache) || 0, baches_mes: parseFloat(p.baches_mes) || 0, merma: parseFloat(p.merma) || 0,
    }))
    // El punto de equilibrio debe cubrir TODOS los costos fijos, no solo el CIF: si se omiten
    // los gastos de administración, ventas y financieros, sale un mínimo de venta que en
    // realidad deja pérdida.
    return getPEqMultiproducto(items, cifTotal + gastosFijosOper)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, cifTotal, mps, gastosFijosOper])

  const produccionMesPorProducto = useMemo(() => {
    const normalizar = (v) => String(v || '').trim().toLocaleLowerCase('es')
    const productoPorId = new Map(productos.map(p => [String(p.id), p]))
    const productoPorNombre = new Map(productos.map(p => [normalizar(p.nombre), p]))
    const acumulado = new Map()

    const resolverProducto = (orden) => {
      if (orden.origen === 'producto' && orden.origen_id != null) {
        const porId = productoPorId.get(String(orden.origen_id))
        if (porId) return porId
      }
      return productoPorNombre.get(normalizar(orden.producto))
    }
    const sumar = (producto, unidades, baches) => {
      if (!producto) return
      const actual = acumulado.get(String(producto.id)) || { unidades: 0, baches: 0, ordenes: 0 }
      actual.unidades += unidades
      actual.baches += baches
      actual.ordenes += 1
      acumulado.set(String(producto.id), actual)
    }

    // Cada orden cerrada se cuenta una sola vez. Si guardó baches_plan, ese es el dato más
    // preciso; si no, se infiere desde el resultado real (o la cantidad planeada como respaldo).
    for (const orden of ordenesProduccionAnalisis) {
      if (orden.es_prueba || !['ejecutada', 'aprobada'].includes(orden.estado)) continue
      const fechaOrden = String(orden.fecha_prod || orden.fecha_envio || orden.created_at || '').slice(0, 10)
      if (fechaOrden < mesAnterior.desde || fechaOrden >= mesAnterior.hasta) continue
      const producto = resolverProducto(orden)
      if (!producto) continue
      const bachesPlan = Number(orden.baches_plan) || 0
      const unidades = Number(orden.cantidad_result) || Number(orden.cantidad_plan) || 0
      const unidadesBache = (Number(producto.bache) || 0) * (1 - (Number(producto.merma) || 0) / 100)
      const baches = bachesPlan > 0 ? bachesPlan : (unidadesBache > 0 ? unidades / unidadesBache : 0)
      sumar(producto, unidades, baches)
    }
    return acumulado
  }, [mesAnterior.desde, mesAnterior.hasta, ordenesProduccionAnalisis, productos])

  const costosRecientesPorProducto = useMemo(() => {
    const porProducto = new Map()
    for (const orden of ordenesProduccionAnalisis) {
      if (orden.es_prueba || !['ejecutada', 'aprobada'].includes(orden.estado) || orden.origen !== 'producto' || orden.origen_id == null) continue
      const producto = productos.find(p => String(p.id) === String(orden.origen_id))
      if (!producto) continue

      const lotesUsados = Array.isArray(orden.lotes_mp) && orden.lotes_mp.length
        ? orden.lotes_mp
        : (Array.isArray(orden.lotes_reservados) ? orden.lotes_reservados : [])
      const mpPepsTotal = lotesUsados.reduce((sum, item) => {
        const lotes = Array.isArray(item.lotes) ? item.lotes : []
        const costoLotes = lotes.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.costo_unitario) || 0), 0)
        const precioRef = Number(mps.find(mp => String(mp.id) === String(item.mp_id))?.precio) || 0
        return sum + costoLotes + (Number(item.sin_lote_cantidad) || 0) * precioRef
      }, 0)
      const destajo = (Array.isArray(orden.destajo) ? orden.destajo : []).reduce((s, d) => s + (Number(d.cantidad) || 0) * (Number(d.tarifa) || 0), 0)
      const tiempo = (Array.isArray(orden.costos_adicionales_hora) ? orden.costos_adicionales_hora : [])
        .reduce((s, c) => s + (Number(c.total) || (Number(c.cantidad) || 0) * (Number(c.tarifa) || 0)), 0)
      const cantidad = Number(orden.cantidad_result) || 0
      if (!(cantidad > 0)) continue

      // Baseline = COSTO DE PRODUCCIÓN/u de la ficha (MP + empaque + MO + CIF), recalculado en vivo.
      const rc = recomputeProducto(producto)
      const minutosReales = minutosProcesoOrden({
        inicio: orden.inicio, fin: orden.fin,
        procesos_tiempos: orden.procesos_tiempos, modo_avanzado: orden.modo_avanzado,
      })
      const calc = calcularCostoProduccionOrden({
        cantidadObtenida: cantidad,
        mpPepsTotal,
        destajoTotal: destajo,
        costosTiempoTotal: tiempo,
        minutosReales,
        mpUnit: rc.mpUnit, empUnit: rc.empUnit, moUnit: rc.moUnit,
        adicUnit: rc.adicUnit, equipoUnit: rc.equipoUnit,
        costoTotalUnit: rc.costoTotalUnit, totalMinutos: rc.totalMinutos, costoMin: rc.costoMin,
        bache: parseFloat(producto.bache) || 0, merma: parseFloat(producto.merma) || 0,
      })
      if (!(calc.costo_real_unit > 0)) continue

      const arr = porProducto.get(String(producto.id)) || []
      if (arr.length < 3) {
        const adicEqUnit = (Number(rc.adicUnit) || 0) + (Number(rc.equipoUnit) || 0)
        arr.push({
          ordenId: orden.id,
          producto: orden.producto || producto.nombre,
          costo: calc.costo_real_unit,
          costoFicha: calc.costo_ficha_unit,
          desviacion: Number.isFinite(calc.desviacion_pct) ? calc.desviacion_pct : 0,
          fecha: orden.fecha_prod || orden.fecha_envio || orden.created_at,
          cantidad,
          cantidadPlan: Number(orden.cantidad_plan) || 0,
          mpTotal: calc.mp_total,
          empTotal: calc.emp_total,
          moTotal: calc.mo_total,
          adicTotal: calc.adic_total,
          conversion: calc.conversion_total,
          destajo: calc.destajo_total,
          tiempo: calc.costos_tiempo_total,
          minutosReales: calc.minutos_reales,
          minutosEsperados: calc.minutos_esperados,
          costoTotal: calc.costo_real_total,
          // Desglose ficha (por unidad) para tabla comparativa
          ficha: {
            mp: Number(rc.mpUnit) || 0,
            emp: Number(rc.empUnit) || 0,
            mo: Number(rc.moUnit) || 0,
            adic: adicEqUnit,
            tiempo: Number(rc.tiempoUnit) || 0,
            total: Number(rc.costoTotalUnit) || 0,
            minutos: Number(rc.totalMinutos) || 0,
          },
          // Desglose orden (por unidad)
          ordenU: {
            mp: cantidad > 0 ? calc.mp_total / cantidad : 0,
            emp: cantidad > 0 ? calc.emp_total / cantidad : 0,
            mo: cantidad > 0 ? calc.mo_total / cantidad : 0,
            adic: cantidad > 0 ? calc.adic_total / cantidad : 0,
            destajo: cantidad > 0 ? calc.destajo_total / cantidad : 0,
            tiempo: cantidad > 0 ? calc.costos_tiempo_total / cantidad : 0,
            total: calc.costo_real_unit,
          },
          costosHora: Array.isArray(orden.costos_adicionales_hora) ? orden.costos_adicionales_hora : [],
          destajoItems: Array.isArray(orden.destajo) ? orden.destajo : [],
          lotesMp: lotesUsados,
        })
        porProducto.set(String(producto.id), arr)
      }
    }
    return porProducto
  // recomputeProducto depende de precios/CIF/equipos; estos deps cubren ese recálculo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mps, ordenesProduccionAnalisis, productos, cifTotal, equipos, equipoLinks, operariosActivos, op.dias, op.jornadaHoras, op.improductividad])

  // Indicadores REALES de un producto guardado: costo pleno (producción + gastos del período) y
  // utilidad neta (tras comisión). Sin ICA: ese impuesto es del período, no de la ficha.
  const indicadoresProducto = (p, rc) => {
    const pMayor = parseFloat(p.precio_mayor) || 0
    const cPleno = rc.costoTotalUnit * (1 + tasaGastosOper)
    const comU = pMayor * ((parseFloat(p.comision) || 0) / 100)
    const utilNeta = pMayor - comU - cPleno
    const unidsMes = (parseFloat(p.bache) || 0) * (parseFloat(p.baches_mes) || 0) * (1 - (parseFloat(p.merma) || 0) / 100)
    const utilidadBruta = pMayor - rc.costoTotalUnit
    return {
      pMayor, cPleno, utilNeta, unidsMes, utilidadBruta,
      margenBrutoPct: pMayor > 0 ? (utilidadBruta / pMayor) * 100 : null,
      utilNetaPct: pMayor > 0 ? (utilNeta / pMayor) * 100 : null,
      utilMes: utilNeta * unidsMes,
    }
  }

  // ---- Base para el PRECIO sugerido (costeo por absorción) ----
  // Los gastos fijos se prorratean sobre el costo de producción mensual del portafolio activo.
  const costoProduccionPortafolio = useMemo(() => productosActivos.reduce((s, p) => {
    const unidsMes = (parseFloat(p.bache) || 0) * (parseFloat(p.baches_mes) || 0) * (1 - (parseFloat(p.merma) || 0) / 100)
    return s + recomputeProducto(p).costoTotalUnit * unidsMes
  }, 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [productos, cifTotal, mps])
  const tasaGastosOper = getTasaGastosOper(gastosFijosOper, costoProduccionPortafolio)

  // ---- Absorción REAL del CIF (por tiempo de proceso, que es como se costea) ----
  const cifAbsorcion = useMemo(() => getCIFAbsorcion(
    productosActivos.map(p => {
      const rc = recomputeProducto(p)
      return { nombre: p.nombre, tipo: p.tipo, minutosBache: rc.totalMinutos || 0, bachesMes: parseFloat(p.baches_mes) || 0, unidsMes: rc.unidsMesTot || 0 }
    }), costoMin, cifTotal, minsDisponibles)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [productos, cifTotal, mps, costoMin, minsDisponibles])

  // ---- Ingredientes con cantidad y precio resueltos ----
  // Las filas "relativo a" calculan su g/bache = (g/bache de la base) × (% / 100)
  // El precio de las filas de lista se toma del precio ACTUAL de la MP.
  const ingredientesEff = useMemo(() => {
    // g/bache de un NORMAL: directo (modo gramos) o derivado de su % × peso total del bache (modo %)
    const pesoTot = parseFloat(pesoBacheTotal) || 0
    const gNormal = (r) => modoIng === 'porcentaje' ? ((parseFloat(r.pct)||0)/100) * pesoTot : (parseFloat(r.cantidad)||0)
    // g/bache de un RELATIVO: su % aplicado sobre la suma de sus bases (que siempre son normales)
    const gRelativo = (r) => {
      const bases = Array.isArray(r.base) ? r.base.filter(Boolean) : (r.base ? [r.base] : [])
      const baseCant = bases.reduce((s, bn) => {
        const br = ingredientes.find(x => x.nombre === bn && x.tipo !== 'relativo')
        return s + (br ? gNormal(br) : 0)
      }, 0)
      return baseCant * (parseFloat(r.pct)||0) / 100
    }
    // El % de receta se mide contra el TOTAL de la mezcla (normales + TODOS los relativos).
    // Antes cada fila usaba un denominador distinto (los normales ignoraban a los relativos y
    // cada relativo solo se sumaba a sí mismo), así que los % no sumaban 100 y el escalado
    // desde el ingrediente ancla subestimaba el tamaño del bache.
    const normalTotal = ingredientes.reduce((s, r) => r.tipo === 'relativo' ? s : s + gNormal(r), 0)
    const totalReceta = normalTotal + ingredientes.reduce((s, r) => r.tipo === 'relativo' ? s + gRelativo(r) : s, 0)
    return ingredientes.map(r => {
      const precio = precioActualIng(r)
      const cant = r.tipo === 'relativo' ? gRelativo(r) : gNormal(r)
      return { ...r, precio, cantidad: cant, pctReceta: totalReceta > 0 ? cant / totalReceta * 100 : 0 }
    })
  }, [ingredientes, mps, modoIng, pesoBacheTotal])

  // Total de gramos por bache (suma de cantidades resueltas) y unidades estimadas desde la receta:
  // unidades/bache = (Σ g/bache × rendimiento% × (1 − desperdicio%)) ÷ peso_unidad
  const totalGramosBache = ingredientesEff.reduce((s, i) => s + (parseFloat(i.cantidad)||0), 0)
  const unidadesDesdeReceta = (parseFloat(pesoUnidad)||0) > 0
    ? (totalGramosBache * (parseFloat(rendimiento)||0)/100 * (1 - (parseFloat(desperdicio)||0)/100)) / parseFloat(pesoUnidad)
    : 0

  // ---- Recalcular costos del formulario ----
  // Al editar, se EXCLUYE el propio producto del portafolio para no contarlo dos veces en U
  const recalcular = useCallback(() => {
    const portafolio = productosActivos.filter(p => p.id !== editingId)
    const equipo = getEquipoUnitProducto({
      equipos, links: equipoLinks, tipo: formProd.tipo, categorias, procesos,
      unidsBache: (parseFloat(formProd.bache) || 0) * (1 - (parseFloat(formProd.merma) || 0) / 100),
      jornadaHoras: op.jornadaHoras,
    })
    setCalcResult(calcularCostosProducto({
      bache:        parseFloat(formProd.bache)       || 1,
      bachesMes:    parseFloat(formProd.baches_mes)  || 1,
      merma:        parseFloat(formProd.merma)        || 0,
      comision:     parseFloat(formProd.comision)     || 0,
      precioMayor:  parseFloat(formProd.precio_mayor) || 0,
      precioDetal:  parseFloat(formProd.precio_detal) || 0,
      ingredientes: ingredientesEff, procesos, empaque,
      cifTotal, productosGuardados: portafolio,
      cifUnidadesFallback, operariosActivos,
      diasHabiles: op.dias, jornadaHoras: op.jornadaHoras, improductividad: op.improductividad,
      adicionales,
      costosHora,
      equipoUnit: equipo.total,
    }))
  }, [formProd, ingredientesEff, procesos, empaque, cifTotal, productos, editingId, cifUnidadesFallback, operariosActivos, op, adicionales, costosHora, categorias, equipos, equipoLinks])

  useEffect(() => { recalcular() }, [recalcular])

  // Al llegar desde una MP vendible: abre una ficha NUEVA prellenada con su nombre y precio de venta
  useEffect(() => {
    const st = location.state
    if (!st?.nuevaFichaNombre) return
    setEditingId(null); setSelFuente('')
    setIngredientes([]); setProcesos([]); setEmpaque([])
    // Si viene de una MP vendible, la ficha se marca AUTOMÁTICAMENTE como tipo 'mp' y se vincula a la MP
    setFormProd({ ...EMPTY_PROD, nombre: st.nuevaFichaNombre, precio_mayor: st.nuevaFichaPrecio || EMPTY_PROD.precio_mayor,
      ...(st.nuevaFichaMpId ? { tipo: 'mp', mp_id: st.nuevaFichaMpId, presentacion: st.nuevaFichaUnidad || 'Unidad' } : {}) })
    setTab('nuevo')
    consumeArrival()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const parseJSON = (v, def) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return def } }

  // ---- Limpiar formulario ----
  const limpiarForm = () => {
    setFormProd(EMPTY_PROD); setIngredientes([]); setProcesos([]); setEmpaque([])
    setImagenes([]); setRendimiento(62); setDesperdicio(2); setPesoUnidad(1000)
    setPorciona(false); setPesoSubporcion(''); setModoIng('gramos'); setPesoBacheTotal('')
    setBrix(75); setBrixAplica(false); setParamsCalidad([]); setCamposExtra([])
    setCategorias([]); setAdicionales([]); setAdicOpen(false); setCostosHora([]); setImprimibles([])
    setFichaFile(null); setFichaNombre(''); setFichaPath('')
    setEditingId(null); setSelFuente('')
  }

  const volverAListaFichas = () => { limpiarForm(); setTab('lista') }
  // Editar/nueva ficha = subpágina: Atrás del navegador vuelve a la lista
  const closeFicha = useHistoryLayer(tab === 'nuevo', volverAListaFichas, 'ficha-edit')

  /** Abre el detalle de esa orden en Órdenes (reemplaza el modal actual en el historial) */
  const abrirOrdenDesdeDetalle = (ordenId) => {
    if (ordenId == null || ordenId === '') return
    navigate('/ordenes', { replace: true, state: { verOrden: ordenId } })
  }

  // ---- Dispatcher del selector: producto (editar) o receta rápida (convertir a producto) ----
  const cargarFuente = (value) => {
    if (!value) { limpiarForm(); return }
    const [tipo, idStr] = value.split('-')
    if (tipo === 'prod')   cargarProducto(idStr)
    if (tipo === 'recipe') cargarRecetaComoProducto(idStr)
  }

  // ---- Cargar receta rápida → se convierte en producto base nuevo al guardar ----
  const cargarRecetaComoProducto = (id) => {
    const r = recetas.find(x => String(x.id) === String(id))
    if (!r) return
    const ings = parseJSON(r.ingredientes, [])

    // Calcular los gramos por ingrediente para que la columna g/bache (y el % derivado) tengan valores.
    // 1º intenta con el ancla de la receta; si no hay, usa los % como gramos (lote de referencia).
    const gramosPorNombre = {}
    if (r.ancla && (parseFloat(r.cantidad_ancla)||0) > 0) {
      const calcIngs = ings.map(i => ({ nombre: i.nombre, pct: parseFloat(i.pct)||0, precio: parseFloat(i.precio)||0, presentacion: parseFloat(i.presentacion)||1000, tipo: i.tipo||'normal', base: i.base||'total' }))
      const res = calcularReceta({ ingredientes: calcIngs, ancla: r.ancla, cantidadAncla: parseFloat(r.cantidad_ancla)||0, rendimiento: r.rendimiento, desperdicio: r.desperdicio, pesoUnidad: r.peso_unidad })
      if (res) res.calculados.forEach(c => { gramosPorNombre[c.nombre] = c.cantidad })
    }

    setEditingId(null)              // se guardará como producto NUEVO (receta base)
    setSelFuente(`recipe-${r.id}`)
    setFormProd({ ...EMPTY_PROD, nombre: r.nombre || '' })
    setIngredientes(ings.map(i => {
      const esRel = (i.tipo || 'normal') === 'relativo'
      // gramos: explícito → calculado por ancla → % como gramos (solo normales)
      let cantidad = i.cantidad || i.gramos || ''
      if (!cantidad && !esRel) {
        const g = gramosPorNombre[i.nombre]
        cantidad = g != null ? g.toFixed(1) : (i.pct || '')
      }
      return {
        ...EMPTY_ING, _id: Date.now() + Math.random(),
        mpId: i.mpId||'', nombre: i.nombre||'', modo: i.mpId ? 'lista' : 'manual',
        precio: i.precio||'', presentacion: i.presentacion||1000,
        pct: i.pct||'',
        cantidad: esRel ? '' : cantidad,   // las relativas derivan su cantidad de la base
        tipo: i.tipo||'normal', base: i.base||'',
      }
    }))
    setProcesos([]); setEmpaque([])   // el usuario agrega MO y empaque
    setRendimiento(r.rendimiento || 62); setDesperdicio(r.desperdicio ?? 2); setPesoUnidad(r.peso_unidad || 1000)
    setBrix(r.brix || 75); setBrixAplica(!!r.brix_aplica)
    setImagenes(r.imagen_url ? [r.imagen_url] : [])
    setFichaNombre(r.ficha_nombre || ''); setFichaPath(r.ficha_url || ''); setFichaFile(null)
    setTab('nuevo')
    toast(`Receta "${r.nombre}" cargada — agrega MO/empaque y guárdala como producto`)
  }

  // ---- Cargar producto existente para editar ----
  const cargarProducto = (id) => {
    if (!id) { limpiarForm(); return }
    const p = productos.find(x => x.id === parseInt(id))
    if (!p) return
    setEditingId(p.id)
    setSelFuente(`prod-${p.id}`)
    setFormProd({ nombre: p.nombre, tipo: p.tipo, bache: p.bache, baches_mes: p.baches_mes, merma: p.merma, comision: p.comision, precio_mayor: p.precio_mayor, precio_detal: p.precio_detal, presentacion: p.presentacion || 'Unidad', activo: p.activo !== false, mp_id: p.mp_id || '', vida_util_valor: p.vida_util_valor || '', vida_util_unidad: p.vida_util_unidad || 'meses', descripcion: p.descripcion || '', empaca_surtido: !!p.empaca_surtido, metodo_loteo: normalizarMetodoLoteo(p.metodo_loteo),
      utilidad_objetivo: p.utilidad_objetivo ?? '', iva_pct: p.iva_pct ?? '', imp_saludable_pct: p.imp_saludable_pct ?? '', ibua_valor: p.ibua_valor ?? '' })
    setCamposExtra(parseJSON(p.campos_personalizados, []))
    setCategorias(parseJSON(p.categorias, []))
    const adic = parseJSON(p.costos_adicionales, [])
    setAdicionales(adic.map(a => ({ ...a, _id: Date.now() + Math.random() })))
    const horas = parseJSON(p.costos_hora, []).map(c => ({ ...c, _id: Date.now() + Math.random() }))
    setCostosHora(horas)
    setAdicOpen(adic.length > 0 || horas.length > 0)
    setIngredientes(parseJSON(p.ingredientes, []).map(i => ({ ...EMPTY_ING, _id: Date.now() + Math.random(), mpId: i.mpId||'', nombre: i.nombre||'', modo: i.mpId ? 'lista' : 'manual', precio: i.precio||'', precioOverride: !!i.precioOverride, presentacion: i.presentacion||1000, pct: i.pct||'', cantidad: i.cantidad||'', tipo: i.tipo||'normal', base: i.base||'' })))
    setProcesos(parseJSON(p.procesos, []).map(pr => ({ ...pr, _id: Date.now() + Math.random() })))
    setEmpaque(parseJSON(p.empaque, []).map(e => ({ ...e, _id: Date.now() + Math.random() })))
    setRendimiento(p.rendimiento || 62); setDesperdicio(p.desperdicio ?? 2); setPesoUnidad(p.peso_unidad || 1000)
    setPorciona(!!p.porciona); setPesoSubporcion(p.peso_subporcion || '')
    setBrix(p.brix || 75); setBrixAplica(!!p.brix_aplica)
    setParamsCalidad(parseJSON(p.parametros_calidad, []))
    setImagenes((() => { try { const a = Array.isArray(p.imagenes) ? p.imagenes : JSON.parse(p.imagenes || '[]'); return a.length ? a : (p.imagen_url ? [p.imagen_url] : []) } catch { return p.imagen_url ? [p.imagen_url] : [] } })())
    setImprimibles(parseJSON(p.imprimibles, []))
    setFichaNombre(p.ficha_nombre || ''); setFichaPath(p.ficha_url || ''); setFichaFile(null)
    setTab('nuevo')
    toast(`"${p.nombre}" cargado para edición`)
  }

  // ---- Guardar/Actualizar producto ----
  const saveProducto = useMutation({
    mutationFn: async ({ actualizarMP = false, cambiosMP = [] } = {}) => {
      if (!formProd.nombre.trim()) throw new Error('Ingresa el nombre del producto')
      const r = calcResult || {}
      // MPs cuyo precio se replicará al inventario (y por ende a todas las recetas)
      const mpsCambiadas = new Set((actualizarMP ? cambiosMP : []).map(c => String(c.mpId)))

      // Imágenes: ya se subieron al elegirlas; la PRIMERA de la galería es la principal.
      // alt + nombre de archivo = nombre del producto (SEO)
      const imagenesSeo = conAltProducto(imagenes, formProd.nombre)
      const imagenUrl = imagenesSeo[0]?.url || ''

      // Subir ficha técnica
      let fichaPathFinal = fichaPath
      if (fichaFile) {
        const ext = fichaFile.name.split('.').pop()
        fichaPathFinal = `fichas/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('technical-sheets').upload(fichaPathFinal, fichaFile, { upsert: true })
        if (upErr) throw upErr
      }

      // Persistir cantidad resuelta + pct.
      // - cantidad: g/bache resuelto (usado por el cálculo de costos en la lista de productos)
      // - pct: en RELATIVOS guardamos el % SOBRE LA BASE (valor original del usuario), porque al
      //   editar se recalcula la cantidad a partir de la base; en NORMALES guardamos el % de receta.
      const ingredientesConPct = ingredientesEff.map(i => {
        const esRel = (i.tipo || 'normal') === 'relativo'
        return {
          mpId: i.mpId || '', nombre: i.nombre || '', modo: i.modo || 'lista',
          // Si el precio se replicó al inventario, deja de ser override: la ficha pasa a seguir el precio canónico de la MP
          precio: i.precio || '', presentacion: i.presentacion || 1000, precioOverride: mpsCambiadas.has(String(i.mpId)) ? false : !!i.precioOverride,
          tipo: i.tipo || 'normal', base: i.base || '',
          cantidad: i.cantidad ? Number(i.cantidad).toFixed(1) : '',
          pct: esRel ? (i.pct || '') : (i.pctReceta ? i.pctReceta.toFixed(3) : ''),
        }
      })

      const datos = {
        ...formProd,
        mp_id: formProd.mp_id ? parseInt(formProd.mp_id) : null,
        bache: parseFloat(formProd.bache) || 70,
        baches_mes: parseFloat(formProd.baches_mes) || 1,
        merma: parseFloat(formProd.merma) || 0,
        // Comisión permite 0 (sin comisión): no usar "|| 3" que convertiría el 0 en 3.
        comision: isNaN(parseFloat(formProd.comision)) ? 3 : parseFloat(formProd.comision),
        precio_mayor: parseFloat(formProd.precio_mayor) || 0,
        precio_detal: parseFloat(formProd.precio_detal) || 0,
        vida_util_valor: parseFloat(formProd.vida_util_valor) || null,
        vida_util_unidad: formProd.vida_util_valor ? (formProd.vida_util_unidad || 'meses') : null,
        descripcion: (formProd.descripcion || '').trim() || null,
        ingredientes: JSON.stringify(ingredientesConPct),
        procesos: JSON.stringify(procesos),
        empaque: JSON.stringify(empaque),
        costo_final: r.costoFinal || 0,
        costo_variable: r.cvu || 0,
        cif_unit: r.cifUnit || 0,
        util_mayor: r.utilMayor || 0,
        util_detal: r.utilDetal || 0,
        pe: r.pe || 0,
        rendimiento: parseFloat(rendimiento) || 62,
        // Desperdicio permite 0 (sin desperdicio adicional): no usar "|| 2" que convertiría el 0 en 2.
        desperdicio: isNaN(parseFloat(desperdicio)) ? 0 : parseFloat(desperdicio),
        peso_unidad: parseFloat(pesoUnidad) || 1000,
        porciona, peso_subporcion: porciona ? (parseFloat(pesoSubporcion) || 0) : null,
        brix: parseFloat(brix) || 75,
        brix_aplica: brixAplica,
        parametros_calidad: paramsCalidad.filter(pc => pc.nombre?.trim()),
        campos_personalizados: camposExtra.filter(c => c.nombre?.trim()),
        imagen_url: imagenUrl || '',
        ficha_nombre: fichaNombre || '',
        ficha_url: fichaPathFinal || '',
        fecha_creado: new Date().toISOString().split('T')[0],
      }
      // Los parámetros de precio se escriben APARTE (más abajo, tolerante a que falte la
      // migración v130). Aquí hay que quitarlos: `...formProd` los arrastra en crudo y una
      // cadena vacía en una columna numérica hace fallar todo el guardado con
      // "invalid input syntax for type numeric".
      delete datos.utilidad_objetivo
      delete datos.iva_pct
      delete datos.imp_saludable_pct
      delete datos.ibua_valor
      delete datos.empaca_surtido
      // metodo_loteo (v150/v155): NUNCA en el update principal — si la columna no existe
      // tumba todo el guardado. Se escribe aparte y se verifica con lectura.
      delete datos.metodo_loteo

      if (editingId) {
        // Detectar cambios en cantidades/costos de ingredientes para guardar histórico
        const old = productos.find(x => x.id === editingId)
        const sig = (arr) => (arr || []).map(i => `${i.nombre}|${i.cantidad}|${i.precio}`).sort().join(';')
        const oldIngs = parseJSON(old?.ingredientes, [])
        const huboCambio = sig(oldIngs) !== sig(ingredientesConPct)
        const { error } = await supabase.from('products_costing').update(datos).eq('id', editingId)
        if (error) throw error
        if (huboCambio) {
          try {
            await supabase.from('product_cost_history').insert({
              product_id: editingId,
              snapshot: ingredientesEff.map(i => {
                const mp = mps.find(m => String(m.id) === String(i.mpId))
                const unidad = mp?.unidad || ''
                const costo = ((parseFloat(i.precio) || 0) / (parseFloat(i.presentacion) || 1000)) * (parseFloat(i.cantidad) || 0)
                // Además de los campos de visualización, se guardan los técnicos (mpId, modo, tipo...)
                // para poder RESTAURAR esta versión de la receta con fidelidad.
                return { nombre: i.nombre, cantidad: Number(i.cantidad || 0).toFixed(1), precio: parseFloat(i.precio) || 0, unidad, costo: Math.round(costo),
                  mpId: i.mpId || '', modo: i.modo || 'lista', presentacion: i.presentacion || 1000, precioOverride: !!i.precioOverride,
                  tipo: i.tipo || 'normal', base: i.base || '', pct: i.pct || '' }
              }),
              costo_mp: r.totalMPBache || 0, cvu: r.cvu || 0, costo_total: r.costoTotalUnit || 0,
              creado_por: profile?.nombre || '',
            })
          } catch { /* si la tabla no está, no bloquea el guardado */ }
        }
      } else {
        const { data: ins, error } = await supabase.from('products_costing').insert(datos).select('id').single()
        if (error) throw error
        datos._newId = ins?.id
      }

      // Categorías múltiples + costos adicionales — escritura aparte y tolerante (columnas v84 opcionales).
      try {
        const idFicha = editingId || datos._newId
        if (idFicha) await supabase.from('products_costing').update({
          categorias: categorias.filter(Boolean),
          costos_adicionales: adicionales.filter(a => a.descripcion?.trim() || a.valor).map(a => ({ descripcion: a.descripcion || '', valor: parseFloat(a.valor) || 0, base: a.base || 'unidad', ...(a.dep ? { dep: a.dep } : {}) })),
          empaca_surtido: !!formProd.empaca_surtido,
          costos_hora: costosHora.filter(c => c.nombre?.trim()).map(c => ({ nombre: c.nombre.trim(), unidad: c.unidad || 'hora', tarifa: parseFloat(c.tarifa) || 0, cantidad_default: parseFloat(c.cantidad_default) || 0 })),
          equipo_unit: r.equipoUnit || 0,
        }).eq('id', idFicha)
      } catch { /* columnas opcionales: no bloquea el guardado */ }
      // Método de loteo (v150/v155) — escritura aparte + verificación de lectura.
      try {
        const idFicha = editingId || datos._newId
        const payloadLoteo = normalizarMetodoLoteo(formProd.metodo_loteo)
        if (idFicha) {
          const { error: eLoteo } = await supabase.from('products_costing')
            .update({ metodo_loteo: payloadLoteo })
            .eq('id', idFicha)
          if (eLoteo) {
            datos._avisoLoteo = /metodo_loteo|column/i.test(eLoteo.message || '')
              ? 'No se guardó el método de loteo: falta la columna en SQL. Ejecuta en Supabase el archivo supabase/migration_v155_metodo_loteo.sql'
              : `No se guardó el método de loteo: ${eLoteo.message}`
          } else {
            // Confirmar que quedó en SQL (evita “lo veo en pantalla pero no en DB”)
            const { data: check, error: eCheck } = await supabase
              .from('products_costing')
              .select('metodo_loteo')
              .eq('id', idFicha)
              .maybeSingle()
            if (eCheck && /metodo_loteo|column/i.test(eCheck.message || '')) {
              datos._avisoLoteo = 'La columna metodo_loteo no existe en Supabase. Ejecuta migration_v155_metodo_loteo.sql y vuelve a guardar la ficha.'
            } else {
              const leido = normalizarMetodoLoteo(check?.metodo_loteo)
              const ok = payloadLoteo
                ? !!(leido && JSON.stringify(leido.partes) === JSON.stringify(payloadLoteo.partes))
                : !leido
              if (!ok) {
                datos._avisoLoteo = 'El método de loteo no quedó persistido en SQL (revisa permisos RLS o aplica migration_v155_metodo_loteo.sql).'
              } else {
                datos._loteoOk = leido ? describirPlantilla(leido) : null
              }
            }
          }
        }
      } catch (e) {
        datos._avisoLoteo = /metodo_loteo|column/i.test(e?.message || '')
          ? 'No se guardó el método de loteo: aplica migration_v155_metodo_loteo.sql en Supabase.'
          : (e?.message || 'Error al guardar método de loteo')
      }
      // Precio por ficha (utilidad objetivo propia, IVA, impuesto saludable) e imprimibles —
      // escritura aparte y tolerante (columnas v130 opcionales).
      try {
        const idFicha = editingId || datos._newId
        // Vacío → null (la columna es numérica y no acepta ''); utilidad_objetivo null significa
        // "usa la utilidad global de la empresa".
        const num = (v) => (v === '' || v == null ? null : (parseFloat(v) || 0))
        if (idFicha) {
          const { error } = await supabase.from('products_costing').update({
            utilidad_objetivo: num(formProd.utilidad_objetivo),
            iva_pct: num(formProd.iva_pct) ?? 0,
            imp_saludable_pct: num(formProd.imp_saludable_pct) ?? 0,
            ibua_valor: num(formProd.ibua_valor) ?? 0,
            imprimibles,
          }).eq('id', idFicha)
          // Si las columnas aún no existen (migración v130 sin correr) no se bloquea el guardado,
          // pero sí se avisa: si no, el usuario cree que guardó y esos datos se pierden en silencio.
          if (error) datos._avisoV130 = error.message
        }
      } catch (e) { datos._avisoV130 = e.message }
      // Galería de imágenes — escritura aparte y tolerante (columna v92 opcional).
      try {
        const idFicha = editingId || datos._newId
        if (idFicha) await supabase.from('products_costing').update({ imagenes: imagenesSeo }).eq('id', idFicha)
      } catch { /* columna opcional: no bloquea el guardado */ }

      // Actualiza el costo/precio/nombre en el catálogo de PRODUCTO TERMINADO SOLO SI ya fue
      // agregado allí manualmente (botón "Agregar producto" en Inventario de Producto Terminado).
      // La ficha NUNCA crea el producto terminado ni toca su SKU o su enlace con Alegra:
      // eso se configura exclusivamente en Inventario de Producto Terminado, porque el producto
      // que realmente se vende (ej. un surtido armado) puede ser distinto de esta ficha base.
      if ((formProd.tipo || '') !== 'subproducto' && editingId) {
        try {
          const { data: ya } = await supabase.from('finished_products').select('id, alegra_item_id').eq('product_id', editingId).maybeSingle()
          if (ya) {
            await supabase.from('finished_products').update({
              nombre: formProd.nombre.trim(),
              descripcion: (formProd.descripcion || '').trim() || null,
              costo_unitario: Math.round(r.costoFinal || 0),
              precio_mayor: parseFloat(formProd.precio_mayor) || 0,
              precio_detal: parseFloat(formProd.precio_detal) || 0,
              imagen_url: imagenUrl || null,
              activo: formProd.activo !== false,
            }).eq('id', ya.id)
            // Galería de imágenes (columna v92) — aparte y tolerante para no bloquear la sincronización
            try { await supabase.from('finished_products').update({ imagenes: imagenesSeo }).eq('id', ya.id) } catch { /* opcional */ }
            // Si ese terminado está enlazado a Alegra, empuja costo/precio/nombre automáticamente
            if (ya.alegra_item_id) { try { await supabase.functions.invoke('alegra-push-stock', { body: { finished_id: ya.id } }) } catch (e) { console.warn('No se pudo sincronizar con Alegra:', e) } }
          }
        } catch (e) { console.warn('No se pudo actualizar el catálogo de terminados:', e) }
      }

      // Replicar el nuevo costo de MP al inventario y a TODAS las recetas que usan ese ingrediente
      let recetasAfectadas = []
      if (actualizarMP && cambiosMP.length) {
        const mapNuevo = new Map(cambiosMP.map(c => [String(c.mpId), c.nuevo]))
        // 1) Inventario de Materias Primas (precio canónico por Kg)
        for (const c of cambiosMP) {
          await supabase.from('raw_materials').update({ precio: c.nuevo }).eq('id', c.mpId)
        }
        // 2) Propagar a cada producto/receta guardada que contenga esos ingredientes
        for (const p of productos) {
          if (p.id === editingId) continue   // el editado ya se guardó con sus datos arriba
          const ings = parseJSON(p.ingredientes, [])
          let changed = false
          const nuevosIngs = ings.map(i => {
            if (i.mpId && mapNuevo.has(String(i.mpId))) {
              const np = mapNuevo.get(String(i.mpId))
              if (Math.round(parseFloat(i.precio) || 0) !== Math.round(np)) changed = true
              // Replica el precio y quita el override para que siga el precio canónico de la MP
              return { ...i, precio: np, precioOverride: false }
            }
            return i
          })
          if (!changed) continue
          // Recalcular costos y márgenes del producto con el nuevo precio (CIF solo entre activos)
          const otros = productosActivos.filter(x => x.id !== p.id)
          const calc = calcularCostosProducto({
            bache: parseFloat(p.bache) || 1, bachesMes: parseFloat(p.baches_mes) || 1,
            merma: parseFloat(p.merma) || 0, comision: parseFloat(p.comision) || 0,
            precioMayor: parseFloat(p.precio_mayor) || 0, precioDetal: parseFloat(p.precio_detal) || 0,
            ingredientes: nuevosIngs, procesos: parseJSON(p.procesos, []), empaque: parseJSON(p.empaque, []),
            cifTotal, productosGuardados: otros, cifUnidadesFallback, operariosActivos,
            diasHabiles: op.dias, jornadaHoras: op.jornadaHoras, improductividad: op.improductividad,
            adicionales: parseJSON(p.costos_adicionales, []),
            costosHora: parseJSON(p.costos_hora, []),
          })
          await supabase.from('products_costing').update({
            ingredientes: JSON.stringify(nuevosIngs),
            costo_final: calc.costoFinal || 0, costo_variable: calc.cvu || 0, cif_unit: calc.cifUnit || 0,
            util_mayor: calc.utilMayor || 0, util_detal: calc.utilDetal || 0, pe: calc.pe || 0,
          }).eq('id', p.id)
          recetasAfectadas.push(p.nombre)
        }
      }
      const mpSelf = (cambiosMP || []).find(c => c.esSelf)
      return { recetasAfectadas, mpSelf, avisoV130: datos._avisoV130, avisoLoteo: datos._avisoLoteo, loteoOk: datos._loteoOk }
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products_costing'] })
      qc.invalidateQueries({ queryKey: ['product_cost_history'] })
      qc.invalidateQueries({ queryKey: ['raw_materials'] })
      qc.invalidateQueries({ queryKey: ['finished_products'] })
      qc.invalidateQueries({ queryKey: ['lotes_para_sugerencia'] })
      const n = res?.recetasAfectadas?.length || 0
      toast(editingId ? 'Producto actualizado ✓' : 'Producto guardado ✓')
      if (res?.avisoV130) toast('La ficha se guardó, pero el IVA / utilidad objetivo / imprimibles NO: falta correr la migración v130. (' + res.avisoV130 + ')', 'warning')
      if (res?.avisoLoteo) toast(res.avisoLoteo, 'error')
      else if (res?.loteoOk) toast(`Método de loteo guardado en SQL: ${res.loteoOk}`, 'success')
      if (res?.mpSelf) toast(`Costo de "${res.mpSelf.nombre}" guardado en Inventario MP: $${fNum(res.mpSelf.nuevo)}/${res.mpSelf.unidad || 'u'}`, 'success')
      if (n > 0) toast(`Precio replicado a ${n} receta(s): ${res.recetasAfectadas.join(', ')}`, 'success')
      closeFicha()
    },
    onError: (e) => toast(e.message, 'error'),
  })

  // Guardar la ficha; si se editó el costo de alguna MP de lista, el nuevo precio se replica
  // automáticamente al inventario de MP y a todas las recetas que usan ese ingrediente.
  const guardarFicha = async () => {
    const cambiosMP = ingredientes
      .filter(i => i.mpId && i.precioOverride)
      .map(i => { const mp = mps.find(m => String(m.id) === String(i.mpId)); return mp ? { mpId: mp.id, nombre: mp.nombre, nuevo: parseFloat(i.precio) || 0, actual: mp.precio || 0 } : null })
      .filter(c => c && Math.round(c.nuevo) !== Math.round(c.actual))
    // Si esta ficha ES de una MP (vendible o interna fabricada): su COSTO CALCULADO pasa a ser el
    // precio de esa MP en el inventario, y se propaga a todas las recetas que la usan como ingrediente.
    // (1 unidad de la ficha = 1 unidad de la MP en el inventario; la presentación viene preajustada.)
    if (formProd.tipo === 'mp' && formProd.mp_id) {
      const mp = mps.find(m => String(m.id) === String(formProd.mp_id))
      const costo = Math.round(calcResult?.costoFinal || 0)
      if (mp && costo > 0 && Math.round(mp.precio || 0) !== costo && !cambiosMP.some(c => String(c.mpId) === String(mp.id))) {
        cambiosMP.push({ mpId: mp.id, nombre: mp.nombre, nuevo: costo, actual: mp.precio || 0, esSelf: true, unidad: mp.unidad })
      }
    }
    saveProducto.mutate({ actualizarMP: cambiosMP.length > 0, cambiosMP })
  }

  // Borrado SEGURO: guarda un respaldo completo en la papelera antes de eliminar (restaurable)
  const deleteProducto = useMutation({
    mutationFn: async (id) => {
      const { data: row, error: e1 } = await supabase.from('products_costing').select('*').eq('id', id).single()
      if (e1) throw e1
      const { error: e2 } = await supabase.from('productos_papelera').insert({ product_id: id, nombre: row?.nombre || '', snapshot: row, eliminado_por: profile?.nombre || '' })
      if (e2) throw e2
      const { error } = await supabase.from('products_costing').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products_costing'] }); qc.invalidateQueries({ queryKey: ['productos_papelera'] }); toast('Ficha movida a la papelera (recuperable) 🗑') },
    onError: (e) => toast(e.message, 'error'),
  })

  // Papelera de fichas
  const { data: papelera = [] } = useQuery({
    queryKey: ['productos_papelera'],
    queryFn: async () => { const { data } = await supabase.from('productos_papelera').select('*').order('eliminado_at', { ascending: false }); return data || [] },
  })
  const restaurarFicha = useMutation({
    mutationFn: async (p) => {
      const snap = { ...(p.snapshot || {}) }
      delete snap._newId
      const { error } = await supabase.from('products_costing').upsert(snap, { onConflict: 'id' })
      if (error) throw error
      await supabase.from('productos_papelera').delete().eq('id', p.id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products_costing'] }); qc.invalidateQueries({ queryKey: ['productos_papelera'] }); qc.invalidateQueries({ queryKey: ['finished_products'] }); toast('Ficha restaurada ✓') },
    onError: (e) => toast(e.message, 'error'),
  })
  const purgarFicha = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('productos_papelera').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos_papelera'] }); toast('Eliminada definitivamente') },
    onError: (e) => toast(e.message, 'error'),
  })

  // Recalcular y persistir el CIF/costo de TODAS las fichas según el portafolio actual
  const recalcularTodos = useMutation({
    meta: { label: 'Recalculando costos de todas las fichas…' },
    mutationFn: async () => {
      for (const p of productos) {
        const rc = recomputeProducto(p)
        const { error } = await supabase.from('products_costing').update({
          costo_final: rc.costoFinal || 0,
          costo_variable: rc.cvu || 0,
          cif_unit: rc.cifUnit || 0,
          util_mayor: rc.utilMayor || 0,
          util_detal: rc.utilDetal || 0,
          pe: rc.pe || 0,
        }).eq('id', p.id)
        if (error) throw error
        // Mantiene sincronizado el costo del producto terminado (base) con la ficha
        if ((p.tipo || '') !== 'subproducto') {
          await supabase.from('finished_products').update({ costo_unitario: Math.round(rc.costoFinal || 0) }).eq('product_id', p.id)
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products_costing'] }); qc.invalidateQueries({ queryKey: ['finished_products'] }); toast('CIF actualizado en todas las fichas ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  // Duplicar producto (copia todo con nombre " (copia)")
  const duplicarProducto = useMutation({
    mutationFn: async (p) => {
      const { id, created_at, ...resto } = p
      const { error } = await supabase.from('products_costing').insert({
        ...resto,
        nombre: `${p.nombre} (copia)`,
        // SKU y el ID de ítem en Alegra son únicos por producto: si se copian, la ficha duplicada
        // empujaría stock/costo al MISMO ítem de Alegra que el original al sincronizar.
        sku: null, alegra_item_id: null, stock_terminado: 0,
        fecha_creado: new Date().toISOString().split('T')[0],
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products_costing'] }); toast('Producto duplicado ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  // Activar / inactivar un producto (los inactivos no reparten CIF)
  const toggleActivoProducto = useMutation({
    mutationFn: async (p) => {
      const nuevo = p.activo === false
      const { error } = await supabase.from('products_costing').update({ activo: nuevo }).eq('id', p.id)
      if (error) throw error
      return nuevo
    },
    onSuccess: (nuevo) => { qc.invalidateQueries({ queryKey: ['products_costing'] }); toast(nuevo ? 'Producto activado ✓' : 'Producto inactivado (no reparte CIF) ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  // Empuja el stock terminado de todos los productos enlazados hacia Alegra
  const sincronizarAlegra = useMutation({
    meta: { label: 'Sincronizando stock con Alegra…' },
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('alegra-push-stock', { body: { all: true } })
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      const ok = (data?.resultados || []).filter(r => r.estado === 'ok').length
      const err = (data?.resultados || []).filter(r => r.estado === 'error').length
      toast(`Stock sincronizado con Alegra: ${ok} ok${err ? `, ${err} con error` : ''} ✓`, err ? 'warning' : 'success')
    },
    onError: (e) => toast('No se pudo sincronizar con Alegra: ' + e.message, 'error'),
  })


  // ---- CIF CRUD ----
  // Guarda el N° de operarios de capacidad en los parámetros de operación (sin perder los demás)
  const guardarNumOperarios = async (val) => {
    const n = parseInt(val)
    if (isNaN(n) || n < 0) { toast('Número de operarios inválido', 'warning'); return }
    if (n === parseInt(op.numOperarios || 0)) return
    const nuevo = { ...paramsNom, operacion: { ...op, numOperarios: n } }
    const { error } = await supabase.from('payroll_settings').upsert({ id: 1, params: nuevo, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) { toast(error.message, 'error'); return }
    qc.invalidateQueries({ queryKey: ['payroll_settings'] }); toast('N° de operarios actualizado ✓')
  }
  const addCIF = async (grupo = 'cif') =>{ await supabase.from('cif_items').insert({ descripcion: 'Nuevo ítem', categoria: 'General', grupo, frecuencia: 'mensual', valor: 0 }); refetchCIF(); toast('Ítem agregado') }
  const updateCIF = async (id, field, val) => { await supabase.from('cif_items').update({ [field]: val }).eq('id', id); refetchCIF() }
  const deleteCIF = async (id) => { await supabase.from('cif_items').delete().eq('id', id); refetchCIF(); toast('Ítem eliminado') }

  // ---- Reordenar listas (arrastrar y soltar) ----
  const ordIng  = useReorder(setIngredientes)
  const ordProc = useReorder(setProcesos)
  const ordEmp  = useReorder(setEmpaque)

  // ---- Ingrediente helpers ----
  const addIngrediente = () => setIngredientes(p => [...p, { ...EMPTY_ING, _id: Date.now() + Math.random() }])
  const addIngredienteRelativo = () => setIngredientes(p => [...p, { ...EMPTY_ING, _id: Date.now() + Math.random(), tipo: 'relativo', base: [] }])
  const nombresIngNormal = ingredientes.filter(r => r.tipo !== 'relativo' && r.nombre).map(r => r.nombre)
  const addProceso     = () => setProcesos(p => [...p, { _id: Date.now(), nombre: '', minutos: '' }])
  const addEmpaque     = () => setEmpaque(p => [...p, { _id: Date.now(), mpId: '', nombre: '', modo: 'lista', precio: '', presentacion: 1, cantidad: '' }])
  const updIng  = (id, f, v) => setIngredientes(p => p.map(r => r._id === id ? { ...r, [f]: v } : r))
  const updProc = (id, f, v) => setProcesos(p => p.map(r => r._id === id ? { ...r, [f]: v } : r))
  const updEmp  = (id, f, v) => setEmpaque(p => p.map(r => r._id === id ? { ...r, [f]: v } : r))

  // Presentación (g/ml equivalentes por unidad de compra): Kg/Litro = 1000; Gramo/Mililitro = 1.
  // Así el costo por gramo del ingrediente = precio ÷ presentación queda correcto según la unidad de la MP.
  // Seleccionar MP de la lista → autocompleta nombre y precio
  const handleSelectMP = (id, mpId) => {
    const mp = mps.find(m => String(m.id) === String(mpId))
    setIngredientes(p => p.map(r => r._id === id ? { ...r, mpId, nombre: mp?.nombre||'', precio: mp?String(mp.precio):'', presentacion: presDeUnidad(mp?.unidad), precioOverride: false } : r))
  }

  /** Precio de inventario (promedio ponderado) vs el guardado en la ficha. */
  const precioInventarioIng = (ing) => {
    if (!ing?.mpId) return null
    const mp = mps.find(m => String(m.id) === String(ing.mpId))
    return mp ? Number(mp.precio) || 0 : null
  }
  const costoDesfasado = (ing) => {
    const inv = precioInventarioIng(ing)
    if (inv == null) return false
    return Math.abs((parseFloat(ing.precio) || 0) - inv) > 0.01 || !!ing.precioOverride
  }
  const actualizarCostoIng = (id) => {
    setIngredientes(p => p.map(r => {
      if (r._id !== id) return r
      const mp = mps.find(m => String(m.id) === String(r.mpId))
      if (!mp) return r
      return { ...r, precio: String(mp.precio ?? ''), precioOverride: false, presentacion: presDeUnidad(mp.unidad) }
    }))
  }
  const actualizarCostosTodos = () => {
    const ids = new Set(ingredientes.filter(r => r.mpId && costoDesfasado(r)).map(r => r._id))
    if (!ids.size) {
      toast('Todos los costos ya coinciden con el inventario')
      return
    }
    setIngredientes(p => p.map(r => {
      if (!ids.has(r._id)) return r
      const mp = mps.find(m => String(m.id) === String(r.mpId))
      if (!mp) return r
      return { ...r, precio: String(mp.precio ?? ''), precioOverride: false, presentacion: presDeUnidad(mp.unidad) }
    }))
    toast(`${ids.size} costo(s) actualizado(s) desde inventario ✓`)
  }
  const ingsConDesfase = ingredientes.filter(r => r.mpId && costoDesfasado(r)).length

  // Toggle lista ↔ manual
  const toggleModo = (id, modo) => {
    setIngredientes(p => p.map(r => r._id === id ? { ...r, modo, mpId: '', nombre: modo==='lista'?'':r.nombre, precio: '' } : r))
  }

  // ── Crear una MP en el inventario DESDE un ingrediente manual (sin salir de la ficha) ──
  // Al guardar, el ingrediente pasa automáticamente a modo Lista enlazado a la MP nueva.
  const [nuevaMpIng, setNuevaMpIng] = useState(null)   // { ingId, nombre, categoria, unidad, precio }
  const categoriasMp = [...new Set(mps.map(m => m.categoria).filter(Boolean))].sort()
  const abrirNuevaMpDesdeIng = (r) => {
    setNuevaMpIng({ ingId: r._id, nombre: (r.nombre || '').trim(), categoria: '', unidad: 'Kg', precio: r.precio || '' })
  }
  const crearMpDesdeIng = useMutation({
    mutationFn: async () => {
      const n = (nuevaMpIng?.nombre || '').trim()
      if (!n) throw new Error('Escribe el nombre de la materia prima')
      if (mps.some(m => (m.nombre || '').trim().toLowerCase() === n.toLowerCase())) throw new Error('Ya existe una MP con ese nombre en el inventario — úsala desde el modo Lista')
      const categoria = (nuevaMpIng.categoria || 'otro').trim() || 'otro'
      try { await supabase.from('mp_categories').upsert({ nombre: categoria }, { onConflict: 'nombre' }) } catch { /* tabla opcional */ }
      const { data, error } = await supabase.from('raw_materials').insert({
        nombre: n, categoria, tipo: 'comprado', unidad: nuevaMpIng.unidad || 'Kg',
        precio: parseFloat(nuevaMpIng.precio) || 0, stock: 0, stock_min: 0, vendible: false,
      }).select('id, nombre, precio, unidad').single()
      if (error) throw error
      return data
    },
    onSuccess: (mp) => {
      qc.invalidateQueries({ queryKey: ['raw_materials'] })
      // Enlaza el ingrediente que originó la creación con la MP nueva (pasa a modo Lista)
      setIngredientes(p => p.map(r => r._id === nuevaMpIng.ingId
        ? { ...r, modo: 'lista', mpId: String(mp.id), nombre: mp.nombre, precio: String(mp.precio ?? ''), presentacion: presDeUnidad(mp.unidad), precioOverride: false }
        : r))
      setNuevaMpIng(null)
      toast(`"${mp.nombre}" creada en el inventario y enlazada al ingrediente ✓`)
    },
    onError: (e) => toast(e.message, 'error'),
  })

  // g/bache cambia → el % se deriva en render (no se almacena)
  const handleCantidadChange = (id, val) => updIng(id, 'cantidad', val)

  // Cambia el modo de ingreso g/bache ↔ %. Al pasar a %, SIEMBRA cada fila con su % actual
  // de la receta y fija el peso total con los gramos actuales — así los porcentajes se
  // sostienen tal cual (antes quedaban vacíos/viejos y la receta se descuadraba al editarlos).
  const cambiarModoIng = (m) => {
    if (m === modoIng) return
    if (m === 'porcentaje') {
      const total = ingredientesEff.reduce((s, i) => i.tipo !== 'relativo' ? s + (parseFloat(i.cantidad) || 0) : s, 0)
      if (total > 0) {
        if (!(parseFloat(pesoBacheTotal) > 0)) setPesoBacheTotal(String(Math.round(total * 10) / 10))
        setIngredientes(prev => prev.map(r => {
          if (r.tipo === 'relativo') return r
          const eff = ingredientesEff.find(x => x._id === r._id)
          return { ...r, pct: eff && eff.pctReceta > 0 ? eff.pctReceta.toFixed(2) : r.pct }
        }))
      }
    }
    setModoIng(m)
  }

  // ---- Empaque: detecta por categoría O por nombre; el resto va en "Otros insumos"
  // para que SIEMPRE haya opciones disponibles ----
  const RE_EMPAQUE = /empaque|envase|caja|bolsa|etiqueta|filtro|tapa|frasco|envoltura|sticker|rotulo|rótulo/i
  const mpsEmpaque = mps.filter(m => RE_EMPAQUE.test((m.categoria || '') + ' ' + (m.nombre || '')))
  // Ingredientes: excluye las materias primas de categoría empaque/envase
  const mpsIngredientes = mps.filter(m => !/empaque|envase/i.test(m.categoria || ''))
  const handleSelectEmpaqueMP = (id, mpId) => {
    const mp = mps.find(m => String(m.id) === String(mpId))
    // La presentación sale de la unidad de la MP (igual que en ingredientes): un empaque
    // comprado por Kg (film, cinta) se digita en gramos, así que su presentación es 1000.
    setEmpaque(p => p.map(r => r._id === id ? { ...r, mpId, nombre: mp?.nombre||'', precio: mp?String(mp.precio):'', presentacion: presDeUnidad(mp?.unidad) } : r))
  }
  const toggleModoEmpaque = (id, modo) => {
    setEmpaque(p => p.map(r => r._id === id ? { ...r, modo, mpId: '', nombre: modo==='lista'?'':r.nombre, precio: '' } : r))
  }

  // Descarga ficha técnica
  const descargarFicha = async () => {
    if (!fichaPath) { toast('No hay ficha adjunta', 'warning'); return }
    try {
      const { data, error } = await supabase.storage.from('technical-sheets').download(fichaPath)
      if (error) throw error
      const url = URL.createObjectURL(data)
      const a = document.createElement('a'); a.href = url; a.download = fichaNombre || 'ficha'
      document.body.appendChild(a); a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 300)
    } catch (err) { toast('Error: ' + err.message, 'error') }
  }

  // Imágenes del producto: selección → recorte 1:1 → sube el blob al bucket → galería.
  const handleImg = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCropImg(f) }
  const subirImgBlob = async (blob) => {
    setSubiendoImg(true)
    try {
      const nombre = (formProd.nombre || '').trim() || 'producto'
      const path = pathImgProducto(nombre, { carpeta: 'productos' })
      const { error } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      setImagenes(prev => [...prev, { url: data.publicUrl, url_mobile: data.publicUrl, alt: nombre }])
      toast('Imagen cargada ✓ — recuerda guardar la ficha')
    } catch (err) { toast('No se pudo subir la imagen: ' + err.message, 'error') }
    finally { setSubiendoImg(false) }
  }
  const quitarImagen = (i) => setImagenes(prev => prev.filter((_, idx) => idx !== i))
  const hacerPrincipal = (i) => setImagenes(prev => [prev[i], ...prev.filter((_, idx) => idx !== i)])

  // ---- Imprimibles (PDF de etiquetas/rótulos que el operario imprime al producir) ----
  const subirImprimible = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = ''
    if (!files.length) return
    setSubiendoImp(true)
    try {
      for (const f of files) {
        const esPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')
        if (!esPdf) { toast(`"${f.name}" no es PDF y se omitió`, 'warning'); continue }
        if (f.size > 15 * 1024 * 1024) { toast(`"${f.name}" pesa más de 15 MB y se omitió`, 'warning'); continue }
        // Los archivos elegidos desde Drive/OneDrive por el selector del celular no están en el
        // teléfono: son un "atajo" que el navegador debe descargar al leerlo, y si eso falla la
        // subida moría con un genérico "Failed to fetch". Se lee a memoria primero para poder
        // detectarlo y explicarlo, y se sube el contenido ya descargado.
        let datos
        try {
          datos = new Blob([await f.arrayBuffer()], { type: 'application/pdf' })
          if (datos.size === 0) throw new Error('archivo vacío')
        } catch {
          toast(`No se pudo leer "${f.name}". Si está en Google Drive, descárgalo primero al dispositivo y vuelve a intentarlo.`, 'error')
          continue
        }
        const path = `fichas/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${(f.name || 'archivo.pdf').replace(/[^\w.\-]/g, '_')}`
        const { error } = await supabase.storage.from('ficha-imprimibles').upload(path, datos, { upsert: true, contentType: 'application/pdf' })
        if (error) throw error
        setImprimibles(prev => [...prev, { nombre: f.name, path, size: datos.size, subido_por: profile?.nombre || '', fecha: new Date().toISOString().split('T')[0] }])
      }
      toast('Imprimible(s) cargado(s) ✓ — recuerda guardar la ficha')
    } catch (err) {
      // El bucket lo crea la migración v130. Sin ella Supabase responde "Bucket not found",
      // y en móvil/tablet el fallo de red se ve como un genérico "Failed to fetch".
      const msg = /bucket|not found|failed to fetch/i.test(err.message || '')
        ? 'No se pudo subir: falta correr la migración v130 en Supabase, que crea el espacio de archivos "ficha-imprimibles".'
        : 'No se pudo subir: ' + err.message
      toast(msg, 'error')
    }
    finally { setSubiendoImp(false) }
  }
  const quitarImprimible = (i) => setImprimibles(prev => prev.filter((_, idx) => idx !== i))
  // Abre el PDF en una pestaña nueva con URL firmada (bucket privado). Desde ahí el operario
  // imprime con el visor del dispositivo, que en tablets ofrece "Imprimir" y "Compartir".
  const abrirImprimible = async (imp) => {
    try {
      const { data, error } = await supabase.storage.from('ficha-imprimibles').createSignedUrl(imp.path, 3600)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener')
    } catch (err) { toast('No se pudo abrir el archivo: ' + err.message, 'error') }
  }

  // Resultado ancla (useMemo para calcular en tiempo real)
  const anclaResultado = useMemo(() => {
    if (!anclaId || !anclaQty) return null
    const ings = ingredientesEff.map(i => ({
      nombre: i.nombre,
      pct: i.tipo === 'relativo' ? (parseFloat(i.pct)||0) : (i.pctReceta||0),
      precio: parseFloat(i.precio)||0,
      presentacion: parseFloat(i.presentacion)||1000,
      tipo: i.tipo || 'normal',
      base: i.tipo === 'relativo' ? (i.base||'total') : 'total',
    }))
    return calcularReceta({ ingredientes: ings, ancla: anclaId, cantidadAncla: parseFloat(anclaQty)||0, rendimiento: parseFloat(rendimiento)||62, desperdicio: parseFloat(desperdicio)||2, pesoUnidad: parseFloat(pesoUnidad)||1000 })
  }, [anclaId, anclaQty, ingredientesEff, rendimiento, desperdicio, pesoUnidad])

  // Aplicar cantidades calculadas por ancla — solo a filas normales
  // (las relativas derivan su cantidad de la base automáticamente)
  const aplicarDesdeAncla = () => {
    if (!anclaResultado) return
    setIngredientes(prev => prev.map(r => {
      if (r.tipo === 'relativo') return r
      const calc = anclaResultado.calculados.find(c => c.nombre === r.nombre)
      return calc ? { ...r, cantidad: calc.cantidad.toFixed(1) } : r
    }))
    setAnclaModal(false); toast('Cantidades aplicadas ✓')
  }

  // Exporta la ficha de costos como Excel CON ESTILO (logo, colores, bordes) y FÓRMULAS VIVAS.
  // Pre-carga el costo/minuto y el CIF por unidad para que el total cuadre con la app.
  const exportarFichaExcel = async (p) => {
    try {
      const cfg = getConfig()
      // _adicUnidad: costos adicionales por unidad (depreciación, etc.) — el overhead/CIF ya va
      // incluido en "Mano de obra por unidad" (costo/minuto), así que NO se debe volver a sumar aquí.
      await descargarFichaExcel(
        { ...p, _costoMinuto: costoMin, _adicUnidad: recomputeProducto(p).adicUnit || 0 },
        { empresa: cfg.empresa || 'Mumi Amazonia', logoUrl: cfg.logo_url || '', cifItems }
      )
      toast('Excel exportado ✓')
    } catch (e) { toast('No se pudo generar el Excel: ' + e.message, 'error') }
  }

  // ---- RENDER ----
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{labelModulo}</h1>
        {vista === 'productos' && (
          <div className="page-actions">
            <button className="btn btn-secondary btn-sm" title="Ver existencias y configurar la integración del catálogo vendible" onClick={() => pushTo('/terminados')}><Ico as={Package} size={14} />Ver stock de producto terminado y configurar</button>
            {esAdmin && <button className="btn btn-secondary btn-sm" onClick={() => setModalPapelera(true)}><Ico as={Trash2} size={14} />Papelera{papelera.length > 0 ? ` (${papelera.length})` : ''}</button>}
            <button className="btn btn-dorado btn-sm" onClick={() => { limpiarForm(); setTab('nuevo') }}>+ Nueva Ficha</button>
          </div>
        )}
      </div>

      {/* ===== LISTA PRODUCTOS: listado acordeón agrupado por categoría (todos los anchos) ===== */}
      {tab === 'lista' && (
        <div className="card fichas-lista">
          <div className="card-title"><Ico as={Package} size={14} />Fichas de Productos</div>
          <div className="alert alert-info" style={{ fontSize:'0.82rem' }}>
            ℹ Todo se recalcula <strong>en vivo</strong> con el CIF y los precios de MP actuales. La <strong>utilidad neta</strong> ya
            descuenta costo de producción, gastos de administración/ventas/financieros y comisión: es lo que de verdad te queda.
            El ICA no se calcula en la ficha (es impuesto del período).
            Los valores <strong>guardados</strong> (los que usan Producto Terminado, Órdenes y el Tablero) solo cambian al guardar la
            ficha o con <strong>"↻ Aplicar a las fichas"</strong> en Costos y Gastos.
          </div>

          {productos.length === 0 ? (
            <p className="empty-table">No hay fichas. Crea la primera →</p>
          ) : (
            <div className="fichas-listado">
              {productosAgrupados.map(grupo => (
                <div key={grupo.tipo} className="ficha-grupo-bloque">
                  <div className="ficha-grupo-titulo">
                    <Tag size={14} aria-hidden="true" />
                    <strong>{grupo.label}</strong>
                    <span className="badge badge-gris">{grupo.items.length}</span>
                  </div>
                  {grupo.items.map(p => {
                    const rc = recomputeProducto(p)
                    const ind = indicadoresProducto(p, rc)
                    const pctCIF = totalUnidsPortafolio > 0 ? ind.unidsMes / totalUnidsPortafolio * 100 : 0
                    const colorUtil = ind.utilNeta >= 0 ? 'var(--selva)' : 'var(--rojo)'
                    const inactivo = p.activo === false
                    const peq = peqMultiproducto.find(x => x.nombre === p.nombre)
                    const produccionMes = produccionMesPorProducto.get(String(p.id))
                    const bachesReales = produccionMes?.baches || 0
                    const bachesFicha = Number(p.baches_mes) || 0
                    const diferenciaBaches = bachesReales - bachesFicha
                    const desviacionBachesPct = bachesFicha > 0 ? (diferenciaBaches / bachesFicha) * 100 : (bachesReales > 0 ? 100 : 0)
                    const alertaBachesIgnorada = alertasIgnoradas.some(a => String(a.product_id) === String(p.id) && a.alert_type === 'baches_mes' && a.periodo === mesAnterior.periodo)
                    const produccionDesviada = !cargandoProduccionMes && Math.abs(desviacionBachesPct) >= 10 && !alertaBachesIgnorada
                    const costosRecientes = costosRecientesPorProducto.get(String(p.id)) || []
                    const costoDesviado = costosRecientes.some(c => Math.abs(c.desviacion) > 10)
                    return (
                      <AccordionItem key={p.id}
                        titulo={<>
                          {p.imagen_url && <img src={p.imagen_url} alt="" style={{ width:24, height:24, borderRadius:3, objectFit:'cover', verticalAlign:'middle', marginRight:6 }} />}
                          {p.nombre}
                          {inactivo && <span className="badge badge-gris" style={{ marginLeft:6, fontSize:'0.65rem' }}><Ico as={Pause} size={12} />Inactivo</span>}
                          {produccionDesviada && <span className="ficha-alerta-punto" title={`La producción de ${mesAnterior.label} difiere de la ficha`} aria-label="Alerta de producción" />}
                          {costoDesviado && <span className="ficha-alerta-punto ficha-alerta-punto-costo" title="El costo de producción real (MP + empaque + MO + CIF) de una de las últimas tres órdenes difiere más de 10% vs la ficha" aria-label="Alerta de costo" />}
                        </>}
                        sub={<>Costo pleno {fCOP(ind.cPleno)} · Margen bruto <span style={{ color: ind.utilidadBruta >= 0 ? 'var(--selva)' : 'var(--rojo)' }}>{ind.margenBrutoPct != null ? `${ind.margenBrutoPct.toFixed(1)}%` : '—'}</span></>}
                      >
                        <Fila et="Tipo">{grupo.label}{inactivo ? ' · inactivo' : ''}</Fila>
                        <Fila et="Unid/mes">{fNum(ind.unidsMes)} <small style={{ color:'var(--texto-suave)' }}>({pctCIF.toFixed(1)}% del portafolio)</small></Fila>
                        <Fila et="Mínimo a vender (PE ponderado)">{!inactivo && peq?.mcu > 0 ? `${fNum(peq.pe)} unid/mes` : '—'}</Fila>
                        <Fila et="MP + empaque">{fCOP(rc.cvu)}</Fila>
                        <Fila et="Mano de obra + CIF">{fCOP(rc.moUnit)}</Fila>
                        <Fila et="Costo de producción/u">{fCOP(rc.costoTotalUnit)}</Fila>
                        <Fila et="Costo pleno/u (+ gastos)">{fCOP(ind.cPleno)}</Fila>
                        <Fila et="P. Mayor">{fCOP(p.precio_mayor)}</Fila>
                        <Fila et="Margen bruto/u"><span style={{ color: ind.utilidadBruta >= 0 ? 'var(--selva)' : 'var(--rojo)' }}>{fCOP(ind.utilidadBruta)}{ind.margenBrutoPct != null ? ` (${ind.margenBrutoPct.toFixed(1)}%)` : ''}</span></Fila>
                        <Fila et="Utilidad neta/u"><span style={{ color: colorUtil }}>{fCOP(ind.utilNeta)}</span></Fila>
                        <Fila et="Utilidad al mes"><span style={{ color: colorUtil }}>{fCOP(ind.utilMes)}</span></Fila>
                        {produccionDesviada && (
                          <div className="ficha-alerta-produccion" role="status">
                            <span className="ficha-alerta-punto" aria-hidden="true" />
                            <div>
                              <strong>Revisa los baches configurados</strong>
                              <div>
                                En {mesAnterior.label} se produjeron aproximadamente <strong>{fNum(bachesReales)} baches</strong>,
                                mientras la ficha indica <strong>{fNum(bachesFicha)} baches/mes</strong>
                                ({diferenciaBaches > 0 ? `${fNum(diferenciaBaches)} más` : `${fNum(Math.abs(diferenciaBaches))} menos`}).
                              </div>
                              <small>
                                Basado en {produccionMes?.ordenes || 0} orden(es) de producción cerrada(s). Los registros de producción no se incluyen.
                              </small>
                              <button type="button" className="btn btn-xs btn-secondary" style={{ marginTop:8 }} onClick={() => ignorarAlertaBaches(p.id)}>Ignorar hasta el próximo mes</button>
                            </div>
                          </div>
                        )}
                        {costosRecientes.length > 0 && (
                          <div className={`ficha-alerta-costo ${costoDesviado ? 'activa' : ''}`} role="status">
                            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                              <strong>{costoDesviado ? '⚠ Variación de costo de producción > 10%' : 'Costos de producción recientes'}</strong>
                              {costoDesviado && (
                                <button
                                  type="button"
                                  className="btn btn-xs btn-primary"
                                  style={{ marginLeft:'auto' }}
                                  onClick={() => setDetalleCosto({
                                    producto: p,
                                    items: costosRecientes,
                                    foco: costosRecientes.find(c => Math.abs(c.desviacion) > 10)?.ordenId,
                                  })}
                                >
                                  <Ico as={BarChart3} size={13} />Ver detalle de costos
                                </button>
                              )}
                            </div>
                            <div className="ficha-costos-recientes">
                              {costosRecientes.map(c => (
                                <button
                                  key={c.ordenId}
                                  type="button"
                                  className="ficha-costo-chip"
                                  title={`Ver detalle · ${opCodigo(c.ordenId)} · ${c.fecha ? fFecha(String(c.fecha).slice(0, 10)) : ''}`}
                                  onClick={() => setDetalleCosto({ producto: p, items: costosRecientes, foco: c.ordenId })}
                                >
                                  <span className="ficha-costo-chip-op">{opCodigo(c.ordenId)}</span>
                                  {fCOP(c.costo)} <small style={{ color: c.desviacion > 10 ? 'var(--rojo)' : c.desviacion < -10 ? 'var(--tierra)' : 'var(--texto-suave)' }}>{c.desviacion >= 0 ? '+' : ''}{c.desviacion.toFixed(1)}%</small>
                                </button>
                              ))}
                            </div>
                            <small>Comparado con el <strong>costo de producción/u</strong> (MP + empaque + MO + CIF): {fCOP(recomputeProducto(p).costoTotalUnit)}.</small>
                          </div>
                        )}
                        <div className="acordeon-acciones">
                          <button className="btn btn-xs btn-secondary" onClick={() => { setVerProd(p); setVerModal(true) }}>Ver</button>
                          <button className="btn btn-xs btn-secondary" onClick={() => pushTo(p.empaca_surtido ? '/ordenes' : '/produccion', { filtrarProducto: p.nombre })}><Ico as={ClipboardList} size={13} />{p.empaca_surtido ? 'Órdenes relacionadas' : 'Registros'}</button>
                          <button className="btn btn-xs btn-primary" onClick={() => cargarProducto(p.id)}><Ico as={Pencil} size={14} />Editar</button>
                          <button className="btn btn-xs btn-secondary" onClick={() => duplicarProducto.mutate(p)} disabled={duplicarProducto.isPending}>⧉ Duplicar</button>
                          <button className={`btn btn-xs ${inactivo ? 'btn-success' : 'btn-secondary'}`} onClick={() => toggleActivoProducto.mutate(p)} disabled={toggleActivoProducto.isPending}>{inactivo ? '▶ Activar' : '⏸ Inactivar'}</button>
                          <button className="btn btn-xs btn-dorado" title="Descargar ficha de costos en Excel" onClick={() => exportarFichaExcel(p)}><Ico as={FileSpreadsheet} size={13} />Excel</button>
                          <button className="btn btn-xs btn-danger" onClick={() => { setConfirmDel(p); setDelText('') }}><X size={13} aria-hidden="true" /></button>
                        </div>
                      </AccordionItem>
                    )
                  })}
                </div>
              ))}

              {(() => {
                const act = productosActivos
                const tot = act.reduce((a, p) => {
                  const i = indicadoresProducto(p, recomputeProducto(p))
                  return { unids: a.unids + i.unidsMes, util: a.util + i.utilMes }
                }, { unids: 0, util: 0 })
                return (
                  <div className="fichas-total">
                    <strong>TOTAL portafolio activo ({act.length})</strong>
                    <span>{fNum(tot.unids)} unid/mes</span>
                    <span style={{ color: tot.util >= 0 ? 'var(--crema)' : '#ffc9c9' }}>{fCOP(tot.util)}/mes</span>
                  </div>
                )
              })()}
            </div>
          )}

          {productos.length > 1 && (
            <div className="fichas-lista-footer">
              <button className="btn btn-sm btn-dorado" onClick={() => recalcularTodos.mutate()} disabled={recalcularTodos.isPending}>
                {recalcularTodos.isPending ? 'Recalculando...' : '🔄 Guardar CIF actualizado en todas las fichas'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== NUEVA / EDITAR FICHA ===== */}
      {tab === 'nuevo' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={closeFicha}>← Volver a productos</button>
          </div>
          {/* ── Selector: cargar producto (editar) o receta rápida (convertir a producto) ── */}
          <div className="card" style={{ padding:'14px 20px', marginBottom:16, background:'rgba(26,58,42,0.03)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <span style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', whiteSpace:'nowrap' }}>
                {editingId ? '✏ Editando producto:' : (selFuente.startsWith('recipe-') ? '🔄 Convirtiendo receta a producto:' : '📋 Cargar:')}
              </span>
              <Select className="form-control" value={selFuente} onChange={e => cargarFuente(e.target.value)} style={{ maxWidth:340 }}>
                <option value="">— nueva ficha en blanco —</option>
                {productos.length > 0 && <optgroup label="⭐ Productos (editar)">{productos.map(p => <option key={p.id} value={`prod-${p.id}`}>{p.nombre}</option>)}</optgroup>}
                {recetas.length > 0 && <optgroup label="💾 Recetas rápidas (convertir a producto)">{recetas.map(r => <option key={r.id} value={`recipe-${r.id}`}>{r.nombre}</option>)}</optgroup>}
              </Select>
              {(editingId || selFuente) && (
                <button className="btn btn-secondary btn-sm" onClick={limpiarForm}>+ Nueva ficha</button>
              )}
              {selFuente.startsWith('recipe-') && (
                <span style={{ fontSize:'0.8rem', color:'var(--tierra)' }}>Agrega MO, empaque y precios; al guardar se creará como producto base.</span>
              )}
            </div>
          </div>

          {/* Calcular costos de una MP fabricada internamente (vendible O interna no vendible) */}
          {!editingId && (
            <div className="card" style={{ padding:'14px 20px', marginBottom:16, background:'rgba(124,179,66,0.06)', border:'1px solid rgba(124,179,66,0.3)' }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontWeight:600, color:'var(--selva)' }}>
                <input type="checkbox" checked={modoMpVend} onChange={e => setModoMpVend(e.target.checked)} />
                <FlaskConical size={15} aria-hidden="true" /> Calcular costos de una materia prima que fabricas
              </label>
              {modoMpVend && (() => {
                // Candidatas: MP vendibles (se venden) O internas/fabricadas (tipo 'interno', para uso propio),
                // que aún no tengan ficha de costos. Las compradas NO — su costo es su precio de compra.
                const mpFabricadas = mps.filter(m => (m.vendible || m.tipo === 'interno') && !productos.some(p => p.tipo === 'mp' && String(p.mp_id) === String(m.id)))
                return (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ fontSize:'0.72rem', color:'var(--texto-suave)' }}>MP vendible o interna (fabricada) — marcada en Inventario MP</label>
                    <Select className="form-control" style={{ maxWidth: 380 }} value="" onChange={e => {
                      const m = mps.find(x => String(x.id) === e.target.value); if (!m) return
                      setIngredientes([]); setProcesos([]); setEmpaque([]); setEditingId(null); setSelFuente('')
                      // "Activo" significa EN PRODUCCIÓN, no vendible: una MP interna (mermelada,
                      // pulpa) se fabrica igual que las demás, consume minutos de planta y por tanto
                      // debe absorber CIF. Marcarla inactiva por no venderse la sacaba del reparto y
                      // hacía aparecer esos minutos como capacidad ociosa.
                      setFormProd({ ...EMPTY_PROD, nombre: m.nombre, tipo: 'mp', mp_id: String(m.id), presentacion: m.unidad || 'Unidad', activo: true })
                    }}>
                      <option value="">Seleccionar MP...</option>
                      {mpFabricadas.map(m => <option key={m.id} value={m.id}>{m.nombre} · {m.unidad}{m.vendible ? ' · vendible' : ' · interna'}</option>)}
                    </Select>
                    {mpFabricadas.length === 0 && <small style={{ display:'block', marginTop:6, color:'var(--texto-suave)' }}>No hay MP pendientes. En <strong>Inventario MP</strong> marca la MP como "Se puede vender" (vendible) o créala con tipo <strong>Fabricada/interna</strong>.</small>}
                    {formProd.tipo === 'mp' && formProd.mp_id && <small style={{ display:'block', marginTop:6, color:'var(--selva)' }}>✓ Ficha de MP: <strong>{formProd.nombre}</strong>. Agrega sus ingredientes/procesos y guarda: el costo calculado se guardará como su precio en Inventario MP y se propagará a las recetas que la usan.</small>}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── Imagen + Info básica del producto ── */}
          <details className="card" {...secProps(true)}>
            <summary className="card-title"><Ico as={FileText} size={14} />Información básica<span className="card-hint">{formProd.nombre || 'nombre, tipo, SKU, vida útil...'}</span></summary>
            <div className="card-acc-body">
            {/* Galería de imágenes: la primera es la principal (miniatura del listado y del terminado) */}
            <div className="form-group">
              <label className="form-label">Imágenes <small style={{ fontWeight:400, textTransform:'none', color:'var(--texto-suave)' }}>(la primera es la principal — clic en ★ para cambiarla)</small></label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-start' }}>
                {imagenes.map((im, i) => (
                  <div key={urlDeImg(im) + i} style={{ position:'relative', width:72, height:72, borderRadius:'var(--radio)', overflow:'hidden', border: i === 0 ? '2px solid var(--dorado)' : '1px solid var(--crema-oscuro)' }}>
                    <img src={urlDeImg(im)} alt={formProd.nombre || `imagen ${i + 1}`} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    <div style={{ position:'absolute', top:2, right:2, display:'flex', gap:2 }}>
                      {i > 0 && <button type="button" title="Hacer principal" onClick={() => hacerPrincipal(i)} style={{ background:'rgba(0,0,0,0.55)', color:'#ffd54f', border:'none', borderRadius:4, cursor:'pointer', fontSize:'0.7rem', padding:'1px 4px' }}>★</button>}
                      <button type="button" title="Quitar imagen" onClick={() => quitarImagen(i)} style={{ background:'rgba(0,0,0,0.55)', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontSize:'0.7rem', padding:'1px 4px' }}>✕</button>
                    </div>
                    {i === 0 && <span style={{ position:'absolute', bottom:2, left:2, background:'var(--dorado)', color:'#2b1c04', fontSize:'0.58rem', fontWeight:700, borderRadius:3, padding:'0 4px' }}>PRINCIPAL</span>}
                    <div style={{ position:'absolute', bottom:2, right:2, display:'flex', gap:2 }}>
                      <button type="button" title="Mover izquierda" disabled={i === 0} onClick={() => setImagenes(prev => { const b=[...prev];[b[i-1],b[i]]=[b[i],b[i-1]];return b })} style={{ background:'rgba(0,0,0,0.55)', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontSize:'0.75rem', padding:'0 5px', opacity:i===0?0.3:1 }}>‹</button>
                      <button type="button" title="Mover derecha" disabled={i === imagenes.length - 1} onClick={() => setImagenes(prev => { const b=[...prev];[b[i+1],b[i]]=[b[i],b[i+1]];return b })} style={{ background:'rgba(0,0,0,0.55)', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontSize:'0.75rem', padding:'0 5px', opacity:i===imagenes.length-1?0.3:1 }}>›</button>
                    </div>
                  </div>
                ))}
                <div onClick={() => !subiendoImg && imgInputRef.current?.click()}
                  style={{ width:72, height:72, border:'2px dashed var(--crema-oscuro)', borderRadius:'var(--radio)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.6rem', background:'var(--crema)', color:'var(--texto-suave)' }}>
                  {subiendoImg ? '…' : '＋'}
                  <input type="file" accept="image/*" ref={imgInputRef} onChange={handleImg} style={{ display:'none' }} />
                </div>
              </div>
              {cropImg && <ImageCropper file={cropImg} aspect={1} salidaW={1000} salidaH={1000} onCancel={() => setCropImg(null)} onCropped={(blob) => { setCropImg(null); subirImgBlob(blob) }} />}
            </div>

            {/* Campos */}
            <div className="form-grid">
                <div className="form-group" style={{ gridColumn:'1 / -1' }}><label className="form-label">Nombre del Producto</label><input className="form-control" value={formProd.nombre} onChange={e => setFormProd(f=>({...f,nombre:e.target.value}))} placeholder="Nombre de mi producto" /></div>
                <div className="form-group" style={{ gridColumn:'1 / -1' }}>
                  <label className="form-label">Descripción del producto <small style={{ fontWeight:400, textTransform:'none', color:'var(--texto-suave)' }}>(opcional)</small></label>
                  <textarea className="form-control" rows={2} maxLength={500} value={formProd.descripcion || ''} onChange={e => setFormProd(f=>({...f,descripcion:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Estado del producto</label>
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'8px 0' }}>
                    <input type="checkbox" checked={formProd.activo !== false} onChange={e => setFormProd(f=>({...f, activo: e.target.checked}))} />
                    <span style={{ fontWeight:600, color: formProd.activo !== false ? 'var(--selva)' : 'var(--texto-suave)' }}>{formProd.activo !== false ? '✓ Activo (en producción)' : '⏸ Inactivo (no reparte CIF)'}</span>
                  </label>
                  <small style={{ color:'var(--texto-suave)', fontSize:'0.72rem' }}>
                    "Activo" = <strong>se fabrica hoy</strong>, no que se venda. Los productos internos (mermelada, pulpa)
                    van activos: consumen planta y deben absorber CIF. Inactiva solo lo que dejaste de producir —
                    sus minutos salen del reparto y aparecen como capacidad ociosa.
                  </small>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display:'flex', alignItems:'center' }}>
                    Tipo
                    {esAdmin && <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft:'auto' }} onClick={() => setTiposModal(true)}><Ico as={Settings} size={14} />Gestionar</button>}
                  </label>
                  <Select className="form-control" value={formProd.tipo} onChange={e => setFormProd(f=>({...f,tipo:e.target.value}))}>
                    {opcionesTipo.map(t => <option key={t} value={t}>{tipoLabel(t)}</option>)}
                  </Select>
                </div>
                {/* Categorías adicionales — sobre todo para MP vendibles que caben en varias categorías */}
                {formProd.tipo === 'mp' && (
                  <div className="form-group" style={{ gridColumn:'1 / -1' }}>
                    <label className="form-label">Categorías adicionales <small style={{ fontWeight:400, textTransform:'none', color:'var(--texto-suave)' }}>(la MP vendible puede pertenecer a varias)</small></label>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {opcionesTipo.filter(t => t !== formProd.tipo).map(t => { const on = categorias.includes(t); return (
                        <button type="button" key={t} className={`btn btn-xs ${on ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setCategorias(cs => on ? cs.filter(x => x !== t) : [...cs, t])}>
                          {on ? '✓ ' : '+ '}{tipoLabel(t)}
                        </button>
                      ) })}
                    </div>
                    {categorias.length > 0 && <small style={{ display:'block', marginTop:4, color:'var(--selva)' }}>Categorías: {[formProd.tipo, ...categorias].map(tipoLabel).join(', ')}</small>}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Presentación <small style={{ fontWeight:400, textTransform:'none', color:'var(--texto-suave)' }}>(elige o escribe una)</small></label>
                  <input className="form-control" list="dl-presentaciones" value={formProd.presentacion || ''} onChange={e => setFormProd(f=>({...f,presentacion:e.target.value}))} placeholder="Ej: Caja, Unidad, Kilo..." />
                  <datalist id="dl-presentaciones">{PRESENTACIONES.map(p => <option key={p} value={p} />)}</datalist>
                </div>
            </div>

            {/* Campos personalizados */}
            <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid var(--crema-oscuro)' }}>
              <div style={{ display:'flex', alignItems:'center', marginBottom:8, gap:6, flexWrap:'wrap' }}>
                <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem' }}><Ico as={Tag} size={14} />Datos adicionales del producto</div>
                <div style={{ marginLeft:'auto', display:'flex', gap:6, flexWrap:'wrap' }}>
                  {['Registro Invima', 'Código de barras'].map(n => (
                    <button key={n} type="button" className="btn btn-sm btn-secondary" disabled={camposExtra.some(c => c.nombre === n)}
                      onClick={() => setCamposExtra(c => [...c, { nombre: n, valor: '' }])}>+ {n}</button>
                  ))}
                  <button type="button" className="btn btn-sm btn-secondary" onClick={addCampoExtra}>+ Otro</button>
                </div>
              </div>
              {camposExtra.length === 0
                ? <p style={{ fontSize:'0.82rem', color:'var(--texto-suave)' }}>Sin datos adicionales. Usa los botones para agregar Registro Invima, Código de barras u otro campo.</p>
                : camposExtra.map((c, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr auto', gap:8, marginBottom:8, alignItems:'center' }}>
                    <input className="form-control" placeholder="Nombre del campo" value={c.nombre} onChange={e => updCampoExtra(i,'nombre',e.target.value)} />
                    <input className="form-control" placeholder="Valor" value={c.valor} onChange={e => updCampoExtra(i,'valor',e.target.value)} />
                    <button type="button" className="btn btn-danger btn-xs" onClick={() => delCampoExtra(i)}><X size={13} aria-hidden="true" /></button>
                  </div>
                ))}
            </div>
            </div>
          </details>

          {/* ── Ingredientes (integrado con toggle lista/manual de Calculadora de Receta) ── */}
          <details className="card" {...secProps(!!editingId || ingredientes.length > 0)}>
            <summary className="card-title ed-sec-title">
              <span className="ed-sec-title-main">🌿 Materias Primas e Insumos</span>
              <span className="card-hint">{ingredientes.length} ingrediente{ingredientes.length === 1 ? '' : 's'}</span>
              <div className="ed-sec-actions" onClick={e => e.stopPropagation()}>
                <button className="btn btn-sm btn-secondary" onClick={addIngrediente}>+ Normal</button>
                <button className="btn btn-sm btn-dorado" onClick={addIngredienteRelativo}>+ Relativo</button>
              </div>
            </summary>
            <div className="card-acc-body">
            {/* Modo de ingreso: gramos/bache o porcentaje */}
            <div className="ed-toolbar">
              <div className="ed-toolbar-modo">
                <span style={{ fontSize:'0.8rem', color:'var(--texto-suave)' }}>Ingresar por:</span>
                {[['gramos','g / bache'],['porcentaje','% (porcentaje)']].map(([m,lbl],i) => (
                  <button key={m} type="button" onClick={() => cambiarModoIng(m)} style={{
                    padding:'4px 10px', fontSize:'0.78rem', cursor:'pointer', fontWeight:600,
                    background: modoIng===m ? 'var(--selva)' : 'transparent',
                    color: modoIng===m ? 'var(--crema)' : 'var(--texto-suave)',
                    border:`1px solid ${modoIng===m ? 'var(--selva)' : 'var(--crema-oscuro)'}`,
                    borderRadius: i===0 ? '4px 0 0 4px' : '0 4px 4px 0', marginLeft: i===1 ? -1 : 0,
                  }}>{lbl}</button>
                ))}
                {modoIng==='porcentaje' && (
                  <label className="ed-toolbar-peso" style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.8rem' }}>
                    Peso total del bache (g):
                    <input type="number" className="form-control" style={{ width:130 }} value={pesoBacheTotal} onChange={e => setPesoBacheTotal(e.target.value)} placeholder="Ej: 10000" min={1} />
                  </label>
                )}
              </div>
              {ingsConDesfase > 0 && (
                <button type="button" className="btn btn-xs btn-dorado ed-toolbar-sync"
                  title="Trae el costo promedio actual de cada MP desde Inventario (borra overrides). El costo de la ficha ya se recalcula en vivo si no hay override; este botón sincroniza el valor guardado."
                  onClick={actualizarCostosTodos}>
                  Actualizar {ingsConDesfase} costo{ingsConDesfase === 1 ? '' : 's'} desde inventario
                </button>
              )}
            </div>
            <p className="ed-hint-costo" style={{ fontSize: '0.72rem', color: 'var(--texto-suave)', margin: '0 0 10px' }}>
              El costo de cada MP sigue el <strong>promedio ponderado</strong> del inventario (se actualiza al ingresar lotes). Sin override, la ficha lo usa en vivo; el botón sirve si quedó un costo fijo o desfasado.
            </p>
            <div className="ed-scroll">
              <div className="ed-wrap ed-ings" style={{ minWidth:820 }}>
                {/* Header */}
                <div className="ed-head" style={{ display:'grid', gridTemplateColumns:'2.2fr 0.7fr 0.9fr 0.8fr 0.9fr 44px', gap:8, paddingBottom:6, fontSize:'0.72rem', fontWeight:700, color:'var(--texto-suave)', textTransform:'uppercase' }}>
                  <span>Ingrediente</span>
                  <span style={{ textAlign:'right' }}>% receta</span>
                  <span style={{ textAlign:'right' }}>g / bache</span>
                  <span style={{ textAlign:'right' }}>$ / Kg</span>
                  <span style={{ textAlign:'right' }}>Subtotal</span>
                  <span></span>
                </div>

                {ingredientes.map((r, idx) => {
                  const eff = ingredientesEff.find(x => x._id === r._id) || {}
                  const cantEff = eff.cantidad || 0           // g/bache efectivo (resuelto para relativos)
                  const pctRow  = eff.pctReceta || 0          // % sobre el total de la receta
                  const precioEff = eff.precio != null ? eff.precio : (parseFloat(r.precio)||0)  // precio actual de la MP si es de lista
                  const sub = (precioEff / (parseFloat(r.presentacion)||1000)) * cantEff
                  const modo = r.modo || 'lista'
                  const esRelativo = r.tipo === 'relativo'
                  const accent = esRelativo ? 'var(--dorado)' : undefined
                  return (
                    <div key={r._id} className={ordIng.rowClassName(idx)} {...ordIng.rowProps(idx)} style={{ display:'grid', gridTemplateColumns:'2.2fr 0.7fr 0.9fr 0.8fr 0.9fr 44px', gap:8, alignItems:'start', marginBottom:10 }}>
                      {/* Asa de arrastre + Nombre (toggle + input/select + base si es relativo) */}
                      <div className="ed-col-nombre" style={{ display:'flex', gap:6, alignItems:'flex-start' }}>
                        <span className="ed-drag solo-desktop" {...ordIng.handleProps(idx)}>⠿</span>
                        <div style={{ display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:0 }}>
                        <div style={{ display:'flex' }}>
                          {['lista','manual'].map((m, i) => (
                            <button key={m} type="button" onClick={() => toggleModo(r._id, m)} style={{
                              flex:1, padding:'2px 0', fontSize:'0.67rem', cursor:'pointer',
                              fontFamily:"'Source Sans 3',sans-serif", fontWeight:600,
                              background: modo===m ? (esRelativo?'var(--tierra)':'var(--selva)') : 'transparent',
                              color: modo===m ? 'var(--crema)' : 'var(--texto-suave)',
                              border: `1px solid ${modo===m ? (esRelativo?'var(--tierra)':'var(--selva)') : 'var(--crema-oscuro)'}`,
                              borderRadius: i===0 ? '3px 0 0 3px' : '0 3px 3px 0', marginLeft: i===1 ? -1 : 0,
                            }}>
                              {m==='lista' ? '📦 Lista' : '✏ Manual'}
                            </button>
                          ))}
                        </div>
                        {modo === 'manual'
                          ? <>
                              <input key={`ing-man-${r._id}`} className="form-control" placeholder="Nombre ingrediente" value={r.nombre||''} onChange={e => updIng(r._id,'nombre',e.target.value)} style={{ borderColor: accent }} />
                              {(r.nombre||'').trim() && (
                                <button type="button" onClick={() => abrirNuevaMpDesdeIng(r)}
                                  style={{ background:'none', border:'none', padding:0, textAlign:'left', cursor:'pointer', color:'var(--selva-claro)', fontSize:'0.7rem', textDecoration:'underline' }}>
                                  + Agregar "{r.nombre.trim()}" al inventario de MP
                                </button>
                              )}
                            </>
                          : <BuscadorSelect key={`ing-lst-${r._id}`} value={r.mpId||''} placeholder="Escribe para buscar la MP..."
                              opciones={mpsIngredientes.map(m => ({ value: String(m.id), label: m.nombre, sub: `${fCOP(m.precio)}/${m.unidad}` }))}
                              onSelect={(v) => handleSelectMP(r._id, v)} />
                        }
                        {esRelativo && (
                          <div style={{ display:'flex', flexDirection:'column', gap:3, fontSize:'0.72rem', color:'var(--tierra)' }}>
                            <span>relativo a la suma de (marca uno o varios):</span>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'2px 8px', border:'1px solid var(--dorado)', borderRadius:4, padding:'4px 6px', maxHeight:90, overflowY:'auto' }}>
                              {nombresIngNormal.filter(n => n !== r.nombre).length === 0
                                ? <span style={{ color:'var(--texto-suave)' }}>Agrega ingredientes normales primero</span>
                                : nombresIngNormal.filter(n => n !== r.nombre).map(n => {
                                  const sel = Array.isArray(r.base) ? r.base : (r.base ? [r.base] : [])
                                  const checked = sel.includes(n)
                                  return (
                                    <label key={n} style={{ display:'flex', alignItems:'center', gap:3, cursor:'pointer', whiteSpace:'nowrap' }}>
                                      <input type="checkbox" checked={checked} onChange={() => updIng(r._id,'base', checked ? sel.filter(x => x !== n) : [...sel, n])} />
                                      {n}
                                    </label>
                                  )
                                })}
                            </div>
                          </div>
                        )}
                        </div>
                      </div>

                      {/* % receta */}
                      <div className="ed-col-pct" data-label="% receta">
                      {esRelativo
                        ? <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                            <input type="number" className="form-control" placeholder="0" value={r.pct||''} onFocus={e => e.target.select()} onChange={e => updIng(r._id,'pct',e.target.value)} step="0.01" style={{ textAlign:'right', paddingRight:16, borderColor: accent }} />
                            <span style={{ position:'absolute', right:6, fontSize:'0.78rem', color:'var(--texto-suave)', pointerEvents:'none' }}>%</span>
                          </div>
                        : <span style={{ textAlign:'right', paddingTop:8, fontSize:'0.88rem', color: pctRow>0 ? 'var(--selva)' : 'var(--texto-suave)', fontWeight: pctRow>0 ? 600 : 400 }}>
                            {pctRow > 0 ? pctRow.toFixed(1) + '%' : '—'}
                          </span>
                      }
                      </div>

                      {/* g/bache (modo gramos) o % (modo porcentaje) — calculado para relativo */}
                      <div className="ed-col-cant" data-label={modoIng === 'porcentaje' && !esRelativo ? '% ingreso' : 'g / bache'}>
                      {esRelativo
                        ? <span style={{ textAlign:'right', paddingTop:8, fontSize:'0.88rem', color:'var(--tierra)' }} title="Calculado desde la base">
                            {cantEff > 0 ? cantEff.toFixed(1) + ' g' : '—'}
                          </span>
                        : modoIng === 'porcentaje'
                          ? <div style={{ display:'flex', flexDirection:'column' }}>
                              <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                                <input type="number" className="form-control" placeholder="%" value={r.pct||''} onFocus={e => e.target.select()} onChange={e => updIng(r._id,'pct',e.target.value)} step="0.01" style={{ textAlign:'right', paddingRight:16, background:'rgba(124,179,66,0.06)' }} />
                                <span style={{ position:'absolute', right:6, fontSize:'0.78rem', color:'var(--texto-suave)', pointerEvents:'none' }}>%</span>
                              </div>
                              <span style={{ fontSize:'0.68rem', color:'var(--texto-suave)', textAlign:'right' }}>{cantEff > 0 ? cantEff.toFixed(1)+' g' : '—'}</span>
                            </div>
                          : <input type="number" className="form-control" placeholder="g/bache" value={r.cantidad||''} onFocus={e => e.target.select()} onChange={e => handleCantidadChange(r._id, e.target.value)} style={{ textAlign:'right', background:'rgba(124,179,66,0.06)' }} />
                      }
                      </div>

                      {/* $/Kg — editable; si es de lista y se cambia, queda como override (no toca la MP hasta confirmar al guardar) */}
                      <div className="ed-col-precio" data-label="$ / Kg" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                          <span style={{ position:'absolute', left:6, fontSize:'0.78rem', color:'var(--texto-suave)', pointerEvents:'none' }}>$</span>
                          {r.mpId
                            ? <MoneyInput
                                value={r.precioOverride ? (r.precio || '') : String(precioEff || r.precio || '')}
                                onChange={v => setIngredientes(p => p.map(x => x._id === r._id ? { ...x, precio: v, precioOverride: true } : x))}
                                style={{ paddingLeft:16, background: r.precioOverride ? 'rgba(200,169,74,0.12)' : 'rgba(124,179,66,0.08)', borderColor: r.precioOverride || costoDesfasado(r) ? 'var(--dorado)' : undefined }}
                              />
                            : <MoneyInput value={r.precio||''} onChange={v => updIng(r._id,'precio',v)} style={{ paddingLeft:16, borderColor: accent }} />
                          }
                        </div>
                        {r.mpId && costoDesfasado(r) && (
                          <button type="button" className="btn-link-emp" style={{ fontSize: '0.68rem', textAlign: 'right' }}
                            title={`Inventario: ${fCOP(precioInventarioIng(r) || 0)}/${mps.find(m => String(m.id) === String(r.mpId))?.unidad || 'Kg'}`}
                            onClick={() => actualizarCostoIng(r._id)}>
                            Actualizar costo
                          </button>
                        )}
                      </div>

                      {/* Subtotal */}
                      <span className="ed-sub ed-col-sub" data-label="Subtotal" style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', paddingTop:8, textAlign:'right' }}>{fCOP(sub)}</span>
                      <div className="ed-controls" style={{ display:'flex', alignItems:'center', gap:2, marginTop:6 }}>
                        <button type="button" className="btn btn-xs btn-secondary solo-movil" disabled={idx === 0} title="Subir" onClick={() => ordIng.moverArriba(idx)}>↑</button>
                        <button type="button" className="btn btn-xs btn-secondary solo-movil" disabled={idx === ingredientes.length - 1} title="Bajar" onClick={() => ordIng.moverAbajo(idx)}>↓</button>
                        <button className="btn btn-danger btn-xs" onClick={() => setIngredientes(p => p.filter(x => x._id !== r._id))}><X size={13} aria-hidden="true" /></button>
                      </div>
                    </div>
                  )
                })}
                {ingredientes.length === 0 && <p style={{ color:'var(--texto-suave)', fontSize:'0.88rem', padding:'8px 0' }}>Agrega ingredientes (Normal o Relativo a...)</p>}
              </div>
            </div>
            <div className="ed-footer-ings">
              <small style={{ color:'var(--texto-suave)', fontSize:'0.78rem' }}>
                <strong>g/bache</strong> = gramos usados por bache (define el costo) · <strong>%</strong> receta se calcula automáticamente
              </small>
              <strong>Total MP: {fCOP(calcResult?.totalMPBache||0)}</strong>
            </div>
            </div>
          </details>

          {/* ── Parámetros de producción ── */}
          <details className="card" {...secProps(false)}>
            <summary className="card-title"><Ico as={Settings} size={14} />Parámetros de Producción <span className="card-hint">rendimiento, desperdicio, calidad</span></summary>
            <div className="card-acc-body">
            <div className="form-grid">
              <div className="form-group"><label className="form-label">{presLabel}s por bache</label><input type="number" className="form-control" value={formProd.bache} onChange={e => setFormProd(f=>({...f,bache:e.target.value}))} min={0} step="any" /></div>
              <div className="form-group"><label className="form-label">Baches por mes</label><input type="number" className="form-control" value={formProd.baches_mes} onChange={e => setFormProd(f=>({...f,baches_mes:e.target.value}))} min={1} /></div>
              <div className="form-group">
                <label className="form-label">Vida útil <small style={{ fontWeight:400, textTransform:'none', color:'var(--texto-suave)' }}>(opcional)</small></label>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input type="number" className="form-control" value={formProd.vida_util_valor} onChange={e => setFormProd(f=>({...f,vida_util_valor:e.target.value}))} min={0} placeholder="Ej: 6" style={{ flex:1 }} />
                  <Select className="form-control" value={formProd.vida_util_unidad} onChange={e => setFormProd(f=>({...f,vida_util_unidad:e.target.value}))} style={{ flex:1 }}>
                    <option value="dias">Días</option>
                    <option value="meses">Meses</option>
                  </Select>
                </div>
                <small style={{ color:'var(--texto-suave)', fontSize:'0.68rem' }}>Precarga el vencimiento al producir.</small>
              </div>
              <div className="form-group"><label className="form-label">Rendimiento esperado (%)</label><input type="number" className="form-control" value={rendimiento} onChange={e => setRendimiento(e.target.value)} min={1} max={100} step={0.1} /><small style={{ color:'var(--texto-suave)', fontSize:'0.72rem' }}>% de la mezcla que se convierte en producto (ej. por evaporación/cocción).</small></div>
              <div className="form-group"><label className="form-label">% Desperdicio</label><input type="number" className="form-control" value={desperdicio} onChange={e => setDesperdicio(e.target.value)} min={0} max={50} step={0.1} /><small style={{ color:'var(--texto-suave)', fontSize:'0.72rem' }}>Desperdicio <strong>adicional</strong> que se pierde <strong>después</strong> del rendimiento (no es la diferencia de 100 − rendimiento; se descuenta sobre lo ya rendido).</small></div>
              <div className="form-group"><label className="form-label">Peso por {presLabel} (g)</label><input type="number" className="form-control" value={pesoUnidad} onChange={e => setPesoUnidad(e.target.value)} min={1} /></div>
              <div className="form-group">
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.85rem', cursor:'pointer', fontWeight:600, color:'var(--selva)', minHeight:'1.2rem' }}>
                  <input type="checkbox" checked={porciona} onChange={e => setPorciona(e.target.checked)} />
                  Se porciona
                </label>
                {porciona
                  ? <input type="number" className="form-control" value={pesoSubporcion} onChange={e => setPesoSubporcion(e.target.value)} min={1} placeholder="Peso subporción (g)" style={{ marginTop:4 }} />
                  : <div style={{ fontSize:'0.72rem', color:'var(--texto-suave)', marginTop:6 }}>Subporciones por {presLabel}</div>}
                {porciona && (parseFloat(pesoSubporcion)||0) > 0 && (
                  <small style={{ color:'var(--texto-suave)', fontSize:'0.72rem' }}>
                    {((parseFloat(pesoUnidad)||0)/parseFloat(pesoSubporcion)).toFixed(1)} subporciones por {presLabel} de {fNum(parseFloat(pesoUnidad)||0)} g
                  </small>
                )}
              </div>
              <div className="form-group">
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.85rem', cursor:'pointer', fontWeight:600, color:'var(--selva)', minHeight:'1.2rem' }}>
                  <input type="checkbox" checked={!!formProd.empaca_surtido} onChange={e => setFormProd(f => ({ ...f, empaca_surtido: e.target.checked }))} />
                  Se empaca surtido con otro producto
                </label>
                <small style={{ color:'var(--texto-suave)', fontSize:'0.72rem' }}>Habilita el campo “Empacó surtido” al diligenciar e imprimir la orden.</small>
              </div>
            </div>

            {/* Método de loteo — constructor por fichas (click → arma el patrón) */}
            <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid var(--crema-oscuro)' }}>
              <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', marginBottom:6 }}>
                <Ico as={Tag} size={14} />Método de loteo
              </div>
              <p style={{ fontSize:'0.78rem', color:'var(--texto-suave)', margin:'0 0 10px' }}>
                Para la serie tipo <strong>10026 → 10426</strong> usa el atajo <strong>Serie nAA</strong> (Numeración + Año aa).
                Si armas Día + Mes + Año <em>sin</em> Numeración, en órdenes sugerirá la fecha del día (<strong>260826</strong>), no el consecutivo.
              </p>

              {(() => {
                const cfg = normalizarMetodoLoteo(formProd.metodo_loteo)
                const partes = cfg?.partes || []
                const setPartes = (next) => setFormProd(f => ({ ...f, metodo_loteo: configDesdePartes(next) }))
                const clickFicha = (ficha) => {
                  // Texto / separador: se agrega la ficha y se edita el valor en el chip
                  if (ficha.tipo === 'texto') {
                    setPartes(agregarParte(partes, ficha, 'X'))
                    return
                  }
                  if (ficha.tipo === 'sep') {
                    setPartes(agregarParte(partes, ficha, ficha.defaultValor || '-'))
                    return
                  }
                  setPartes(agregarParte(partes, ficha))
                }
                const ej = cfg ? ejemploLote(cfg) : '—'
                const sig = cfg && ej !== '—' ? (sugerirSiguienteLote(cfg, [ej]) || '—') : '—'
                const tieneSeq = partes.some(p => p.tipo === 'seq')

                return (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                      {ATAJOS_LOTEO.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => setFormProd(f => ({ ...f, metodo_loteo: normalizarMetodoLoteo(a.config) }))}
                          title={a.desc}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                    <label className="form-label">Plantilla del lote</label>
                    <div
                      style={{
                        minHeight: 48,
                        padding: '8px 10px',
                        border: '1.5px solid var(--crema-oscuro)',
                        borderRadius: 'var(--radio)',
                        background: 'var(--crema)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        alignItems: 'center',
                      }}
                    >
                      {partes.length === 0 ? (
                        <span style={{ color: 'var(--texto-suave)', fontSize: '0.82rem' }}>
                          Sin método — haz clic en las fichas para armar el lote…
                        </span>
                      ) : partes.map((p, i) => (
                        <span
                          key={`${p.tipo}-${i}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '5px 8px',
                            borderRadius: 8,
                            background: 'rgba(45,90,61,0.1)',
                            border: '1px solid rgba(45,90,61,0.25)',
                            color: 'var(--selva)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          {etiquetaParte(p)}
                          {p.tipo === 'seq' && (
                            <select
                              value={String(p.ancho || 2)}
                              onChange={e => setPartes(actualizarParte(partes, i, { ancho: parseInt(e.target.value, 10) || 2 }))}
                              title="Ceros a la izquierda"
                              style={{
                                marginLeft: 2,
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--selva)',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="1">1 dig</option>
                              <option value="2">2 dig</option>
                              <option value="3">3 dig</option>
                              <option value="4">4 dig</option>
                            </select>
                          )}
                          {(p.tipo === 'texto' || p.tipo === 'sep') && (
                            <input
                              value={p.valor || ''}
                              onChange={e => setPartes(actualizarParte(partes, i, {
                                valor: p.tipo === 'texto' ? e.target.value.toUpperCase() : e.target.value,
                              }))}
                              style={{
                                width: Math.max(28, (p.valor || '').length * 10 + 16),
                                border: 'none',
                                borderBottom: '1px dashed var(--selva)',
                                background: 'transparent',
                                color: 'var(--selva)',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                padding: '0 2px',
                              }}
                              maxLength={p.tipo === 'sep' ? 3 : 12}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => setPartes(quitarParte(partes, i))}
                            title="Quitar"
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--rojo)',
                              cursor: 'pointer',
                              padding: 0,
                              lineHeight: 1,
                              fontSize: '0.95rem',
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {partes.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary"
                          style={{ marginLeft: 'auto' }}
                          onClick={() => setFormProd(f => ({ ...f, metodo_loteo: null }))}
                        >
                          Limpiar
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {FICHAS_LOTEO.map(ficha => {
                        const activa = partes.some(p =>
                          ficha.grupoAnio
                            ? (p.tipo === 'aa' || p.tipo === 'aaaa') && p.tipo === ficha.tipo
                            : p.tipo === ficha.tipo && ficha.unica
                        )
                        return (
                          <button
                            key={ficha.id}
                            type="button"
                            onClick={() => clickFicha(ficha)}
                            style={{
                              minWidth: 92,
                              padding: '10px 12px',
                              borderRadius: 10,
                              border: activa
                                ? '1.5px solid var(--selva)'
                                : '1.5px solid var(--crema-oscuro)',
                              background: activa ? 'rgba(124,179,66,0.15)' : 'var(--blanco, #fff)',
                              cursor: 'pointer',
                              textAlign: 'left',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--selva)' }}>{ficha.label}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--texto-suave)', marginTop: 2 }}>{ficha.hint}</div>
                          </button>
                        )
                      })}
                    </div>

                    {cfg ? (
                      <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(124,179,66,0.08)', borderRadius: 'var(--radio)', fontSize: '0.82rem' }}>
                        Plantilla: <strong>{describirPlantilla(cfg)}</strong>
                        {' · '}Vista previa: <strong style={{ color: 'var(--selva)', letterSpacing: 0.5 }}>{ej}</strong>
                        {' · '}Siguiente: <strong>{sig}</strong>
                        {!tieneSeq && (
                          <div style={{ marginTop: 6, color: 'var(--rojo)', fontSize: '0.78rem' }}>
                            Sin Numeración: en órdenes sugerirá la fecha del día (ddmmaa), no 10426. Usa el atajo «Serie nAA».
                          </div>
                        )}
                      </div>
                    ) : (
                      <small style={{ display: 'block', marginTop: 8, color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
                        Tip: atajo «Serie nAA» → lotes tipo 0126, 10026, 10426…
                      </small>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Parámetros de calidad (fisicoquímicos, reológicos, nutricionales...) */}
            <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid var(--crema-oscuro)' }}>
              <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem' }}><Ico as={FlaskConical} size={14} />Parámetros de Calidad <small style={{ fontWeight:400, color:'var(--texto-suave)' }}>— fisicoquímicos, reológicos, nutricionales y de pureza</small></div>
                <button type="button" className="btn btn-sm btn-secondary" style={{ marginLeft:'auto' }} onClick={addParamCalidad}>+ Agregar parámetro</button>
              </div>
              <datalist id="dl-params-calidad">
                {CATALOGO_PARAMS.map(g => g.items.map(i => <option key={i.nombre} value={i.nombre}>{g.grupo}</option>))}
              </datalist>
              {paramsCalidad.length === 0
                ? <p style={{ fontSize:'0.82rem', color:'var(--texto-suave)' }}>Sin parámetros. Agrega Brix, % humedad, pH, proteínas, etc.</p>
                : paramsCalidad.map((pc, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 0.8fr auto', gap:8, marginBottom:8, alignItems:'center' }}>
                    <input className="form-control" list="dl-params-calidad" placeholder="Parámetro (ej. pH, Brix...)" value={pc.nombre} onChange={e => updParamCalidad(i,'nombre',e.target.value)} />
                    <input className="form-control" placeholder="Valor" value={pc.valor} onChange={e => updParamCalidad(i,'valor',e.target.value)} />
                    <input className="form-control" placeholder="Unidad" value={pc.unidad} onChange={e => updParamCalidad(i,'unidad',e.target.value)} />
                    <button type="button" className="btn btn-danger btn-xs" onClick={() => delParamCalidad(i)}><X size={13} aria-hidden="true" /></button>
                  </div>
                ))}
            </div>

            {/* Conexión receta → unidades por bache */}
            <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(124,179,66,0.08)', borderRadius:'var(--radio)', border:'1px solid rgba(124,179,66,0.2)', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <span style={{ fontSize:'0.85rem', color:'var(--selva)' }}>
                Mezcla: <strong>{fNum(totalGramosBache)} g/bache</strong> →
                Unidades estimadas: <strong style={{ color:'var(--selva)' }}>{unidadesDesdeReceta > 0 ? unidadesDesdeReceta.toFixed(1) : '—'}</strong>
                {' '}<small style={{ color:'var(--texto-suave)' }}>(g × rend% × (1−desp%) ÷ peso unidad)</small>
              </span>
              {(() => {
                // Se conservan hasta 2 decimales (no se redondea a entero): un bache que rinde
                // 62,5 unidades cuesta distinto por unidad que uno de 63, y para el costeo esa
                // fracción importa. El campo "Unidades por bache" acepta decimales.
                const estimada = Math.round(unidadesDesdeReceta * 100) / 100
                return (
                  <button
                    className="btn btn-xs btn-success"
                    disabled={!(unidadesDesdeReceta > 0)}
                    onClick={() => { setFormProd(f => ({ ...f, bache: estimada })); toast('Unidades por bache actualizadas desde la receta ✓') }}
                    title="Copia las unidades estimadas al campo 'Unidades por bache' (Información del Producto)"
                  >
                    ↑ Usar como "Unidades por bache" ({unidadesDesdeReceta > 0 ? estimada.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : 0})
                  </button>
                )
              })()}
            </div>
            </div>
          </details>

          {/* ── Mano de obra ── */}
          <details className="card" {...secProps(procesos.length > 0)}>
            <summary className="card-title"><Ico as={Clock} size={14} />Mano de Obra (por proceso)<span className="card-hint">{procesos.length} proceso{procesos.length === 1 ? '' : 's'}</span><div onClick={e => e.stopPropagation()} style={{ marginLeft:8 }}><button className="btn btn-sm btn-secondary" onClick={addProceso}>+ Agregar proceso</button></div></summary>
            <div className="card-acc-body">
            <div style={{ overflowX:'auto' }}>
              <div className="ed-wrap" style={{ minWidth:500 }}>
                <div className="ed-head" style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 44px', gap:8, paddingBottom:8, fontSize:'0.72rem', fontWeight:700, color:'var(--texto-suave)', textTransform:'uppercase' }}>
                  <span>Proceso</span><span>Minutos/bache</span><span>Costo (auto)</span><span></span>
                </div>
                {procesos.map((r, idx) => (
                  <div key={r._id} className={ordProc.rowClassName(idx)} {...ordProc.rowProps(idx)} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 44px', gap:8, alignItems:'center', marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span {...ordProc.handleProps(idx)}>⠿</span>
                      <input className="form-control" placeholder="Nombre del proceso" value={r.nombre} onChange={e => updProc(r._id,'nombre',e.target.value)} style={{ flex:1, minWidth:0 }} />
                    </div>
                    <input type="number" className="form-control" placeholder="Minutos" value={r.minutos} onChange={e => updProc(r._id,'minutos',e.target.value)} />
                    <span className="ed-sub" style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.9rem' }}>{fCOP((parseFloat(r.minutos)||0)*costoMin)}</span>
                    <div className="ed-controls" style={{ display:'flex', alignItems:'center', gap:2 }}>
                      <button className="btn btn-danger btn-xs" onClick={() => setProcesos(p => p.filter(x => x._id !== r._id))}><X size={13} aria-hidden="true" /></button>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize:'0.78rem', color:'var(--texto-suave)', marginTop:8 }}>
                  Costo/minuto: <strong>{fCOP(costoMin)}</strong> ({operariosActivos} operarios · CIF {fCOP(cifTotal)})
                </div>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}><strong>Total MO: {fCOP(calcResult?.totalMOBache||0)}</strong></div>
            </div>
          </details>

          {/* ── Empaque ── */}
          <details className="card" {...secProps(empaque.length > 0)}>
            <summary className="card-title"><Ico as={Package} size={14} />Empaque & Envase<span className="card-hint">{empaque.length} ítem{empaque.length === 1 ? '' : 's'}</span><div onClick={e => e.stopPropagation()} style={{ marginLeft:8 }}><button className="btn btn-sm btn-secondary" onClick={addEmpaque}>+ Agregar</button></div></summary>
            <div className="card-acc-body">
            <div style={{ overflowX:'auto' }}>
              <div className="ed-wrap" style={{ minWidth:720 }}>
                <div className="ed-head" style={{ display:'grid', gridTemplateColumns:'2.2fr 1fr 1fr 1fr 1fr 44px', gap:8, paddingBottom:6, fontSize:'0.72rem', fontWeight:700, color:'var(--texto-suave)', textTransform:'uppercase' }}>
                  <span>Ítem</span><span style={{ textAlign:'right' }}>$ precio/u</span><span style={{ textAlign:'right' }}>Presentación</span><span style={{ textAlign:'right' }}>Cantidad</span><span style={{ textAlign:'right' }}>Subtotal</span><span></span>
                </div>
                {empaque.map((r, idx) => {
                  const sub = ((parseFloat(r.precio)||0)/(parseFloat(r.presentacion)||1))*(parseFloat(r.cantidad)||0)
                  const modo = r.modo || 'lista'
                  return (
                    <div key={r._id} className={ordEmp.rowClassName(idx)} {...ordEmp.rowProps(idx)} style={{ display:'grid', gridTemplateColumns:'2.2fr 1fr 1fr 1fr 1fr 44px', gap:8, alignItems:'start', marginBottom:10 }}>
                      {/* Asa + Nombre: toggle + select(empaque)/input */}
                      <div style={{ display:'flex', gap:6, alignItems:'flex-start' }}>
                        <span {...ordEmp.handleProps(idx)}>⠿</span>
                        <div style={{ display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:0 }}>
                        <div style={{ display:'flex' }}>
                          {['lista','manual'].map((m, i) => (
                            <button key={m} type="button" onClick={() => toggleModoEmpaque(r._id, m)} style={{
                              flex:1, padding:'2px 0', fontSize:'0.67rem', cursor:'pointer',
                              fontFamily:"'Source Sans 3',sans-serif", fontWeight:600,
                              background: modo===m ? 'var(--selva)' : 'transparent',
                              color: modo===m ? 'var(--crema)' : 'var(--texto-suave)',
                              border: `1px solid ${modo===m ? 'var(--selva)' : 'var(--crema-oscuro)'}`,
                              borderRadius: i===0 ? '3px 0 0 3px' : '0 3px 3px 0', marginLeft: i===1 ? -1 : 0,
                            }}>
                              {m==='lista' ? '📦 Lista' : '✏ Manual'}
                            </button>
                          ))}
                        </div>
                        {modo === 'manual'
                          ? <input key={`emp-man-${r._id}`} className="form-control" placeholder="Ítem (caja, bolsa...)" value={r.nombre||''} onChange={e => updEmp(r._id,'nombre',e.target.value)} />
                          : <Select key={`emp-lst-${r._id}`} className="form-control" value={r.mpId||''} onChange={e => handleSelectEmpaqueMP(r._id, e.target.value)}>
                              <option value="">Seleccionar empaque...</option>
                              {mpsEmpaque.map(m => <option key={m.id} value={m.id}>{m.nombre} — {fCOP(m.precio)}/{m.unidad}</option>)}
                              {mpsEmpaque.length === 0 && <option value="" disabled>No hay insumos de empaque — usa modo ✏ Manual o créalos en Inventario MP</option>}
                            </Select>
                        }
                        </div>
                      </div>
                      <MoneyInput value={r.precio} onChange={v => updEmp(r._id,'precio',v)} placeholder="$ precio/u" style={{ background: r.mpId ? 'rgba(124,179,66,0.04)' : undefined }} />
                      <input type="number" className="form-control" placeholder="Presentación" value={r.presentacion} onChange={e => updEmp(r._id,'presentacion',e.target.value)} style={{ textAlign:'right' }} />
                      <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                        <input type="number" className="form-control" placeholder="Cantidad" value={r.cantidad} onChange={e => updEmp(r._id,'cantidad',e.target.value)} style={{ textAlign:'right' }} />
                        <button type="button" className="btn btn-xs btn-success"
                          disabled={!((parseFloat(formProd.bache)||0) > 0)}
                          title="Igualar a las unidades por bache"
                          onClick={() => updEmp(r._id,'cantidad', parseFloat(formProd.bache)||0)}>
                          ⚡ = bache ({parseFloat(formProd.bache)||0})
                        </button>
                      </div>
                      <span className="ed-sub" style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', paddingTop:8, textAlign:'right' }}>{fCOP(sub)}</span>
                      <div className="ed-controls" style={{ display:'flex', alignItems:'center', gap:2, marginTop:6 }}>
                        <button className="btn btn-danger btn-xs" onClick={() => setEmpaque(p => p.filter(x => x._id !== r._id))}><X size={13} aria-hidden="true" /></button>
                      </div>
                    </div>
                  )
                })}
                {empaque.length === 0 && <p style={{ color:'var(--texto-suave)', fontSize:'0.88rem', padding:'8px 0' }}>Agrega empaques (caja, bolsa, etiqueta...)</p>}
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}><strong>Total Empaque: {fCOP(calcResult?.totalEmpBache||0)}</strong></div>
            </div>
          </details>

          {/* ── Costos adicionales personalizados — la depreciación se gestiona centralmente ── */}
          <div className="card">
            <div className="card-title" style={{ cursor:'pointer' }} onClick={() => setAdicOpen(o => !o)}>
              <Ico as={DollarSign} size={14} />Costos Adicionales {(adicionales.length + costosHora.length) > 0 ? `(${adicionales.length + costosHora.length})` : ''}
              <button type="button" className="btn btn-sm btn-secondary" style={{ marginLeft:'auto' }} onClick={(e) => { e.stopPropagation(); setAdicOpen(o => !o) }}><Ico as={adicOpen ? ChevronUp : ChevronDown} size={14} />{adicOpen ? 'Ocultar' : 'Mostrar'}</button>
            </div>
            {adicOpen && (
              <div>
                <small style={{ color:'var(--texto-suave)', display:'block', marginBottom:8 }}>Costos extra exclusivos de esta ficha. Suman al <strong>costo final por unidad</strong> según su base.</small>
                <div className="alert alert-warning" style={{ fontSize:'0.8rem' }}>
                  ⚠ <strong>Úsalo solo para valores exclusivos de este producto.</strong> La depreciación y asignación de máquinas
                  se configura centralmente en <strong>Costos y Gastos → Agregar depreciación</strong>, para evitar contarla dos veces.
                </div>
                {adicionales.map((a, i) => {
                  const updA = (campos) => setAdicionales(arr => arr.map((x,idx) => idx===i ? { ...x, ...campos } : x))
                  if (a.dep) {
                    // Modo depreciación por horas: valor de la máquina ÷ horas de vida útil × horas por bache.
                    // Cada cambio en los 3 parámetros recalcula `valor` (base bache), que es lo que usa el costeo.
                    const vm = parseFloat(a.dep.valorMaquina) || 0, hv = parseFloat(a.dep.horasVida) || 0, hb = parseFloat(a.dep.horasBache) || 0
                    const costoHora = hv > 0 ? vm / hv : 0
                    const valorBache = costoHora * hb
                    const updDep = (campo, val) => {
                      const dep = { ...a.dep, [campo]: val }
                      const vm2 = parseFloat(dep.valorMaquina) || 0, hv2 = parseFloat(dep.horasVida) || 0, hb2 = parseFloat(dep.horasBache) || 0
                      updA({ dep, valor: hv2 > 0 ? (vm2 / hv2) * hb2 : 0, base: 'bache' })
                    }
                    return (
                      <div key={a._id || i} style={{ border:'1px solid var(--crema-oscuro)', borderRadius:'var(--radio)', padding:'8px 10px', marginBottom:6 }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1.4fr 0.9fr 0.7fr 0.7fr auto', gap:6, alignItems:'end' }}>
                          <div><label style={{ fontSize:'0.68rem', color:'var(--texto-suave)' }}>Máquina / equipo</label><input className="form-control" value={a.descripcion || ''} onChange={e => updA({ descripcion: e.target.value })} placeholder="Ej. Depreciación horno" /></div>
                          <div><label style={{ fontSize:'0.68rem', color:'var(--texto-suave)' }}>Valor máquina ($)</label><input type="number" className="form-control" value={a.dep.valorMaquina ?? ''} onChange={e => updDep('valorMaquina', e.target.value)} min={0} step="any" placeholder="4000000" /></div>
                          <div><label style={{ fontSize:'0.68rem', color:'var(--texto-suave)' }}>Vida útil (horas)</label><input type="number" className="form-control" value={a.dep.horasVida ?? ''} onChange={e => updDep('horasVida', e.target.value)} min={0} step="any" placeholder="10000" /></div>
                          <div><label style={{ fontSize:'0.68rem', color:'var(--texto-suave)' }}>Horas por bache</label><input type="number" className="form-control" value={a.dep.horasBache ?? ''} onChange={e => updDep('horasBache', e.target.value)} min={0} step="any" placeholder="2" /></div>
                          <button type="button" className="btn btn-xs btn-danger" onClick={() => setAdicionales(arr => arr.filter((_,idx) => idx!==i))}>✕</button>
                        </div>
                        <small style={{ display:'block', marginTop:4, color: valorBache > 0 ? 'var(--selva)' : 'var(--texto-suave)', fontSize:'0.72rem' }}>
                          {valorBache > 0
                            ? <>Costo/hora: <strong>{fCOP(costoHora)}</strong> × {hb} h = <strong>{fCOP(valorBache)}</strong> por bache (se divide entre las unidades del bache).</>
                            : 'Llena los tres valores para calcular la depreciación por bache.'}
                        </small>
                      </div>
                    )
                  }
                  return (
                  <div key={a._id || i} style={{ display:'grid', gridTemplateColumns:'1.4fr 0.9fr 0.9fr auto', gap:6, alignItems:'end', marginBottom:6 }}>
                    <div><label style={{ fontSize:'0.68rem', color:'var(--texto-suave)' }}>Descripción</label><input className="form-control" value={a.descripcion || ''} onChange={e => updA({ descripcion: e.target.value })} placeholder="Ej. Depreciación horno" /></div>
                    <div><label style={{ fontSize:'0.68rem', color:'var(--texto-suave)' }}>Valor (COP)</label><input type="number" className="form-control" value={a.valor ?? ''} onChange={e => updA({ valor: e.target.value })} min={0} step="any" /></div>
                    <div><label style={{ fontSize:'0.68rem', color:'var(--texto-suave)' }}>Base</label><Select className="form-control" value={a.base || 'unidad'} onChange={e => updA({ base: e.target.value })}><option value="unidad">por unidad</option><option value="bache">por bache</option><option value="mes">por mes</option></Select></div>
                    <button type="button" className="btn btn-xs btn-danger" onClick={() => setAdicionales(arr => arr.filter((_,idx) => idx!==i))}>✕</button>
                  </div>
                  )
                })}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAdicionales(arr => [...arr, { _id: Date.now()+Math.random(), descripcion:'', valor:'', base:'unidad' }])}><Ico as={Plus} size={13} /> Agregar costo</button>
                </div>
                <small style={{ display:'block', marginTop:8, color:'var(--texto-suave)', fontSize:'0.72rem' }}>Base: <strong>por unidad</strong> suma directo; <strong>por bache</strong> se divide entre las unidades del bache; <strong>por mes</strong> se divide entre las unidades del mes.</small>

                {(formProd.tipo === 'mp' || formProd.tipo === 'subproducto') && (
                  <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid var(--crema-oscuro)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:8 }}>
                      <strong style={{ color:'var(--selva)' }}><Ico as={Clock} size={14} />Costos adicionales por horas o días</strong>
                      <button type="button" className="btn btn-sm btn-secondary" style={{ marginLeft:'auto' }} onClick={() => setCostosHora(arr => [...arr, { _id: Date.now() + Math.random(), nombre:'', unidad:'hora', tarifa:'', cantidad_default:'' }])}>+ Agregar costo</button>
                    </div>
                    <small style={{ color:'var(--texto-suave)', display:'block', marginBottom:8 }}>
                      Ejemplo: consumo energético del horno por hora. La <strong>cantidad sugerida × tarifa</strong> entra al costo de producto
                      (repartida entre las unidades del bache). En cada orden se diligencia la cantidad real.
                    </small>
                    {costosHora.length === 0
                      ? <p style={{ fontSize:'0.82rem', color:'var(--texto-suave)', margin:0 }}>Sin costos por tiempo. Agrégalos para que aparezcan al diligenciar la orden.</p>
                      : costosHora.map((c, i) => (
                        <div key={c._id || i} className="form-grid-4" style={{ marginBottom:8, alignItems:'end' }}>
                          <div><label className="form-label">Concepto</label><input className="form-control" value={c.nombre || ''} onChange={e => setCostosHora(arr => arr.map((x, idx) => idx === i ? { ...x, nombre:e.target.value } : x))} placeholder="Energía horno" /></div>
                          <div><label className="form-label">Unidad</label><Select className="form-control" value={c.unidad || 'hora'} onChange={e => setCostosHora(arr => arr.map((x, idx) => idx === i ? { ...x, unidad:e.target.value } : x))}><option value="hora">Hora</option><option value="dia">Día</option></Select></div>
                          <div><label className="form-label">Tarifa</label><MoneyInput value={c.tarifa || ''} onChange={v => setCostosHora(arr => arr.map((x, idx) => idx === i ? { ...x, tarifa:v } : x))} /></div>
                          <div style={{ display:'flex', gap:6, alignItems:'end' }}><div style={{ flex:1 }}><label className="form-label">Cantidad sugerida</label><input type="number" min="0" step="any" className="form-control" value={c.cantidad_default || ''} onChange={e => setCostosHora(arr => arr.map((x, idx) => idx === i ? { ...x, cantidad_default:e.target.value } : x))} /></div><button type="button" className="btn btn-xs btn-danger" onClick={() => setCostosHora(arr => arr.filter((_, idx) => idx !== i))}><X size={13} aria-hidden="true" /></button></div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Ficha técnica (instrucciones paso a paso) ── */}
          <details className="card" {...secProps(!!fichaNombre)}>
            <summary className="card-title"><Ico as={FileText} size={14} />Ficha Técnica — Instrucciones de Elaboración<span className="card-hint">{fichaNombre || 'opcional'}</span></summary>
            <div className="card-acc-body">
            {/* En el celular el nombre largo del archivo empujaba los botones fuera de la pantalla
                y no se podía quitar la ficha: por eso la fila envuelve y los botones no se encogen. */}
            {fichaNombre && (
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, padding:'8px 12px', background:'rgba(124,179,66,0.08)', borderRadius:'var(--radio)', border:'1px solid rgba(124,179,66,0.2)', flexWrap:'wrap' }}>
                <span style={{ flex:'1 1 140px', minWidth:0, fontSize:'0.88rem', color:'var(--selva-claro)', overflowWrap:'anywhere' }}><Ico as={FileText} size={14} /><strong>{fichaNombre}</strong></span>
                {fichaFile && <span style={{ fontSize:'0.75rem', color:'var(--texto-suave)', flexShrink:0 }}>pendiente de guardar</span>}
                <div style={{ display:'flex', gap:6, flexShrink:0, marginLeft:'auto' }}>
                  {fichaPath && !fichaFile && <button className="btn btn-xs btn-dorado" onClick={descargarFicha}><Ico as={Download} size={14} />Descargar</button>}
                  <button className="btn btn-xs btn-danger" title="Quitar la ficha técnica" onClick={() => { setFichaFile(null); setFichaNombre(''); setFichaPath('') }}><X size={13} aria-hidden="true" />Quitar</button>
                </div>
              </div>
            )}
            <label className="btn btn-secondary btn-sm" style={{ cursor:'pointer', display:'inline-flex' }}>
              📎 {fichaNombre ? 'Reemplazar PDF/Word' : 'Subir PDF o Word'}
              <input type="file" accept=".pdf,.doc,.docx" onChange={e => { const f=e.target.files[0]; if(f){setFichaFile(f);setFichaNombre(f.name)} }} style={{ display:'none' }} />
            </label>
            </div>
          </details>

          {/* ── Insumos imprimibles: PDFs que el operario imprime durante la producción ── */}
          <details className="card" {...secProps(imprimibles.length > 0)}>
            <summary className="card-title">
              <Ico as={Printer} size={14} />Insumos Imprimibles
              <span className="card-hint">{imprimibles.length > 0 ? `${imprimibles.length} archivo(s)` : 'etiquetas, rótulos…'}</span>
            </summary>
            <div className="card-acc-body">
              <div className="alert alert-info" style={{ fontSize:'0.82rem' }}>
                ℹ Sube en PDF las <strong>etiquetas, rótulos o instructivos</strong> que se imprimen al fabricar este producto.
                El operario los verá al diligenciar la orden de producción y podrá imprimirlos directo desde la tablet,
                sin tener que buscarlos ni pedirlos.
              </div>
              {imprimibles.length > 0 && (
                <div style={{ display:'grid', gap:6, marginBottom:10 }}>
                  {imprimibles.map((imp, i) => (
                    // En pantalla angosta el nombre empujaba los botones fuera de la caja y no se
                    // podía eliminar: ahora el nombre se parte en varias líneas y los botones
                    // nunca se encogen (flexShrink 0), así siempre quedan accesibles.
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'var(--crema)', borderRadius:'var(--radio)', flexWrap:'wrap' }}>
                      <Ico as={FileText} size={14} />
                      <span style={{ flex:'1 1 140px', fontSize:'0.86rem', minWidth:0, overflowWrap:'anywhere' }}>{imp.nombre}</span>
                      {imp.size > 0 && <small style={{ color:'var(--texto-suave)', flexShrink:0 }}>{(imp.size / 1024).toFixed(0)} KB</small>}
                      <div style={{ display:'flex', gap:6, flexShrink:0, marginLeft:'auto' }}>
                        <button type="button" className="btn btn-xs btn-secondary" onClick={() => abrirImprimible(imp)}><Ico as={Printer} size={13} />Ver</button>
                        <button type="button" className="btn btn-xs btn-danger" title="Quitar este archivo" onClick={() => quitarImprimible(i)}><X size={13} aria-hidden="true" />Quitar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <label className={`btn btn-secondary btn-sm ${subiendoImp ? 'disabled' : ''}`} style={{ cursor: subiendoImp ? 'wait' : 'pointer', display:'inline-flex' }}>
                <Ico as={Printer} size={14} />{subiendoImp ? 'Subiendo…' : 'Agregar PDF imprimible'}
                <input type="file" accept="application/pdf" multiple disabled={subiendoImp} onChange={subirImprimible} style={{ display:'none' }} />
              </label>
              <small style={{ display:'block', marginTop:6, color:'var(--texto-suave)', fontSize:'0.72rem' }}>Solo PDF, hasta 15 MB por archivo. Puedes subir varios a la vez.</small>
            </div>
          </details>

          {/* ── Precios y Resumen ──
              En móvil son dos acordeones más de la misma serie (se abren de a uno); en escritorio
              se ven lado a lado y siempre abiertos, que es donde el usuario compara precio contra
              costo mientras ajusta. */}
          <div className="grid-resp" style={{ gridTemplateColumns:'1fr 1fr', gap:20 }}>
            <details className="card" {...secProps(true)}>
              <summary className="card-title"><Ico as={DollarSign} size={14} />Precios de Venta
                {calcResult && <span className="card-hint">{fCOP(parseFloat(formProd.precio_mayor) || 0)} por mayor</span>}
              </summary>
              <div className="card-acc-body">

              {/* ── Precio sugerido por la norma de costeo por absorción ── */}
              {calcResult && calcResult.costoTotalUnit > 0 && (() => {
                // Utilidad objetivo PROPIA de esta ficha; si está vacía, la global de la empresa
                const utilFicha = formProd.utilidad_objetivo !== '' && formProd.utilidad_objetivo != null
                  ? (parseFloat(formProd.utilidad_objetivo) || 0) : utilidadObjetivo
                const comisionPct = parseFloat(formProd.comision) || 0
                const sug = getPrecioSugerido({
                  costoProduccionUnit: calcResult.costoTotalUnit, tasaGastosOper,
                  comisionPct, icaPct: 0, utilidadPct: utilFicha,
                })
                const precioActual = parseFloat(formProd.precio_mayor) || 0
                const bajoMinimo = precioActual > 0 && precioActual < sug.precioMinimo
                const bajoObjetivo = precioActual > 0 && precioActual < sug.precioObjetivo && !bajoMinimo
                const color = bajoMinimo ? 'var(--rojo)' : bajoObjetivo ? 'var(--dorado)' : 'var(--selva)'
                // Costo pleno = costo de producción + gastos operativos por u (solo para el cálculo NETO;
                // NO es el costo del producto ni la base del precio, que es solo el costo de producción).
                const costoPlenoUnit = calcResult.costoTotalUnit + sug.gastosOperUnit
                // Utilidad BRUTA (antes de gastos) al precio objetivo = precio − costo de producción.
                const utilBrutaUnit = sug.precioObjetivo - calcResult.costoTotalUnit
                const utilBrutaPct = sug.precioObjetivo > 0 ? (utilBrutaUnit / sug.precioObjetivo) * 100 : 0
                // Lo que realmente queda NETO con el precio actual, tras comisión y gastos operativos (sin ICA).
                const utilRealUnit = precioActual > 0
                  ? precioActual * (1 - comisionPct / 100) - costoPlenoUnit : 0
                const utilRealPct = precioActual > 0 ? (utilRealUnit / precioActual) * 100 : 0
                // Utilidad BRUTA con el precio actual (antes de gastos operativos).
                const utilBrutaRealUnit = precioActual > 0 ? precioActual - calcResult.costoTotalUnit : 0
                const utilBrutaRealPct = precioActual > 0 ? (utilBrutaRealUnit / precioActual) * 100 : 0
                return (
                  <div style={{ background:'#fff8e8', border:`1px solid ${color}`, borderRadius:'var(--radio)', padding:'12px', marginBottom:14 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:8 }}>
                      <strong style={{ color:'var(--selva)', fontSize:'0.88rem' }}><Ico as={TrendingUp} size={14} />Precio sugerido</strong>
                      <span style={{ fontSize:'0.75rem', color:'var(--texto-suave)' }}>utilidad de este producto</span>
                      <input type="number" className="form-control" style={{ width:64, textAlign:'right', padding:'2px 6px' }}
                        value={formProd.utilidad_objetivo} min={0} max={99} step={1} placeholder={String(utilidadObjetivo)}
                        onChange={e => setFormProd(f => ({ ...f, utilidad_objetivo: e.target.value }))}
                        title={`Utilidad objetivo SOLO de este producto. Vacío = usa la de la empresa (${utilidadObjetivo}%). Se guarda con la ficha.`} />
                      <span style={{ fontSize:'0.8rem' }}>%</span>
                    </div>
                    {!sug.viable
                      ? <div className="alert alert-warning" style={{ fontSize:'0.8rem' }}>La comisión ({comisionPct}%) y la utilidad objetivo ({utilFicha}%) suman 100% o más: no existe un precio que los cubra. Baja alguno.</div>
                      : <>
                          <table style={{ fontSize:'0.84rem', width:'100%' }}>
                            <tbody>
                              <tr><td>Costo de producción/u <small style={{ color:'var(--texto-suave)' }}>(MP + empaque + CIF)</small></td><td className="td-number">{fCOP(calcResult.costoTotalUnit)}</td></tr>
                              <tr style={{ color:'var(--tierra)' }}><td><strong>Precio mínimo</strong> <small>(cubre costo de producción + comisión, sin utilidad)</small></td><td className="td-number"><strong>{fCOP(sug.precioMinimo)}</strong></td></tr>
                              <tr style={{ color:'var(--selva)' }}><td><strong>Precio objetivo</strong> <small>(con {utilFicha}% de utilidad bruta + %comisión)</small></td><td className="td-number"><strong style={{ fontSize:'1.05rem' }}>{fCOP(sug.precioObjetivo)}</strong ><br /> <small>Utilidad bruta real</small> <strong style={{ fontSize:'0.8rem' }}>{utilBrutaPct.toFixed(1)}%</strong ></td></tr>
                              <tr></tr>
                            </tbody>
                          </table>
                          {/* Gastos del período: informativos, DESPUÉS del margen bruto (no entran al costo del producto). */}
                          <table style={{ fontSize:'0.8rem', width:'100%', marginTop:6, color:'var(--texto-suave)' }}>
                            <tbody>
                              <tr><td>(−) Comisión de ventas <small>({comisionPct}%)</small></td><td className="td-number">{fCOP(sug.precioObjetivo * comisionPct / 100)}</td></tr>
                              <tr><td>(−) Gastos admin/ventas/financieros por u <small>({(tasaGastosOper*100).toFixed(1)}% del costo de producción · informativo)</small></td><td className="td-number">{fCOP(sug.gastosOperUnit)}</td></tr>
                              <tr style={{ fontWeight:600, color:'var(--texto)' }}><td>= Utilidad neta estimada/u</td><td className="td-number">{fCOP(utilBrutaUnit - sug.precioObjetivo * comisionPct / 100 - sug.gastosOperUnit)}</td></tr>
                            </tbody>
                          </table>
                          <div style={{ marginTop:8, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                            <button type="button" className="btn btn-xs btn-dorado" onClick={() => setFormProd(f => ({ ...f, precio_mayor: Math.ceil(sug.precioObjetivo / 50) * 50 }))}>
                              Usar precio objetivo ({fCOP(Math.ceil(sug.precioObjetivo / 50) * 50)})
                            </button>
                          </div>
                          {/* Qué significa el precio que tienes puesto, en plata contante */}
                          {precioActual > 0 && (
                            <div style={{ marginTop:8, padding:'8px 10px', background:'#fff', borderRadius:'var(--radio)', border:`1px solid ${color}`, fontSize:'0.8rem' }}>
                              <div style={{ color, fontWeight:600, marginBottom:4 }}>
                                {bajoMinimo ? `⚠ Tu precio de ${fCOP(precioActual)} está por debajo del mínimo: pierdes ${fCOP(sug.precioMinimo - precioActual)} por unidad`
                                  : bajoObjetivo ? `Tu precio de ${fCOP(precioActual)} cubre los costos, pero queda ${fCOP(sug.precioObjetivo - precioActual)} bajo el objetivo`
                                  : `✓ Tu precio de ${fCOP(precioActual)} alcanza o supera el objetivo`}
                              </div>
                              <div style={{ color:'var(--texto-suave)' }}>
                                Utilidad <strong>bruta</strong> (precio − costo de producción): <strong style={{ color:'var(--selva)' }}>{fCOP(utilBrutaRealUnit)} ({utilBrutaRealPct.toFixed(1)}%)</strong>.<br />
                                Neta, tras {comisionPct}% comisión y {fCOP(sug.gastosOperUnit)} de gastos operativos:
                                {' '}<strong style={{ color }}>{fCOP(utilRealUnit)} ({utilRealPct.toFixed(1)}%)</strong> por unidad.
                              </div>
                            </div>
                          )}
                          <small style={{ color:'var(--texto-suave)', fontSize:'0.72rem', display:'block', marginTop:6 }}>
                            Precio = costo de producción ÷ (1 − {comisionPct}% comisión − {utilFicha}% utilidad bruta). Se <strong>divide</strong>: son porcentajes del precio,
                            no del costo. Los gastos admin/ventas/financieros NO se suman al costo del producto (NIC 2): se muestran aparte.
                            El ICA no entra en la ficha: es impuesto del período (Costos y Gastos → Impuestos).
                          </small>
                        </>}
                  </div>
                )
              })()}

              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:10 }}>
                <div className="form-group"><label className="form-label">Precio de venta por mayor <small style={{ fontWeight:400, textTransform:'none', color:'var(--texto-suave)' }}>(tu precio de lista)</small></label><MoneyInput value={formProd.precio_mayor} onChange={v => setFormProd(f=>({...f,precio_mayor:v}))} /></div>
                <div className="form-group"><label className="form-label">% Comisión <small style={{ fontWeight:400, textTransform:'none', color:'var(--texto-suave)' }}>(vendedor)</small></label><input type="number" className="form-control" value={formProd.comision} onChange={e => setFormProd(f=>({...f,comision:e.target.value}))} min={0} max={100} step={0.5} /></div>
              </div>
              {calcResult && (parseFloat(formProd.comision) || 0) > 0 && (
                <div style={{ background:'rgba(124,179,66,0.08)', border:'1px solid rgba(124,179,66,0.25)', borderRadius:'var(--radio)', padding:'10px 12px', marginBottom:14 }}>
                  <div style={{ fontSize:'0.76rem', color:'var(--texto-suave)' }}>💼 Precio especial para el distribuidor <small>(precio por mayor − {formProd.comision}% de comisión)</small></div>
                  <div style={{ fontWeight:700, color:'var(--selva)', fontSize:'1.05rem' }}>{fCOP((parseFloat(formProd.precio_mayor)||0) - calcResult.comUnit)}</div>
                  <small style={{ color:'var(--texto-suave)', fontSize:'0.72rem' }}>
                    La comisión representa <strong>{fCOP(calcResult.comUnit)}/u</strong> que le cedes al distribuidor. Tu ganancia pasa de {fCOP(calcResult.utilMayor)}/u a <strong>{fCOP(calcResult.utilMayorNeto)}/u</strong>.
                  </small>
                </div>
              )}
              <div className="form-group"><label className="form-label">Precio al público (detal)</label><MoneyInput value={formProd.precio_detal} onChange={v => setFormProd(f=>({...f,precio_detal:v}))} /></div>

              {/* ── Impuestos INDIRECTOS (los recaudas y los giras a la DIAN) ──
                  DIAN Concepto 541 de 2024: el IBUA y el ICUI NO forman parte de la base gravable
                  del IVA — se discriminan por separado en la factura. Por eso los tres se suman
                  de forma independiente sobre el precio, no en cascada. */}
              {(() => {
                const ivaP   = parseFloat(formProd.iva_pct) || 0
                const icuiP  = parseFloat(formProd.imp_saludable_pct) || 0
                const ibuaU  = parseFloat(formProd.ibua_valor) || 0
                const hayImp = ivaP > 0 || icuiP > 0 || ibuaU > 0
                const ivaLegal = [0, 5, 19].includes(ivaP)
                const conImp = (base) => base + base * (ivaP / 100) + base * (icuiP / 100) + ibuaU
                return (
              <div style={{ background:'var(--crema)', borderRadius:'var(--radio)', padding:'10px 12px', marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <strong style={{ fontSize:'0.82rem', color:'var(--selva)' }}>Impuestos al consumidor</strong>
                  <span style={{ fontSize:'0.75rem', color:'var(--texto-suave)' }}>IVA</span>
                  <Select className="form-control" style={{ width:'auto', padding:'2px 6px', fontSize:'0.8rem' }}
                    value={ivaLegal ? String(ivaP) : 'otro'}
                    onChange={e => e.target.value !== 'otro' && setFormProd(f => ({ ...f, iva_pct: e.target.value }))}
                    title="Tarifas de IVA vigentes en Colombia (art. 468 y ss. del Estatuto Tributario)">
                    <option value="0">0% (excluido/exento)</option>
                    <option value="5">5%</option>
                    <option value="19">19%</option>
                    {!ivaLegal && <option value="otro">{ivaP}% (no estándar)</option>}
                  </Select>
                  <span style={{ fontSize:'0.75rem', color:'var(--texto-suave)', marginLeft:6 }}>ICUI</span>
                  <input type="number" className="form-control" style={{ width:60, textAlign:'right', padding:'2px 6px' }}
                    value={formProd.imp_saludable_pct} onChange={e => setFormProd(f => ({ ...f, imp_saludable_pct: e.target.value }))}
                    min={0} max={100} step={1} placeholder="0"
                    title="ICUI — impuesto a comestibles ultraprocesados (Ley 2277/2022). Tarifa 20% desde 2025. Solo si el producto supera los umbrales de azúcar, sodio o grasas de la OPS." />
                  <span style={{ fontSize:'0.8rem' }}>%</span>
                  <span style={{ fontSize:'0.75rem', color:'var(--texto-suave)', marginLeft:6 }}>IBUA</span>
                  <input type="number" className="form-control" style={{ width:78, textAlign:'right', padding:'2px 6px' }}
                    value={formProd.ibua_valor} onChange={e => setFormProd(f => ({ ...f, ibua_valor: e.target.value }))}
                    min={0} step={1} placeholder="0"
                    title="IBUA — impuesto a bebidas azucaradas. NO es un porcentaje: es un valor fijo en pesos por cada 100 ml según el azúcar del producto, que la DIAN indexa cada enero. Escribe aquí el valor que corresponde a UNA unidad de venta." />
                  <span style={{ fontSize:'0.8rem' }} title="pesos por unidad de venta">$/u</span>
                </div>
                {icuiP > 0 && icuiP !== 20 && (
                  <div style={{ fontSize:'0.75rem', color:'var(--tierra)', marginTop:6 }}>
                    ⚠ La tarifa vigente del ICUI es <strong>20%</strong> desde 2025 (tienes {icuiP}%).
                  </div>
                )}
                {hayImp && (
                  <div style={{ fontSize:'0.82rem', marginTop:8, display:'grid', gap:2 }}>
                    <div>Precio por mayor <strong>con impuestos</strong>: <strong style={{ color:'var(--selva)' }}>{fCOP(conImp(parseFloat(formProd.precio_mayor) || 0))}</strong></div>
                    <div>Precio detal <strong>con impuestos</strong>: <strong style={{ color:'var(--selva)' }}>{fCOP(conImp(parseFloat(formProd.precio_detal) || 0))}</strong></div>
                  </div>
                )}
                <small style={{ display:'block', marginTop:6, color:'var(--texto-suave)', fontSize:'0.72rem' }}>
                  Los recaudas y los giras a la DIAN: no son tuyos, no son costo y por eso <strong>no cambian el precio sugerido</strong> —
                  solo se suman encima para saber cuánto paga el cliente.
                  El <strong>ICUI</strong> (comestibles) y el <strong>IBUA</strong> (bebidas) no entran en la base del IVA: van
                  discriminados aparte en la factura (DIAN, Concepto 541 de 2024).
                  {' '}Si eres <strong>persona natural</strong> con ingresos brutos menores a 10.000 UVT en el año, no eres responsable
                  de estos impuestos saludables: déjalos en 0.
                  El <strong>ICA</strong> no se calcula aquí: es del período (Costos y Gastos → Impuestos).
                </small>
              </div>
                )
              })()}
              {calcResult && (
                <div style={{ fontSize:'0.82rem', color:'var(--texto-suave)', marginTop:4 }}>
                  Ganancia distribuidor (detal − mayor): <strong style={{ color:'var(--selva)' }}>{fCOP((parseFloat(formProd.precio_detal)||0) - (parseFloat(formProd.precio_mayor)||0))}</strong>
                  {(parseFloat(formProd.precio_detal)||0) > 0 && (
                    <> · margen del distribuidor: <strong style={{ color:'var(--selva)' }}>{(((parseFloat(formProd.precio_detal)||0) - (parseFloat(formProd.precio_mayor)||0)) / (parseFloat(formProd.precio_detal)||1) * 100).toFixed(1)}%</strong></>
                  )}
                </div>
              )}
              {/* Precio sugerido al CONSUMIDOR para los distribuidores (margen del distribuidor sobre
                  el precio mayor). Va plegado: es una tabla de referencia que no se consulta
                  siempre, y en el celular empujaba todo lo demás fuera de la pantalla. */}
              {calcResult && (parseFloat(formProd.precio_mayor) || 0) > 0 && (
                <details style={{ marginTop:12, border:'1px solid var(--crema-oscuro)', borderRadius:'var(--radio)', padding:'8px 10px' }}>
                  <summary style={{ cursor:'pointer', fontWeight:600, color:'var(--selva)', fontSize:'0.85rem', listStyle:'revert' }}>
                    <Ico as={ShoppingCart} size={14} />Precio sugerido al público
                    <small style={{ fontWeight:400, color:'var(--texto-suave)' }}> — a cuánto revendería el distribuidor</small>
                  </summary>
                  <div style={{ marginTop:8 }}>
                  <div style={{ display:'flex', alignItems:'center', marginBottom:6, flexWrap:'wrap', gap:6 }}>
                    <div style={{ fontSize:'0.78rem', color:'var(--texto-suave)' }}>Margen del distribuidor sobre el precio mayor = {fCOP(parseFloat(formProd.precio_mayor)||0)}</div>
                    {esAdmin && !editMargenes && <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft:'auto' }} onClick={abrirEditMargenes}><Ico as={Pencil} size={14} />Editar márgenes</button>}
                  </div>
                  {editMargenes ? (
                    <div style={{ background:'var(--crema)', borderRadius:'var(--radio)', padding:10, marginBottom:8 }}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                        {margenesTmp.map((m, i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:2 }}>
                            <input type="number" className="form-control" style={{ width:64, textAlign:'right' }} value={m} onChange={e => setMargenesTmp(t => t.map((x, idx) => idx === i ? e.target.value : x))} />
                            <span style={{ fontSize:'0.8rem' }}>%</span>
                            <button type="button" className="btn btn-xs btn-danger" onClick={() => setMargenesTmp(t => t.filter((_, idx) => idx !== i))}><X size={13} aria-hidden="true" /></button>
                          </div>
                        ))}
                        <button type="button" className="btn btn-xs btn-secondary" onClick={() => setMargenesTmp(t => [...t, ''])}>+ margen</button>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button type="button" className="btn btn-sm btn-primary" onClick={guardarMargenes}>Guardar</button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditMargenes(false)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table style={{ fontSize:'0.85rem' }}>
                        <thead><tr><th>Margen distribuidor</th><th className="td-number">Precio al público</th><th className="td-number">Ganancia distribuidor</th></tr></thead>
                        <tbody>
                          {margenes.map(mp => {
                            const m = mp / 100
                            const pm = parseFloat(formProd.precio_mayor) || 0
                            const publico = m < 1 ? pm / (1 - m) : pm
                            return <tr key={mp}><td>{mp}%</td><td className="td-number">{fCOP(publico)}</td><td className="td-number" style={{ color:'var(--selva)' }}>{fCOP(publico - pm)}</td></tr>
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <small style={{ color:'var(--texto-suave)', fontSize:'0.72rem' }}>Precio al público = precio a distribuidor ÷ (1 − margen). Te indica a cuánto vendería el distribuidor al consumidor final y cuánto ganaría con cada margen.</small>
                  </div>
                </details>
              )}
              </div>
            </details>
            <div className="costo-resumen">
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', marginBottom:14, color:'var(--dorado)' }}>Resumen de Costos</div>
              {calcResult && (() => {
                const pMayor = parseFloat(formProd.precio_mayor) || 0
                const pDetal = parseFloat(formProd.precio_detal) || 0
                const cProd = calcResult.costoTotalUnit
                const gastosU = cProd * tasaGastosOper
                // Brutas: precio − costo de producción (− comisión). Neta: además − gastos operativos.
                const utilBrutaMayor = pMayor - cProd
                const utilBrutaConCom = pMayor - (calcResult.comUnit || 0) - cProd
                const utilBrutaDetal = pDetal - cProd
                const utilNeta = pMayor - (calcResult.comUnit || 0) - cProd - gastosU
                const utilBrutaMayorPct = pMayor > 0 ? (utilBrutaMayor / pMayor * 100) : 0
                const utilNetaPct = pMayor > 0 ? (utilNeta / pMayor * 100) : 0
                const pct = (v) => (cProd > 0 ? (v / cProd * 100).toFixed(0) + '%' : '—')
                const unidsMes = calcResult.unidsMesTot || 0
                const ivaTot = (parseFloat(formProd.iva_pct) || 0) + (parseFloat(formProd.imp_saludable_pct) || 0)
                return (<>
                  <div className="row"><span>Materia prima por unidad <small style={{opacity:0.6,fontSize:'0.72rem'}}>({pct(calcResult.mpUnit)} del costo)</small></span><span>{fCOP(calcResult.mpUnit)}</span></div>
                  <div className="row"><span>Empaque por unidad <small style={{opacity:0.6,fontSize:'0.72rem'}}>({pct(calcResult.empUnit)})</small></span><span>{fCOP(calcResult.empUnit)}</span></div>
                  <div className="row"><span>+ Mano de obra y CIF por unidad <small style={{opacity:0.6,fontSize:'0.72rem'}}>({calcResult.totalMinutos} min × {fCOP(calcResult.costoMin)}/min ÷ unid · {pct(calcResult.moUnit)})</small></span><span style={{color:'var(--dorado)'}}>{fCOP(calcResult.moUnit)}</span></div>
                  {(calcResult.adicUnit || 0) > 0 && <div className="row"><span>+ Costos adicionales por unidad <small style={{opacity:0.6,fontSize:'0.72rem'}}>(depreciación, otros · {pct(calcResult.adicUnit)})</small></span><span style={{color:'var(--dorado)'}}>{fCOP(calcResult.adicUnit)}</span></div>}
                  {(calcResult.tiempoUnit || 0) > 0 && <div className="row"><span>+ Costos por hora/día <small style={{opacity:0.6,fontSize:'0.72rem'}}>(cantidad sugerida × tarifa ÷ unid. bache · {pct(calcResult.tiempoUnit)})</small></span><span style={{color:'var(--dorado)'}}>{fCOP(calcResult.tiempoUnit)}</span></div>}
                  {(calcResult.equipoUnit || 0) > 0 && <div className="row"><span>+ Equipos asignados por categoría <small style={{opacity:0.6,fontSize:'0.72rem'}}>({pct(calcResult.equipoUnit)})</small></span><span style={{color:'var(--dorado)'}}>{fCOP(calcResult.equipoUnit)}</span></div>}
                  <div className="row" style={{ borderTop:'1px solid rgba(245,240,232,0.25)', paddingTop:6, marginTop:4, fontWeight:600 }}>
                    <span>= COSTO DE PRODUCCIÓN por unidad <small style={{opacity:0.6,fontSize:'0.72rem'}}>(MP + empaque + MO + CIF)</small></span><span>{fCOP(cProd)}</span>
                  </div>
                  <div className="total">
                    <div className="row"><span>Precio de venta por mayor</span><span>{fCOP(pMayor)}</span></div>
                    <div className="row ganancia" style={{ fontWeight:800, borderTop:'1px solid rgba(245,240,232,0.25)', paddingTop:8, marginTop:2, alignItems:'baseline' }}>
                      <span>UTILIDAD BRUTA por unidad</span>
                      <span style={{ color: utilBrutaMayor >= 0 ? 'var(--lima)' : 'var(--rojo)' }}><strong style={{ fontSize:'1.5rem' }}>{utilBrutaMayorPct.toFixed(1)}%</strong> <small style={{ opacity:0.85 }}>· {fCOP(utilBrutaMayor)}/u</small></span>
                    </div>
                    {(calcResult.comUnit || 0) > 0 && (
                      <>
                        <div className="row"><span>− Comisión distribuidor <small style={{opacity:0.6,fontSize:'0.72rem'}}>({formProd.comision}%)</small></span><span style={{color:'var(--dorado)'}}>−{fCOP(calcResult.comUnit)}</span></div>
                        <div className="row ganancia" style={{ fontWeight:700, borderTop:'1px solid rgba(245,240,232,0.25)', paddingTop:6 }}>
                          <span>= UTILIDAD BRUTA por unidad <small style={{opacity:0.6,fontSize:'0.72rem'}}>(con comisión)</small></span>
                          <span style={{ color: utilBrutaConCom >= 0 ? undefined : 'var(--rojo)' }}>{fCOP(utilBrutaConCom)} ({pMayor > 0 ? (utilBrutaConCom / pMayor * 100).toFixed(1) + '%' : '-'})</span>
                        </div>
                      </>
                    )}
                    {pDetal > 0 && (
                      <div className="row ganancia"><span>Utilidad bruta al detal</span><span style={{ color: utilBrutaDetal >= 0 ? undefined : 'var(--rojo)' }}>{fCOP(utilBrutaDetal)} ({(utilBrutaDetal / pDetal * 100).toFixed(1)}%)</span></div>
                    )}
                    <div className="row"><span>− Gastos admin/ventas/financieros <small style={{opacity:0.6,fontSize:'0.72rem'}}>({(tasaGastosOper * 100).toFixed(1)}%)</small></span><span style={{color:'var(--dorado)'}}>−{fCOP(gastosU)}</span></div>
                    <div className="row ganancia" style={{ fontWeight:700, borderTop:'1px solid rgba(245,240,232,0.25)', paddingTop:6 }}>
                      <span>= UTILIDAD NETA por unidad</span>
                      <span style={{ color: utilNeta >= 0 ? 'var(--lima)' : 'var(--rojo)' }}><strong style={{ fontSize:'1.15rem' }}>{pMayor > 0 ? utilNetaPct.toFixed(1) + '%' : '-'}</strong> <small style={{ opacity:0.85 }}>· {fCOP(utilNeta)}/u</small></span>
                    </div>
                  </div>

                  <div style={{ marginTop:10, paddingTop:8, borderTop:'1px dashed rgba(245,240,232,0.2)', fontSize:'0.78rem' }}>
                    <div className="row"><span style={{ cursor:'help' }} title="Precio menos el costo VARIABLE (materia prima + empaque). Es lo que cada unidad aporta para cubrir los costos fijos. Si es negativo, vender más aumenta la pérdida.">Margen de contribución/u ⓘ</span><span style={{ color: (pMayor - calcResult.cvu) > 0 ? 'var(--lima)' : 'var(--rojo)' }}>{fCOP(pMayor - calcResult.cvu)}</span></div>
                    <div className="row"><span>Unidades/mes proyectadas</span><span>{fNum(unidsMes)}</span></div>
                    <div className="row"><span>Utilidad bruta del producto al mes</span><span style={{ color: utilBrutaMayor * unidsMes >= 0 ? 'var(--lima)' : 'var(--rojo)', fontWeight:600 }}>{fCOP(utilBrutaMayor * unidsMes)}</span></div>
                    <div className="row"><span style={{ cursor:'help' }} title="Unidades a vender al mes para cubrir los costos fijos, si este fuera el único producto. El mínimo real, repartido entre todo tu portafolio, está en Costos y Gastos.">Punto de equilibrio (solo) ⓘ</span><span>{calcResult.pe > 0 ? fNum(calcResult.pe) + ' unid/mes' : '—'}</span></div>
                    <div className="row"><span style={{ cursor:'help' }} title="CIF del mes ÷ minutos productivos disponibles. Reparte el overhead SEGÚN EL TIEMPO que usa cada producto.">Costo fijo por minuto ⓘ</span><span>{fCOP(calcResult.costoMin)}/min</span></div>
                    {ivaTot > 0 && <div className="row"><span>Precio mayor con impuestos <small style={{opacity:0.6,fontSize:'0.72rem'}}>(IVA/ICUI {ivaTot}%{(parseFloat(formProd.ibua_valor) || 0) > 0 ? ` + IBUA ${fCOP(formProd.ibua_valor)}` : ''})</small></span><span>{fCOP(pMayor * (1 + ivaTot / 100) + (parseFloat(formProd.ibua_valor) || 0))}</span></div>}
                  </div>
                  {utilBrutaMayor < 0 && pMayor > 0 && (
                    <div style={{ marginTop:8, padding:'8px 10px', background:'rgba(192,57,43,0.20)', borderRadius:6, fontSize:'0.78rem' }}>
                      ⚠ Con este precio <strong>pierdes {fCOP(-utilBrutaMayor)} por unidad</strong> frente al costo de producción.
                      Mira el precio sugerido a la izquierda.
                    </div>
                  )}
                </>)
              })()}
            </div>
          </div>

          {/* ── Botones ── */}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
            <button className="btn btn-secondary" onClick={limpiarForm}>Limpiar</button>
            <button className="btn btn-dorado" onClick={() => window.print()}><Ico as={Download} size={14} />PDF</button>
            <button className="btn btn-primary" onClick={guardarFicha} disabled={saveProducto.isPending}>
              {saveProducto.isPending ? 'Guardando...' : editingId ? '✏ Actualizar Ficha' : '💾 Guardar Ficha'}
            </button>
          </div>

          {/* ── Histórico de cambios de costos/cantidades ── */}
          {editingId && (
            <details className="card" style={{ marginTop: 16 }}>
              <summary className="card-title"><Ico as={Clock} size={14} />Histórico de cambios<span className="card-hint">{costHistory.length} registro{costHistory.length === 1 ? '' : 's'}</span></summary>
              <div className="card-acc-body">
              {costHistory.length === 0
                ? <p style={{ color:'var(--texto-suave)', fontSize:'0.85rem' }}>Aún no hay cambios registrados. Cada vez que modifiques cantidades o costos y guardes, se registra aquí con su fecha.</p>
                : <div className="table-wrap">
                    <table>
                      <thead><tr><th>Fecha y hora</th><th>Usuario</th><th className="td-number">Costo MP/bache</th><th className="td-number">Costo Var./u</th><th className="td-number">Costo total/u</th><th>Ingredientes</th><th></th></tr></thead>
                      <tbody>
                        {costHistory.map(h => (
                          <tr key={h.id}>
                            <td>{h.created_at ? new Date(h.created_at).toLocaleString('es-CO') : '—'}</td>
                            <td>{h.creado_por || '—'}</td>
                            <td className="td-number">{fCOP(h.costo_mp || 0)}</td>
                            <td className="td-number">{fCOP(h.cvu || 0)}</td>
                            <td className="td-number"><strong>{fCOP(h.costo_total || 0)}</strong></td>
                            <td style={{ fontSize:'0.78rem', color:'var(--texto-suave)', maxWidth:320 }}>
                              {(Array.isArray(h.snapshot) ? h.snapshot : []).map((i, k) => {
                                const u = i.unidad || 'Kg'
                                const partes = [`precio: ${fCOP(i.precio || 0)}/${u}`]
                                if (i.costo != null) partes.push(`costo: ${fCOP(i.costo)}`)
                                return <div key={k}><strong>{i.nombre}</strong>: {i.cantidad || 0} g ({partes.join(' · ')})</div>
                              })}
                              {(!Array.isArray(h.snapshot) || h.snapshot.length === 0) && '—'}
                            </td>
                            <td style={{ whiteSpace:'nowrap' }}>
                              <button className="btn btn-xs btn-dorado" title="Restaurar esta versión de la receta" style={{ marginRight:4 }}
                                onClick={() => setRestaurarH(h)}><Ico as={Undo2} size={13} />Restaurar</button>
                              <button className="btn btn-xs btn-danger" title="Eliminar este registro del histórico"
                              onClick={() => confirmar('¿Eliminar este registro del histórico?').then(ok => ok && borrarHistorial(h.id))}><X size={13} aria-hidden="true" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>}
              </div>
            </details>
          )}

          {/* ── Modal: Gestionar tipos de producto (admin) ── */}
          {/* ── Modal: restaurar versión del histórico de la receta ── */}
          <Modal open={!!restaurarH} onClose={() => setRestaurarH(null)} guard={false}
            title={`↩ Restaurar versión del ${restaurarH?.created_at ? new Date(restaurarH.created_at).toLocaleString('es-CO') : ''}`}
            footer={<button className="btn btn-secondary" onClick={() => setRestaurarH(null)}>Cancelar</button>}>
            {restaurarH && <>
              <div className="alert alert-warning" style={{ fontSize:'0.84rem' }}>
                Esta acción recupera la <strong>receta</strong> de esa fecha (ingredientes, cantidades y costos). Los procesos, empaque, precios y demás datos de la ficha no cambian.
              </div>
              <div className="table-wrap" style={{ maxHeight:180, overflowY:'auto', marginBottom:12 }}>
                <table style={{ fontSize:'0.82rem' }}>
                  <thead><tr><th>Ingrediente</th><th className="td-number">Cantidad</th><th className="td-number">Precio</th></tr></thead>
                  <tbody>
                    {(Array.isArray(restaurarH.snapshot) ? restaurarH.snapshot : []).map((s, k) => (
                      <tr key={k}><td>{s.nombre}</td><td className="td-number">{s.cantidad} g</td><td className="td-number">{fCOP(s.precio || 0)}/{s.unidad || 'Kg'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <button className="btn btn-primary" onClick={() => aplicarVersionEnFormulario(restaurarH)}>
                  ⚠ Reemplazar la receta actual
                  <small style={{ display:'block', fontWeight:400, fontSize:'0.72rem' }}>Carga esta versión en el formulario (reemplaza los ingredientes actuales). No se guarda hasta que guardes la ficha.</small>
                </button>
                <button className="btn btn-dorado" disabled={crearCopiaDeVersion.isPending} onClick={() => crearCopiaDeVersion.mutate(restaurarH)}>
                  ⧉ {crearCopiaDeVersion.isPending ? 'Creando copia...' : 'Crear como copia'}
                  <small style={{ display:'block', fontWeight:400, fontSize:'0.72rem' }}>Crea una ficha nueva e inactiva con esta versión de la receta, sin tocar la ficha actual.</small>
                </button>
              </div>
            </>}
          </Modal>

          {/* ── Modal: crear MP en el inventario desde un ingrediente manual ── */}
          <Modal open={!!nuevaMpIng} onClose={() => setNuevaMpIng(null)} guard={false} title="Agregar al inventario de MP"
            footer={<>
              <button className="btn btn-secondary" onClick={() => setNuevaMpIng(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={crearMpDesdeIng.isPending} onClick={() => crearMpDesdeIng.mutate()}>{crearMpDesdeIng.isPending ? 'Creando...' : 'Crear y enlazar'}</button>
            </>}>
            {nuevaMpIng && <>
              <div className="alert alert-info" style={{ fontSize:'0.82rem' }}>
                Se creará la materia prima en el Inventario MP (con stock 0) y este ingrediente quedará enlazado a ella automáticamente. Las entradas de stock y demás detalles se manejan luego en Inventario MP.
              </div>
              <div className="form-group"><label className="form-label">Nombre</label><input className="form-control" value={nuevaMpIng.nombre} onChange={e => setNuevaMpIng(v => ({ ...v, nombre: e.target.value }))} /></div>
              <div className="form-group">
                <label className="form-label">Categoría</label>
                <input className="form-control" list="dl-cat-mp-ing" value={nuevaMpIng.categoria} onChange={e => setNuevaMpIng(v => ({ ...v, categoria: e.target.value }))} placeholder="Elige o escribe una (ej: pulpa)" />
                <datalist id="dl-cat-mp-ing">{categoriasMp.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Unidad</label>
                  <Select className="form-control" value={nuevaMpIng.unidad} onChange={e => setNuevaMpIng(v => ({ ...v, unidad: e.target.value }))}>
                    {['Kg','Gramo','Litro','Mililitro','Unidad'].map(u => <option key={u} value={u}>{u}</option>)}
                  </Select>
                </div>
                <div className="form-group">
                  <label className="form-label">Precio por {nuevaMpIng.unidad}</label>
                  <MoneyInput value={nuevaMpIng.precio} onChange={p => setNuevaMpIng(v => ({ ...v, precio: p }))} />
                </div>
              </div>
            </>}
          </Modal>

          <Modal open={tiposModal} onClose={() => setTiposModal(false)} title="Tipos de Producto"
            footer={<button className="btn btn-secondary" onClick={() => setTiposModal(false)}>Cerrar</button>}
          >
            <div className="alert alert-info" style={{ fontSize:'0.83rem' }}>
              Crea o elimina los tipos de producto. "Subproducto interno" y "Otro" son fijos del sistema.
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <input className="form-control" placeholder="Nuevo tipo (ej. chocolate)" value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={addTipo}>+ Crear</button>
            </div>
            {tiposProducto.length === 0
              ? <p className="empty-table">Sin tipos personalizados</p>
              : tiposProducto.map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid var(--crema-oscuro)' }}>
                  <span style={{ flex:1 }}>{tipoLabel(t.nombre)}</span>
                  <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Eliminar el tipo "${t.nombre}"?`).then(ok => ok && delTipo(t))}><Ico as={X} size={14} />Eliminar</button>
                </div>
              ))}
          </Modal>

        </>
      )}

      {/* ===== COSTOS Y GASTOS (una caja por grupo contable) ===== */}
      {tab === 'cif' && (() => {
        const GRUPOS_CORTOS = { cif:'CIF', administracion:'Admin', ventas:'Ventas', financiero:'Financ.', impuesto:'Impuesto', pasivo:'Pasivo' }
        // Fila editable de un ítem (compartida por todas las cajas). El selector "Grupo"
        // mueve el ítem a otra caja al cambiarlo.
        const filaItem = (c) => {
          const mensual = getCIFMensual(c)
          const esProrrateo = c.frecuencia && c.frecuencia !== 'mensual'
          return (
            <tr key={c.id}>
              <td><input className="form-control" defaultValue={c.descripcion} onBlur={e => updateCIF(c.id,'descripcion',e.target.value)} style={{ border:'none', background:'transparent', padding:'4px 0' }} /></td>
              <td><input className="form-control" defaultValue={c.categoria||''} onBlur={e => updateCIF(c.id,'categoria',e.target.value)} placeholder="Categoría" style={{ border:'none', background:'transparent', padding:'4px 0', fontSize:'0.85rem' }} /></td>
              <td>
                <Select className="form-control" value={c.frecuencia} onChange={e => updateCIF(c.id,'frecuencia',e.target.value)} style={{ fontSize:'0.85rem' }}>
                  <option value="mensual">Mensual</option><option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option><option value="anual">Anual</option>
                </Select>
              </td>
              <td>
                <input type="number" className="form-control" defaultValue={c.valor} onBlur={e => updateCIF(c.id,'valor',parseFloat(e.target.value)||0)} style={{ textAlign:'right', width:130 }} />
                {esProrrateo && <div style={{ fontSize:'0.75rem', color:'var(--tierra)', marginTop:3 }}>÷ {c.frecuencia==='anual'?12:c.frecuencia==='semestral'?6:3} = {fCOP(mensual)}/mes</div>}
              </td>
              <td>
                <Select className="form-control" value={c.grupo || 'cif'} onChange={e => updateCIF(c.id,'grupo',e.target.value)} title="Mover este ítem a otro grupo" style={{ fontSize:'0.78rem' }}>
                  {GRUPOS_CIF.map(g => <option key={g.value} value={g.value}>{GRUPOS_CORTOS[g.value] || g.label}</option>)}
                </Select>
              </td>
              <td><button className="btn btn-xs btn-danger" onClick={() => deleteCIF(c.id)}><X size={13} aria-hidden="true" /></button></td>
            </tr>
          )
        }
        const CAJAS = [
          { g:'cif', icono:'🏭', titulo:'Costos de producción (CIF)', afecta:true,
            desc:'Existen porque hay producción: arriendo/energía/agua de la planta, mantenimiento de equipos, dotación de operarias, insumos de aseo de producción. Se reparten entre los productos vía costo/minuto.',
            nomina: costoNomina.total, nominaLbl:'Nómina de producción (automática)',
            nominaDet:`Salarios ${fCOP(costoNomina.salarios)} · Auxilio ${fCOP(costoNomina.auxilios)} · Prestaciones ${fCOP(costoNomina.prestaciones)} · Parafiscales ${fCOP(costoNomina.parafiscales)}${costoNomina.honorarios > 0 ? ` · Honorarios ${fCOP(costoNomina.honorarios)}` : ''} — no agregues salarios como ítem manual (se duplicarían)`,
            total: cifTotal },
          { g:'administracion', icono:'🗂', titulo:'Gastos administrativos',
            desc:'Gestionar la empresa: honorarios del contador, papelería, celular, software, registro mercantil, seguros, mantenimiento del inmueble, cafetería/bienestar.',
            nomina: gastosOp.administracion.nomina, nominaLbl:'Nómina de administración (automática)', total: gastosOp.administracion.total },
          { g:'ventas', icono:'🛒', titulo:'Gastos de ventas',
            desc:'Vender los productos: publicidad y redes, transporte de entregas de pedidos, comisiones de vendedores, ferias y eventos.',
            nomina: gastosOp.ventas.nomina, nominaLbl:'Nómina de ventas (automática)', total: gastosOp.ventas.total },
          { g:'financiero', icono:'🏦', titulo:'Gastos financieros',
            desc:'Financiar la operación: intereses de préstamos y comisiones bancarias.', total: gastosOp.financiero.total },
          { g:'impuesto', icono:'🧾', titulo:'Impuestos sobre ingresos',
            desc:'ICA y similares sobre las ventas brutas. Van en línea separada del estado de resultados — no son un gasto administrativo.', total: gastosOp.impuestos.total },
          { g:'pasivo', icono:'📉', titulo:'Abono a deuda (salida de caja)',
            desc:'Capital de los préstamos. No es gasto (reduce la deuda, no la utilidad) y por eso no entra al costo del producto ni al estado de resultados — solo el interés es gasto financiero. Pero sí sale de la caja cada mes: mira abajo el punto de equilibrio de caja.', total: gastosOp.pasivo.total },
        ]
        const gastosOperTotal = gastosOp.administracion.total + gastosOp.ventas.total + gastosOp.financiero.total + gastosOp.impuestos.total
        return (
        <>
          <div className="card">
            <div className="card-title">
              💰 Costos y Gastos del mes
              <button className="btn btn-sm btn-dorado" style={{ marginLeft:'auto' }} disabled={recalcularTodos.isPending}
                title="Guarda en cada ficha el costo calculado con el CIF y la nómina vigentes. Producto Terminado, Órdenes y el Tablero usan ese valor guardado."
                onClick={() => confirmar(`Se recalcularán y guardarán los costos de ${productos.length} ficha(s) con el CIF y la nómina actuales. ¿Continuar?`).then(ok => ok && recalcularTodos.mutate())}>
                {recalcularTodos.isPending ? 'Recalculando…' : '↻ Aplicar a las fichas'}
              </button>
            </div>
            <div className="alert alert-info" style={{ fontSize:'0.83rem' }}>
              ℹ Cada ítem vive en la caja de su clasificación contable. Solo los <strong>Costos de producción (CIF)</strong> se
              reparten entre los productos y definen el costo/minuto; los demás grupos alimentan el estado de resultados del
              Tablero pero <strong>no</strong> encarecen el producto. Con el selector "Grupo" de cada fila mueves el ítem a otra caja.
              Tras reclasificar ítems o cambiar la nómina, usa <strong>"Aplicar a las fichas"</strong> para que el costo guardado
              de cada producto (el que usan Producto Terminado, Órdenes y el Tablero) refleje los valores nuevos.
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:170, textAlign:'center', background:'rgba(45,90,61,0.08)', borderRadius:8, padding:'10px' }}>
                <div style={{ fontSize:'1.15rem', fontWeight:700, color:'var(--selva)' }}>{fCOP(cifTotal)}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--texto-suave)' }}>Costos de producción (CIF)</div>
              </div>
              <div style={{ flex:1, minWidth:170, textAlign:'center', background:'rgba(200,169,74,0.12)', borderRadius:8, padding:'10px' }}>
                <div style={{ fontSize:'1.15rem', fontWeight:700, color:'var(--dorado)' }}>{fCOP(gastosOperTotal)}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--texto-suave)' }}>Gastos admin + ventas + financiero + impuestos</div>
              </div>
              <div style={{ flex:1, minWidth:170, textAlign:'center', background:'var(--crema)', borderRadius:8, padding:'10px' }}>
                <div style={{ fontSize:'1.15rem', fontWeight:700, color:'var(--tierra)' }}>{fCOP(gastosOp.pasivo.total)}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--texto-suave)' }}>Pasivo (solo flujo de caja)</div>
              </div>
              <div style={{ flex:1, minWidth:170, textAlign:'center', background:'#fff8e8', borderRadius:8, padding:'10px', border:'1px solid var(--dorado)' }}>
                <div style={{ fontSize:'1.15rem', fontWeight:700, color:'var(--dorado)' }}>{fCOP(costoMin)}/min</div>
                <div style={{ fontSize:'0.75rem', color:'var(--texto-suave)' }}>Costo por minuto de producción</div>
              </div>
            </div>
          </div>

          <div className="tabs" style={{ marginBottom:14 }}>
            <button className={`tab-btn ${costosSubtab === 'costos' ? 'active' : ''}`} onClick={() => setCostosSubtab('costos')}>Costos</button>
            <button className={`tab-btn ${costosSubtab === 'gastos' ? 'active' : ''}`} onClick={() => setCostosSubtab('gastos')}>Gastos</button>
            <button className={`tab-btn ${costosSubtab === 'analisis' ? 'active' : ''}`} onClick={() => setCostosSubtab('analisis')}>Análisis</button>
          </div>

          {CAJAS.filter(caja => costosSubtab === 'costos' ? caja.g === 'cif' : costosSubtab === 'gastos' ? caja.g !== 'cif' : false).map(caja => {
            const items = cifItems.filter(c => (c.grupo || 'cif') === caja.g)
            return (
              <div key={caja.g} className="card" style={{ borderLeft: caja.afecta ? '4px solid var(--selva)' : '4px solid var(--crema-oscuro)' }}>
                <div className="card-title">
                  {caja.icono} {caja.titulo}
                  {caja.afecta
                    ? <span className="badge badge-verde" style={{ marginLeft:8, fontSize:'0.66rem' }}>afecta el costo del producto</span>
                    : <span className="badge badge-gris" style={{ marginLeft:8, fontSize:'0.66rem' }}>no afecta el costo del producto</span>}
                  <div style={{ marginLeft:'auto', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {caja.g === 'cif' && (
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setModalEquipos(true)} title={depreciacionGeneral > 0 ? `Depreciación general al CIF: ${fCOP(depreciacionGeneral)}/mes` : undefined}>
                        <Ico as={Wrench} size={13} />Agregar depreciación
                        {equipos.length > 0 && <span className="badge badge-gris" style={{ marginLeft:4 }}>{equipos.length}</span>}
                      </button>
                    )}
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => addCIF(caja.g)}>+ Agregar ítem</button>
                  </div>
                </div>
                <div style={{ fontSize:'0.8rem', color:'var(--texto-suave)', marginBottom:8 }}>{caja.desc}</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Descripción</th><th>Categoría</th><th>Frecuencia</th><th>Valor ($)</th><th title="Mover a otro grupo">Grupo</th><th></th></tr></thead>
                    <tbody>
                      {items.length === 0 && !(caja.nomina > 0)
                        ? <tr><td colSpan={6} className="empty-table">Sin ítems — usa "+ Agregar ítem"</td></tr>
                        : items.map(filaItem)}
                      {caja.nomina > 0 && (
                        <tr style={{ background:'rgba(124,179,66,0.10)' }}>
                          <td colSpan={3}><strong>🧑‍🤝‍🧑 {caja.nominaLbl}</strong><div style={{ fontSize:'0.72rem', color:'var(--texto-suave)' }}>{caja.nominaDet || 'Según empleados activos de esta área — el área se asigna en Nómina'}</div></td>
                          <td className="td-number"><strong>{fCOP(caja.nomina)}</strong></td>
                          <td colSpan={2} style={{ fontSize:'0.72rem', color:'var(--texto-suave)' }} title="Calculado desde Empleados">automático</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'var(--crema)' }}>
                        <td colSpan={3}><strong>TOTAL MENSUAL</strong></td>
                        <td className="td-number"><strong>{fCOP(caja.total)}</strong></td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })}

          {costosSubtab === 'analisis' && <>
          <div className="card">
          <div className="card-title">⏱ Cálculo y reparto del CIF</div>
          {/* Desglose y simulador del costo por minuto de mano de obra */}
          <div style={{ marginTop:16, padding:16, background:'#fff8e8', border:'1px solid var(--dorado)', borderRadius:'var(--radio)' }}>
            <strong style={{ color:'var(--selva)' }}><Ico as={Clock} size={14} />Costo por minuto de mano de obra (producción)</strong>
            <div style={{ fontSize:'0.85rem', marginTop:8, display:'grid', gap:4 }}>
              <div>Costos de producción (CIF) del mes: <strong>{fCOP(cifTotal)}</strong> <small style={{ color:'var(--texto-suave)' }}>(ítems CIF {fCOP(cifManual)} + nómina producción {fCOP(costoNomina.total)} + depreciación general {fCOP(depreciacionGeneral)})</small></div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span>Operarios que aportan capacidad:</span>
                {(() => {
                  const empActivos = empleadosProduccion.filter(e => (e.estado || 'activo') === 'activo' && !e.archivado).length
                  return (
                    <Select className="form-control" style={{ width:'auto' }} value={parseInt(op.numOperarios || 0)} onChange={e => guardarNumOperarios(e.target.value)} title="Se guarda en los parámetros de operación (visible también en Nómina → Parámetros)">
                      <option value={0}>todos los de producción ({empActivos})</option>
                      {Array.from({ length: empActivos }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                    </Select>
                  )
                })()}
                <small style={{ color:'var(--texto-suave)' }}>· {op.dias} días · {op.jornadaHoras} h/día · improd. {((parseFloat(op.improductividad)||0)*100).toFixed(0)}%</small>
              </div>
              <div>Minutos disponibles/mes: <strong>{fNum(Math.round(minsDisponibles))}</strong> <small style={{ color:'var(--texto-suave)' }}>= {operariosActivos} × {op.dias} × {op.jornadaHoras} × 60 × (1 − {parseFloat(op.improductividad)||0})</small></div>
              <div style={{ fontSize:'1rem', marginTop:2 }}>Costo/minuto = {fCOP(cifTotal)} ÷ {fNum(Math.round(minsDisponibles))} = <strong style={{ color:'var(--dorado)' }}>{fCOP(costoMin)}/min</strong></div>
            </div>

            <div className="alert alert-info" style={{ fontSize:'0.8rem', marginTop:10 }}>
              ℹ Normalmente déjalo en <strong>"todos los de producción"</strong>: se toma solo de quienes tienen área Producción en Nómina.
              El campo existe para cuando la <em>capacidad</em> no coincide con la <em>plantilla</em> — por ejemplo si alguien de producción es
              supervisor y no trabaja en los baches, o si quieres calcular a capacidad normal en un mes atípico. Ojo: si eliges un número
              distinto a {empleadosProduccion.length}, el costo/minuto usa el salario de {empleadosProduccion.length} persona(s) repartido entre la capacidad de {operariosActivos}.
            </div>
          </div>

          <div style={{ marginTop:16, padding:16, background:'var(--crema)', borderRadius:'var(--radio)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
              <strong style={{ color:'var(--selva)' }}><Ico as={BarChart3} size={14} />Absorción del CIF por producto</strong>
              <div style={{ fontSize:'1.05rem', fontWeight:600, color:'var(--selva)' }}>CIF del mes: <span style={{ color:'var(--dorado)' }}>{fCOP(cifTotal)}</span></div>
            </div>
            <div className="alert alert-info" style={{ fontSize:'0.85rem', marginBottom:12 }}>
              ℹ El CIF se reparte por <strong>tiempo de proceso</strong>: cada producto absorbe los minutos que usa × {fCOP(costoMin)}/min.
              Por eso solo se absorbe la parte del CIF correspondiente a la capacidad que realmente usas; el resto es <strong>capacidad ociosa</strong>.
            </div>
            {cifAbsorcion.items.length === 0
              ? <p style={{ color:'var(--texto-suave)', fontSize:'0.9rem' }}>Agrega fichas de costos para ver la absorción</p>
              : (() => {
                  // Porcentajes legibles: entero cuando es grande, un decimal cuando es pequeño
                  const fPct = (v) => (!isFinite(v) ? '—' : Math.abs(v) >= 10 ? Math.round(v) + '%' : v.toFixed(1) + '%')
                  // El tiempo en horas se lee mucho mejor que en miles de minutos
                  const fTiempo = (min) => (Math.abs(min) >= 600 ? fNum(min / 60) + ' h' : fNum(min) + ' min')
                  const sobreAbsorbe = cifAbsorcion.minutosUsados > minsDisponibles
                  const pctDe = (v) => (cifTotal > 0 ? v / cifTotal * 100 : 0)
                  // Ordenados de mayor a menor absorción: lo que más pesa, primero
                  const filas = [...cifAbsorcion.items].sort((a, b) => b.absorbido - a.absorbido)
                  const totalUnids = cifAbsorcion.items.reduce((s, i) => s + i.unidsMes, 0)
                  return (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Producto</th><th>Unid/mes</th><th>Tiempo/mes</th><th>% del CIF</th><th>CIF absorbido/mes</th><th>CIF por unidad</th></tr></thead>
                    <tbody>
                      {filas.map((i, idx) => {
                        const pct = pctDe(i.absorbido)
                        const sinProcesos = i.minutosMes <= 0
                        return (
                          <tr key={idx} style={sinProcesos ? { opacity: 0.6 } : undefined}>
                            <td>
                              <strong>{i.nombre}</strong> {i.tipo && <span className="badge badge-gris" style={{ fontSize:'0.7rem' }}>{i.tipo}</span>}
                              {sinProcesos && <div style={{ fontSize:'0.72rem', color:'var(--tierra)' }}>Sin procesos con minutos: no absorbe CIF</div>}
                            </td>
                            <td className="td-number">{fNum(i.unidsMes)}</td>
                            <td className="td-number">{sinProcesos ? '—' : fTiempo(i.minutosMes)}</td>
                            <td className="td-number">
                              <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end' }}>
                                <div className="progress" style={{ width:60 }}><div className="progress-bar" style={{ width:Math.min(100, Math.max(0, pct)).toFixed(0)+'%' }} /></div>
                                {fPct(pct)}
                              </div>
                            </td>
                            <td className="td-number">{fCOP(i.absorbido)}</td>
                            <td className="td-number text-dorado"><strong>{sinProcesos ? '—' : fCOP(i.cifUnit)}</strong></td>
                          </tr>
                        )
                      })}
                      {/* Capacidad ociosa: CIF pagado que ningún producto absorbió */}
                      {!sobreAbsorbe && cifAbsorcion.ocioso > 1 && (
                        <tr style={{ background:'rgba(192,57,43,0.08)' }}>
                          <td><strong>⚠ Capacidad ociosa</strong><div style={{ fontSize:'0.72rem', color:'var(--texto-suave)' }}>CIF que ningún producto absorbe porque la planta no opera a tope. Según NIC 2 no se carga al inventario: va al resultado del mes.</div></td>
                          <td className="td-number">—</td>
                          <td className="td-number">{fTiempo(minsDisponibles - cifAbsorcion.minutosUsados)}</td>
                          <td className="td-number">{fPct(pctDe(cifAbsorcion.ocioso))}</td>
                          <td className="td-number" style={{ color:'var(--rojo)' }}><strong>{fCOP(cifAbsorcion.ocioso)}</strong></td>
                          <td>—</td>
                        </tr>
                      )}
                      {/* Sobre-absorción: se trabajó MÁS de la capacidad configurada */}
                      {sobreAbsorbe && (
                        <tr style={{ background:'rgba(200,169,74,0.14)' }}>
                          <td><strong>⚠ Sobre-absorción</strong><div style={{ fontSize:'0.72rem', color:'var(--texto-suave)' }}>Se usaron más minutos de los que tiene la capacidad configurada, así que los productos cargaron más CIF del que existe. Sube el N° de operarios o los días/jornada arriba para que cuadre.</div></td>
                          <td className="td-number">—</td>
                          <td className="td-number">+{fTiempo(cifAbsorcion.minutosUsados - minsDisponibles)}</td>
                          <td className="td-number">+{fPct(pctDe(-cifAbsorcion.ocioso))}</td>
                          <td className="td-number" style={{ color:'var(--tierra)' }}><strong>+{fCOP(-cifAbsorcion.ocioso)}</strong></td>
                          <td>—</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'var(--selva)', color:'var(--crema)' }}>
                        <td><strong>TOTAL</strong></td>
                        <td className="td-number">{fNum(totalUnids)}</td>
                        {/* Tiempo: el disponible cuando sobra capacidad; el realmente usado cuando se excede */}
                        <td className="td-number">{fTiempo(Math.max(minsDisponibles, cifAbsorcion.minutosUsados))}</td>
                        <td className="td-number">{fPct(pctDe(sobreAbsorbe ? cifAbsorcion.totalAbsorbido : cifTotal))}</td>
                        <td className="td-number">{fCOP(sobreAbsorbe ? cifAbsorcion.totalAbsorbido : cifTotal)}</td>
                        <td>—</td>
                      </tr>
                    </tfoot>
                  </table>
                  <div style={{ fontSize:'0.8rem', color:'var(--texto-suave)', marginTop:8 }}>
                    Uso de capacidad: <strong style={{ color: sobreAbsorbe ? 'var(--tierra)' : cifAbsorcion.usoCapacidadPct >= 80 ? 'var(--selva)' : cifAbsorcion.usoCapacidadPct >= 50 ? 'var(--dorado)' : 'var(--rojo)' }}>{fPct(cifAbsorcion.usoCapacidadPct)}</strong>
                    {' '}({fTiempo(cifAbsorcion.minutosUsados)} de {fTiempo(minsDisponibles)} al mes).
                    {sobreAbsorbe
                      ? <> Estás produciendo por encima de la capacidad configurada, así que el costo/minuto está <strong>sobrestimado</strong> y encarece las fichas. Ajusta los parámetros de operación arriba.</>
                      : cifAbsorcion.ocioso > 1
                        ? <> Si produjeras a capacidad plena, ese {fCOP(cifAbsorcion.ocioso)}/mes se repartiría entre más unidades y cada producto costaría menos.</>
                        : null}
                  </div>
                </div>
                  )
                })()
            }
            {productos.length === 0 && (
              <div style={{ marginTop:12, padding:10, background:'white', borderRadius:'var(--radio)', border:'1px solid var(--crema-oscuro)' }}>
                <span style={{ fontSize:'0.82rem', color:'var(--texto-suave)' }}><Ico as={Settings} size={14} />Estimación inicial (aún sin fichas) — unidades/mes:</span>
                <input type="number" className="form-control" value={cifUnidadesFallback} onChange={e => setCifUnidadesFallback(Number(e.target.value))} style={{ width:110, display:'inline-block', marginLeft:8 }} />
                <span style={{ fontSize:'0.82rem', color:'var(--texto-suave)', marginLeft:8 }}>CIF/unidad: <strong style={{ color:'var(--dorado)' }}>{fCOP(cifTotal/(cifUnidadesFallback||1))}</strong></span>
                <div style={{ fontSize:'0.72rem', color:'var(--texto-suave)', marginTop:4 }}>Solo se usa mientras no haya fichas de producto. Al crear productos, el CIF se reparte automáticamente y este valor se ignora.</div>
              </div>
            )}
          </div>

          {/* Punto de equilibrio de CAJA: el abono a deuda no es gasto pero sí hay que generarlo */}
          {(() => {
            const mcTotalMes = peqMultiproducto.reduce((s, i) => s + i.mcu * i.q, 0)
            const unidsMesTot = peqMultiproducto.reduce((s, i) => s + i.q, 0)
            const mcuProm = unidsMesTot > 0 ? mcTotalMes / unidsMesTot : 0
            // Fijos = CIF + gastos de administración, ventas y financieros. El ICA no entra:
            // es un porcentaje de la venta (variable), no un costo fijo del mes.
            const fijosTot = cifTotal + gastosFijosOper
            const peContable = getPEqCaja(fijosTot, 0, mcuProm)
            const peCaja = getPEqCaja(fijosTot, gastosOp.pasivo.total, mcuProm)
            return (
              <div style={{ marginTop:16, padding:16, background:'var(--crema)', borderRadius:'var(--radio)' }}>
                <strong style={{ color:'var(--selva)' }}><Ico as={DollarSign} size={14} />Punto de equilibrio: contable vs. de caja</strong>
                {mcuProm <= 0
                  ? <p style={{ fontSize:'0.85rem', color:'var(--texto-suave)', marginTop:8 }}>Necesitas fichas con precio y costo variable para calcularlo.</p>
                  : <>
                      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:10 }}>
                        <div style={{ flex:1, minWidth:180, textAlign:'center', background:'#fff', borderRadius:8, padding:'10px', border:'1px solid var(--crema-oscuro)' }}>
                          <div style={{ fontSize:'1.15rem', fontWeight:700, color:'var(--selva)' }}>{fNum(peContable)}</div>
                          <div style={{ fontSize:'0.75rem', color:'var(--texto-suave)' }}>unid/mes para no dar pérdida</div>
                        </div>
                        <div style={{ flex:1, minWidth:180, textAlign:'center', background:'#fff', borderRadius:8, padding:'10px', border:'1px solid var(--dorado)' }}>
                          <div style={{ fontSize:'1.15rem', fontWeight:700, color:'var(--dorado)' }}>{fNum(peCaja)}</div>
                          <div style={{ fontSize:'0.75rem', color:'var(--texto-suave)' }}>unid/mes para además pagar la deuda</div>
                        </div>
                        <div style={{ flex:1, minWidth:180, textAlign:'center', background:'#fff', borderRadius:8, padding:'10px', border:'1px solid var(--crema-oscuro)' }}>
                          <div style={{ fontSize:'1.15rem', fontWeight:700, color:'var(--tierra)' }}>{fNum(unidsMesTot)}</div>
                          <div style={{ fontSize:'0.75rem', color:'var(--texto-suave)' }}>unid/mes que produces hoy</div>
                        </div>
                      </div>
                      <div style={{ fontSize:'0.78rem', color:'var(--texto-suave)', marginTop:10 }}>
                        Costos fijos {fCOP(fijosTot)} (producción {fCOP(cifTotal)} + gastos {fCOP(gastosFijosOper)}) ÷ margen de contribución promedio {fCOP(mcuProm)}/u.
                        {gastosOp.pasivo.total > 0 && <> El abono a deuda de {fCOP(gastosOp.pasivo.total)}/mes no es gasto, pero exige vender <strong>{fNum(peCaja - peContable)} unidades más</strong> para no quedarte sin caja.</>}
                      </div>

                      {/* Mínimo a vender de CADA producto, según su peso en el portafolio */}
                      <div style={{ marginTop:14 }}>
                        <strong style={{ color:'var(--selva)', fontSize:'0.88rem' }}>Cuánto debes vender de cada producto</strong>
                        <div className="alert alert-info" style={{ fontSize:'0.8rem', margin:'6px 0 8px' }}>
                          ℹ Solo productos <strong>vendibles</strong> (no incluye materias primas ni subproductos internos).
                          El mínimo se reparte según su <strong>participación en ventas</strong> (unidades × precio mayor).
                          Es el punto en que no ganas ni pierdes: por encima de esa cifra, cada unidad deja utilidad.
                        </div>
                        <div className="table-wrap">
                          <table>
                            <thead><tr><th>Producto</th><th className="td-number">Produces/mes</th><th className="td-number">% ventas</th><th className="td-number">Margen/u</th><th className="td-number">Mínimo a vender</th><th className="td-number">Holgura</th></tr></thead>
                            <tbody>
                              {peqMultiproducto.length === 0
                                ? <tr><td colSpan={6} className="empty-table">No hay fichas vendibles activas para calcular el mínimo de venta.</td></tr>
                                : peqMultiproducto.map((i, idx) => {
                                const holgura = i.q - i.pe
                                const ok = holgura >= 0
                                return (
                                  <tr key={idx}>
                                    <td><strong>{i.nombre}</strong></td>
                                    <td className="td-number">{fNum(i.q)}</td>
                                    <td className="td-number">{((i.participacion || 0) * 100).toFixed(1)}%</td>
                                    <td className="td-number" style={{ color: i.mcu > 0 ? 'var(--selva)' : 'var(--rojo)' }}>{fCOP(i.mcu)}</td>
                                    <td className="td-number"><strong>{i.mcu > 0 ? fNum(i.pe) : '—'}</strong></td>
                                    <td className="td-number" style={{ color: ok ? 'var(--selva)' : 'var(--rojo)', fontWeight:600 }}>
                                      {i.mcu > 0 ? (ok ? `+${fNum(holgura)}` : `${fNum(holgura)}`) : 'sin margen'}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ fontSize:'0.76rem', color:'var(--texto-suave)', marginTop:6 }}>
                          <strong>Holgura</strong> = lo que produces al mes menos el mínimo. En verde te sobra colchón; en rojo
                          ese producto no alcanza a cubrir la parte de costos fijos que le corresponde, aunque el portafolio
                          completo sí lo haga. Si un producto queda con <em>margen/u</em> negativo, su precio está por debajo
                          de su costo variable: ahí no hay volumen que lo salve, hay que subir el precio o bajar el costo.
                        </div>
                      </div>
                    </>}
              </div>
            )
          })()}
        </div>
          </>}
        </>
        )
      })()}

      {/* ===== MPs ===== */}
      {tab === 'mps' && (
        <div className="card">
          <div className="card-title">🌿 Catálogo de Materias Primas</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Categoría</th><th>Unidad</th><th>Precio</th><th>Tipo</th></tr></thead>
              <tbody>
                {mps.length === 0
                  ? <tr><td colSpan={5} className="empty-table">Sin materias primas (ir a Inventario MP para gestionar)</td></tr>
                  : mps.map(m => (
                    <tr key={m.id}>
                      <td><strong>{m.nombre}</strong></td>
                      <td><span className="badge badge-gris">{m.categoria}</span></td>
                      <td>{m.unidad}</td>
                      <td className="td-number">{fCOP(m.precio)}<small style={{ color:'var(--texto-suave)' }}>/{m.unidad}</small></td>
                      <td><span className={`badge ${m.tipo==='interno'?'badge-dorado':'badge-azul'}`}>{m.tipo==='interno'?'Fabricado':'Comprado'}</span></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
          <div style={{ marginTop:16 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => window.location.href='/inventario'}>→ Gestionar MPs en Inventario</button>
          </div>
        </div>
      )}

      {/* ===== CALCULADORA DE RECETA ===== */}
      {tab === 'receta' && <Receta embedded productos={productos} onConvertir={(id) => cargarRecetaComoProducto(id)} />}

      {/* Modal ver ficha de costo */}
      {/* Confirmación reforzada de borrado de ficha */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Eliminar ficha de producto"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setConfirmDel(null)}>Cancelar</button>
          <button className="btn btn-danger" disabled={delText.trim() !== (confirmDel?.nombre || '').trim()} onClick={() => { deleteProducto.mutate(confirmDel.id); setConfirmDel(null) }}>Eliminar</button>
        </>}>
        {confirmDel && (
          <div style={{ fontSize: '0.9rem' }}>
            <div className="alert alert-warning" style={{ fontSize: '0.82rem' }}>Vas a eliminar la ficha <strong>{confirmDel.nombre}</strong>. Se guardará un respaldo en la <strong>papelera</strong> (recuperable). Esto <strong>no</strong> afecta el producto terminado ni Alegra.</div>
            <label className="form-label">Para confirmar, escribe el nombre exacto del producto:</label>
            <input className="form-control" value={delText} onChange={e => setDelText(e.target.value)} placeholder={confirmDel.nombre} />
          </div>
        )}
      </Modal>

      {/* Papelera de fichas */}
      <Modal open={modalPapelera} onClose={() => setModalPapelera(false)} title={`🗑 Papelera de fichas (${papelera.length})`} size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={() => setModalPapelera(false)}>Cerrar</button>}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th>Eliminada</th><th>Por</th><th>Acciones</th></tr></thead>
            <tbody>
              {papelera.length === 0
                ? <tr><td colSpan={4} className="empty-table">Papelera vacía.</td></tr>
                : papelera.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.nombre}</strong></td>
                      <td>{p.eliminado_at ? fFecha(p.eliminado_at.slice(0, 10)) : '—'}</td>
                      <td>{p.eliminado_por || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-xs btn-success" onClick={() => restaurarFicha.mutate(p)} disabled={restaurarFicha.isPending}><Ico as={Undo2} size={14} />Restaurar</button>
                          <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Eliminar definitivamente "${p.nombre}" de la papelera? Esto ya no se puede recuperar.`).then(ok => ok && purgarFicha.mutate(p.id))}><X size={13} aria-hidden="true" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal
        open={modalEquipos}
        onClose={closeModalEquipos}
        title="Depreciación y uso de equipos"
        size="modal-xl"
        footer={<button className="btn btn-secondary" onClick={closeModalEquipos}>Cerrar</button>}
      >
        <div className="alert alert-info" style={{ fontSize:'0.8rem' }}>
          La depreciación se calcula por línea recta: <strong>(valor − residual) ÷ vida útil ÷ 12</strong>.
          El método general entra al CIF mensual; por categoría se asigna según las horas o días del proceso de cada ficha.
        </div>
        <div className="form-grid-4" style={{ alignItems:'end' }}>
          <div className="form-group"><label className="form-label">Equipo *</label><input className="form-control" value={equipoForm.nombre} onChange={e => setEquipoForm(f => ({ ...f, nombre:e.target.value }))} placeholder="Horno deshidratador" /></div>
          <div className="form-group"><label className="form-label">Valor de adquisición</label><MoneyInput value={equipoForm.valor_adquisicion} onChange={v => setEquipoForm(f => ({ ...f, valor_adquisicion:v }))} /></div>
          <div className="form-group"><label className="form-label">Valor residual</label><MoneyInput value={equipoForm.valor_residual} onChange={v => setEquipoForm(f => ({ ...f, valor_residual:v }))} /></div>
          <div className="form-group"><label className="form-label">Vida útil (años)</label><input type="number" min="0.1" step="0.1" className="form-control" value={equipoForm.vida_util_anos} onChange={e => setEquipoForm(f => ({ ...f, vida_util_anos:e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Asignación</label><Select className="form-control" value={equipoForm.allocation_mode} onChange={e => setEquipoForm(f => ({ ...f, allocation_mode:e.target.value }))}><option value="general">General (CIF mensual)</option><option value="categoria">Por categoría y uso</option></Select></div>
          <div className="form-group">
            <label className="form-label">Grupo contable</label>
            <Select className="form-control" value={['cif','administracion','ventas'].includes(equipoForm.grupo) ? equipoForm.grupo : 'cif'} onChange={e => setEquipoForm(f => ({ ...f, grupo:e.target.value }))}>
              {GRUPOS_EQUIPO.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </Select>
            <small style={{ color:'var(--texto-suave)', fontSize:'0.72rem', display:'block', marginTop:4 }}>
              Según el <strong>uso</strong> del equipo: planta → <strong>CIF</strong> (entra al costo del producto si es asignación general);
              oficina → <strong>Administración</strong>; entregas/comercial → <strong>Ventas</strong>.
              Si compraste a crédito, aquí solo va la depreciación del activo; los intereses del crédito son gasto financiero (en Gastos), no depreciación.
            </small>
          </div>
          {equipoForm.allocation_mode === 'categoria' && <>
            <div className="form-group"><label className="form-label">Base de uso</label><Select className="form-control" value={equipoForm.rate_basis} onChange={e => setEquipoForm(f => ({ ...f, rate_basis:e.target.value }))}><option value="hora">Hora</option><option value="dia">Día</option></Select></div>
            <div className="form-group"><label className="form-label">Capacidad mensual ({equipoForm.rate_basis === 'dia' ? 'días' : 'horas'})</label><input type="number" min="0.1" step="any" className="form-control" value={equipoForm.capacidad_mes} onChange={e => setEquipoForm(f => ({ ...f, capacidad_mes:e.target.value }))} /></div>
          </>}
        </div>
        {equipoForm.allocation_mode === 'categoria' && (
          <div className="form-group">
            <label className="form-label">Categorías a las que aplica</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {[...new Set([...tiposProducto.map(t => t.nombre), 'subproducto', 'mp', 'otro'])].map(cat => (
                <label key={cat} className="check-row" style={{ padding:'5px 8px' }}><input type="checkbox" checked={equipoForm.categorias.includes(cat)} onChange={e => setEquipoForm(f => ({ ...f, categorias:e.target.checked ? [...f.categorias, cat] : f.categorias.filter(x => x !== cat) }))} /><span>{cat}</span></label>
              ))}
            </div>
          </div>
        )}
        <div style={{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 14px', flexWrap:'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={guardarEquipo}>{equipoForm.id ? 'Guardar cambios' : 'Agregar equipo'}</button>
          {equipoForm.id && <button type="button" className="btn btn-secondary" onClick={limpiarEquipoForm}>Cancelar edición</button>}
          <span style={{ marginLeft:'auto', color:'var(--texto-suave)', fontSize:'0.78rem' }}>
            Depreciación mensual: <strong>{fCOP(getDepreciacionMensualEquipo(equipoForm))}</strong>
            {equipoForm.allocation_mode === 'categoria' ? ` · ${fCOP(getCostoTasaEquipo(equipoForm))}/${equipoForm.rate_basis}` : ''}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Equipo</th><th>Método</th><th>Categorías</th><th>Depreciación/mes</th><th>Tasa</th><th></th></tr></thead>
            <tbody>
              {equipos.length === 0 ? <tr><td colSpan={6} className="empty-table">Sin equipos configurados.</td></tr> : equipos.map(e => {
                const cats = equipoLinks.filter(l => String(l.equipment_id) === String(e.id)).map(l => l.categoria)
                return (
                  <tr key={e.id}>
                    <td><strong>{e.nombre}</strong></td>
                    <td>{e.allocation_mode === 'general' ? 'General' : 'Por categoría'}</td>
                    <td>{cats.join(', ') || '—'}</td>
                    <td className="td-number">{fCOP(getDepreciacionMensualEquipo(e))}</td>
                    <td className="td-number">{e.allocation_mode === 'categoria' ? `${fCOP(getCostoTasaEquipo(e))}/${e.rate_basis}` : '—'}</td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="btn btn-xs btn-secondary" onClick={() => editarEquipo(e)}><Pencil size={12} aria-hidden="true" /></button>
                        <button type="button" className="btn btn-xs btn-danger" onClick={() => eliminarEquipo(e)}><Trash2 size={12} aria-hidden="true" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal
        open={!!detalleCosto}
        onClose={closeDetalleCosto}
        title={`Detalle de costos — ${detalleCosto?.producto?.nombre || ''}`}
        size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={closeDetalleCosto}>Cerrar</button>}
      >
        {detalleCosto && (() => {
          const items = detalleCosto.items || []
          const fichaCosto = Number(detalleCosto.items?.[0]?.costoFicha)
            || (detalleCosto.producto ? recomputeProducto(detalleCosto.producto).costoTotalUnit : 0)
            || Number(detalleCosto.producto?.costo_final) || 0
          return (
            <div className="detalle-costos-alerta">
              <div className="alert alert-info" style={{ fontSize:'0.82rem' }}>
                Comparación vs <strong>costo de producción/u</strong> de la ficha (MP + empaque + MO + CIF): <strong>{fCOP(fichaCosto)}</strong>.
                La variación suele venir de tiempos de proceso (MO) o de ingredientes de más; producir más cantidad con proporciones normales no debería alarmar.
              </div>
              {items.map(c => {
                const resalta = detalleCosto.foco != null && String(detalleCosto.foco) === String(c.ordenId)
                const alarma = Math.abs(c.desviacion) > 10
                const codigo = opCodigo(c.ordenId)
                const f = c.ficha || {}
                const o = c.ordenU || {}
                const fichaTotalU = Number(f.total || c.costoFicha || fichaCosto) || 0
                const filas = [
                  { key: 'mp', label: 'Materias primas', ficha: f.mp, orden: o.mp, hint: 'Si sube: ingredientes de más o precios PEPS distintos' },
                  { key: 'emp', label: 'Empaque', ficha: f.emp, orden: o.emp, hint: 'Tarifa de ficha × unidades obtenidas' },
                  { key: 'mo', label: 'MO / CIF (tiempo)', ficha: f.mo, orden: o.mo, hint: c.minutosReales > 0
                    ? `${fNum(Math.round(c.minutosReales))} min reales vs ${fNum(Math.round(c.minutosEsperados || 0))} esp.`
                    : 'Sin tiempos registrados → se usa tarifa de ficha' },
                  { key: 'adic', label: 'Adicionales / equipos', ficha: f.adic, orden: o.adic, hint: 'Costos fijos de la ficha' },
                  { key: 'destajo', label: 'Destajo (extra orden)', ficha: 0, orden: o.destajo, hint: 'Solo aparece en la orden' },
                  { key: 'tiempo', label: 'Costos por hora/día', ficha: f.tiempo, orden: o.tiempo, hint: 'Ficha: cantidad sugerida × tarifa; orden: cantidad real diligenciada' },
                ].filter(row => (Number(row.ficha) || 0) > 0 || (Number(row.orden) || 0) > 0 || ['mp', 'mo'].includes(row.key))
                // % = cuánto mueve este concepto el costo/u respecto al TOTAL de la ficha
                // (antes era % sobre la misma línea → MO $50→$500 salía +900% y se veía “raro”).
                const fmtDiff = (fichaV, ordenV) => {
                  const fv = Number(fichaV) || 0
                  const ov = Number(ordenV) || 0
                  const d = ov - fv
                  const pct = fichaTotalU > 0 ? (d / fichaTotalU) * 100 : (ov > 0 ? 100 : 0)
                  return { d, pct, fv, ov }
                }
                const fmtPct = (pct, { nuevo = false } = {}) => {
                  if (nuevo) return 'nuevo'
                  if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) return '—'
                  const sign = pct >= 0 ? '+' : ''
                  if (Math.abs(pct) >= 999) return `${sign}>999%`
                  return `${sign}${pct.toFixed(1)}%`
                }
                const plan = Number(c.cantidadPlan) || 0
                const obtuvo = Number(c.cantidad) || 0
                const diffUnd = obtuvo - plan
                const pctUnd = plan > 0 ? (diffUnd / plan) * 100 : null
                const desvTotal = Number.isFinite(c.desviacion) ? c.desviacion : 0
                return (
                  <div key={c.ordenId} className={`detalle-costo-orden ${resalta ? 'foco' : ''} ${alarma ? 'alarma' : ''}`}>
                    <div className="detalle-costo-orden-head">
                      <div>
                        <strong>{codigo}</strong>
                        <small> · {c.fecha ? fFecha(String(c.fecha).slice(0, 10)) : 'sin fecha'}</small>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontWeight:700, color: alarma ? (desvTotal > 0 ? 'var(--rojo)' : 'var(--tierra)') : 'var(--selva)' }}>{fCOP(c.costo)}/u</div>
                        <small style={{ color: desvTotal > 10 ? 'var(--rojo)' : desvTotal < -10 ? 'var(--tierra)' : 'var(--texto-suave)' }}>
                          {!Number.isFinite(desvTotal) ? '—'
                            : `${desvTotal >= 0 ? '+' : ''}${desvTotal.toFixed(1)}%`} vs ficha ({fCOP(c.costoFicha || fichaCosto)}/u)
                        </small>
                      </div>
                    </div>
                    <div className="detalle-costo-unidades" style={{
                      display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:8,
                      margin:'10px 0 4px', padding:'10px 12px',
                      background:'rgba(45,90,61,0.04)', border:'1px solid var(--crema-oscuro)', borderRadius:'var(--radio)',
                      fontSize:'0.84rem',
                    }}>
                      <div>
                        <div style={{ color:'var(--texto-suave)', fontSize:'0.72rem' }}>Debían salir</div>
                        <div style={{ fontWeight:700, color:'var(--selva)' }}>{plan > 0 ? `${fNum(plan)} und` : '—'}</div>
                        <small style={{ color:'var(--texto-suave)' }}>cantidad planeada</small>
                      </div>
                      <div>
                        <div style={{ color:'var(--texto-suave)', fontSize:'0.72rem' }}>Salieron</div>
                        <div style={{ fontWeight:700, color:'var(--selva)' }}>{obtuvo > 0 ? `${fNum(obtuvo)} und` : '—'}</div>
                        <small style={{ color:'var(--texto-suave)' }}>cantidad obtenida</small>
                      </div>
                      <div>
                        <div style={{ color:'var(--texto-suave)', fontSize:'0.72rem' }}>Variación de unidades</div>
                        <div style={{
                          fontWeight:700,
                          color: plan <= 0 ? 'var(--texto-suave)'
                            : diffUnd < -0.5 ? 'var(--rojo)'
                              : diffUnd > 0.5 ? 'var(--tierra)'
                                : 'var(--selva)',
                        }}>
                          {plan <= 0 ? '—' : `${diffUnd > 0 ? '+' : ''}${fNum(diffUnd)} und`}
                          {pctUnd != null ? ` (${fmtPct(pctUnd)})` : ''}
                        </div>
                        <small style={{ color:'var(--texto-suave)' }}>
                          {plan <= 0 ? 'Sin plan en la orden'
                            : diffUnd < -0.5 ? 'Salieron menos → el costo/u suele subir'
                              : diffUnd > 0.5 ? 'Salieron más → el costo/u suele bajar'
                                : 'Cantidad según lo planeado'}
                        </small>
                      </div>
                    </div>
                    <div className="table-wrap" style={{ marginTop:8 }}>
                      <table className="tabla-comparativa-costos">
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th className="td-number">Ficha /u</th>
                            <th className="td-number">{codigo} /u</th>
                            <th className="td-number">Diferencia</th>
                            <th className="td-number" title="Cuánto aporta este concepto a la variación del costo total de la ficha. La suma de las filas ≈ % del total.">% Δ total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filas.map(row => {
                            const { d, pct, fv, ov } = fmtDiff(row.ficha, row.orden)
                            const esNuevo = !(fv > 0) && ov > 0
                            const marca = Math.abs(pct) > 10 || esNuevo
                            return (
                              <tr key={row.key} className={marca ? 'fila-variacion' : undefined} title={row.hint || ''}>
                                <td>
                                  {row.label}
                                  {row.key === 'mo' && c.minutosReales > 0 && (
                                    <small style={{ display:'block', color:'var(--texto-suave)' }}>{row.hint}</small>
                                  )}
                                </td>
                                <td className="td-number">{fv > 0 || row.key === 'mp' || row.key === 'emp' || row.key === 'mo' ? fCOP(fv) : '—'}</td>
                                <td className="td-number">{fCOP(ov)}</td>
                                <td className="td-number" style={{ color: d > 0.5 ? 'var(--rojo)' : d < -0.5 ? 'var(--tierra)' : undefined }}>
                                  {Math.abs(d) < 0.5 ? '—' : `${d > 0 ? '+' : ''}${fCOP(d)}`}
                                </td>
                                <td className="td-number" style={{ color: pct > 10 ? 'var(--rojo)' : pct < -10 ? 'var(--tierra)' : 'var(--texto-suave)' }}>
                                  {fmtPct(pct, { nuevo: esNuevo })}
                                </td>
                              </tr>
                            )
                          })}
                          {(() => {
                            const { d, pct } = fmtDiff(fichaTotalU, o.total || c.costo)
                            return (
                              <tr className="fila-total-comparativa">
                                <td>= Costo de producción /u</td>
                                <td className="td-number">{fCOP(fichaTotalU)}</td>
                                <td className="td-number">{fCOP(o.total || c.costo)}</td>
                                <td className="td-number" style={{ color: d > 0 ? 'var(--rojo)' : d < 0 ? 'var(--tierra)' : undefined }}>
                                  {Math.abs(d) < 0.5 ? '—' : `${d > 0 ? '+' : ''}${fCOP(d)}`}
                                </td>
                                <td className="td-number" style={{ fontWeight:700, color: pct > 10 ? 'var(--rojo)' : pct < -10 ? 'var(--tierra)' : 'var(--selva)' }}>
                                  {fmtPct(pct)}
                                </td>
                              </tr>
                            )
                          })()}
                        </tbody>
                      </table>
                      <small style={{ display:'block', marginTop:4, color:'var(--texto-suave)', fontSize:'0.72rem' }}>
                        “% Δ total” = (diferencia del concepto) ÷ (costo ficha/u). Así las filas suman ≈ la variación del encabezado.
                      </small>
                    </div>
                    <small style={{ display:'block', marginTop:6, color:'var(--texto-suave)', fontSize:'0.75rem' }}>
                      Totales de la orden: MP {fCOP(c.mpTotal)} · Empaque {fCOP(c.empTotal || 0)} · MO/CIF {fCOP(c.moTotal || 0)}
                      {(c.adicTotal || 0) > 0 ? ` · Adic. ${fCOP(c.adicTotal)}` : ''}
                      {(c.destajo || 0) > 0 ? ` · Destajo ${fCOP(c.destajo)}` : ''}
                      {(c.tiempo || 0) > 0 ? ` · Tiempo ${fCOP(c.tiempo)}` : ''}
                      {' · '}Total {fCOP(c.costoTotal)}
                    </small>
                    {c.costosHora?.length > 0 && (
                      <div style={{ marginTop:8, fontSize:'0.8rem' }}>
                        <strong>Tiempo registrado en {codigo}:</strong>
                        <ul style={{ margin:'4px 0 0 18px', padding:0 }}>
                          {c.costosHora.map((h, i) => (
                            <li key={i}>{h.nombre || 'Concepto'}: {fNum(h.cantidad || 0)} {h.unidad || 'hora'}(s) × {fCOP(h.tarifa || 0)} = {fCOP(h.total || (Number(h.cantidad) || 0) * (Number(h.tarifa) || 0))}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {c.destajoItems?.some(d => d.nombre?.trim() || d.cantidad || d.tarifa) && (
                      <div style={{ marginTop:8, fontSize:'0.8rem' }}>
                        <strong>Destajo en {codigo}:</strong>
                        <ul style={{ margin:'4px 0 0 18px', padding:0 }}>
                          {c.destajoItems.filter(d => d.nombre?.trim() || d.cantidad || d.tarifa).map((d, i) => (
                            <li key={i}>{d.nombre || 'Operario'}: {fNum(d.cantidad || 0)} × {fCOP(d.tarifa || 0)} = {fCOP((Number(d.cantidad) || 0) * (Number(d.tarifa) || 0))}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {c.lotesMp?.length > 0 && (
                      <div style={{ marginTop:8, fontSize:'0.8rem' }}>
                        <strong>MP consumida ({codigo}):</strong>
                        <ul style={{ margin:'4px 0 0 18px', padding:0 }}>
                          {c.lotesMp.map((item, i) => {
                            const lotes = Array.isArray(item.lotes) ? item.lotes : []
                            const costoLotes = lotes.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.costo_unitario) || 0), 0)
                            const mp = mps.find(m => String(m.id) === String(item.mp_id))
                            const sinLote = (Number(item.sin_lote_cantidad) || 0) * (Number(mp?.precio) || 0)
                            return (
                              <li key={i}>
                                {item.nombre || mp?.nombre || `MP #${item.mp_id}`}: {fCOP(costoLotes + sinLote)}
                                {lotes.length > 0 && <small style={{ color:'var(--texto-suave)' }}> · lotes {lotes.map(l => l.lote || 's/n').join(', ')}</small>}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                    <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
                      <button type="button" className="btn btn-xs btn-primary" onClick={() => abrirOrdenDesdeDetalle(c.ordenId)}>
                        Abrir {codigo}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </Modal>

      <Modal open={verModal} onClose={() => setVerModal(false)} title={`Ficha — ${verProd?.nombre}`} size="modal-xl"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setVerModal(false)}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => { cargarProducto(verProd?.id); setVerModal(false) }}><Ico as={Pencil} size={14} />Editar esta ficha</button>
          </>
        }
      >
        {verProd && (() => {
          const rc = recomputeProducto(verProd)
          const ind = indicadoresProducto(verProd, rc)
          // Participación CIF informativa por ventas (precio mayor × unid); viene del motor.
          const pctCIF = parseFloat(rc.pctCIF) || 0
          const peq = peqMultiproducto.find(x => x.nombre === verProd.nombre)
          const cifAsigProd = cifAbsorcion.items.find(x => x.nombre === verProd.nombre)?.absorbido || 0
          const pctComponente = (v) => (rc.costoTotalUnit > 0 ? (v / rc.costoTotalUnit * 100).toFixed(1) + '%' : '—')
          const rentabilidadSobreCosto = rc.costoTotalUnit > 0 ? (rc.utilMayor / rc.costoTotalUnit * 100) : 0
          const vIngs = parseJSON(verProd.ingredientes, [])
          const vProcs = parseJSON(verProd.procesos, [])
          const vEmps = parseJSON(verProd.empaque, [])
          const vCampos = parseJSON(verProd.campos_personalizados, [])
          const vCalidad = parseJSON(verProd.parametros_calidad, [])
          const vAdic = parseJSON(verProd.costos_adicionales, [])
          const totalG = vIngs.reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0)
          return (
          <>
            <div className="grid-resp" style={{ gridTemplateColumns:'1fr 1fr', gap:'8px 16px', marginBottom:16 }}>
              {verProd.imagen_url && <div style={{ gridColumn:'span 2' }}><img src={verProd.imagen_url} alt={verProd.nombre} style={{ height:120, objectFit:'contain', borderRadius:4 }} /></div>}
              <div><strong>Tipo:</strong> {verProd.tipo}</div>
              <div><strong>Presentación:</strong> {verProd.presentacion || 'Unidad'}</div>
              <div><strong>Unidades/bache:</strong> {verProd.bache}</div>
              <div><strong>Baches/mes:</strong> {verProd.baches_mes}</div>
              <div><strong>Unidades/mes:</strong> {fNum(ind.unidsMes)}</div>
              <div><strong>Vida útil:</strong> {verProd.vida_util_valor ? `${verProd.vida_util_valor} ${verProd.vida_util_unidad === 'dias' ? 'día(s)' : 'mes(es)'}` : '—'}</div>
              <div><strong>Rendimiento:</strong> {verProd.rendimiento || 62}%</div>
              <div><strong>Desperdicio:</strong> {verProd.desperdicio ?? 2}%</div>
              <div><strong>Peso/unidad:</strong> {fNum(verProd.peso_unidad || 0)} g</div>
              <div><strong>% Comisión:</strong> {verProd.comision || 0}%</div>
              {vCampos.map((c, k) => <div key={k}><strong>{c.nombre}:</strong> {c.valor || '—'}</div>)}
            </div>

            {vIngs.length > 0 && <>
              <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', marginBottom:6 }}>🌿 Receta ({vIngs.length} ingredientes · {fNum(totalG)} g/bache)</div>
              <div className="table-wrap" style={{ maxHeight:200, overflowY:'auto', marginBottom:14 }}>
                <table style={{ fontSize:'0.82rem' }}>
                  <thead><tr><th>Ingrediente</th><th className="td-number">g/bache</th><th className="td-number">% receta</th><th className="td-number">$/presentación</th></tr></thead>
                  <tbody>
                    {vIngs.map((i, k) => (
                      <tr key={k}>
                        <td>{i.nombre}{i.tipo === 'relativo' ? <small style={{ color:'var(--tierra)' }}> (relativo)</small> : ''}</td>
                        <td className="td-number">{fNum(parseFloat(i.cantidad) || 0)}</td>
                        <td className="td-number">{totalG > 0 ? ((parseFloat(i.cantidad) || 0) / totalG * 100).toFixed(1) + '%' : '—'}</td>
                        <td className="td-number">{fCOP(parseFloat(i.precio) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>}

            {vProcs.length > 0 && <>
              <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', marginBottom:6 }}>⏱ Procesos (mano de obra)</div>
              <div style={{ fontSize:'0.84rem', marginBottom:14 }}>
                {vProcs.map((p, k) => <span key={k}>{k > 0 && ' · '}{p.nombre || 'Proceso'}: <strong>{fNum(parseFloat(p.minutos) || 0)} min</strong></span>)}
                {' '}<small style={{ color:'var(--texto-suave)' }}>(total {fNum(vProcs.reduce((s, p) => s + (parseFloat(p.minutos) || 0), 0))} min/bache)</small>
              </div>
            </>}

            {vEmps.length > 0 && <>
              <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', marginBottom:6 }}>📦 Empaque</div>
              <div style={{ fontSize:'0.84rem', marginBottom:14 }}>
                {vEmps.map((e, k) => <span key={k}>{k > 0 && ' · '}{e.nombre || 'Ítem'}: {fNum(parseFloat(e.cantidad) || 0)} × {fCOP((parseFloat(e.precio) || 0) / (parseFloat(e.presentacion) || 1))}</span>)}
              </div>
            </>}

            {vCalidad.length > 0 && <>
              <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', marginBottom:6 }}>🧪 Parámetros de calidad</div>
              <div style={{ fontSize:'0.84rem', marginBottom:14 }}>
                {vCalidad.map((p, k) => <span key={k}>{k > 0 && ' · '}{p.nombre}: <strong>{p.valor}{p.unidad ? ` ${p.unidad}` : ''}</strong></span>)}
              </div>
            </>}

            {vAdic.length > 0 && <>
              <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', marginBottom:6 }}>💰 Costos adicionales</div>
              <div style={{ fontSize:'0.84rem', marginBottom:14 }}>
                {vAdic.map((a, k) => <span key={k}>{k > 0 && ' · '}{a.descripcion || 'Costo'}: <strong>{fCOP(parseFloat(a.valor) || 0)}</strong> <small style={{ color:'var(--texto-suave)' }}>por {a.base || 'unidad'}</small></span>)}
              </div>
            </>}

            <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', marginBottom:6 }}>📊 Costos y márgenes (en vivo)</div>
            <table>
              <thead><tr><th>Concepto</th><th className="td-number">Valor (en vivo)</th></tr></thead>
              <tbody>
                <tr><td>Costo MP + empaque por unidad</td><td className="td-number">{fCOP(rc.cvu)}</td></tr>
                <tr><td>(+) Mano de obra/overhead por unidad <small style={{ color:'var(--texto-suave)' }}>({rc.totalMinutos} min × {fCOP(rc.costoMin)}/min)</small></td><td className="td-number text-dorado">{fCOP(rc.moUnit)}</td></tr>
                {(rc.adicUnit || 0) > 0 && <tr><td>(+) Costos adicionales por unidad</td><td className="td-number text-dorado">{fCOP(rc.adicUnit)}</td></tr>}
                {(rc.equipoUnit || 0) > 0 && <tr><td>(+) Equipos asignados por categoría</td><td className="td-number text-dorado">{fCOP(rc.equipoUnit)}</td></tr>}
                <tr style={{ fontWeight:700, borderTop:'2px solid var(--crema-oscuro)' }}><td>= COSTO TOTAL por unidad</td><td className="td-number">{fCOP(rc.costoTotalUnit)}</td></tr>
                <tr style={{ color:'var(--selva-claro)' }}><td>Precio Mayor → Ganancia/u</td><td className="td-number">{fCOP(verProd.precio_mayor)} → {fCOP(rc.utilMayor)}</td></tr>
                {(rc.comUnit || 0) > 0 && <tr style={{ color:'var(--tierra)' }}><td>(−) Comisión distribuidor → Ganancia neta/u</td><td className="td-number">{fCOP(rc.comUnit)} → {fCOP(rc.utilMayorNeto)}</td></tr>}
                <tr style={{ color:'var(--selva)' }}><td>Precio Detal → Ganancia/u</td><td className="td-number">{fCOP(verProd.precio_detal)} → {fCOP(rc.utilDetal)}</td></tr>
                <tr style={{ fontSize:'0.82rem', color:'var(--texto-suave)' }}><td>Punto de equilibrio (calculado)</td><td className="td-number">{peq && peq.pe>0 ? fNum(peq.pe)+' unid/mes' : '—'}</td></tr>
                <tr style={{ fontSize:'0.82rem', color:'var(--texto-suave)' }}><td>% participación CIF (ventas del portafolio)</td><td className="td-number">{pctCIF > 0 ? pctCIF.toFixed(1) + '%' : '—'}</td></tr>
              </tbody>
            </table>

            <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', margin:'16px 0 6px' }}><Ico as={BarChart3} size={14} />Rentabilidad</div>
            <table>
              <tbody>
                <tr><td>% MP+empaque / costo total</td><td className="td-number">{pctComponente(rc.cvu)}</td></tr>
                <tr><td>% Mano de obra + overhead (CIF) / costo total</td><td className="td-number">{pctComponente(rc.moUnit)}</td></tr>
                {(rc.adicUnit || 0) > 0 && <tr><td>% Costos adicionales / costo total</td><td className="td-number">{pctComponente(rc.adicUnit)}</td></tr>}
                <tr><td>Margen bruto Mayor (%)</td><td className="td-number">{verProd.precio_mayor > 0 ? (rc.utilMayor / verProd.precio_mayor * 100).toFixed(1) + '%' : '—'}</td></tr>
                <tr><td>Margen bruto Detal (%)</td><td className="td-number">{verProd.precio_detal > 0 ? (rc.utilDetal / verProd.precio_detal * 100).toFixed(1) + '%' : '—'}</td></tr>
                <tr><td>Rentabilidad sobre costo (utilidad ÷ costo)</td><td className="td-number">{rentabilidadSobreCosto.toFixed(1)}%</td></tr>
                <tr><td>CIF absorbido por este producto (mensual)</td><td className="td-number">{fCOP(cifAsigProd)}</td></tr>
              </tbody>
            </table>
          </>
          )
        })()}
      </Modal>
    </div>
  )
}

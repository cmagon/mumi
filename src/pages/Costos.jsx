import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  fCOP, fNum, getCIFTotalMensual, getCIFMensual, getCostoMinuto,
  calcularCostosProducto, getCIFDistribucion, calcularReceta, getPEqMultiproducto,
  getCostoNominaMensual, PARAMS_NOMINA_DEFAULT,
} from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useReorder } from '../hooks/useReorder'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'
import MoneyInput from '../components/ui/MoneyInput'
import { useConfirm } from '../context/ConfirmContext'
import { AccordionItem, Fila } from '../components/ui/Acordeon'
import * as XLSX from 'xlsx'
import Receta from './Receta'
import { CATALOGO_PARAMS, PARAM_UNIDAD, PRESENTACIONES } from '../lib/calidad'

const EMPTY_PROD = {
  nombre: '', tipo: 'galleta', bache: 70, baches_mes: 3,
  merma: 0, comision: 3, precio_mayor: 10000, precio_detal: 15000,
  presentacion: 'Unidad',
}
const EMPTY_ING = { mpId: '', nombre: '', modo: 'lista', precio: '', presentacion: 1000, pct: '', cantidad: '', tipo: 'normal', base: '' }

export default function Costos() {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const imgInputRef = useRef()
  const { profile } = useAuth()
  const soloReceta = profile?.rol && profile.rol !== 'admin'   // operario/auxiliar: solo Calculadora de Receta

  // ---- Tabs y modo ----
  const [tab, setTab] = useState(profile?.rol && profile.rol !== 'admin' ? 'receta' : 'lista')
  const [editingId, setEditingId] = useState(null)   // null = nuevo, number = editando producto existente
  const [selFuente, setSelFuente] = useState('')     // valor del selector: '' | prod-{id} | recipe-{id}

  // ---- Formulario de ficha ----
  const [formProd, setFormProd]     = useState(EMPTY_PROD)
  const [ingredientes, setIngredientes] = useState([])
  const [procesos, setProcesos]     = useState([])
  const [empaque, setEmpaque]       = useState([])
  const [calcResult, setCalcResult] = useState(null)

  // ---- Imagen del producto ----
  const [imgData, setImgData] = useState('')

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

  // ---- Queries ----
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
  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
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
  const costoNomina = getCostoNominaMensual(empleados, paramsNom)
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
  const { data: tiposProducto = [] } = useQuery({
    queryKey: ['product_types'],
    queryFn: async () => { const { data } = await supabase.from('product_types').select('*').order('nombre'); return data || [] },
  })
  // Opciones del select de Tipo: gestionables + especiales fijos
  const tipoLabel = (t) => ({ subproducto: 'Subproducto interno', otro: 'Otro' }[t] || (t.charAt(0).toUpperCase() + t.slice(1)))
  const opcionesTipo = [...new Set([...tiposProducto.map(t => t.nombre), 'subproducto', 'otro'])]
  const [tiposModal, setTiposModal] = useState(false)
  const [nuevoTipo, setNuevoTipo] = useState('')
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

  // ---- CIF helpers ----
  // El CIF total = ítems manuales (arriendo, servicios, préstamo...) + nómina automática del personal.
  const cifManual = getCIFTotalMensual(cifItems)
  const cifTotal = cifManual + costoNomina.total
  const operariosActivos = (parseFloat(op.numOperarios) || 0) > 0 ? parseFloat(op.numOperarios) : (empleados.length || 3)
  const costoMin = getCostoMinuto(cifTotal, operariosActivos, op.dias, op.jornadaHoras, op.improductividad)
  // Minutos productivos disponibles al mes (denominador del costo/minuto)
  const minsDisponibles = operariosActivos * (parseFloat(op.dias) || 0) * (parseFloat(op.jornadaHoras) || 0) * 60 * (1 - (parseFloat(op.improductividad) || 0))
  const cifDist  = getCIFDistribucion(cifTotal, productos)

  // Unidades/mes totales del portafolio (para % CIF en vivo)
  const totalUnidsPortafolio = productos.reduce((s, p) => s + (p.bache * p.baches_mes * (1 - (p.merma||0)/100)), 0)

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
    const otros = productos.filter(x => x.id !== p.id)   // evita doble conteo
    const ings = parse(p.ingredientes).map(i => ({ ...i, precio: precioActualIng(i) }))
    return calcularCostosProducto({
      bache:        parseFloat(p.bache)        || 1,
      bachesMes:    parseFloat(p.baches_mes)   || 1,
      merma:        parseFloat(p.merma)         || 0,
      comision:     parseFloat(p.comision)      || 0,
      precioMayor:  parseFloat(p.precio_mayor)  || 0,
      precioDetal:  parseFloat(p.precio_detal)  || 0,
      ingredientes: ings, procesos: parse(p.procesos), empaque: parse(p.empaque),
      cifTotal, productosGuardados: otros, cifUnidadesFallback, operariosActivos,
      diasHabiles: op.dias, jornadaHoras: op.jornadaHoras, improductividad: op.improductividad,
    })
  }

  // Punto de equilibrio multiproducto (CF / MCPT × participación) sobre todo el portafolio
  const peqMultiproducto = useMemo(() => {
    const items = productos.map(p => ({
      nombre: p.nombre, precio_mayor: parseFloat(p.precio_mayor) || 0,
      cvu: recomputeProducto(p).costoTotalUnit,
      bache: parseFloat(p.bache) || 0, baches_mes: parseFloat(p.baches_mes) || 0, merma: parseFloat(p.merma) || 0,
    }))
    return getPEqMultiproducto(items, cifTotal)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, cifTotal, mps])

  // ---- Ingredientes con cantidad y precio resueltos ----
  // Las filas "relativo a" calculan su g/bache = (g/bache de la base) × (% / 100)
  // El precio de las filas de lista se toma del precio ACTUAL de la MP.
  const ingredientesEff = useMemo(() => {
    // g/bache de un NORMAL: directo (modo gramos) o derivado de su % × peso total del bache (modo %)
    const pesoTot = parseFloat(pesoBacheTotal) || 0
    const gNormal = (r) => modoIng === 'porcentaje' ? ((parseFloat(r.pct)||0)/100) * pesoTot : (parseFloat(r.cantidad)||0)
    const normalTotal = ingredientes.reduce((s, r) => r.tipo === 'relativo' ? s : s + gNormal(r), 0)
    return ingredientes.map(r => {
      const precio = precioActualIng(r)
      if (r.tipo === 'relativo') {
        const bases = Array.isArray(r.base) ? r.base.filter(Boolean) : (r.base ? [r.base] : [])
        const baseCant = bases.reduce((s, bn) => {
          const br = ingredientes.find(x => x.nombre === bn && x.tipo !== 'relativo')
          return s + (br ? gNormal(br) : 0)
        }, 0)
        const cant = baseCant * (parseFloat(r.pct)||0) / 100
        return { ...r, precio, cantidad: cant, pctReceta: normalTotal+cant > 0 ? cant/(normalTotal+cant)*100 : 0 }
      }
      const cant = gNormal(r)
      return { ...r, precio, cantidad: cant, pctReceta: normalTotal > 0 ? cant/normalTotal*100 : 0 }
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
    const portafolio = editingId ? productos.filter(p => p.id !== editingId) : productos
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
    }))
  }, [formProd, ingredientesEff, procesos, empaque, cifTotal, productos, editingId, cifUnidadesFallback, operariosActivos, op])

  useEffect(() => { recalcular() }, [recalcular])

  const parseJSON = (v, def) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return def } }

  // ---- Limpiar formulario ----
  const limpiarForm = () => {
    setFormProd(EMPTY_PROD); setIngredientes([]); setProcesos([]); setEmpaque([])
    setImgData(''); setRendimiento(62); setDesperdicio(2); setPesoUnidad(1000)
    setPorciona(false); setPesoSubporcion(''); setModoIng('gramos'); setPesoBacheTotal('')
    setBrix(75); setBrixAplica(false); setParamsCalidad([]); setCamposExtra([])
    setFichaFile(null); setFichaNombre(''); setFichaPath('')
    setEditingId(null); setSelFuente('')
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
      const calcIngs = ings.map(i => ({ nombre: i.nombre, pct: parseFloat(i.pct)||0, precio: parseFloat(i.precio)||0, tipo: i.tipo||'normal', base: i.base||'total' }))
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
    setRendimiento(r.rendimiento || 62); setDesperdicio(r.desperdicio || 2); setPesoUnidad(r.peso_unidad || 1000)
    setBrix(r.brix || 75); setBrixAplica(!!r.brix_aplica)
    setImgData(r.imagen_url || '')
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
    setFormProd({ nombre: p.nombre, tipo: p.tipo, bache: p.bache, baches_mes: p.baches_mes, merma: p.merma, comision: p.comision, precio_mayor: p.precio_mayor, precio_detal: p.precio_detal, presentacion: p.presentacion || 'Unidad' })
    setCamposExtra(parseJSON(p.campos_personalizados, []))
    setIngredientes(parseJSON(p.ingredientes, []).map(i => ({ ...EMPTY_ING, _id: Date.now() + Math.random(), mpId: i.mpId||'', nombre: i.nombre||'', modo: i.mpId ? 'lista' : 'manual', precio: i.precio||'', precioOverride: !!i.precioOverride, presentacion: i.presentacion||1000, pct: i.pct||'', cantidad: i.cantidad||'', tipo: i.tipo||'normal', base: i.base||'' })))
    setProcesos(parseJSON(p.procesos, []).map(pr => ({ ...pr, _id: Date.now() + Math.random() })))
    setEmpaque(parseJSON(p.empaque, []).map(e => ({ ...e, _id: Date.now() + Math.random() })))
    setRendimiento(p.rendimiento || 62); setDesperdicio(p.desperdicio || 2); setPesoUnidad(p.peso_unidad || 1000)
    setPorciona(!!p.porciona); setPesoSubporcion(p.peso_subporcion || '')
    setBrix(p.brix || 75); setBrixAplica(!!p.brix_aplica)
    setParamsCalidad(parseJSON(p.parametros_calidad, []))
    setImgData(p.imagen_url || '')
    setFichaNombre(p.ficha_nombre || ''); setFichaPath(p.ficha_url || ''); setFichaFile(null)
    setTab('nuevo')
    toast(`"${p.nombre}" cargado para edición`)
  }

  // ---- Guardar/Actualizar producto ----
  const saveProducto = useMutation({
    mutationFn: async ({ actualizarMP = false, cambiosMP = [] } = {}) => {
      if (!formProd.nombre.trim()) throw new Error('Ingresa el nombre del producto')
      const r = calcResult || {}

      // Subir imagen si hay nueva
      let imagenUrl = imgData
      if (imgData && imgData.startsWith('data:') && !editingId) {
        // Subir base64 como archivo
        const res = await fetch(imgData); const blob = await res.blob()
        const ext = blob.type.split('/')[1] || 'jpg'
        const path = `productos/${Date.now()}.${ext}`
        const { error: imgErr } = await supabase.storage.from('product-images').upload(path, blob, { upsert: true })
        if (!imgErr) {
          const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path)
          imagenUrl = urlData.publicUrl
        }
      }

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
          precio: i.precio || '', presentacion: i.presentacion || 1000, precioOverride: !!i.precioOverride,
          tipo: i.tipo || 'normal', base: i.base || '',
          cantidad: i.cantidad ? Number(i.cantidad).toFixed(1) : '',
          pct: esRel ? (i.pct || '') : (i.pctReceta ? i.pctReceta.toFixed(3) : ''),
        }
      })

      const datos = {
        ...formProd,
        bache: parseFloat(formProd.bache) || 70,
        baches_mes: parseFloat(formProd.baches_mes) || 1,
        merma: parseFloat(formProd.merma) || 0,
        comision: parseFloat(formProd.comision) || 3,
        precio_mayor: parseFloat(formProd.precio_mayor) || 0,
        precio_detal: parseFloat(formProd.precio_detal) || 0,
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
        desperdicio: parseFloat(desperdicio) || 2,
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
                return { nombre: i.nombre, cantidad: Number(i.cantidad || 0).toFixed(1), precio: parseFloat(i.precio) || 0, unidad, costo: Math.round(costo) }
              }),
              costo_mp: r.totalMPBache || 0, cvu: r.cvu || 0, costo_total: r.costoTotalUnit || 0,
              creado_por: profile?.nombre || '',
            })
          } catch { /* si la tabla no está, no bloquea el guardado */ }
        }
      } else {
        const { error } = await supabase.from('products_costing').insert(datos)
        if (error) throw error
      }

      // Si el usuario confirmó, actualizar los costos en el inventario de Materias Primas
      if (actualizarMP && cambiosMP.length) {
        for (const c of cambiosMP) {
          await supabase.from('raw_materials').update({ precio: c.nuevo }).eq('id', c.mpId)
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products_costing'] })
      qc.invalidateQueries({ queryKey: ['product_cost_history'] })
      qc.invalidateQueries({ queryKey: ['raw_materials'] })
      toast(editingId ? 'Producto actualizado ✓' : 'Producto guardado ✓')
      limpiarForm(); setTab('lista')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  // Guardar la ficha; si se editó el costo de alguna MP de lista, pregunta si actualizar el inventario
  const guardarFicha = async () => {
    const cambiosMP = ingredientes
      .filter(i => i.mpId && i.precioOverride)
      .map(i => { const mp = mps.find(m => String(m.id) === String(i.mpId)); return mp ? { mpId: mp.id, nombre: mp.nombre, nuevo: parseFloat(i.precio) || 0, actual: mp.precio || 0 } : null })
      .filter(c => c && Math.round(c.nuevo) !== Math.round(c.actual))
    let actualizarMP = false
    if (cambiosMP.length) {
      const lista = cambiosMP.map(c => `• ${c.nombre}: ${fCOP(c.actual)} → ${fCOP(c.nuevo)}`).join('\n')
      actualizarMP = await confirmar(`Cambiaste el costo de ${cambiosMP.length} materia(s) prima(s) respecto al inventario:\n${lista}\n\n¿Deseas actualizar también esos costos en el inventario de Materias Primas?`,
        { title: 'Actualizar costos de MP', confirmText: 'Sí, actualizar inventario', cancelText: 'No, solo esta ficha' })
    }
    saveProducto.mutate({ actualizarMP, cambiosMP })
  }

  const deleteProducto = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('products_costing').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products_costing'] }); toast('Ficha eliminada') },
  })

  // Recalcular y persistir el CIF/costo de TODAS las fichas según el portafolio actual
  const recalcularTodos = useMutation({
    mutationFn: async () => {
      for (const p of productos) {
        const rc = recomputeProducto(p)
        const { error } = await supabase.from('products_costing').update({
          costo_final: rc.costoFinal || 0,
          cif_unit: rc.cifUnit || 0,
          util_mayor: rc.utilMayor || 0,
          util_detal: rc.utilDetal || 0,
          pe: rc.pe || 0,
        }).eq('id', p.id)
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products_costing'] }); toast('CIF actualizado en todas las fichas ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  // Duplicar producto (copia todo con nombre " (copia)")
  const duplicarProducto = useMutation({
    mutationFn: async (p) => {
      const { id, created_at, ...resto } = p
      const { error } = await supabase.from('products_costing').insert({
        ...resto,
        nombre: `${p.nombre} (copia)`,
        fecha_creado: new Date().toISOString().split('T')[0],
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products_costing'] }); toast('Producto duplicado ✓') },
    onError: (e) => toast(e.message, 'error'),
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
  const addCIF = async () =>{ await supabase.from('cif_items').insert({ descripcion: 'Nuevo ítem', categoria: 'General', frecuencia: 'mensual', valor: 0 }); refetchCIF(); toast('Ítem CIF agregado') }
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

  // Seleccionar MP de la lista → autocompleta nombre y precio
  const handleSelectMP = (id, mpId) => {
    const mp = mps.find(m => String(m.id) === String(mpId))
    setIngredientes(p => p.map(r => r._id === id ? { ...r, mpId, nombre: mp?.nombre||'', precio: mp?String(mp.precio):'', presentacion: 1000, precioOverride: false } : r))
  }

  // Toggle lista ↔ manual
  const toggleModo = (id, modo) => {
    setIngredientes(p => p.map(r => r._id === id ? { ...r, modo, mpId: '', nombre: modo==='lista'?'':r.nombre, precio: '' } : r))
  }

  // g/bache cambia → el % se deriva en render (no se almacena)
  const handleCantidadChange = (id, val) => updIng(id, 'cantidad', val)

  // ---- Empaque: detecta por categoría O por nombre; el resto va en "Otros insumos"
  // para que SIEMPRE haya opciones disponibles ----
  const RE_EMPAQUE = /empaque|envase|caja|bolsa|etiqueta|filtro|tapa|frasco|envoltura|sticker|rotulo|rótulo/i
  const mpsEmpaque = mps.filter(m => RE_EMPAQUE.test((m.categoria || '') + ' ' + (m.nombre || '')))
  // Ingredientes: excluye las materias primas de categoría empaque/envase
  const mpsIngredientes = mps.filter(m => !/empaque|envase/i.test(m.categoria || ''))
  const handleSelectEmpaqueMP = (id, mpId) => {
    const mp = mps.find(m => String(m.id) === String(mpId))
    setEmpaque(p => p.map(r => r._id === id ? { ...r, mpId, nombre: mp?.nombre||'', precio: mp?String(mp.precio):'', presentacion: 1 } : r))
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

  // Imagen del producto
  const handleImg = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setImgData(ev.target.result)
    reader.readAsDataURL(file)
  }

  // Resultado ancla (useMemo para calcular en tiempo real)
  const anclaResultado = useMemo(() => {
    if (!anclaId || !anclaQty) return null
    const ings = ingredientesEff.map(i => ({
      nombre: i.nombre,
      pct: i.tipo === 'relativo' ? (parseFloat(i.pct)||0) : (i.pctReceta||0),
      precio: parseFloat(i.precio)||0,
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

  const exportarFichaExcel = (p) => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['MUMI AMAZONIA - FICHA DE COSTOS'],[''],
      ['Producto',p.nombre],['Tipo',p.tipo],['Fecha',p.fecha_creado],[''],
      ['Costo total por unidad',p.costo_final],['Precio mayor',p.precio_mayor],['Utilidad mayor',p.util_mayor],
      ['Precio detal',p.precio_detal],['Utilidad detal',p.util_detal],['Punto equilibrio',p.pe||'—']
    ])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Costos')
    XLSX.writeFile(wb,`FichaCostos_${p.nombre.replace(/\s/g,'_')}.xlsx`); toast('Excel exportado ✓')
  }

  // ---- RENDER ----
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{soloReceta ? 'Calcular Recetas Rápidas o de Prueba' : 'Calculadora de Costos'}</h1>
        {!soloReceta && (
          <div className="page-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setTab('lista')}>📋 Productos</button>
            <button className="btn btn-dorado btn-sm" onClick={() => { limpiarForm(); setTab('nuevo') }}>+ Nueva Ficha</button>
          </div>
        )}
      </div>

      <div className="tabs">
        {(soloReceta
          ? [['receta','🧪 Recetas Rápidas / Prueba']]
          : [['lista','Productos'],['nuevo','📝 Ficha de Producto'],['receta','🧪 Recetas Rápidas / Prueba'],['cif','Costos Fijos (CIF)'],['mps','Materias Primas']]
        ).map(([id, lbl]) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {/* ===== LISTA PRODUCTOS ===== */}
      {tab === 'lista' && (
        <div className="card">
          <div className="card-title">📦 Fichas de Productos</div>
          <div className="alert alert-info" style={{ fontSize:'0.82rem' }}>
            ℹ El <strong>CIF/unidad</strong> y el <strong>% CIF</strong> se recalculan en vivo según el portafolio actual.
            Al agregar un producto, la participación de cada uno se ajusta automáticamente. Los valores guardados se
            actualizan en disco la próxima vez que edites y guardes cada ficha.
          </div>
          {/* ===== Versión móvil: acordeón ===== */}
          <div className="solo-movil">
            {productos.length === 0
              ? <p className="empty-table">No hay fichas. Crea la primera →</p>
              : productos.map(p => {
                  const rc = recomputeProducto(p)
                  const unidsMes = p.bache * p.baches_mes * (1 - (p.merma||0)/100)
                  const pctCIF = totalUnidsPortafolio > 0 ? unidsMes/totalUnidsPortafolio*100 : 0
                  const margen = p.precio_mayor > 0 ? rc.utilMayor/p.precio_mayor*100 : null
                  return (
                    <AccordionItem key={p.id}
                      titulo={<>{p.imagen_url && <img src={p.imagen_url} alt="" style={{ width:24, height:24, borderRadius:3, objectFit:'cover', verticalAlign:'middle', marginRight:6 }} />}{p.nombre}</>}
                      sub={<>Costo {fCOP(rc.costoFinal)} · Margen {margen != null ? margen.toFixed(1)+'%' : '—'}</>}
                    >
                      <Fila et="Tipo">{p.tipo}</Fila>
                      <Fila et="Unid/mes">{fNum(unidsMes)}</Fila>
                      <Fila et="MP + empaque">{fCOP(rc.cvu)}</Fila>
                      <Fila et="MO/overhead (por tiempo)">{fCOP(rc.moUnit)}</Fila>
                      <Fila et="Costo total/u">{fCOP(rc.costoTotalUnit)}</Fila>
                      <Fila et="P. Mayor">{fCOP(p.precio_mayor)}</Fila>
                      <Fila et="% Utilidad">{margen != null ? margen.toFixed(1)+'%' : '—'}</Fila>
                      <div className="acordeon-acciones">
                        <button className="btn btn-xs btn-secondary" onClick={() => { setVerProd(p); setVerModal(true) }}>Ver</button>
                        <button className="btn btn-xs btn-primary" onClick={() => cargarProducto(p.id)}>✏ Editar</button>
                        <button className="btn btn-xs btn-secondary" onClick={() => duplicarProducto.mutate(p)} disabled={duplicarProducto.isPending}>⧉ Duplicar</button>
                        <button className="btn btn-xs btn-dorado" onClick={() => exportarFichaExcel(p)}>Excel</button>
                        <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Eliminar la ficha del producto "${p.nombre}"?\nEsta acción no se puede deshacer.`).then(ok => ok && deleteProducto.mutate(p.id))}>✕</button>
                      </div>
                    </AccordionItem>
                  )
                })}
          </div>

          {/* ===== Versión desktop: tabla ===== */}
          <div className="table-wrap solo-desktop">
            <table>
              <thead><tr><th>Producto</th><th>Imagen</th><th>Tipo</th><th>Unid/mes</th><th>MP+Emp</th><th>MO/overhead</th><th>Costo total/u</th><th>P. Mayor</th><th>% Utilidad</th><th>Acciones</th></tr></thead>
              <tbody>
                {productos.length === 0
                  ? <tr><td colSpan={10} className="empty-table">No hay fichas. Crea la primera →</td></tr>
                  : productos.map(p => {
                      const rc = recomputeProducto(p)
                      const unidsMes = p.bache * p.baches_mes * (1 - (p.merma||0)/100)
                      const pctCIF = totalUnidsPortafolio > 0 ? unidsMes/totalUnidsPortafolio*100 : 0
                      const margen = p.precio_mayor > 0 ? rc.utilMayor/p.precio_mayor*100 : null
                      return (
                        <tr key={p.id}>
                          <td><strong>{p.nombre}</strong></td>
                          <td>
                            {p.imagen_url
                              ? <img src={p.imagen_url} alt={p.nombre} style={{ width:32, height:32, borderRadius:3, objectFit:'cover' }} />
                              : <span style={{ color:'var(--texto-suave)', fontSize:'0.8rem' }}>—</span>
                            }
                          </td>
                          <td><span className="badge badge-gris">{p.tipo}</span></td>
                          <td className="td-number">{fNum(unidsMes)}</td>
                          <td className="td-number">{fCOP(rc.cvu)}</td>
                          <td className="td-number text-dorado">{fCOP(rc.moUnit)}</td>
                          <td className="td-number"><strong>{fCOP(rc.costoTotalUnit)}</strong></td>
                          <td className="td-number">{fCOP(p.precio_mayor)}</td>
                          <td className="td-number text-verde">{margen != null ? margen.toFixed(1)+'%' : '—'}</td>
                          <td>
                            <div style={{ display:'flex', gap:4 }}>
                              <button className="btn btn-xs btn-secondary" onClick={() => { setVerProd(p); setVerModal(true) }}>Ver</button>
                              <button className="btn btn-xs btn-primary" onClick={() => cargarProducto(p.id)}>✏ Editar</button>
                              <button className="btn btn-xs btn-secondary" onClick={() => duplicarProducto.mutate(p)} disabled={duplicarProducto.isPending} title="Duplicar producto">⧉ Duplicar</button>
                              <button className="btn btn-xs btn-dorado" onClick={() => exportarFichaExcel(p)}>Excel</button>
                              <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Eliminar la ficha del producto "${p.nombre}"?\nEsta acción no se puede deshacer.`).then(ok => ok && deleteProducto.mutate(p.id))}>✕</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
          {productos.length > 1 && (
            <div style={{ marginTop:12, display:'flex', justifyContent:'flex-end' }}>
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
          {/* ── Selector: cargar producto (editar) o receta rápida (convertir a producto) ── */}
          <div className="card" style={{ padding:'14px 20px', marginBottom:16, background:'rgba(26,58,42,0.03)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <span style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', whiteSpace:'nowrap' }}>
                {editingId ? '✏ Editando producto:' : (selFuente.startsWith('recipe-') ? '🔄 Convirtiendo receta a producto:' : '📋 Cargar:')}
              </span>
              <select className="form-control" value={selFuente} onChange={e => cargarFuente(e.target.value)} style={{ maxWidth:340 }}>
                <option value="">— nueva ficha en blanco —</option>
                {productos.length > 0 && <optgroup label="⭐ Productos (editar)">{productos.map(p => <option key={p.id} value={`prod-${p.id}`}>{p.nombre}</option>)}</optgroup>}
                {recetas.length > 0 && <optgroup label="💾 Recetas rápidas (convertir a producto)">{recetas.map(r => <option key={r.id} value={`recipe-${r.id}`}>{r.nombre}</option>)}</optgroup>}
              </select>
              {(editingId || selFuente) && (
                <button className="btn btn-secondary btn-sm" onClick={limpiarForm}>+ Nueva ficha</button>
              )}
              {selFuente.startsWith('recipe-') && (
                <span style={{ fontSize:'0.8rem', color:'var(--tierra)' }}>Agrega MO, empaque y precios; al guardar se creará como producto base.</span>
              )}
            </div>
          </div>

          {/* ── Imagen + Info básica del producto ── */}
          <div className="card">
            <div className="card-title">📝 Información del Producto</div>
            <div className="grid-resp" style={{ gridTemplateColumns:'80px 1fr', gap:20, alignItems:'start' }}>
              {/* Imagen */}
              <div>
                <label className="form-label">Imagen</label>
                <div
                  onClick={() => imgInputRef.current?.click()}
                  style={{ width:72, height:72, border:'2px dashed var(--crema-oscuro)', borderRadius:'var(--radio)', overflow:'hidden', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.8rem', background: imgData ? 'transparent' : 'var(--crema)' }}
                >
                  {imgData ? <img src={imgData} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="producto" /> : '📷'}
                  <input type="file" accept="image/*" ref={imgInputRef} onChange={handleImg} style={{ display:'none' }} />
                </div>
                {imgData && <button className="btn btn-xs btn-danger" style={{ marginTop:4 }} onClick={() => setImgData('')}>✕</button>}
              </div>

              {/* Campos */}
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Nombre del Producto</label><input className="form-control" value={formProd.nombre} onChange={e => setFormProd(f=>({...f,nombre:e.target.value}))} placeholder="Nombre de mi producto" /></div>
                <div className="form-group">
                  <label className="form-label" style={{ display:'flex', alignItems:'center' }}>
                    Tipo
                    {esAdmin && <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft:'auto' }} onClick={() => setTiposModal(true)}>⚙ Gestionar</button>}
                  </label>
                  <select className="form-control" value={formProd.tipo} onChange={e => setFormProd(f=>({...f,tipo:e.target.value}))}>
                    {opcionesTipo.map(t => <option key={t} value={t}>{tipoLabel(t)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Presentación <small style={{ fontWeight:400, textTransform:'none', color:'var(--texto-suave)' }}>(elige o escribe una)</small></label>
                  <input className="form-control" list="dl-presentaciones" value={formProd.presentacion || ''} onChange={e => setFormProd(f=>({...f,presentacion:e.target.value}))} placeholder="Ej: Caja, Unidad, Kilo..." />
                  <datalist id="dl-presentaciones">{PRESENTACIONES.map(p => <option key={p} value={p} />)}</datalist>
                </div>
                <div className="form-group"><label className="form-label">{presLabel}s por bache</label><input type="number" className="form-control" value={formProd.bache} onChange={e => setFormProd(f=>({...f,bache:e.target.value}))} min={1} /></div>
                <div className="form-group"><label className="form-label">Baches por mes</label><input type="number" className="form-control" value={formProd.baches_mes} onChange={e => setFormProd(f=>({...f,baches_mes:e.target.value}))} min={1} /></div>
                <div className="form-group"><label className="form-label">% Comisión</label><input type="number" className="form-control" value={formProd.comision} onChange={e => setFormProd(f=>({...f,comision:e.target.value}))} min={0} max={100} step={0.5} /></div>
              </div>
            </div>

            {/* Campos personalizados */}
            <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid var(--crema-oscuro)' }}>
              <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem' }}>🏷️ Campos personalizados <small style={{ fontWeight:400, color:'var(--texto-suave)' }}>— datos adicionales del producto</small></div>
                <button type="button" className="btn btn-sm btn-secondary" style={{ marginLeft:'auto' }} onClick={addCampoExtra}>+ Agregar campo</button>
              </div>
              {camposExtra.length === 0
                ? <p style={{ fontSize:'0.82rem', color:'var(--texto-suave)' }}>Sin campos. Ej: Registro INVIMA, Vida útil, Lote, Código de barras...</p>
                : camposExtra.map((c, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr auto', gap:8, marginBottom:8, alignItems:'center' }}>
                    <input className="form-control" placeholder="Nombre del campo" value={c.nombre} onChange={e => updCampoExtra(i,'nombre',e.target.value)} />
                    <input className="form-control" placeholder="Valor" value={c.valor} onChange={e => updCampoExtra(i,'valor',e.target.value)} />
                    <button type="button" className="btn btn-danger btn-xs" onClick={() => delCampoExtra(i)}>✕</button>
                  </div>
                ))}
            </div>
          </div>

          {/* ── Ingredientes (integrado con toggle lista/manual de Calculadora de Receta) ── */}
          <div className="card">
            <div className="card-title">
              🌿 Materias Primas e Insumos
              <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
                <button className="btn btn-sm btn-secondary" onClick={addIngrediente}>+ Normal</button>
                <button className="btn btn-sm btn-dorado" onClick={addIngredienteRelativo}>+ Relativo a...</button>
              </div>
            </div>
            {/* Modo de ingreso: gramos/bache o porcentaje */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, flexWrap:'wrap' }}>
              <span style={{ fontSize:'0.8rem', color:'var(--texto-suave)' }}>Ingresar por:</span>
              {[['gramos','g / bache'],['porcentaje','% (porcentaje)']].map(([m,lbl],i) => (
                <button key={m} type="button" onClick={() => setModoIng(m)} style={{
                  padding:'4px 10px', fontSize:'0.78rem', cursor:'pointer', fontWeight:600,
                  background: modoIng===m ? 'var(--selva)' : 'transparent',
                  color: modoIng===m ? 'var(--crema)' : 'var(--texto-suave)',
                  border:`1px solid ${modoIng===m ? 'var(--selva)' : 'var(--crema-oscuro)'}`,
                  borderRadius: i===0 ? '4px 0 0 4px' : '0 4px 4px 0', marginLeft: i===1 ? -1 : 0,
                }}>{lbl}</button>
              ))}
              {modoIng==='porcentaje' && (
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.8rem', marginLeft:8 }}>
                  Peso total del bache (g):
                  <input type="number" className="form-control" style={{ width:130 }} value={pesoBacheTotal} onChange={e => setPesoBacheTotal(e.target.value)} placeholder="Ej: 10000" min={1} />
                </label>
              )}
            </div>
            <div style={{ overflowX:'auto' }}>
              <div className="ed-wrap" style={{ minWidth:820 }}>
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
                      <div style={{ display:'flex', gap:6, alignItems:'flex-start' }}>
                        <span {...ordIng.handleProps(idx)}>⠿</span>
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
                          ? <input className="form-control" placeholder="Nombre ingrediente" value={r.nombre||''} onChange={e => updIng(r._id,'nombre',e.target.value)} style={{ borderColor: accent }} />
                          : <select className="form-control" value={r.mpId||''} onChange={e => handleSelectMP(r._id, e.target.value)} style={{ borderColor: accent }}>
                              <option value="">Seleccionar MP...</option>
                              {mpsIngredientes.map(m => <option key={m.id} value={m.id}>{m.nombre} — {fCOP(m.precio)}/{m.unidad}</option>)}
                            </select>
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
                      {esRelativo
                        ? <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                            <input type="number" className="form-control" placeholder="0" value={r.pct||''} onChange={e => updIng(r._id,'pct',e.target.value)} step="0.01" style={{ textAlign:'right', paddingRight:16, borderColor: accent }} />
                            <span style={{ position:'absolute', right:6, fontSize:'0.78rem', color:'var(--texto-suave)', pointerEvents:'none' }}>%</span>
                          </div>
                        : <span style={{ textAlign:'right', paddingTop:8, fontSize:'0.88rem', color: pctRow>0 ? 'var(--selva)' : 'var(--texto-suave)', fontWeight: pctRow>0 ? 600 : 400 }}>
                            {pctRow > 0 ? pctRow.toFixed(1) + '%' : '—'}
                          </span>
                      }

                      {/* g/bache (modo gramos) o % (modo porcentaje) — calculado para relativo */}
                      {esRelativo
                        ? <span style={{ textAlign:'right', paddingTop:8, fontSize:'0.88rem', color:'var(--tierra)' }} title="Calculado desde la base">
                            {cantEff > 0 ? cantEff.toFixed(1) + ' g' : '—'}
                          </span>
                        : modoIng === 'porcentaje'
                          ? <div style={{ display:'flex', flexDirection:'column' }}>
                              <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                                <input type="number" className="form-control" placeholder="%" value={r.pct||''} onChange={e => updIng(r._id,'pct',e.target.value)} step="0.01" style={{ textAlign:'right', paddingRight:16, background:'rgba(124,179,66,0.06)' }} />
                                <span style={{ position:'absolute', right:6, fontSize:'0.78rem', color:'var(--texto-suave)', pointerEvents:'none' }}>%</span>
                              </div>
                              <span style={{ fontSize:'0.68rem', color:'var(--texto-suave)', textAlign:'right' }}>{cantEff > 0 ? cantEff.toFixed(1)+' g' : '—'}</span>
                            </div>
                          : <input type="number" className="form-control" placeholder="g/bache" value={r.cantidad||''} onChange={e => handleCantidadChange(r._id, e.target.value)} style={{ textAlign:'right', background:'rgba(124,179,66,0.06)' }} />
                      }

                      {/* $/Kg — editable; si es de lista y se cambia, queda como override (no toca la MP hasta confirmar al guardar) */}
                      <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                        <span style={{ position:'absolute', left:6, fontSize:'0.78rem', color:'var(--texto-suave)', pointerEvents:'none' }}>$</span>
                        {r.mpId
                          ? <MoneyInput value={r.precio || ''} onChange={v => setIngredientes(p => p.map(x => x._id === r._id ? { ...x, precio: v, precioOverride: true } : x))} style={{ paddingLeft:16, background: r.precioOverride ? 'rgba(200,169,74,0.12)' : 'rgba(124,179,66,0.08)', borderColor: r.precioOverride ? 'var(--dorado)' : undefined }} />
                          : <MoneyInput value={r.precio||''} onChange={v => updIng(r._id,'precio',v)} style={{ paddingLeft:16, borderColor: accent }} />
                        }
                      </div>

                      {/* Subtotal */}
                      <span className="ed-sub" style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem', paddingTop:8, textAlign:'right' }}>{fCOP(sub)}</span>
                      <div className="ed-controls" style={{ display:'flex', alignItems:'center', gap:2, marginTop:6 }}>
                        <button className="btn btn-danger btn-xs" onClick={() => setIngredientes(p => p.filter(x => x._id !== r._id))}>✕</button>
                      </div>
                    </div>
                  )
                })}
                {ingredientes.length === 0 && <p style={{ color:'var(--texto-suave)', fontSize:'0.88rem', padding:'8px 0' }}>Agrega ingredientes (Normal o Relativo a...)</p>}
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
              <small style={{ color:'var(--texto-suave)', fontSize:'0.78rem' }}>
                <strong>g/bache</strong> = gramos usados por bache (define el costo) · <strong>%</strong> receta se calcula automáticamente
              </small>
              <strong>Total MP: {fCOP(calcResult?.totalMPBache||0)}</strong>
            </div>
          </div>

          {/* ── Parámetros de producción ── */}
          <div className="card">
            <div className="card-title">⚙️ Parámetros de Producción <small style={{ fontWeight:400, fontSize:'0.78rem', color:'var(--texto-suave)' }}>— rendimiento, desperdicio y peso por unidad determinan cuántas unidades salen del bache</small></div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Rendimiento esperado (%)</label><input type="number" className="form-control" value={rendimiento} onChange={e => setRendimiento(e.target.value)} min={1} max={100} step={0.1} /></div>
              <div className="form-group"><label className="form-label">% Desperdicio</label><input type="number" className="form-control" value={desperdicio} onChange={e => setDesperdicio(e.target.value)} min={0} max={50} step={0.1} /></div>
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
            </div>

            {/* Parámetros de calidad (fisicoquímicos, reológicos, nutricionales...) */}
            <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid var(--crema-oscuro)' }}>
              <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.88rem' }}>🧪 Parámetros de Calidad <small style={{ fontWeight:400, color:'var(--texto-suave)' }}>— fisicoquímicos, reológicos, nutricionales y de pureza</small></div>
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
                    <button type="button" className="btn btn-danger btn-xs" onClick={() => delParamCalidad(i)}>✕</button>
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
              <button
                className="btn btn-xs btn-success"
                disabled={!(unidadesDesdeReceta > 0)}
                onClick={() => { setFormProd(f => ({ ...f, bache: Math.round(unidadesDesdeReceta) })); toast('Unidades por bache actualizadas desde la receta ✓') }}
                title="Copia las unidades estimadas al campo 'Unidades por bache' (Información del Producto)"
              >
                ↑ Usar como "Unidades por bache" ({unidadesDesdeReceta > 0 ? Math.round(unidadesDesdeReceta) : 0})
              </button>
            </div>
          </div>

          {/* ── Mano de obra ── */}
          <div className="card">
            <div className="card-title">⏱️ Mano de Obra (por proceso)<button className="btn btn-sm btn-secondary" style={{ marginLeft:'auto' }} onClick={addProceso}>+ Agregar proceso</button></div>
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
                      <button className="btn btn-danger btn-xs" onClick={() => setProcesos(p => p.filter(x => x._id !== r._id))}>✕</button>
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

          {/* ── Empaque ── */}
          <div className="card">
            <div className="card-title">📦 Empaque & Envase<button className="btn btn-sm btn-secondary" style={{ marginLeft:'auto' }} onClick={addEmpaque}>+ Agregar</button></div>
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
                          ? <input className="form-control" placeholder="Ítem (caja, bolsa...)" value={r.nombre||''} onChange={e => updEmp(r._id,'nombre',e.target.value)} />
                          : <select className="form-control" value={r.mpId||''} onChange={e => handleSelectEmpaqueMP(r._id, e.target.value)}>
                              <option value="">Seleccionar empaque...</option>
                              {mpsEmpaque.map(m => <option key={m.id} value={m.id}>{m.nombre} — {fCOP(m.precio)}/{m.unidad}</option>)}
                              {mpsEmpaque.length === 0 && <option value="" disabled>No hay insumos de empaque — usa modo ✏ Manual o créalos en Inventario MP</option>}
                            </select>
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
                        <button className="btn btn-danger btn-xs" onClick={() => setEmpaque(p => p.filter(x => x._id !== r._id))}>✕</button>
                      </div>
                    </div>
                  )
                })}
                {empaque.length === 0 && <p style={{ color:'var(--texto-suave)', fontSize:'0.88rem', padding:'8px 0' }}>Agrega empaques (caja, bolsa, etiqueta...)</p>}
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}><strong>Total Empaque: {fCOP(calcResult?.totalEmpBache||0)}</strong></div>
          </div>

          {/* ── Ficha técnica (instrucciones paso a paso) ── */}
          <div className="card">
            <div className="card-title">📄 Ficha Técnica — Instrucciones de Elaboración</div>
            {fichaNombre && (
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, padding:'8px 12px', background:'rgba(124,179,66,0.08)', borderRadius:'var(--radio)', border:'1px solid rgba(124,179,66,0.2)' }}>
                <span style={{ flex:1, fontSize:'0.88rem', color:'var(--selva-claro)' }}>📄 <strong>{fichaNombre}</strong></span>
                {fichaPath && !fichaFile && <button className="btn btn-xs btn-dorado" onClick={descargarFicha}>⬇ Descargar</button>}
                {fichaFile && <span style={{ fontSize:'0.75rem', color:'var(--texto-suave)' }}>pendiente de guardar</span>}
                <button className="btn btn-xs btn-danger" onClick={() => { setFichaFile(null); setFichaNombre(''); setFichaPath('') }}>✕</button>
              </div>
            )}
            <label className="btn btn-secondary btn-sm" style={{ cursor:'pointer', display:'inline-flex' }}>
              📎 {fichaNombre ? 'Reemplazar PDF/Word' : 'Subir PDF o Word'}
              <input type="file" accept=".pdf,.doc,.docx" onChange={e => { const f=e.target.files[0]; if(f){setFichaFile(f);setFichaNombre(f.name)} }} style={{ display:'none' }} />
            </label>
          </div>

          {/* ── Precios y Resumen ── */}
          <div className="grid-resp" style={{ gridTemplateColumns:'1fr 1fr', gap:20 }}>
            <div className="card">
              <div className="card-title">💲 Precios de Venta</div>
              <div className="form-group"><label className="form-label">Precio a distribuidor (mayor)</label><MoneyInput value={formProd.precio_mayor} onChange={v => setFormProd(f=>({...f,precio_mayor:v}))} /></div>
              <div className="form-group"><label className="form-label">Precio al público (detal)</label><MoneyInput value={formProd.precio_detal} onChange={v => setFormProd(f=>({...f,precio_detal:v}))} /></div>
              {calcResult && (
                <div style={{ fontSize:'0.82rem', color:'var(--texto-suave)', marginTop:4 }}>
                  Ganancia distribuidor (detal − mayor): <strong style={{ color:'var(--selva)' }}>{fCOP((parseFloat(formProd.precio_detal)||0) - (parseFloat(formProd.precio_mayor)||0))}</strong>
                  {(parseFloat(formProd.precio_detal)||0) > 0 && (
                    <> · margen del distribuidor: <strong style={{ color:'var(--selva)' }}>{(((parseFloat(formProd.precio_detal)||0) - (parseFloat(formProd.precio_mayor)||0)) / (parseFloat(formProd.precio_detal)||1) * 100).toFixed(1)}%</strong></>
                  )}
                </div>
              )}
              {/* Precio sugerido al CONSUMIDOR para los distribuidores (margen del distribuidor sobre el precio mayor) */}
              {calcResult && (parseFloat(formProd.precio_mayor) || 0) > 0 && (
                <div style={{ marginTop:12 }}>
                  <div style={{ display:'flex', alignItems:'center', marginBottom:6 }}>
                    <div style={{ fontWeight:600, color:'var(--selva)', fontSize:'0.85rem' }}>🛒 Precio sugerido al público <small style={{ fontWeight:400, color:'var(--texto-suave)' }}>(margen del distribuidor sobre el precio mayor = {fCOP(parseFloat(formProd.precio_mayor)||0)})</small></div>
                    {esAdmin && !editMargenes && <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft:'auto' }} onClick={abrirEditMargenes}>✏ Editar márgenes</button>}
                  </div>
                  {editMargenes ? (
                    <div style={{ background:'var(--crema)', borderRadius:'var(--radio)', padding:10, marginBottom:8 }}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                        {margenesTmp.map((m, i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:2 }}>
                            <input type="number" className="form-control" style={{ width:64, textAlign:'right' }} value={m} onChange={e => setMargenesTmp(t => t.map((x, idx) => idx === i ? e.target.value : x))} />
                            <span style={{ fontSize:'0.8rem' }}>%</span>
                            <button type="button" className="btn btn-xs btn-danger" onClick={() => setMargenesTmp(t => t.filter((_, idx) => idx !== i))}>✕</button>
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
              )}
            </div>
            <div className="costo-resumen">
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.1rem', marginBottom:14, color:'var(--dorado)' }}>Resumen de Costos</div>
              {calcResult && (<>
                <div className="row"><span>Costo MP por unidad</span><span>{fCOP(calcResult.mpUnit)}</span></div>
                <div className="row"><span>Costo empaque por unidad</span><span>{fCOP(calcResult.empUnit)}</span></div>
                <div className="row"><span>+ Mano de obra/overhead por unidad <small style={{opacity:0.6,fontSize:'0.72rem'}}>({calcResult.totalMinutos} min × {fCOP(calcResult.costoMin)}/min ÷ unidades)</small></span><span style={{color:'var(--dorado)'}}>{fCOP(calcResult.moUnit)}</span></div>
                <div className="total">
                  <div className="row"><span><strong>Costo TOTAL por unidad</strong></span><span><strong>{fCOP(calcResult.costoTotalUnit)}</strong></span></div>
                  <div className="row ganancia"><span>Ganancia mayor <small style={{opacity:0.6,fontSize:'0.72rem'}}>(precio − costo)</small></span><span>{fCOP(calcResult.utilMayor)} ({parseFloat(formProd.precio_mayor)>0?(calcResult.utilMayor/parseFloat(formProd.precio_mayor)*100).toFixed(1)+'%':'-'})</span></div>
                  <div className="row ganancia"><span>Ganancia detal</span><span>{fCOP(calcResult.utilDetal)} ({parseFloat(formProd.precio_detal)>0?(calcResult.utilDetal/parseFloat(formProd.precio_detal)*100).toFixed(1)+'%':'-'})</span></div>
                </div>
                <div style={{ marginTop:10, paddingTop:8, borderTop:'1px dashed rgba(245,240,232,0.2)', fontSize:'0.78rem', opacity:0.75 }}>
                  <div className="row"><span>Punto de equilibrio</span><span>{calcResult.pe>0?fNum(calcResult.pe)+' unid/mes':'—'}</span></div>
                  <div className="row"><span>Costo fijo por minuto</span><span>{fCOP(calcResult.costoMin)}/min</span></div>
                </div>
              </>)}
            </div>
          </div>

          {/* ── Botones ── */}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
            <button className="btn btn-secondary" onClick={limpiarForm}>Limpiar</button>
            <button className="btn btn-dorado" onClick={() => window.print()}>⬇ PDF</button>
            <button className="btn btn-primary" onClick={guardarFicha} disabled={saveProducto.isPending}>
              {saveProducto.isPending ? 'Guardando...' : editingId ? '✏ Actualizar Ficha' : '💾 Guardar Ficha'}
            </button>
          </div>

          {/* ── Histórico de cambios de costos/cantidades ── */}
          {editingId && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-title">🕑 Histórico de cambios (cantidades/costos de ingredientes)</div>
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
                            <td><button className="btn btn-xs btn-danger" title="Eliminar este registro del histórico"
                              onClick={() => confirmar('¿Eliminar este registro del histórico?').then(ok => ok && borrarHistorial(h.id))}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>}
            </div>
          )}

          {/* ── Modal: Gestionar tipos de producto (admin) ── */}
          <Modal open={tiposModal} onClose={() => setTiposModal(false)} title="⚙ Tipos de Producto"
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
                  <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Eliminar el tipo "${t.nombre}"?`).then(ok => ok && delTipo(t))}>✕ Eliminar</button>
                </div>
              ))}
          </Modal>

        </>
      )}

      {/* ===== CIF ===== */}
      {tab === 'cif' && (
        <div className="card">
          <div className="card-title">
            🏢 Costos Fijos Mensuales (CIF)
            <button className="btn btn-sm btn-secondary" style={{ marginLeft:'auto' }} onClick={addCIF}>+ Agregar ítem</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Descripción</th><th>Categoría</th><th>Frecuencia</th><th>Valor ($)</th><th></th></tr></thead>
              <tbody>
                {cifItems.map(c => {
                  const mensual = getCIFMensual(c)
                  const esProrrateo = c.frecuencia && c.frecuencia !== 'mensual'
                  return (
                    <tr key={c.id}>
                      <td><input className="form-control" defaultValue={c.descripcion} onBlur={e => updateCIF(c.id,'descripcion',e.target.value)} style={{ border:'none', background:'transparent', padding:'4px 0' }} /></td>
                      <td><input className="form-control" defaultValue={c.categoria||''} onBlur={e => updateCIF(c.id,'categoria',e.target.value)} style={{ border:'none', background:'transparent', padding:'4px 0', fontSize:'0.85rem' }} /></td>
                      <td>
                        <select className="form-control" value={c.frecuencia} onChange={e => updateCIF(c.id,'frecuencia',e.target.value)} style={{ fontSize:'0.85rem' }}>
                          <option value="mensual">Mensual</option><option value="trimestral">Trimestral</option>
                          <option value="semestral">Semestral</option><option value="anual">Anual</option>
                        </select>
                      </td>
                      <td>
                        <input type="number" className="form-control" defaultValue={c.valor} onBlur={e => updateCIF(c.id,'valor',parseFloat(e.target.value)||0)} style={{ textAlign:'right', width:140 }} />
                        {esProrrateo && <div style={{ fontSize:'0.75rem', color:'var(--tierra)', marginTop:3 }}>÷ {c.frecuencia==='anual'?12:c.frecuencia==='semestral'?6:3} = {fCOP(mensual)}/mes</div>}
                      </td>
                      <td><button className="btn btn-xs btn-danger" onClick={() => deleteCIF(c.id)}>✕</button></td>
                    </tr>
                  )
                })}
                <tr>
                  <td colSpan={5}><button className="btn btn-xs btn-secondary" onClick={addCIF}>+ Agregar ítem</button></td>
                </tr>
                <tr style={{ background:'rgba(124,179,66,0.10)' }}>
                  <td colSpan={2}><strong>🧑‍🤝‍🧑 Nómina del personal (automática)</strong><div style={{ fontSize:'0.72rem', color:'var(--texto-suave)' }}>Salarios + auxilio + prestaciones + parafiscales · según empleados activos</div></td>
                  <td style={{ fontSize:'0.72rem', color:'var(--texto-suave)' }} title="Calculado desde Empleados">automático</td>
                  <td className="td-number"><strong>{fCOP(costoNomina.total)}</strong></td>
                  <td></td>
                </tr>
                <tr style={{ background:'var(--crema)' }}>
                  <td colSpan={2}><strong>TOTAL CIF MENSUAL</strong> <small style={{ fontWeight:400, color:'var(--texto-suave)' }}>(manuales {fCOP(cifManual)} + nómina {fCOP(costoNomina.total)})</small></td>
                  <td className="td-number" colSpan={2}><strong>{fCOP(cifTotal)}</strong></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="alert alert-info" style={{ fontSize:'0.83rem', marginTop:10 }}>
            ℹ La <strong>nómina se suma automáticamente</strong> al CIF a partir de los empleados activos (igual que la "Planta de Personal" del Excel).
            <strong> No agregues los salarios como ítem manual</strong> para no duplicar. Detalle de la nómina:
            Salarios {fCOP(costoNomina.salarios)} · Auxilio {fCOP(costoNomina.auxilios)} · Prestaciones {fCOP(costoNomina.prestaciones)} · Parafiscales {fCOP(costoNomina.parafiscales)}{costoNomina.honorarios > 0 ? ` · Honorarios (CPS) ${fCOP(costoNomina.honorarios)}` : ''}.
          </div>
          {/* Desglose y simulador del costo por minuto de mano de obra */}
          <div style={{ marginTop:16, padding:16, background:'#fff8e8', border:'1px solid var(--dorado)', borderRadius:'var(--radio)' }}>
            <strong style={{ color:'var(--selva)' }}>⏱ Costo por minuto de mano de obra</strong>
            <div style={{ fontSize:'0.85rem', marginTop:8, display:'grid', gap:4 }}>
              <div>CIF total mensual: <strong>{fCOP(cifTotal)}</strong> <small style={{ color:'var(--texto-suave)' }}>(manuales {fCOP(cifManual)} + nómina {fCOP(costoNomina.total)})</small></div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span>N° de operarios de capacidad:</span>
                {(() => {
                  const empActivos = empleados.filter(e => (e.estado || 'activo') === 'activo' && !e.archivado).length
                  return (
                    <select className="form-control" style={{ width:'auto' }} value={parseInt(op.numOperarios || 0)} onChange={e => guardarNumOperarios(e.target.value)} title="Se guarda en los parámetros de operación">
                      <option value={0}>todos los activos ({empActivos})</option>
                      {Array.from({ length: empActivos }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )
                })()}
                <small style={{ color:'var(--texto-suave)' }}>· {op.dias} días · {op.jornadaHoras} h/día · improd. {((parseFloat(op.improductividad)||0)*100).toFixed(0)}%</small>
              </div>
              <div>Minutos disponibles/mes: <strong>{fNum(Math.round(minsDisponibles))}</strong> <small style={{ color:'var(--texto-suave)' }}>= {operariosActivos} × {op.dias} × {op.jornadaHoras} × 60 × (1 − {parseFloat(op.improductividad)||0})</small></div>
              <div style={{ fontSize:'1rem', marginTop:2 }}>Costo/minuto = {fCOP(cifTotal)} ÷ {fNum(Math.round(minsDisponibles))} = <strong style={{ color:'var(--dorado)' }}>{fCOP(costoMin)}/min</strong></div>
            </div>

            <div className="alert alert-info" style={{ fontSize:'0.8rem', marginTop:10 }}>
              ⚠ La <strong>nómina</strong> del CIF incluye a <strong>todos</strong> los empleados ({empleados.length}), pero los <strong>“operarios de capacidad” ({operariosActivos})</strong> deben ser solo quienes producen. Si subes operarios sin que tengan su salario cargado, el costo/minuto baja artificialmente (el cuadro de arriba mantiene el CIF fijo a propósito, para que veas solo el efecto de la capacidad).
            </div>
          </div>

          <div style={{ marginTop:16, padding:16, background:'var(--crema)', borderRadius:'var(--radio)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
              <strong style={{ color:'var(--selva)' }}>📊 Distribución CIF por línea de producto</strong>
              <div style={{ fontSize:'1.05rem', fontWeight:600, color:'var(--selva)' }}>Total: <span style={{ color:'var(--dorado)' }}>{fCOP(cifTotal)}</span></div>
            </div>
            <div className="alert alert-info" style={{ fontSize:'0.85rem', marginBottom:12 }}>
              ℹ Método <strong>Punto de Equilibrio Multiproducto</strong>: CIF distribuido proporcional a unidades/mes de cada producto.
            </div>
            {cifDist.length === 0
              ? <p style={{ color:'var(--texto-suave)', fontSize:'0.9rem' }}>Agrega fichas de costos para ver la distribución</p>
              : <div className="table-wrap">
                  <table>
                    <thead><tr><th>Producto</th><th>Unid/mes</th><th>% Participación</th><th>CIF asignado/mes</th><th>CIF por unidad</th></tr></thead>
                    <tbody>
                      {cifDist.map((i, idx) => (
                        <tr key={idx}>
                          <td><strong>{i.nombre}</strong> <span className="badge badge-gris" style={{ fontSize:'0.7rem' }}>{i.tipo||''}</span></td>
                          <td className="td-number">{fNum(i.unidsMes)}</td>
                          <td className="td-number">
                            <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end' }}>
                              <div className="progress" style={{ width:80 }}><div className="progress-bar" style={{ width:(i.pct*100).toFixed(1)+'%' }} /></div>
                              {(i.pct*100).toFixed(1)}%
                            </div>
                          </td>
                          <td className="td-number">{fCOP(i.cifAsig)}</td>
                          <td className="td-number text-dorado"><strong>{fCOP(i.cifUnit)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'var(--selva)', color:'var(--crema)' }}>
                        <td><strong>TOTAL</strong></td>
                        <td className="td-number">{fNum(cifDist.reduce((s,i)=>s+i.unidsMes,0))}</td>
                        <td className="td-number">100%</td>
                        <td className="td-number">{fCOP(cifTotal)}</td>
                        <td>—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
            }
            {productos.length === 0 && (
              <div style={{ marginTop:12, padding:10, background:'white', borderRadius:'var(--radio)', border:'1px solid var(--crema-oscuro)' }}>
                <span style={{ fontSize:'0.82rem', color:'var(--texto-suave)' }}>⚙️ Estimación inicial (aún sin fichas) — unidades/mes:</span>
                <input type="number" className="form-control" value={cifUnidadesFallback} onChange={e => setCifUnidadesFallback(Number(e.target.value))} style={{ width:110, display:'inline-block', marginLeft:8 }} />
                <span style={{ fontSize:'0.82rem', color:'var(--texto-suave)', marginLeft:8 }}>CIF/unidad: <strong style={{ color:'var(--dorado)' }}>{fCOP(cifTotal/(cifUnidadesFallback||1))}</strong></span>
                <div style={{ fontSize:'0.72rem', color:'var(--texto-suave)', marginTop:4 }}>Solo se usa mientras no haya fichas de producto. Al crear productos, el CIF se reparte automáticamente y este valor se ignora.</div>
              </div>
            )}
          </div>
        </div>
      )}

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
      <Modal open={verModal} onClose={() => setVerModal(false)} title={`Ficha — ${verProd?.nombre}`} size="modal-xl"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setVerModal(false)}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => { cargarProducto(verProd?.id); setVerModal(false) }}>✏ Editar esta ficha</button>
            <button className="btn btn-dorado" onClick={() => window.print()}>🖨 Imprimir</button>
          </>
        }
      >
        {verProd && (() => {
          const rc = recomputeProducto(verProd)
          const unidsMes = verProd.bache * verProd.baches_mes * (1 - (verProd.merma||0)/100)
          const pctCIF = totalUnidsPortafolio > 0 ? unidsMes/totalUnidsPortafolio*100 : 0
          const peq = peqMultiproducto.find(x => x.nombre === verProd.nombre)
          return (
          <>
            <div className="grid-resp" style={{ gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
              {verProd.imagen_url && <div style={{ gridColumn:'span 2' }}><img src={verProd.imagen_url} alt={verProd.nombre} style={{ height:120, objectFit:'contain', borderRadius:4 }} /></div>}
              <div><strong>Tipo:</strong> {verProd.tipo}</div>
              <div><strong>Unidades/bache:</strong> {verProd.bache}</div>
              <div><strong>Baches/mes:</strong> {verProd.baches_mes}</div>
              <div><strong>Unidades/mes:</strong> {fNum(unidsMes)}</div>
            </div>
            <table>
              <thead><tr><th>Concepto</th><th className="td-number">Valor (en vivo)</th></tr></thead>
              <tbody>
                <tr><td>Costo MP + empaque por unidad</td><td className="td-number">{fCOP(rc.cvu)}</td></tr>
                <tr><td>(+) Mano de obra/overhead por unidad <small style={{ color:'var(--texto-suave)' }}>({rc.totalMinutos} min × {fCOP(rc.costoMin)}/min)</small></td><td className="td-number text-dorado">{fCOP(rc.moUnit)}</td></tr>
                <tr style={{ fontWeight:700, borderTop:'2px solid var(--crema-oscuro)' }}><td>= COSTO TOTAL por unidad</td><td className="td-number">{fCOP(rc.costoTotalUnit)}</td></tr>
                <tr style={{ color:'var(--selva-claro)' }}><td>Precio Mayor → Ganancia/u</td><td className="td-number">{fCOP(verProd.precio_mayor)} → {fCOP(rc.utilMayor)}</td></tr>
                <tr style={{ color:'var(--selva)' }}><td>Precio Detal → Ganancia/u</td><td className="td-number">{fCOP(verProd.precio_detal)} → {fCOP(rc.utilDetal)}</td></tr>
                <tr style={{ fontSize:'0.82rem', color:'var(--texto-suave)' }}><td>Punto de equilibrio (calculado)</td><td className="td-number">{peq && peq.pe>0 ? fNum(peq.pe)+' unid/mes' : '—'}</td></tr>
              </tbody>
            </table>
          </>
          )
        })()}
      </Modal>
    </div>
  )
}

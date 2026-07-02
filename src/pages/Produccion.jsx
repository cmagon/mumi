import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile } from '../lib/supabase'
import { writeOrQueue } from '../lib/offlineQueue'
import { fFecha, fNum, fCOP, componerSurtido } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { notificar } from '../lib/notificaciones'
import { getConfig } from '../lib/appConfig'
import { setBusy } from '../lib/busy'
import { descargarPlantillaProduccion, leerPlantillaProduccion, exportarRegistrosExcelPTZ, exportarRegistrosPDFPTZ } from '../lib/plantillaProduccion'
import Modal from '../components/ui/Modal'
import TimeField from '../components/ui/TimeField'
import { useReorder } from '../hooks/useReorder'
import { AccordionItem, Fila } from '../components/ui/Acordeon'
import { puedeVerSeccion } from '../lib/permisos'
import * as XLSX from 'xlsx'
import {
  Download, Upload, Plus, Check, Pencil, Trash2, X, BarChart3, DollarSign, Link2,
  ReceiptText, Factory, ClipboardList, Shuffle, Camera, Save, Printer, Undo2, Package,
  CheckCircle2, AlertTriangle,
} from 'lucide-react'

// Icono inline alineado con el texto
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

// Fecha/hora locales
const fechaLocalISO = (d = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const horaAhora = () => new Date().toTimeString().slice(0, 5)
// Opciones rápidas de fecha de vencimiento (igual que en Órdenes)
const desdeHoyMeses = (m) => { const d = new Date(); d.setMonth(d.getMonth() + m); return fechaLocalISO(d) }
const labelMeses = (m) => m % 12 === 0 ? `${m / 12} año${m / 12 > 1 ? 's' : ''}` : `${m} mes${m > 1 ? 'es' : ''}`
const getVenceOpts = () => { try { const v = JSON.parse(localStorage.getItem('mumi_vence_opts')); return Array.isArray(v) && v.length ? v : [1, 2, 3, 6, 12, 24] } catch { return [1, 2, 3, 6, 12, 24] } }

const EMPTY = {
  tipo_registro: 'final', producto: '', fecha: new Date().toISOString().split('T')[0],
  lote: '', vence: '', empaque: 'UNIDADES', cantidad: '',
  inicio: '', fin: '', labor: 'PRODUCCION', responsable: '', obs: '',
  completado: false, conforme: true, peso_final: '', peso_desperdicio: '', lotes_origen: '',
  peso_subporcion: '', cant_subporciones: '', surtido: false, lote_mezcla: '', producto_surtido: '',
}

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const LABORES = ['PRODUCCION', 'EMPACADO', 'ROTULADO', 'PRODUCTO FINAL DIRECTO']

// Etapas FINALES (producto terminado): ROTULADO o "PRODUCTO FINAL DIRECTO" (marca el lote como
// final en un solo paso, sin pasar por las etapas). Solo estas suman a la cantidad final del lote.
const esRotulado = (labor) => /rotulado|final|directo/i.test(labor || '')
const sumarRotulado = (etapas = []) =>
  etapas.filter(e => esRotulado(e.labor)).reduce((s, e) => s + (parseFloat(e.cantidad) || 0), 0)
const sumarPeso = (etapas = [], campo) =>
  etapas.reduce((s, e) => s + (parseFloat(e[campo]) || 0), 0)

export default function Produccion() {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const esAdmin = profile?.rol === 'admin'
  // Permiso configurable (asignable por el admin en Usuarios): descargar registros y ver el
  // Análisis Mensual. El admin siempre puede; para otros roles depende de la sección 'analisis'.
  const puedeAnalisis = puedeVerSeccion(profile?.rol, 'produccion', 'analisis')
  const fileRef = useRef()
  const importRef = useRef()
  const [tab, setTab] = useState('lista')
  // Si no tiene permiso de análisis, nunca dejar la vista en esa pestaña
  useEffect(() => { if (!puedeAnalisis && tab === 'analisis') setTab('lista') }, [puedeAnalisis, tab])
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroAño, setFiltroAño] = useState(String(new Date().getFullYear()))
  const [filtroProd, setFiltroProd] = useState('')
  const [anioAnalisis, setAnioAnalisis] = useState(String(new Date().getFullYear()))
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [fotos, setFotos] = useState([])   // [{ preview, file?, url? }]
  const [verFotoModal, setVerFotoModal] = useState(false)
  const [fotoVerUrl, setFotoVerUrl] = useState('')
  const [detalleRec, setDetalleRec] = useState(null)
  const [saving, setSaving] = useState(false)
  const [importando, setImportando] = useState(false)
  const ptzRef = useRef()
  const [importResult, setImportResult] = useState(null)   // { insertados, errores }
  const [importOpen, setImportOpen] = useState(false)      // tabla de verificación previa a guardar
  const [importFilas, setImportFilas] = useState([])       // filas editables leídas del Excel
  const [importAvisos, setImportAvisos] = useState([])     // filas omitidas al leer
  const [menuDesc, setMenuDesc] = useState(false)          // desplegable "Descargar registros"
  const [ordenLink, setOrdenLink] = useState(null)   // id de orden si se llega desde "Registrar producción"
  const [subprocs, setSubprocs] = useState([])       // tiempos por proceso/subproceso (unificado con órdenes)
  const ordProc = useReorder(setSubprocs)
  const [autoSavedAt, setAutoSavedAt] = useState('')

  // Precarga al llegar desde una orden de producción
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const d = location.state?.desdeOrden
    if (d) {
      setForm({ ...EMPTY, producto: d.producto || '', tipo_registro: d.tipo_registro || 'final', cantidad: d.cantidad || '', lote: d.lote || '', vence: d.vence || '', inicio: d.inicio || '', fin: d.fin || '', ...(d.fecha ? { fecha: d.fecha } : {}) })
      setEditId(null); setDetalleRec(null); setFotos([]); setOrdenLink(d.orden_id || null)
      setModal(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: registros = [] } = useQuery({
    queryKey: ['production_records'],
    queryFn: async () => {
      const { data } = await supabase.from('production_records').select('*').order('fecha', { ascending: false })
      return data || []
    },
  })

  // Para el Análisis mensual: entradas reales a stock terminado (cajas finales empacadas).
  // Esto excluye automáticamente lo que va a SALDO y usa el nombre del producto (surtido incluido).
  const { data: finishedProds = [] } = useQuery({
    queryKey: ['finished_products_nombres'],
    queryFn: async () => { const { data } = await supabase.from('finished_products').select('id, nombre'); return data || [] },
  })
  const { data: entradasTerminado = [] } = useQuery({
    queryKey: ['finished_movements_entradas'],
    queryFn: async () => { const { data } = await supabase.from('finished_movements').select('finished_id, cantidad, fecha, tipo, origen').eq('tipo', 'entrada').eq('origen', 'produccion'); return data || [] },
  })

  // Documento vivo PTZ-RG-03 (sección Documentación): su archivo es la plantilla de descarga/lectura.
  // Si se actualiza allí, aquí se refleja automáticamente. Si no existe, se usa el archivo empaquetado.
  const { data: ptzDoc } = useQuery({
    queryKey: ['doc_ptz_rg_03'],
    queryFn: async () => {
      const { data } = await supabase.from('documentos').select('codigo, nombre, storage_url, version, eliminado_at')
        .is('eliminado_at', null).eq('codigo', 'PTZ-RG-03').order('version', { ascending: false }).limit(1).maybeSingle()
      return data || null
    },
  })
  const ptzUrl = ptzDoc?.storage_url || ''

  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').eq('estado','activo')
      return data || []
    },
  })

  const { data: productos = [] } = useQuery({
    queryKey: ['products_costing'],
    queryFn: async () => {
      const { data } = await supabase.from('products_costing').select('nombre, tipo, costo_final, costo_variable, cif_unit, porciona, peso_subporcion, peso_unidad').order('nombre')
      return data || []
    },
  })
  // Catálogo de productos terminados (para elegir el nombre del surtido — no texto libre)
  const { data: terminados = [] } = useQuery({
    queryKey: ['finished_products'],
    queryFn: async () => { const { data } = await supabase.from('finished_products').select('id, nombre, tipo, activo').eq('activo', true).order('nombre'); return data || [] },
  })
  // Órdenes (para trazabilidad de MP consumida en el detalle del registro) — solo admin
  const { data: ordenesMp = [] } = useQuery({
    queryKey: ['production_orders_mp'],
    queryFn: async () => { const { data } = await supabase.from('production_orders').select('id, lotes_mp, cantidad_plan, procesos_tiempos'); return data || [] },
  })
  // Numeración visible de órdenes (misma lógica que el módulo Órdenes)
  const { data: ordenIdsData = [] } = useQuery({
    queryKey: ['orden_ids'],
    queryFn: async () => { const { data } = await supabase.from('production_orders').select('id').order('id'); return data || [] },
  })
  const ordenStartNum = parseInt(localStorage.getItem('mumi_orden_start')) || 1
  const opNum = (id) => { const idx = ordenIdsData.findIndex(o => o.id === id); return (idx >= 0 ? idx : 0) + ordenStartNum }

  // Revertir un registro que proviene de una orden: devuelve la orden a "en proceso" para corregir desde Órdenes
  const revertirAOrden = async (r) => {
    const ok = await confirmar('Este registro proviene de una orden de producción. Se devolverá la orden a "en proceso" para corregir los datos desde Órdenes de Producción. ¿Continuar?', { title: 'Revertir a la orden', confirmText: 'Sí, revertir' })
    if (!ok) return
    await supabase.from('production_orders').update({ estado: 'en_proceso' }).eq('id', r.orden_id)
    qc.invalidateQueries({ queryKey: ['production_orders'] })
    toast('Orden devuelta a proceso — corrige los datos desde Órdenes y vuelve a Enviar y cerrar')
    navigate('/ordenes', { state: { verOrden: r.orden_id } })
  }

  // Subproductos = materias primas fabricadas internamente (Inventario MP, tipo 'interno')
  const { data: mpInternas = [] } = useQuery({
    queryKey: ['raw_materials_internas'],
    queryFn: async () => {
      const { data } = await supabase.from('raw_materials').select('nombre').eq('tipo', 'interno').order('nombre')
      return data || []
    },
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('production_records').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production_records'] }); toast('Eliminado') },
  })

  const aprobarRegistro = useMutation({
    mutationFn: async (id) => { const { error } = await supabase.from('production_records').update({ aprobado: true }).eq('id', id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production_records'] }); toast('Registro aprobado ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  // ---- Fotos múltiples ----
  const handleFile = (e) => {
    const files = [...e.target.files]; if (!files.length) return
    setFotos(prev => [...prev, ...files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))])
    e.target.value = ''   // permite volver a elegir el mismo archivo
  }
  const removeFoto = (i) => setFotos(prev => prev.filter((_, idx) => idx !== i))

  // Sube las fotos nuevas y devuelve el array final de URLs
  const subirFotos = async () => {
    const urls = []
    for (const f of fotos) {
      if (f.url) { urls.push(f.url); continue }
      const ext = f.file.name.split('.').pop()
      const url = await uploadFile('production-photos', `produccion/${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`, f.file)
      urls.push(url)
    }
    return urls
  }

  const handleSave = async (e) => {
    e?.preventDefault()
    if (!form.producto.trim() || !form.fecha) { toast('Producto y fecha son obligatorios', 'warning'); return }
    if (!form.lote.trim()) { toast('El lote es obligatorio (ej. 012026)', 'warning'); return }
    if (!navigator.onLine && fotos.some(f => f.file)) {
      toast('Sin conexión: las fotos requieren internet. Quítalas para guardar el registro offline.', 'warning'); return
    }
    setSaving(true)
    try {
      const fotosUrls = await subirFotos()
      const procs = subprocs.filter(p => p.nombre?.trim() || p.inicio || p.fin || p.fecha)
      // Inicio/fin globales = primer inicio / último fin de los subprocesos
      const _ini = procs.map(p => p.inicio).filter(Boolean).sort()
      const _fin = procs.map(p => p.fin).filter(Boolean).sort()
      const inicioG = _ini[0] || form.inicio || ''
      const finG = _fin.length ? _fin[_fin.length - 1] : (form.fin || '')
      const etapa = {
        labor: form.labor, fecha: form.fecha, cantidad: parseFloat(form.cantidad) || 0,
        peso_final: parseFloat(form.peso_final) || 0, peso_desperdicio: parseFloat(form.peso_desperdicio) || 0,
        conforme: form.conforme, lotes_origen: form.lotes_origen || '',
        inicio: inicioG, fin: finG, obs: form.obs || '',
        responsable: form.responsable || '', fotos: fotosUrls,
      }
      const estadoDe = (etapas) => etapas.some(e => e.conforme === false) ? 'no conforme' : 'conforme'

      if (editId) {
        // Editar la cabecera del lote (no acumula etapas)
        const datos = {
          tipo_registro: form.tipo_registro, producto: form.producto, fecha: form.fecha,
          lote: form.lote, vence: form.vence || null, empaque: form.empaque,
          cantidad: parseFloat(form.cantidad) || 0, inicio: inicioG || null, fin: finG || null,
          labor: form.labor, responsable: form.responsable, obs: form.obs,
          peso_final: parseFloat(form.peso_final) || 0, peso_desperdicio: parseFloat(form.peso_desperdicio) || 0,
          estado: form.conforme ? 'conforme' : 'no conforme', completado: form.completado, fotos: fotosUrls, foto_url: fotosUrls[0] || '',
          subprocesos: procs,
          peso_subporcion: form.peso_subporcion !== '' ? (parseFloat(form.peso_subporcion) || 0) : null,
          cant_subporciones: form.cant_subporciones !== '' ? (parseFloat(form.cant_subporciones) || 0) : null,
          surtido: form.surtido, lote_mezcla: form.surtido ? (form.lote_mezcla || null) : null, producto_surtido: form.surtido ? (form.producto_surtido || null) : null,
        }
        const r = await writeOrQueue({ table: 'production_records', action: 'update', payload: datos, match: { id: editId } })
        toast(r.queued ? 'Registro guardado sin conexión — se sincronizará 📴' : 'Registro actualizado ✓')
      } else {
        // ¿Existe ya un lote con ese id (mismo producto y tipo, no completado)? → acumula etapa
        const existente = registros.find(r =>
          r.lote && r.lote.trim() === form.lote.trim() &&
          r.producto === form.producto && (r.tipo_registro || 'final') === form.tipo_registro && !r.completado)
        if (existente) {
          const etapas = [...(Array.isArray(existente.etapas) ? existente.etapas : []), etapa]
          const cantidadFinal = sumarRotulado(etapas)
          const fotosAll = [...(Array.isArray(existente.fotos) ? existente.fotos : []), ...fotosUrls]
          const r = await writeOrQueue({ table: 'production_records', action: 'update', match: { id: existente.id }, payload: {
            etapas, cantidad: cantidadFinal, completado: form.completado,
            peso_final: sumarPeso(etapas, 'peso_final'), peso_desperdicio: sumarPeso(etapas, 'peso_desperdicio'),
            vence: form.vence || existente.vence, empaque: form.empaque, fecha: form.fecha,
            estado: estadoDe(etapas), fotos: fotosAll, foto_url: fotosAll[0] || existente.foto_url || '',
            orden_id: ordenLink || existente.orden_id || null,
            subprocesos: [...(Array.isArray(existente.subprocesos) ? existente.subprocesos : []), ...procs],
            peso_subporcion: form.peso_subporcion !== '' ? (parseFloat(form.peso_subporcion) || 0) : existente.peso_subporcion,
            cant_subporciones: form.cant_subporciones !== '' ? (parseFloat(form.cant_subporciones) || 0) : existente.cant_subporciones,
            surtido: form.surtido || existente.surtido, lote_mezcla: form.lote_mezcla || existente.lote_mezcla || null, producto_surtido: form.producto_surtido || existente.producto_surtido || null,
          } })
          toast(r.queued ? `Etapa guardada sin conexión — se sincronizará 📴` : `Etapa "${form.labor}" agregada al lote ${form.lote} ✓`)
        } else {
          const etapas = [etapa]
          const r = await writeOrQueue({ table: 'production_records', action: 'insert', payload: {
            tipo_registro: form.tipo_registro, producto: form.producto, fecha: form.fecha,
            lote: form.lote, vence: form.vence || null, empaque: form.empaque,
            cantidad: sumarRotulado(etapas), inicio: inicioG || null, fin: finG || null,
            labor: form.labor, responsable: form.responsable, obs: form.obs,
            peso_final: sumarPeso(etapas, 'peso_final'), peso_desperdicio: sumarPeso(etapas, 'peso_desperdicio'),
            estado: estadoDe(etapas), completado: form.completado,
            etapas, fotos: fotosUrls, foto_url: fotosUrls[0] || '',
            aprobado: !esOperario, creado_por: profile?.nombre || '',
            orden_id: ordenLink || null, subprocesos: procs,
            peso_subporcion: form.peso_subporcion !== '' ? (parseFloat(form.peso_subporcion) || 0) : null,
            cant_subporciones: form.cant_subporciones !== '' ? (parseFloat(form.cant_subporciones) || 0) : null,
            surtido: form.surtido, lote_mezcla: form.surtido ? (form.lote_mezcla || null) : null, producto_surtido: form.surtido ? (form.producto_surtido || null) : null,
          } })
          if (esOperario && !r.queued) await notificar({ destinatario: 'admin', tipo: 'registro_pendiente', mensaje: `Registro de producción pendiente de aprobación: ${form.producto} (lote ${form.lote}) por ${profile?.nombre || 'operario'}`, link: '/produccion' })
          toast(r.queued ? 'Registro guardado sin conexión — se sincronizará 📴' : (esOperario ? 'Registro creado — pendiente de aprobación del administrador' : 'Registro de lote creado ✓'))
        }
      }
      qc.invalidateQueries({ queryKey: ['production_records'] })
      setModal(false); setForm(EMPTY); setEditId(null); setFotos([]); setDetalleRec(null); setOrdenLink(null); setSubprocs([])
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Autoguardado al EDITAR un registro manual (debounce)
  useEffect(() => {
    if (!modal || !editId) return
    const t = setTimeout(async () => {
      try {
        await supabase.from('production_records').update({
          producto: form.producto, fecha: form.fecha, lote: form.lote, vence: form.vence || null, empaque: form.empaque,
          cantidad: parseFloat(form.cantidad) || 0, labor: form.labor, responsable: form.responsable, obs: form.obs,
          peso_final: parseFloat(form.peso_final) || 0, peso_desperdicio: parseFloat(form.peso_desperdicio) || 0,
          estado: form.conforme ? 'conforme' : 'no conforme', completado: form.completado,
          peso_subporcion: form.peso_subporcion !== '' ? (parseFloat(form.peso_subporcion) || 0) : null,
          cant_subporciones: form.cant_subporciones !== '' ? (parseFloat(form.cant_subporciones) || 0) : null,
          surtido: form.surtido, lote_mezcla: form.surtido ? (form.lote_mezcla || null) : null, producto_surtido: form.surtido ? (form.producto_surtido || null) : null,
          subprocesos: subprocs.filter(p => p.nombre?.trim() || p.inicio || p.fin || p.fecha),
        }).eq('id', editId)
        setAutoSavedAt(new Date().toLocaleTimeString('es-CO'))
        qc.invalidateQueries({ queryKey: ['production_records'] })
      } catch { /* silencioso */ }
    }, 1200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, subprocs, modal, editId])

  const openEdit = (r) => {
    setForm({ tipo_registro: r.tipo_registro || 'final', producto: r.producto, fecha: r.fecha, lote: r.lote || '', vence: r.vence || '', empaque: r.empaque || 'UNIDADES', cantidad: r.cantidad, inicio: r.inicio || '', fin: r.fin || '', labor: r.labor || 'PRODUCCION', responsable: r.responsable || '', obs: r.obs || '', completado: !!r.completado, conforme: r.estado !== 'no conforme', peso_final: r.peso_final || '', peso_desperdicio: r.peso_desperdicio || '', lotes_origen: '', peso_subporcion: r.peso_subporcion || '', cant_subporciones: r.cant_subporciones || '', surtido: !!r.surtido, lote_mezcla: r.lote_mezcla || '', producto_surtido: r.producto_surtido || '' })
    setDetalleRec(r)
    setEditId(r.id)
    setSubprocs(Array.isArray(r.subprocesos) ? r.subprocesos : [])
    setFotos((Array.isArray(r.fotos) && r.fotos.length ? r.fotos : (r.foto_url ? [r.foto_url] : [])).map(u => ({ url: u, preview: u })))
    setModal(true)
  }

  // ---- Importar desde Excel ----
  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setImportando(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      if (!rows.length) throw new Error('El archivo no tiene filas')
      // Mapea por nombres de columna flexibles
      const get = (row, ...keys) => { for (const k of Object.keys(row)) { if (keys.some(x => k.toLowerCase().includes(x))) return row[k] } return '' }
      const toDate = (v) => {
        if (!v) return null
        if (typeof v === 'number') { const d = XLSX.SSF ? new Date(Math.round((v - 25569) * 86400 * 1000)) : null; return d ? d.toISOString().split('T')[0] : null }
        const d = new Date(v); return isNaN(d) ? String(v) : d.toISOString().split('T')[0]
      }
      const registrosNuevos = rows.map(r => {
        const cant = parseFloat(get(r, 'cantidad')) || 0
        return {
          producto: String(get(r, 'producto') || '').trim(),
          fecha: toDate(get(r, 'fecha')) || new Date().toISOString().split('T')[0],
          lote: String(get(r, 'lote') || '').trim(),
          vence: toDate(get(r, 'venc', 'vence')) || null,
          empaque: String(get(r, 'empaque') || 'UNIDADES').trim() || 'UNIDADES',
          cantidad: cant,
          responsable: String(get(r, 'responsable') || '').trim(),
          labor: String(get(r, 'labor', 'proceso') || 'PRODUCCION').trim() || 'PRODUCCION',
          obs: String(get(r, 'obs', 'observ') || '').trim(),
          tipo_registro: /sub/i.test(String(get(r, 'tipo'))) ? 'subproducto' : 'final',
          completado: true,
          estado: cant > 0 ? 'conforme' : 'no conforme',
          etapas: [], fotos: [],
        }
      }).filter(r => r.producto)
      if (!registrosNuevos.length) throw new Error('No se encontraron filas con "producto"')
      const { error } = await supabase.from('production_records').insert(registrosNuevos)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['production_records'] })
      toast(`${registrosNuevos.length} registros importados ✓`)
    } catch (err) {
      toast('Error al importar: ' + err.message, 'error')
    } finally {
      setImportando(false)
      if (importRef.current) importRef.current.value = ''
    }
  }

  // ===== Importar registros de producción diaria desde la plantilla PTZ-RG-03 (con verificación) =====
  const descargarPlantilla = async () => {
    try { await descargarPlantillaProduccion(ptzUrl) }
    catch (e) { toast('No se pudo descargar la plantilla: ' + (e.message || e), 'error') }
  }
  const normNombre = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
  // Paso 1: leer el Excel y abrir la tabla de verificación (NO inserta todavía)
  const importarPTZ = async (file) => {
    if (!file) return
    setImportando(true); setBusy(true)
    try {
      const { filas, errores } = await leerPlantillaProduccion(file)
      if (!filas.length) { setImportResult({ insertados: 0, errores: errores.length ? errores : ['No se encontraron filas con datos válidos.'] }); return }
      const editable = filas.map(f => {
        const nf = normNombre(f.producto)
        const match = terminados.find(t => normNombre(t.nombre) === nf)
          || terminados.find(t => nf && (normNombre(t.nombre).includes(nf) || nf.includes(normNombre(t.nombre))))
        return { ...f, prodId: match ? String(match.id) : '', producto: match ? match.nombre : f.producto }
      })
      setImportFilas(editable); setImportAvisos(errores); setImportOpen(true)
    } catch (e) {
      setImportResult({ insertados: 0, errores: ['Error al leer el archivo: ' + (e.message || e)] })
      toast('Error al leer el archivo', 'error')
    } finally { setImportando(false); setBusy(false); if (ptzRef.current) ptzRef.current.value = '' }
  }
  const updateImportFila = (i, campo, val) => setImportFilas(fs => fs.map((f, idx) => {
    if (idx !== i) return f
    if (campo === 'prodId') { const t = terminados.find(x => String(x.id) === String(val)); return { ...f, prodId: val, producto: t ? t.nombre : f.producto } }
    return { ...f, [campo]: val }
  }))
  const quitarImportFila = (i) => setImportFilas(fs => fs.filter((_, idx) => idx !== i))
  // Paso 2: confirmar → insertar los registros ya verificados
  const confirmarImportacion = async () => {
    const validas = importFilas.filter(f => String(f.producto || '').trim() && f.fecha)
    if (!validas.length) { toast('No hay filas válidas (falta producto o fecha)', 'warning'); return }
    setImportando(true); setBusy(true)
    try {
      const payload = validas.map(f => {
        const uni = parseFloat(f.unidades) || 0, caj = parseFloat(f.cajas) || 0
        const usaCajas = caj > 0
        const cantidad = usaCajas ? caj : uni
        const notaExtra = usaCajas && uni > 0 ? ` · Unidades: ${uni}` : ''
        return {
          producto: String(f.producto).trim(), fecha: f.fecha, lote: f.lote || '', vence: f.vence || null,
          empaque: usaCajas ? 'CAJAS' : 'UNIDADES', cantidad,
          inicio: f.inicio || null, fin: f.fin || null,
          labor: (f.labor || 'PRODUCCION').trim(), responsable: (f.responsable || '').trim(),
          obs: (f.obs || '') + notaExtra + ' · [Importado PTZ-RG-03]',
          estado: 'conforme', completado: true, aprobado: true, tipo_registro: 'final', orden_id: null,
        }
      })
      let insertados = 0
      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200)
        const { error } = await supabase.from('production_records').insert(chunk)
        if (error) throw error
        insertados += chunk.length
      }
      qc.invalidateQueries({ queryKey: ['production_records'] })
      setImportOpen(false); setImportFilas([])
      setImportResult({ insertados, errores: importAvisos })
      toast(`Importados ${insertados} registro(s) ✓`)
    } catch (e) {
      setImportResult({ insertados: 0, errores: ['Error al importar: ' + (e.message || e)] })
      toast('Error al importar', 'error')
    } finally { setImportando(false); setBusy(false) }
  }

  // ===== Descargar registros en el formato original PTZ-RG-03 (Excel o PDF) =====
  const descargarExcelPTZ = async () => {
    setMenuDesc(false); setBusy(true)
    try { await exportarRegistrosExcelPTZ(filtrados, { templateUrl: ptzUrl }) }
    catch (e) { toast('No se pudo generar el Excel: ' + (e.message || e), 'error') }
    finally { setBusy(false) }
  }
  const descargarPdfPTZ = () => {
    setMenuDesc(false)
    const cfg = getConfig()
    try { exportarRegistrosPDFPTZ(filtrados, { empresa: cfg.empresa, logoUrl: cfg.logo_url }) }
    catch (e) { toast(e.message || 'No se pudo generar el PDF', 'error') }
  }

  // Filtros
  const filtrados = [...registros].filter(p => {
    try {
      const d = new Date(p.fecha)
      if (filtroMes && d.getMonth() + 1 !== parseInt(filtroMes)) return false
      if (filtroAño && d.getFullYear() !== parseInt(filtroAño)) return false
      if (filtroProd && p.producto !== filtroProd) return false
      return true
    } catch { return false }
  })

  const aprobados = registros.filter(r => r.aprobado !== false)
  const prodNames = [...new Set(registros.map(r => r.producto))].sort()
  // Años realmente presentes en los registros (+ el año actual), para no ofrecer años vacíos
  const aniosRegistros = [...new Set([String(new Date().getFullYear()), ...registros.map(r => String(r.fecha || '').slice(0, 4)).filter(Boolean)])].sort((a, b) => b.localeCompare(a))
  // Año/mes tomados del texto 'YYYY-MM-DD' para evitar el desfase de zona horaria
  const anioDe = (f) => String(f || '').slice(0, 4)
  const mesDe = (f) => (parseInt(String(f || '').slice(5, 7), 10) || 0) - 1   // 0-11

  // ===== Análisis mensual: CANTIDAD EMPACADA FINAL =====
  // Fuente = entradas a stock terminado (cajas finales empacadas, surtido con su nombre; lo que va a
  // saldo NO entra aquí) + producción de subproductos (MP fabricadas internamente, que no son producto
  // terminado y por eso no generan entrada de terminado).
  const nombreFP = Object.fromEntries(finishedProds.map(p => [p.id, p.nombre]))
  // Registros IMPORTADOS (PTZ-RG-03): no generan finished_movements (para no afectar el stock),
  // así que se cuentan directo desde production_records para que sí aparezcan en el análisis.
  const esImportado = (r) => /\[Importado PTZ-RG-03\]/.test(r.obs || '')
  const entradasAnalisis = [
    ...entradasTerminado.map(m => ({ nombre: nombreFP[m.finished_id] || '(producto terminado)', fecha: m.fecha, cant: Number(m.cantidad) || 0 })),
    ...aprobados.filter(r => r.tipo_registro === 'subproducto').map(r => ({ nombre: r.producto, fecha: r.fecha, cant: Number(r.cantidad) || 0 })),
    ...aprobados.filter(r => (r.tipo_registro || 'final') !== 'subproducto' && esImportado(r)).map(r => ({ nombre: r.producto, fecha: r.fecha, cant: Number(r.cantidad) || 0 })),
  ].filter(e => e.nombre)
  const aniosDisponibles = [...new Set(entradasAnalisis.map(e => anioDe(e.fecha)).filter(Boolean))].sort((a, b) => b.localeCompare(a))
  const entradasAnio = entradasAnalisis.filter(e => anioDe(e.fecha) === anioAnalisis)
  const analisis = [...new Set(entradasAnio.map(e => e.nombre))].sort().map(pr => {
    const meses = Array.from({ length: 12 }, (_, m) =>
      entradasAnio.filter(e => e.nombre === pr && mesDe(e.fecha) === m).reduce((s, e) => s + e.cant, 0)
    )
    return { nombre: pr, meses, total: meses.reduce((s, v) => s + v, 0) }
  })
  // Totales por mes (fila de cierre) y total general del año
  const totalesMes = Array.from({ length: 12 }, (_, m) => analisis.reduce((s, row) => s + (row.meses[m] || 0), 0))
  const totalAnio = totalesMes.reduce((s, v) => s + v, 0)
  // Si el año elegido para el análisis no tiene datos pero hay otros años (p. ej. registros
  // importados de años anteriores), selecciona automáticamente el año más reciente con datos.
  useEffect(() => {
    if (aniosDisponibles.length && !aniosDisponibles.includes(anioAnalisis)) setAnioAnalisis(aniosDisponibles[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aniosDisponibles.join('|')])

  const exportarExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Producto','Fecha','Lote','F.Vencimiento','Empaque','Cantidad','Responsable','H.Inicio','H.Final','Labor','Estado','Observaciones'],
      ...filtrados.map(p => [p.producto,p.fecha,p.lote,p.vence,p.empaque,p.cantidad,p.responsable,p.inicio,p.fin,p.labor,p.estado||'conforme',p.obs])
    ])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Produccion')
    XLSX.writeFile(wb, 'RegistroProduccion_MumiAmazonia.xlsx'); toast('Excel exportado ✓')
  }

  // Lotes que se pueden combinar en el rotulado: lotes en etapa de producción o empacado
  const esOperario = profile?.rol !== 'admin'
  const lotesCombinables = [...new Set(registros
    .filter(r => /produccion|empacado/i.test(r.labor || '') ||
      (Array.isArray(r.etapas) ? r.etapas : []).some(e => /produccion|empacado/i.test(e.labor || '')))
    .map(r => r.lote).filter(l => l && l !== form.lote))]

  // Producto de un lote (para autocompletar el nombre del surtido según el lote combinado)
  const productoDeLote = (lote) => {
    const k = String(lote || '').trim().split(/[,;]/)[0].trim()
    if (!k) return ''
    const r = registros.find(x => String(x.lote || '').trim() === k)
    return r?.producto || ''
  }
  // Autocompleta el nombre del producto surtido cuando hay surtido + lote de mezcla
  const autoSurtido = (productoBase, loteMezcla) => {
    const otro = productoDeLote(loteMezcla)
    return otro ? componerSurtido(productoBase, otro) : ''
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Registro de Producción</h1>
        <div className="page-actions">
          {puedeAnalisis && <div style={{ position: 'relative', display: 'inline-block' }} onMouseLeave={() => setMenuDesc(false)}>
            <button className="btn btn-secondary btn-sm" onClick={() => setMenuDesc(v => !v)}><Ico as={Download} size={14} />Descargar registros ▾</button>
            {menuDesc && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, background: 'var(--blanco, #fff)', border: '1px solid var(--crema-oscuro)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 210, overflow: 'hidden' }}>
                <button className="btn btn-menu" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer' }} onClick={descargarExcelPTZ}>📊 Excel — formato PTZ-RG-03</button>
                <button className="btn btn-menu" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderTop: '1px solid var(--crema-oscuro)', cursor: 'pointer' }} onClick={descargarPdfPTZ}>📄 PDF — formato PTZ-RG-03</button>
              </div>
            )}
          </div>}
          {!esOperario && <button className="btn btn-secondary btn-sm" onClick={descargarPlantilla}><Ico as={Download} size={14} />Plantilla PTZ-RG-03</button>}
          {!esOperario && (
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {importando ? 'Importando...' : <><ClipboardList size={14} aria-hidden="true" /> Importar registros (PTZ-RG-03)</>}
              <input type="file" accept=".xlsx,.xls" ref={ptzRef} onChange={e => { const f = e.target.files?.[0]; importarPTZ(f) }} style={{ display: 'none' }} disabled={importando} />
            </label>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => { setForm(EMPTY); setEditId(null); setDetalleRec(null); setFotos([]); setOrdenLink(null); setSubprocs([]); setModal(true) }}><Ico as={Plus} size={14} />Nuevo Registro</button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'lista' ? 'active' : ''}`} onClick={() => setTab('lista')}>Registros</button>
        {puedeAnalisis && <button className={`tab-btn ${tab === 'analisis' ? 'active' : ''}`} onClick={() => setTab('analisis')}>Análisis Mensual</button>}
      </div>

      {tab === 'lista' && (
        <div className="card">
          {filtrados.some(p => !p.completado) && (
            <div className="alert alert-warning" style={{ fontSize: '0.85rem' }}>
              ⚠ Hay <strong>{filtrados.filter(p => !p.completado).length}</strong> lote(s) <strong>sin completar</strong>.
              Sus cantidades aún no son definitivas; agrega las etapas restantes y marca "Lote completado".
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="form-control" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Todos los meses</option>
              {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select className="form-control" value={filtroAño} onChange={e => setFiltroAño(e.target.value)} style={{ width: 'auto' }}>
              {aniosRegistros.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="form-control" value={filtroProd} onChange={e => setFiltroProd(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Todos los productos</option>
              {prodNames.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {/* ===== Versión móvil: acordeón ===== */}
          <div className="solo-movil">
            {filtrados.length === 0
              ? <p className="empty-table">Sin registros</p>
              : filtrados.map(p => (
                <AccordionItem key={p.id}
                  titulo={<>{p.producto} {p.completado ? <span className="badge badge-verde" style={{ fontSize: '0.6rem' }}>Completado</span> : <span className="badge badge-dorado" style={{ fontSize: '0.6rem' }}>En proceso</span>}</>}
                  sub={<>Lote {p.lote || '—'} · {fNum(p.cantidad)} {p.empaque || ''}</>}
                >
                  <Fila et="Tipo">{p.tipo_registro === 'subproducto' ? 'Subproducto' : 'Producto final'}</Fila>
                  <Fila et="Lote">{p.lote || '—'}</Fila>
                  <Fila et="Etapas">{Array.isArray(p.etapas) ? p.etapas.length : 0}</Fila>
                  <Fila et="Fecha">{fFecha(p.fecha)}</Fila>
                  <Fila et="Empaque">{p.empaque || '—'}</Fila>
                  <Fila et="Cant. final">{fNum(p.cantidad)}</Fila>
                  <Fila et="Estado">{p.estado || 'conforme'}{p.aprobado === false ? ' · Pendiente aprob.' : ''}</Fila>
                  <div className="acordeon-acciones">
                    {!esOperario && p.aprobado === false && <button className="btn btn-xs btn-success" onClick={() => aprobarRegistro.mutate(p.id)}><Ico as={Check} size={13} />Aprobar</button>}
                    <button className="btn btn-xs btn-secondary" onClick={() => setDetalleRec(p)}><Ico as={ReceiptText} size={13} />Detalles</button>
                    {p.orden_id
                      ? <button className="btn btn-xs btn-secondary" onClick={() => revertirAOrden(p)}><Ico as={Undo2} size={13} />Revertir a la orden</button>
                      : <button className="btn btn-xs btn-secondary" onClick={() => openEdit(p)}><Ico as={Pencil} size={13} />Editar</button>}
                    {!esOperario && <button className="btn btn-xs btn-danger" onClick={() => confirmar('¿Eliminar este registro?').then(ok => ok && remove.mutate(p.id))}><Ico as={X} size={13} />Eliminar</button>}
                  </div>
                </AccordionItem>
              ))}
          </div>

          {/* ===== Versión desktop: tabla ===== */}
          <div className="table-wrap solo-desktop">
            <table>
              <thead><tr><th>Producto</th><th className="col-opcional">Tipo</th><th>Lote</th><th className="col-opcional">Etapas</th><th className="col-opcional-2">Fecha</th><th className="col-opcional">Empaque</th><th>Cant. final</th><th className="col-opcional-2">Avance</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {filtrados.length === 0
                  ? <tr><td colSpan={10} className="empty-table">Sin registros</td></tr>
                  : filtrados.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.producto}</strong>{p.surtido && (() => {
                        const rankLote = (l) => { const m = String(l || '').match(/^(\d+)(\d{2})$/); return m ? (parseInt(m[2]) * 100000 + parseInt(m[1])) : (parseInt(l) || 0) }
                        const lotes = [...new Set([p.lote, ...String(p.lote_mezcla || '').split(/[,;+]/)].map(l => String(l || '').trim()).filter(Boolean))].sort((a, b) => rankLote(a) - rankLote(b))
                        return lotes.length > 0 ? <div style={{ fontSize: '0.72rem', color: 'var(--tierra)', display: 'flex', alignItems: 'center', gap: 3 }}><Shuffle size={11} aria-hidden="true" /> {lotes.join(' + ')}</div> : null
                      })()}</td>
                      <td className="col-opcional"><span className={`badge ${p.tipo_registro === 'subproducto' ? 'badge-dorado' : 'badge-azul'}`}>{p.tipo_registro === 'subproducto' ? 'Subprod.' : 'Final'}</span></td>
                      <td><strong>{p.lote || '—'}</strong></td>
                      <td className="td-number col-opcional">{Array.isArray(p.etapas) ? p.etapas.length : 0}</td>
                      <td className="col-opcional-2">{fFecha(p.fecha)}</td>
                      <td className="col-opcional">{p.empaque || '—'}</td>
                      <td className="td-number"><strong>{fNum(p.cantidad)}</strong></td>
                      <td className="col-opcional-2">{p.completado ? <span className="badge badge-verde">Completado</span> : <span className="badge badge-dorado">En proceso</span>}</td>
                      <td>
                        <span className={`badge ${p.estado === 'no conforme' ? 'badge-rojo' : 'badge-verde'}`}>{p.estado || 'conforme'}</span>
                        {p.aprobado === false && <div><span className="badge badge-dorado" style={{ fontSize: '0.62rem' }}>Pendiente aprob.</span></div>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {!esOperario && p.aprobado === false && <button className="btn btn-xs btn-success" onClick={() => aprobarRegistro.mutate(p.id)} title="Aprobar"><Check size={13} aria-hidden="true" /></button>}
                          <button className="btn btn-xs btn-secondary" onClick={() => setDetalleRec(p)} title="Ver detalles"><ReceiptText size={13} aria-hidden="true" /></button>
                          {p.orden_id
                            ? <button className="btn btn-xs btn-secondary" title="Revertir a la orden para corregir" onClick={() => revertirAOrden(p)}><Undo2 size={13} aria-hidden="true" /></button>
                            : <button className="btn btn-xs btn-secondary" onClick={() => openEdit(p)} title="Editar"><Pencil size={13} aria-hidden="true" /></button>}
                          {!esOperario && <button className="btn btn-xs btn-danger" onClick={() => confirmar('¿Eliminar?').then(ok => ok && remove.mutate(p.id))} title="Eliminar"><X size={13} aria-hidden="true" /></button>}
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'analisis' && puedeAnalisis && (
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><BarChart3 size={16} aria-hidden="true" /> Resumen de Producción por Mes
            <select className="form-control" style={{ width: 120, marginLeft: 'auto' }} value={anioAnalisis} onChange={e => setAnioAnalisis(e.target.value)}>
              {(aniosDisponibles.length ? aniosDisponibles : [anioAnalisis]).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* ===== Versión móvil: acordeón (un producto por tarjeta, meses con producción) ===== */}
          <div className="solo-movil">
            {analisis.length === 0
              ? <p className="empty-table">Sin datos</p>
              : analisis.map(row => (
                <AccordionItem key={row.nombre} titulo={row.nombre} sub={`Total: ${row.total}`}>
                  {row.meses.every(v => !v)
                    ? <p style={{ color: 'var(--texto-suave)', fontSize: '0.85rem' }}>Sin producción registrada</p>
                    : row.meses.map((v, i) => v > 0 && <Fila key={i} et={MESES[i + 1]}>{v}</Fila>)}
                  <Fila et="Total año">{row.total}</Fila>
                </AccordionItem>
              ))}
          </div>

          {/* ===== Versión desktop: tabla ===== */}
          <div className="table-wrap solo-desktop">
            <table>
              <thead><tr><th>Producto</th>{MESES.slice(1).map(m => <th key={m}>{m}</th>)}<th>Total</th></tr></thead>
              <tbody>
                {analisis.length === 0
                  ? <tr><td colSpan={14} className="empty-table">Sin producción aprobada en {anioAnalisis}</td></tr>
                  : analisis.map(row => (
                  <tr key={row.nombre}>
                    <td><strong>{row.nombre}</strong></td>
                    {row.meses.map((v, i) => <td key={i} className="td-number">{v > 0 ? fNum(v) : '—'}</td>)}
                    <td className="td-number"><strong>{fNum(row.total)}</strong></td>
                  </tr>
                ))}
                {analisis.length > 0 && (
                  <tr style={{ background: 'rgba(45,90,61,0.06)', fontWeight: 700 }}>
                    <td><strong>Total mes</strong></td>
                    {totalesMes.map((v, i) => <td key={i} className="td-number">{v > 0 ? fNum(v) : '—'}</td>)}
                    <td className="td-number"><strong>{fNum(totalAnio)}</strong></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal registro */}
      <Modal open={modal} onClose={() => { setModal(false); setForm(EMPTY); setEditId(null); setFotos([]); setDetalleRec(null); setOrdenLink(null); setSubprocs([]) }}
        title={`🏭 ${editId ? 'Editar' : 'Nuevo'} Registro de Producción`} size="modal-lg"
        footer={
          <>
            {editId && autoSavedAt && <span style={{ fontSize: '0.72rem', color: 'var(--selva)', marginRight: 'auto' }}>✓ autoguardado {autoSavedAt}</span>}
            <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Registro'}
            </button>
          </>
        }
      >
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Tipo de registro</label>
            <select className="form-control" value={form.tipo_registro} onChange={e => setForm(f => ({ ...f, tipo_registro: e.target.value }))}>
              <option value="final">Producto final</option>
              <option value="subproducto">Subproducto</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Producto <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>({form.tipo_registro === 'subproducto' ? 'MP fabricadas internamente' : 'de Fichas de Costos'})</small></label>
            <select className="form-control" value={form.producto} onChange={e => setForm(f => ({ ...f, producto: e.target.value }))}>
              <option value="">Seleccionar {form.tipo_registro === 'subproducto' ? 'subproducto' : 'producto'}...</option>
              {form.tipo_registro === 'subproducto'
                ? mpInternas.map(m => <option key={m.nombre} value={m.nombre}>{m.nombre}</option>)
                : productos.filter(p => p.tipo !== 'subproducto').map(p => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}
            </select>
            {form.tipo_registro === 'subproducto' && mpInternas.length === 0 && (
              <small style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>No hay materias primas "fabricadas internamente" en Inventario MP.</small>
            )}
          </div>
        </div>
        {!editId && (
          <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
            El <strong>lote</strong> identifica la producción. Si ingresas un lote que ya existe (sin completar), esta entrada se
            agrega como <strong>etapa</strong>. Solo las cantidades de <strong>ROTULADO</strong> (producto terminado) suman a la cantidad final. Marca <strong>"Lote completado"</strong> cuando termines.
            {form.tipo_registro === 'final' && <> Formato sugerido para producto final: <strong>012026, 022026…</strong></>}
          </div>
        )}
        <div style={{ background: 'rgba(45,90,61,0.10)', borderLeft: '3px solid var(--selva)', padding: '6px 10px', borderRadius: 4, fontWeight: 700, fontSize: '0.88rem', color: 'var(--selva)', margin: '14px 0 8px' }}><Ico as={ClipboardList} size={14} />Identificación del lote</div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Lote</label><input className="form-control" value={form.lote} onChange={e => setForm(f => ({ ...f, lote: e.target.value }))} placeholder={form.tipo_registro === 'final' ? 'Ej: 012026' : 'Lote de subproducto'} /></div>
          <div className="form-group"><label className="form-label">Fecha</label><input type="date" className="form-control" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Labor / Proceso de esta etapa</label>
            <select className="form-control" value={form.labor} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, labor: v, completado: /final|directo/i.test(v) ? true : f.completado })) }}>
              {LABORES.map(l => <option key={l}>{l}</option>)}
            </select>
            {/final|directo/i.test(form.labor)
              ? <small style={{ color: 'var(--lima)', fontSize: '0.75rem' }}>Marca el lote como producto final completo en un solo paso.</small>
              : esRotulado(form.labor) && <small style={{ color: 'var(--lima)', fontSize: '0.75rem' }}>Etapa final — su cantidad suma al total del lote.</small>}
          </div>
          <div className="form-group"><label className="form-label">Cantidad {esRotulado(form.labor) ? '(producto terminado)' : '(esta etapa)'}</label><input type="number" className="form-control" value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} min={0} /></div>
        </div>
        <div style={{ background: 'rgba(45,90,61,0.10)', borderLeft: '3px solid var(--selva)', padding: '6px 10px', borderRadius: 4, fontWeight: 700, fontSize: '0.88rem', color: 'var(--selva)', margin: '14px 0 8px' }}><Ico as={Package} size={14} />Resultado de producción</div>
        {/* Conformidad y pesos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: form.conforme ? 'rgba(124,179,66,0.08)' : 'rgba(192,57,43,0.08)', borderRadius: 'var(--radio)', border: `1px solid ${form.conforme ? 'rgba(124,179,66,0.2)' : 'rgba(192,57,43,0.25)'}`, marginBottom: 12 }}>
          <input type="checkbox" id="cb-conforme" checked={form.conforme} onChange={e => setForm(f => ({ ...f, conforme: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="cb-conforme" style={{ cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: form.conforme ? 'var(--selva)' : 'var(--rojo)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {form.conforme ? <><CheckCircle2 size={15} aria-hidden="true" /> Producción conforme</> : <><AlertTriangle size={15} aria-hidden="true" /> No conforme (registra los pesos obtenidos)</>}
          </label>
        </div>
        <div className="form-grid-3">
          <div className="form-group"><label className="form-label">Peso final (g/Kg)</label><input type="number" className="form-control" value={form.peso_final} onChange={e => setForm(f => ({ ...f, peso_final: e.target.value }))} min={0} placeholder="Peso conforme obtenido" /></div>
          <div className="form-group"><label className="form-label">Peso desperdicio</label><input type="number" className="form-control" value={form.peso_desperdicio} onChange={e => setForm(f => ({ ...f, peso_desperdicio: e.target.value }))} min={0} placeholder="Dañado / quemado / caído" /></div>
          <div className="form-group">
            <label className="form-label">Empaque</label>
            <select className="form-control" value={form.empaque} onChange={e => setForm(f => ({ ...f, empaque: e.target.value }))}>
              <option>UNIDADES</option><option>CAJAS</option><option>BOLSAS</option><option>KILOS</option>
            </select>
          </div>
        </div>
        {/* Subporciones (si el producto se porciona) */}
        {(() => {
          const prodSel = productos.find(p => p.nombre === form.producto)
          if (!prodSel?.porciona) return null
          return (
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Peso subporción (g)</label><input type="number" className="form-control" value={form.peso_subporcion} onChange={e => setForm(f => ({ ...f, peso_subporcion: e.target.value }))} min={0} placeholder={prodSel.peso_subporcion || ''} /></div>
              <div className="form-group"><label className="form-label">Cantidad subporciones</label><input type="number" className="form-control" value={form.cant_subporciones} onChange={e => {
                const v = e.target.value
                const pu = parseFloat(prodSel.peso_unidad) || 0, psub = parseFloat(form.peso_subporcion) || parseFloat(prodSel.peso_subporcion) || 0
                setForm(f => ({ ...f, cant_subporciones: v, ...(pu > 0 && psub > 0 && v !== '' ? { cantidad: String(Math.round((parseFloat(v) || 0) * psub / pu)) } : {}) }))
              }} min={0} /></div>
            </div>
          )
        })()}
        {/* Empaque surtido / mezclado con otro lote */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', margin: '4px 0 8px' }}>
          <input type="checkbox" checked={form.surtido} onChange={e => setForm(f => ({ ...f, surtido: e.target.checked }))} /> <Shuffle size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> Empacado surtido / mezclado con otro lote
        </label>
        {form.surtido && (
          <>
            <div className="form-group">
              <label className="form-label">¿Con qué lote(s) se mezcló?</label>
              <input className="form-control" list="dl-lotes-mezcla" value={form.lote_mezcla}
                onChange={e => { const v = e.target.value; setForm(f => ({ ...f, lote_mezcla: v, producto_surtido: autoSurtido(f.producto, v) || f.producto_surtido })) }}
                placeholder="Elige o escribe (ej: 160626)" />
              <datalist id="dl-lotes-mezcla">{lotesCombinables.map(l => <option key={l} value={l} />)}</datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Producto surtido resultante <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(elige del catálogo de Producto Terminado; se sugiere según el lote)</small></label>
              <select className="form-control" value={form.producto_surtido} onChange={e => setForm(f => ({ ...f, producto_surtido: e.target.value }))}>
                <option value="">Seleccionar producto terminado...</option>
                {terminados.map(t => <option key={t.id} value={t.nombre}>{t.tipo === 'surtido' ? '🔀 ' : ''}{t.nombre}</option>)}
                {form.producto_surtido && !terminados.some(t => t.nombre === form.producto_surtido) && <option value={form.producto_surtido}>⚠ {form.producto_surtido} (sin registrar)</option>}
              </select>
              {form.producto_surtido && !terminados.some(t => t.nombre === form.producto_surtido) && (
                <small style={{ color: 'var(--rojo)', fontSize: '0.72rem' }}>⚠ "{form.producto_surtido}" no existe en el catálogo. Créalo en <strong>Producto Terminado</strong>.</small>
              )}
            </div>
          </>
        )}
        {/* Lotes combinados (solo rotulado: ej. surtido de varios sabores) */}
        {esRotulado(form.labor) && (
          <div className="form-group">
            <label className="form-label">Lotes que se combinan en el rotulado <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(opcional — elige de la lista o escribe; ej. surtido de varios sabores)</small></label>
            <input className="form-control" list="dl-lotes-comb" value={form.lotes_origen} onChange={e => setForm(f => ({ ...f, lotes_origen: e.target.value }))} placeholder="Ej: 012026, 022026" />
            <datalist id="dl-lotes-comb">{lotesCombinables.map(l => <option key={l} value={l} />)}</datalist>
          </div>
        )}
        <div style={{ background: 'rgba(45,90,61,0.10)', borderLeft: '3px solid var(--selva)', padding: '6px 10px', borderRadius: 4, fontWeight: 700, fontSize: '0.88rem', color: 'var(--selva)', margin: '14px 0 8px' }}>📅 Vencimiento</div>
        <div className="form-group">
          <label className="form-label">Fecha de vencimiento</label>
          <input type="date" className="form-control" style={{ maxWidth: 220 }} value={form.vence} onChange={e => setForm(f => ({ ...f, vence: e.target.value }))} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {getVenceOpts().map(m => <button key={m} type="button" className="btn btn-xs btn-secondary" onClick={() => setForm(f => ({ ...f, vence: desdeHoyMeses(m) }))}>+{labelMeses(m)}</button>)}
          </div>
        </div>
        <div style={{ background: 'rgba(45,90,61,0.10)', borderLeft: '3px solid var(--selva)', padding: '6px 10px', borderRadius: 4, fontWeight: 700, fontSize: '0.88rem', color: 'var(--selva)', margin: '14px 0 8px' }}>⏱ Tiempos por proceso / subproceso</div>
        <div style={{ background: 'rgba(0,0,0,0.02)', padding: 10, borderRadius: 'var(--radio)', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button type="button" className="btn btn-xs btn-secondary" onClick={() => setSubprocs(p => [...p, { nombre: '', fecha: '', inicio: '', fin: '' }])}>+ Proceso</button>
          </div>
          {subprocs.length === 0 && <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>Opcional: registra los procesos/subprocesos con su fecha y horas.</div>}
          {subprocs.map((p, i) => {
            const upd = (k, v) => setSubprocs(arr => arr.map((x, idx) => idx === i ? { ...x, [k]: v } : x))
            return (
              <div key={i} className={ordProc.rowClassName(i)} {...ordProc.rowProps(i)} style={{ display: 'grid', gridTemplateColumns: 'auto 1.3fr 1.2fr 1.1fr 1.1fr auto', gap: 8, alignItems: 'end', marginBottom: 8, borderBottom: '1px dashed var(--crema-oscuro)', paddingBottom: 8 }}>
                <span {...ordProc.handleProps(i)} style={{ ...ordProc.handleProps(i).style, alignSelf: 'center' }}>⠿</span>
                <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Proceso/subproceso</label><input className="form-control" value={p.nombre} onChange={e => upd('nombre', e.target.value)} placeholder="Ej: Mezclado, Horneo..." /></div>
                <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Fecha</label><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="date" className="form-control" value={p.fecha || ''} onChange={e => upd('fecha', e.target.value)} /><button type="button" className="btn btn-xs btn-secondary" title="Hoy" onClick={() => upd('fecha', fechaLocalISO())}>Hoy</button></div></div>
                <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Inicio</label><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><TimeField value={p.inicio} onChange={v => upd('inicio', v)} /><button type="button" className="btn btn-xs btn-secondary" title="Ahora" onClick={() => upd('inicio', horaAhora())}>⏱</button></div></div>
                <div><label style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>Fin</label><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><TimeField value={p.fin} onChange={v => upd('fin', v)} /><button type="button" className="btn btn-xs btn-secondary" title="Ahora" onClick={() => upd('fin', horaAhora())}>⏱</button></div></div>
                <button type="button" className="btn btn-xs btn-danger" onClick={() => setSubprocs(arr => arr.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            )
          })}
        </div>
        <div style={{ background: 'rgba(45,90,61,0.10)', borderLeft: '3px solid var(--selva)', padding: '6px 10px', borderRadius: 4, fontWeight: 700, fontSize: '0.88rem', color: 'var(--selva)', margin: '14px 0 8px' }}>👤 Responsable y evidencia</div>
        <div className="form-group">
          <label className="form-label">Responsable</label>
          <select className="form-control" value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {empleados
              .filter(e => !(esOperario && /administrador/i.test(e.nombre)))
              .map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Observaciones</label><textarea className="form-control" rows={2} value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} /></div>

        {/* Registro fotográfico múltiple */}
        <div className="form-group">
          <label className="form-label">Registro fotográfico</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {fotos.map((f, i) => (
              <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
                <img src={f.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />
                <button type="button" onClick={() => removeFoto(i)} title="Eliminar foto"
                  style={{ position: 'absolute', top: -6, right: -6, background: 'var(--rojo)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1 }}>✕</button>
              </div>
            ))}
            <div className="foto-upload" onClick={() => fileRef.current?.click()} style={{ width: 80, height: 80, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <input type="file" accept="image/*" multiple ref={fileRef} onChange={handleFile} style={{ display: 'none' }} />
              <div style={{ fontSize: '1.5rem' }}>📸</div>
              <div style={{ color: 'var(--texto-suave)', fontSize: '0.62rem' }}>Agregar</div>
            </div>
          </div>
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>Puedes agregar varias fotos, eliminarlas y volver a cargar.</small>
        </div>

        {/* Marcar lote completado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(124,179,66,0.08)', borderRadius: 'var(--radio)', border: '1px solid rgba(124,179,66,0.2)' }}>
          <input type="checkbox" id="cb-completado" checked={form.completado} onChange={e => setForm(f => ({ ...f, completado: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="cb-completado" style={{ cursor: 'pointer', fontSize: '0.9rem', color: 'var(--selva)', fontWeight: 600 }}>
            ✅ Lote completado (la cantidad final ya es definitiva)
          </label>
        </div>
      </Modal>

      {/* Modal ver foto */}
      {/* Verificación de registros importados (editar + relacionar producto antes de guardar) */}
      <Modal open={importOpen} onClose={() => { setImportOpen(false); setImportFilas([]) }} title="🔎 Verificar registros a importar (PTZ-RG-03)" size="modal-xl"
        footer={<>
          <button className="btn btn-secondary" onClick={() => { setImportOpen(false); setImportFilas([]) }}>Cancelar</button>
          <button className="btn btn-primary" disabled={importando} onClick={confirmarImportacion}>
            <Ico as={Save} size={14} />{importando ? 'Guardando…' : `Guardar ${importFilas.filter(f => String(f.producto || '').trim() && f.fecha).length} registro(s)`}
          </button>
        </>}
      >
        <div className="alert alert-info" style={{ fontSize: '0.83rem' }}>
          Revisa y corrige los datos. <strong>Relaciona cada fila con un producto del catálogo</strong> (se emparejó automáticamente por nombre; las filas sin producto se marcan en rojo). Se guardan como registros de producción diaria aprobados, sin afectar el stock.
        </div>
        {importAvisos.length > 0 && (
          <details style={{ marginBottom: 8 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--tierra)', fontSize: '0.82rem' }}>{importAvisos.length} fila(s) omitida(s) al leer</summary>
            <ul style={{ fontSize: '0.8rem', color: 'var(--texto-suave)', paddingLeft: 18 }}>{importAvisos.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </details>
        )}
        <div className="table-wrap" style={{ maxHeight: '55vh', overflow: 'auto' }}>
          <table style={{ fontSize: '0.8rem' }}>
            <thead><tr>
              <th>Fecha</th><th>Producto del catálogo</th><th>Lote</th><th>Vence</th>
              <th className="td-number">Unid.</th><th className="td-number">Cajas</th>
              <th>Inicio</th><th>Fin</th><th>Responsable</th><th>Obs.</th><th></th>
            </tr></thead>
            <tbody>
              {importFilas.length === 0
                ? <tr><td colSpan={11} className="empty-table">Sin filas</td></tr>
                : importFilas.map((f, i) => {
                  const sinProd = !String(f.producto || '').trim()
                  const sinMatch = !f.prodId
                  return (
                    <tr key={i} style={sinProd ? { background: 'rgba(192,57,43,0.08)' } : undefined}>
                      <td><input type="date" className="form-control" style={{ minWidth: 130, padding: '3px 5px' }} value={f.fecha || ''} onChange={e => updateImportFila(i, 'fecha', e.target.value)} /></td>
                      <td>
                        <select className="form-control" style={{ minWidth: 180, padding: '3px 5px', borderColor: sinMatch ? 'var(--rojo)' : undefined }} value={f.prodId} onChange={e => updateImportFila(i, 'prodId', e.target.value)}>
                          <option value="">— {f.producto ? `sin vincular: "${f.producto}"` : 'elige producto'} —</option>
                          {terminados.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                      </td>
                      <td><input className="form-control" style={{ minWidth: 90, padding: '3px 5px' }} value={f.lote || ''} onChange={e => updateImportFila(i, 'lote', e.target.value)} /></td>
                      <td><input type="date" className="form-control" style={{ minWidth: 130, padding: '3px 5px' }} value={f.vence || ''} onChange={e => updateImportFila(i, 'vence', e.target.value)} /></td>
                      <td><input type="number" className="form-control td-number" style={{ width: 66, padding: '3px 5px' }} value={f.unidades ?? ''} onChange={e => updateImportFila(i, 'unidades', e.target.value)} /></td>
                      <td><input type="number" className="form-control td-number" style={{ width: 62, padding: '3px 5px' }} value={f.cajas ?? ''} onChange={e => updateImportFila(i, 'cajas', e.target.value)} /></td>
                      <td><input className="form-control" style={{ width: 64, padding: '3px 5px' }} value={f.inicio || ''} onChange={e => updateImportFila(i, 'inicio', e.target.value)} placeholder="HH:MM" /></td>
                      <td><input className="form-control" style={{ width: 64, padding: '3px 5px' }} value={f.fin || ''} onChange={e => updateImportFila(i, 'fin', e.target.value)} placeholder="HH:MM" /></td>
                      <td><input className="form-control" style={{ minWidth: 110, padding: '3px 5px' }} value={f.responsable || ''} onChange={e => updateImportFila(i, 'responsable', e.target.value)} /></td>
                      <td><input className="form-control" style={{ minWidth: 130, padding: '3px 5px' }} value={f.obs || ''} onChange={e => updateImportFila(i, 'obs', e.target.value)} /></td>
                      <td><button className="btn btn-xs btn-danger" title="Quitar fila" onClick={() => quitarImportFila(i)}><X size={12} aria-hidden="true" /></button></td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Resultado de la importación */}
      <Modal open={!!importResult} onClose={() => setImportResult(null)} title="📥 Importación de registros (PTZ-RG-03)"
        footer={<button className="btn btn-primary" onClick={() => setImportResult(null)}>Cerrar</button>}
      >
        {importResult && (
          <>
            <div className={`alert ${importResult.insertados > 0 ? 'alert-success' : 'alert-info'}`} style={{ fontSize: '0.9rem' }}>
              {importResult.insertados > 0
                ? <><strong>{importResult.insertados}</strong> registro(s) importado(s) como producción diaria (aprobados, sin afectar el stock).</>
                : 'No se importaron registros.'}
            </div>
            {importResult.errores?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, color: 'var(--tierra)', marginBottom: 6 }}>Filas omitidas / avisos ({importResult.errores.length}):</div>
                <ul style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', maxHeight: 220, overflow: 'auto', paddingLeft: 18 }}>
                  {importResult.errores.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal open={verFotoModal} onClose={() => setVerFotoModal(false)} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Camera size={18} aria-hidden="true" /> Foto registro</span>} size="modal-lg">
        <div style={{ textAlign: 'center' }}>
          <img src={fotoVerUrl} alt="registro" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 4, objectFit: 'contain' }} />
        </div>
      </Modal>

      {/* Modal detalles del lote (etapas) */}
      <Modal open={!!detalleRec && !modal} onClose={() => setDetalleRec(null)} title={`🧾 Lote ${detalleRec?.lote || ''} — ${detalleRec?.producto || ''}`} size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={() => setDetalleRec(null)}>Cerrar</button>}
      >
        {detalleRec && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16, fontSize: '0.88rem' }} className="grid-resp">
              <div><strong>Tipo:</strong> {detalleRec.tipo_registro === 'subproducto' ? 'Subproducto' : 'Producto final'}</div>
              <div><strong>Estado:</strong> {detalleRec.completado ? <span className="badge badge-verde">Completado</span> : <span className="badge badge-dorado">En proceso</span>} {detalleRec.estado === 'no conforme' && <span className="badge badge-rojo">No conforme</span>}</div>
              <div><strong>Cantidad final:</strong> {fNum(detalleRec.cantidad || 0)} {detalleRec.empaque}</div>
              <div><strong>Peso final:</strong> {fNum(detalleRec.peso_final || 0)}</div>
              <div><strong>Peso desperdicio:</strong> {fNum(detalleRec.peso_desperdicio || 0)}</div>
              {detalleRec.cant_subporciones != null && <div><strong>Subporciones:</strong> {fNum(detalleRec.cant_subporciones || 0)} {detalleRec.peso_subporcion ? `(${fNum(detalleRec.peso_subporcion)} g c/u)` : ''}</div>}
              {detalleRec.orden_id && <div><strong>Origen:</strong> <button type="button" className="btn-link-emp" onClick={() => navigate('/ordenes', { state: { verOrden: detalleRec.orden_id } })} title="Ver detalles de la orden">📋 Orden de producción OP-{opNum(detalleRec.orden_id)}</button></div>}
              {detalleRec.aprobado === false && <div><strong>Aprobación:</strong> <span className="badge badge-dorado">Pendiente</span></div>}
            </div>
            {/* Costos del lote (solo admin) */}
            {esAdmin && (() => {
              const prod = productos.find(p => p.nombre === detalleRec.producto)
              const cant = parseFloat(detalleRec.cantidad) || 0
              if (!prod) return null
              const cvu = parseFloat(prod.costo_variable) || 0           // MP + empaque por unidad
              const total = parseFloat(prod.costo_final) || 0            // costo total por unidad (con overhead)
              const overhead = Math.max(0, total - cvu)                  // CIF / mano de obra por unidad
              const ord = detalleRec.orden_id ? ordenesMp.find(o => String(o.id) === String(detalleRec.orden_id)) : null
              // Costo real por unidad: el costo del lote (según ficha × unidades planificadas) repartido entre las unidades realmente obtenidas
              const planificadas = parseFloat(ord?.cantidad_plan) || 0
              const costoLote = total * (planificadas > 0 ? planificadas : cant)
              const costoUnitReal = cant > 0 ? costoLote / cant : total
              const desv = total > 0 ? (costoUnitReal - total) / total * 100 : 0
              const alerta = Math.abs(desv) <= 5
                ? { txt: '✅ Alineado con la ficha', badge: 'badge-verde' }
                : desv > 5
                  ? { txt: `⚠ Más costoso de lo esperado (+${desv.toFixed(1)}%)`, badge: 'badge-rojo' }
                  : { txt: `Más barato de lo esperado (${desv.toFixed(1)}%)`, badge: 'badge-dorado' }
              return (
                <>
                  <div className="card-title" style={{ fontSize: '0.95rem' }}><Ico as={DollarSign} size={15} />Costos del lote (solo admin)</div>
                  <div className="table-wrap" style={{ marginBottom: 8 }}>
                    <table>
                      <thead><tr><th>Concepto</th><th className="td-number">Por unidad</th><th className="td-number">Total lote ({fNum(cant)} u)</th></tr></thead>
                      <tbody>
                        <tr><td>MP + empaque</td><td className="td-number">{fCOP(cvu)}</td><td className="td-number">{fCOP(cvu * cant)}</td></tr>
                        <tr><td>Mano de obra / CIF</td><td className="td-number">{fCOP(overhead)}</td><td className="td-number">{fCOP(overhead * cant)}</td></tr>
                        <tr style={{ fontWeight: 700, background: 'rgba(124,179,66,0.08)' }}><td>Costo total (ficha)</td><td className="td-number">{fCOP(total)}</td><td className="td-number">{fCOP(total * cant)}</td></tr>
                        <tr style={{ fontWeight: 700, background: 'rgba(200,169,74,0.10)' }}><td>Costo REAL (producción)</td><td className="td-number">{fCOP(costoUnitReal)}</td><td className="td-number">{fCOP(costoLote)}</td></tr>
                        {planificadas > 0 && <tr><td>Planificadas → obtenidas</td><td className="td-number" colSpan={2}>{fNum(planificadas)} → {fNum(cant)}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginBottom: 12 }}><span className={`badge ${alerta.badge}`}>{alerta.txt}</span>{' '}<small style={{ color: 'var(--texto-suave)' }}>vs costo de la ficha {fCOP(total)}/u</small></div>
                  {ord && Array.isArray(ord.lotes_mp) && ord.lotes_mp.length > 0 && (
                    <>
                      <div className="card-title" style={{ fontSize: '0.95rem' }}><Ico as={Link2} size={15} />Materias primas consumidas (lotes)</div>
                      <div className="table-wrap" style={{ marginBottom: 12 }}>
                        <table>
                          <thead><tr><th>Materia prima</th><th className="td-number">Consumo</th><th>Lotes (PEPS)</th></tr></thead>
                          <tbody>
                            {ord.lotes_mp.map((t, i) => (
                              <tr key={i}><td>{t.nombre}</td><td className="td-number">{fNum(t.consumo)} {t.unidad}</td><td style={{ fontSize: '0.8rem' }}>{(t.lotes || []).map(l => `${l.lote || 's/lote'}: ${fNum(l.cantidad)}`).join(' · ') || '—'}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )
            })()}
            {/* Resumen de etapas/procesos por fecha (subprocesos del registro o de la orden vinculada) */}
            {(() => {
              const ordVinc = detalleRec.orden_id ? ordenesMp.find(o => String(o.id) === String(detalleRec.orden_id)) : null
              const subs = (Array.isArray(detalleRec.subprocesos) && detalleRec.subprocesos.length)
                ? detalleRec.subprocesos
                : (Array.isArray(ordVinc?.procesos_tiempos) ? ordVinc.procesos_tiempos : [])
              if (!subs.length) return null
              const grupos = {}
              subs.forEach(s => { const f = s.fecha || '—'; (grupos[f] ||= []).push(s) })
              const fechas = Object.keys(grupos).sort()
              return (
                <>
                  <div className="card-title" style={{ fontSize: '0.95rem' }}><Ico as={ReceiptText} size={15} />Etapas (resumen por fecha)</div>
                  <div className="table-wrap" style={{ marginBottom: 16 }}>
                    <table>
                      <thead><tr><th>Fecha</th><th>Procesos / etapas</th></tr></thead>
                      <tbody>
                        {fechas.map(f => <tr key={f}><td>{f === '—' ? '—' : fFecha(f)}</td><td style={{ fontSize: '0.85rem' }}>{grupos[f].map(s => s.nombre).filter(Boolean).join(', ') || '—'}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            })()}
            {Array.isArray(detalleRec.etapas) && detalleRec.etapas.length > 0 && (
              <div className="card-title" style={{ fontSize: '0.95rem' }}>Etapas ({detalleRec.etapas.length})</div>
            )}
            {Array.isArray(detalleRec.etapas) && detalleRec.etapas.length > 0 && (() => {
              const grupos = {}
              detalleRec.etapas.forEach(et => { const f = et.fecha || '—'; (grupos[f] ||= []).push(et) })
              const fechas = Object.keys(grupos).sort()
              if (fechas.length <= 1) return null   // si todo es la misma fecha, no hace falta el resumen
              return (
                <div className="table-wrap" style={{ marginBottom: 10 }}>
                  <table>
                    <thead><tr><th>Fecha</th><th>Mano de obra aplicada</th><th className="td-number">Cantidad</th></tr></thead>
                    <tbody>
                      {fechas.map(f => {
                        const arr = grupos[f]
                        const labores = [...new Set(arr.map(e => e.labor).filter(Boolean))].join(', ')
                        const cantTotal = arr.reduce((s, e) => s + (parseFloat(e.cantidad) || 0), 0)
                        return <tr key={f}><td>{f === '—' ? '—' : fFecha(f)}</td><td style={{ fontSize: '0.85rem' }}>{labores || '—'}</td><td className="td-number">{fNum(cantTotal)}</td></tr>
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}
            {(!detalleRec.etapas || detalleRec.etapas.length === 0)
              ? ((!Array.isArray(detalleRec.subprocesos) || detalleRec.subprocesos.length === 0) && !(detalleRec.orden_id && ordenesMp.find(o => String(o.id) === String(detalleRec.orden_id))?.procesos_tiempos?.length) && <p className="empty-table">Sin procesos registrados</p>)
              : (detalleRec.etapas || []).map((et, i) => (
                <div key={i} style={{ border: `1px solid ${et.conforme === false ? 'rgba(192,57,43,0.3)' : 'var(--crema-oscuro)'}`, borderRadius: 'var(--radio)', padding: 12, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <strong style={{ color: 'var(--selva)' }}>{et.labor} {et.conforme === false && <span className="badge badge-rojo" style={{ fontSize: '0.6rem' }}>No conforme</span>}</strong>
                    <span style={{ color: 'var(--texto-suave)', fontSize: '0.85rem' }}>{fFecha(et.fecha)}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                    Cantidad: <strong>{fNum(et.cantidad || 0)}</strong>
                    {esRotulado(et.labor) ? <span className="badge badge-verde" style={{ marginLeft: 6, fontSize: '0.62rem' }}>suma al total</span> : <span className="badge badge-gris" style={{ marginLeft: 6, fontSize: '0.62rem' }}>intermedia</span>}
                    {(et.inicio || et.fin) && <span style={{ marginLeft: 10, color: 'var(--texto-suave)' }}>{et.inicio || '—'} a {et.fin || '—'}</span>}
                    {et.responsable && <span style={{ marginLeft: 10, color: 'var(--texto-suave)' }}>· {et.responsable}</span>}
                  </div>
                  {(et.peso_final || et.peso_desperdicio) ? <div style={{ fontSize: '0.82rem', marginTop: 4 }}>Peso final: <strong>{fNum(et.peso_final || 0)}</strong> · Desperdicio: <strong>{fNum(et.peso_desperdicio || 0)}</strong></div> : null}
                  {et.lotes_origen && <div style={{ fontSize: '0.82rem', color: 'var(--tierra)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 3 }}><Shuffle size={12} aria-hidden="true" /> Combina lotes: {et.lotes_origen}</div>}
                  {et.obs && <div style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', marginTop: 4 }}>{et.obs}</div>}
                  {Array.isArray(et.fotos) && et.fotos.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {et.fotos.map((u, k) => <img key={k} src={u} alt="" onClick={() => { setFotoVerUrl(u); setVerFotoModal(true) }} style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }} />)}
                    </div>
                  )}
                </div>
              ))}
          </>
        )}
      </Modal>
    </div>
  )
}

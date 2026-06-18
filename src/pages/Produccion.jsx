import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile } from '../lib/supabase'
import { writeOrQueue } from '../lib/offlineQueue'
import { fFecha, fNum, fCOP } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { notificar } from '../lib/notificaciones'
import Modal from '../components/ui/Modal'
import TimeField from '../components/ui/TimeField'
import { useReorder } from '../hooks/useReorder'
import { AccordionItem, Fila } from '../components/ui/Acordeon'
import * as XLSX from 'xlsx'

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
  peso_subporcion: '', cant_subporciones: '', surtido: false, lote_mezcla: '',
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
  const fileRef = useRef()
  const importRef = useRef()
  const [tab, setTab] = useState('lista')
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroAño, setFiltroAño] = useState(String(new Date().getFullYear()))
  const [filtroProd, setFiltroProd] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [fotos, setFotos] = useState([])   // [{ preview, file?, url? }]
  const [verFotoModal, setVerFotoModal] = useState(false)
  const [fotoVerUrl, setFotoVerUrl] = useState('')
  const [detalleRec, setDetalleRec] = useState(null)
  const [saving, setSaving] = useState(false)
  const [importando, setImportando] = useState(false)
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
          surtido: form.surtido, lote_mezcla: form.surtido ? (form.lote_mezcla || null) : null,
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
            surtido: form.surtido || existente.surtido, lote_mezcla: form.lote_mezcla || existente.lote_mezcla || null,
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
            surtido: form.surtido, lote_mezcla: form.surtido ? (form.lote_mezcla || null) : null,
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
          surtido: form.surtido, lote_mezcla: form.surtido ? (form.lote_mezcla || null) : null,
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
    setForm({ tipo_registro: r.tipo_registro || 'final', producto: r.producto, fecha: r.fecha, lote: r.lote || '', vence: r.vence || '', empaque: r.empaque || 'UNIDADES', cantidad: r.cantidad, inicio: r.inicio || '', fin: r.fin || '', labor: r.labor || 'PRODUCCION', responsable: r.responsable || '', obs: r.obs || '', completado: !!r.completado, conforme: r.estado !== 'no conforme', peso_final: r.peso_final || '', peso_desperdicio: r.peso_desperdicio || '', lotes_origen: '', peso_subporcion: r.peso_subporcion || '', cant_subporciones: r.cant_subporciones || '', surtido: !!r.surtido, lote_mezcla: r.lote_mezcla || '' })
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

  // Análisis por producto/mes — SOLO registros aprobados (no alimenta hasta que el admin aprueba)
  const aprobados = registros.filter(r => r.aprobado !== false)
  const prodNames = [...new Set(registros.map(r => r.producto))].sort()
  const analisis = [...new Set(aprobados.map(r => r.producto))].sort().map(pr => {
    const meses = Array.from({ length: 12 }, (_, m) =>
      aprobados.filter(r => r.producto === pr && new Date(r.fecha).getMonth() === m).reduce((s, r) => s + (r.cantidad || 0), 0)
    )
    return { nombre: pr, meses, total: meses.reduce((s, v) => s + v, 0) }
  })

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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Registro de Producción</h1>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={exportarExcel}>⬇ Excel</button>
          {!esOperario && (
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
              {importando ? 'Importando...' : '⬆ Importar Excel'}
              <input type="file" accept=".xlsx,.xls,.csv" ref={importRef} onChange={handleImport} style={{ display: 'none' }} disabled={importando} />
            </label>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>⬇ PDF</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setForm(EMPTY); setEditId(null); setDetalleRec(null); setFotos([]); setOrdenLink(null); setSubprocs([]); setModal(true) }}>+ Nuevo Registro</button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'lista' ? 'active' : ''}`} onClick={() => setTab('lista')}>Registros</button>
        <button className={`tab-btn ${tab === 'analisis' ? 'active' : ''}`} onClick={() => setTab('analisis')}>Análisis Mensual</button>
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
              <option value="2025">2025</option>
              <option value="2026">2026</option>
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
                    {!esOperario && p.aprobado === false && <button className="btn btn-xs btn-success" onClick={() => aprobarRegistro.mutate(p.id)}>✓ Aprobar</button>}
                    <button className="btn btn-xs btn-secondary" onClick={() => setDetalleRec(p)}>🧾 Detalles</button>
                    {p.orden_id
                      ? <button className="btn btn-xs btn-secondary" onClick={() => revertirAOrden(p)}>↩ Revertir a la orden</button>
                      : <button className="btn btn-xs btn-secondary" onClick={() => openEdit(p)}>✏ Editar</button>}
                    {!esOperario && <button className="btn btn-xs btn-danger" onClick={() => confirmar('¿Eliminar este registro?').then(ok => ok && remove.mutate(p.id))}>✕ Eliminar</button>}
                  </div>
                </AccordionItem>
              ))}
          </div>

          {/* ===== Versión desktop: tabla ===== */}
          <div className="table-wrap solo-desktop">
            <table>
              <thead><tr><th>Producto</th><th>Tipo</th><th>Lote</th><th>Etapas</th><th>Fecha</th><th>Empaque</th><th>Cant. final</th><th>Avance</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {filtrados.length === 0
                  ? <tr><td colSpan={10} className="empty-table">Sin registros</td></tr>
                  : filtrados.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.producto}</strong></td>
                      <td><span className={`badge ${p.tipo_registro === 'subproducto' ? 'badge-dorado' : 'badge-azul'}`}>{p.tipo_registro === 'subproducto' ? 'Subprod.' : 'Final'}</span></td>
                      <td><strong>{p.lote || '—'}</strong></td>
                      <td className="td-number">{Array.isArray(p.etapas) ? p.etapas.length : 0}</td>
                      <td>{fFecha(p.fecha)}</td>
                      <td>{p.empaque || '—'}</td>
                      <td className="td-number"><strong>{fNum(p.cantidad)}</strong></td>
                      <td>{p.completado ? <span className="badge badge-verde">Completado</span> : <span className="badge badge-dorado">En proceso</span>}</td>
                      <td>
                        <span className={`badge ${p.estado === 'no conforme' ? 'badge-rojo' : 'badge-verde'}`}>{p.estado || 'conforme'}</span>
                        {p.aprobado === false && <div><span className="badge badge-dorado" style={{ fontSize: '0.62rem' }}>Pendiente aprob.</span></div>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {!esOperario && p.aprobado === false && <button className="btn btn-xs btn-success" onClick={() => aprobarRegistro.mutate(p.id)} title="Aprobar">✓</button>}
                          <button className="btn btn-xs btn-secondary" onClick={() => setDetalleRec(p)} title="Ver detalles">🧾</button>
                          {p.orden_id
                            ? <button className="btn btn-xs btn-secondary" title="Revertir a la orden para corregir" onClick={() => revertirAOrden(p)}>↩</button>
                            : <button className="btn btn-xs btn-secondary" onClick={() => openEdit(p)}>✏</button>}
                          {!esOperario && <button className="btn btn-xs btn-danger" onClick={() => confirmar('¿Eliminar?').then(ok => ok && remove.mutate(p.id))}>✕</button>}
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

      {tab === 'analisis' && (
        <div className="card">
          <div className="card-title">📊 Resumen de Producción por Mes</div>

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
                {analisis.map(row => (
                  <tr key={row.nombre}>
                    <td><strong>{row.nombre}</strong></td>
                    {row.meses.map((v, i) => <td key={i} className="td-number">{v > 0 ? v : '—'}</td>)}
                    <td className="td-number"><strong>{row.total}</strong></td>
                  </tr>
                ))}
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
        <div style={{ background: 'rgba(45,90,61,0.10)', borderLeft: '3px solid var(--selva)', padding: '6px 10px', borderRadius: 4, fontWeight: 700, fontSize: '0.88rem', color: 'var(--selva)', margin: '14px 0 8px' }}>🏷️ Identificación del lote</div>
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
        <div style={{ background: 'rgba(45,90,61,0.10)', borderLeft: '3px solid var(--selva)', padding: '6px 10px', borderRadius: 4, fontWeight: 700, fontSize: '0.88rem', color: 'var(--selva)', margin: '14px 0 8px' }}>📦 Resultado de producción</div>
        {/* Conformidad y pesos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: form.conforme ? 'rgba(124,179,66,0.08)' : 'rgba(192,57,43,0.08)', borderRadius: 'var(--radio)', border: `1px solid ${form.conforme ? 'rgba(124,179,66,0.2)' : 'rgba(192,57,43,0.25)'}`, marginBottom: 12 }}>
          <input type="checkbox" id="cb-conforme" checked={form.conforme} onChange={e => setForm(f => ({ ...f, conforme: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="cb-conforme" style={{ cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: form.conforme ? 'var(--selva)' : 'var(--rojo)' }}>
            {form.conforme ? '✅ Producción conforme' : '⚠ No conforme (registra los pesos obtenidos)'}
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
          <input type="checkbox" checked={form.surtido} onChange={e => setForm(f => ({ ...f, surtido: e.target.checked }))} /> 📦 Empacado surtido / mezclado con otro lote
        </label>
        {form.surtido && (
          <div className="form-group">
            <label className="form-label">¿Con qué lote(s) se mezcló?</label>
            <input className="form-control" list="dl-lotes-mezcla" value={form.lote_mezcla} onChange={e => setForm(f => ({ ...f, lote_mezcla: e.target.value }))} placeholder="Elige o escribe (ej: 160626)" />
            <datalist id="dl-lotes-mezcla">{lotesCombinables.map(l => <option key={l} value={l} />)}</datalist>
          </div>
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
      <Modal open={verFotoModal} onClose={() => setVerFotoModal(false)} title="📷 Foto registro" size="modal-lg">
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
                  <div className="card-title" style={{ fontSize: '0.95rem' }}>💰 Costos del lote (solo admin)</div>
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
                      <div className="card-title" style={{ fontSize: '0.95rem' }}>🔗 Materias primas consumidas (lotes)</div>
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
                  <div className="card-title" style={{ fontSize: '0.95rem' }}>🧾 Etapas (resumen por fecha)</div>
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
                  {et.lotes_origen && <div style={{ fontSize: '0.82rem', color: 'var(--tierra)', marginTop: 4 }}>🔀 Combina lotes: {et.lotes_origen}</div>}
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

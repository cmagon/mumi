import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile } from '../lib/supabase'
import { fFecha } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'
import { Bell, Download, Link2, NotebookText, Pencil, X } from 'lucide-react'
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

const BUCKET = 'documentos'
const TIPOS_CAMPO = { text: 'Texto', number: 'Número', date: 'Fecha', hora: 'Hora', select: 'Lista', textarea: 'Texto largo', checkbox: 'Sí/No' }
const slug = (s) => (s || '').toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const hoy = () => new Date().toISOString().split('T')[0]
const addDias = (fechaStr, dias) => { const d = new Date(fechaStr + 'T00:00:00'); d.setDate(d.getDate() + (parseInt(dias) || 0)); return d.toISOString().split('T')[0] }

const EMPTY_PLANTILLA = { codigo: '', nombre: '', programa: '', descripcion: '', campos: [], periodica: false, dias_periodo: 30, genera_alerta: false, dias_aviso: 7, activo: true }

// Plantillas base recurrentes del SGC (se siembran con el botón "Cargar plantillas base")
const PLANTILLAS_BASE = [
  { codigo: 'PTZ-RG-02', nombre: 'Control de Temperaturas y Humedad', programa: '15. Trazabilidad', periodica: true, dias_periodo: 1, genera_alerta: true, dias_aviso: 1,
    campos: [{ key: 'area', label: 'Área/Equipo', tipo: 'text', requerido: true }, { key: 'temperatura', label: 'Temperatura (°C)', tipo: 'number', requerido: true }, { key: 'humedad', label: 'Humedad (%)', tipo: 'number' }, { key: 'hora', label: 'Hora', tipo: 'hora' }] },
  { codigo: 'CAP-RG-01', nombre: 'Control de Cloro y pH', programa: '03. Control de Agua Potable', periodica: true, dias_periodo: 1, genera_alerta: true, dias_aviso: 1,
    campos: [{ key: 'punto', label: 'Punto de muestreo', tipo: 'text', requerido: true }, { key: 'cloro_ppm', label: 'Cloro libre (ppm)', tipo: 'number', requerido: true }, { key: 'ph', label: 'pH', tipo: 'number', requerido: true }, { key: 'hora', label: 'Hora', tipo: 'hora' }] },
  { codigo: 'L&D-RG-01', nombre: 'Registro de Actividades de Limpieza', programa: '02. Limpieza y Desinfección', periodica: true, dias_periodo: 1, genera_alerta: true, dias_aviso: 1,
    campos: [{ key: 'area', label: 'Área/Superficie', tipo: 'text', requerido: true }, { key: 'actividad', label: 'Actividad', tipo: 'text' }, { key: 'producto', label: 'Producto usado', tipo: 'text' }, { key: 'conforme', label: 'Conforme', tipo: 'checkbox' }] },
  { codigo: 'CDP-RG-03', nombre: 'Registro de Fumigación', programa: '05. Control de Plagas', periodica: true, dias_periodo: 30, genera_alerta: true, dias_aviso: 7,
    campos: [{ key: 'area', label: 'Área tratada', tipo: 'text', requerido: true }, { key: 'producto', label: 'Producto aplicado', tipo: 'text', requerido: true }, { key: 'empresa', label: 'Empresa/Responsable', tipo: 'text' }] },
  { codigo: 'MYC-RG-03', nombre: 'Mantenimiento y Calibración', programa: '12. Mantenimiento y Calibración', periodica: true, dias_periodo: 90, genera_alerta: true, dias_aviso: 15,
    campos: [{ key: 'equipo', label: 'Equipo', tipo: 'text', requerido: true }, { key: 'tipo_act', label: 'Tipo', tipo: 'select', opciones: ['Mantenimiento', 'Calibración'], requerido: true }, { key: 'resultado', label: 'Resultado', tipo: 'text' }] },
  { codigo: 'HPL-RG-03', nombre: 'Inspección de Personal', programa: '07. Higiene Personal', periodica: true, dias_periodo: 1, genera_alerta: false, dias_aviso: 1,
    campos: [{ key: 'empleado', label: 'Empleado', tipo: 'text', requerido: true }, { key: 'uniforme', label: 'Uniforme completo', tipo: 'checkbox' }, { key: 'manos', label: 'Manos/uñas OK', tipo: 'checkbox' }, { key: 'observaciones', label: 'Observaciones', tipo: 'textarea' }] },
  { codigo: 'PTZ-OR-01', nombre: 'Orden de Producción', programa: '15. Trazabilidad', periodica: false, dias_periodo: 0, genera_alerta: false, dias_aviso: 7,
    campos: [{ key: 'producto', label: 'Producto', tipo: 'text', requerido: true }, { key: 'cantidad', label: 'Cantidad', tipo: 'number' }, { key: 'unidad', label: 'Unidad', tipo: 'text' }, { key: 'operario', label: 'Operario', tipo: 'text' }, { key: 'lote', label: 'Lote', tipo: 'text' }] },
  { codigo: 'PTZ-RG-03', nombre: 'Control Producción Diaria', programa: '15. Trazabilidad', periodica: false, dias_periodo: 0, genera_alerta: false, dias_aviso: 7,
    campos: [{ key: 'producto', label: 'Producto', tipo: 'text', requerido: true }, { key: 'lote', label: 'Lote', tipo: 'text' }, { key: 'cantidad', label: 'Unidades', tipo: 'number' }, { key: 'peso_final', label: 'Peso final', tipo: 'number' }, { key: 'peso_desperdicio', label: 'Desperdicio', tipo: 'number' }] },
]

export default function Registros() {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const esAdmin = profile?.rol === 'admin'
  const navigate = useNavigate()

  const [sel, setSel] = useState(null)            // plantilla seleccionada (libro abierto)
  const [buscar, setBuscar] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  // entrada
  const [entradaModal, setEntradaModal] = useState(false)
  const [entradaForm, setEntradaForm] = useState({ fecha: hoy(), datos: {}, observaciones: '', responsable: '' })
  const [entradaFile, setEntradaFile] = useState(null)
  const [saving, setSaving] = useState(false)
  // plantilla (admin)
  const [plantillaModal, setPlantillaModal] = useState(false)
  const [plantillaForm, setPlantillaForm] = useState(EMPTY_PLANTILLA)
  const [plantillaEditId, setPlantillaEditId] = useState(null)

  const { data: plantillas = [] } = useQuery({
    queryKey: ['registro_plantillas'],
    queryFn: async () => { const { data } = await supabase.from('registro_plantillas').select('*').order('programa').order('orden').order('nombre'); return data || [] },
  })

  const { data: entradas = [] } = useQuery({
    queryKey: ['registro_entradas', sel?.id],
    enabled: !!sel,
    queryFn: async () => { const { data } = await supabase.from('registro_entradas').select('*').eq('plantilla_id', sel.id).order('fecha', { ascending: false }); return data || [] },
  })

  // El libro "Orden de Producción" (PTZ-OR-01) muestra TODAS las órdenes reales automáticamente
  const esLibroOrdenes = !!sel && ((sel.codigo || '').toUpperCase() === 'PTZ-OR-01' || /orden de produc/i.test(sel.nombre || ''))
  const { data: ordenesProd = [] } = useQuery({
    queryKey: ['production_orders_libro'],
    enabled: esLibroOrdenes,
    queryFn: async () => { const { data } = await supabase.from('production_orders').select('*').order('created_at', { ascending: false }); return data || [] },
  })
  // Convierte cada orden real en una "entrada" para mostrarla con las columnas del libro
  const entradasOrdenes = esLibroOrdenes ? ordenesProd.map(o => ({
    id: `op-${o.id}`, _orden: true,
    fecha: (o.fecha_inicio || o.created_at || '').split('T')[0],
    responsable: o.operario || '', estado: o.estado,
    datos: { producto: o.producto, cantidad: o.cantidad_plan, unidad: o.unidad, operario: o.operario, lote: o.lote },
  })) : []

  // El libro "Control Producción Diaria" (PTZ-RG-03) muestra los registros de producción reales
  const esLibroProduccion = !!sel && ((sel.codigo || '').toUpperCase() === 'PTZ-RG-03' || /producci[oó]n diaria/i.test(sel.nombre || ''))
  const { data: registrosProd = [] } = useQuery({
    queryKey: ['production_records_libro'],
    enabled: esLibroProduccion,
    queryFn: async () => { const { data } = await supabase.from('production_records').select('*').order('fecha', { ascending: false }); return data || [] },
  })
  const entradasProduccion = esLibroProduccion ? registrosProd.map(r => ({
    id: `pr-${r.id}`, _registro: true,
    fecha: (r.fecha || '').split('T')[0], responsable: r.responsable || '',
    estado: r.aprobado === false ? 'pendiente' : (r.estado || 'conforme'),
    datos: { producto: r.producto, lote: r.lote, cantidad: r.cantidad, peso_final: r.peso_final, peso_desperdicio: r.peso_desperdicio },
  })) : []

  // Para las alertas: últimas próximas fechas de plantillas periódicas
  const { data: proximos = [] } = useQuery({
    queryKey: ['registro_proximos'],
    queryFn: async () => { const { data } = await supabase.from('registro_entradas').select('plantilla_id, fecha, proxima_fecha').not('proxima_fecha', 'is', null).order('fecha', { ascending: false }); return data || [] },
  })

  const alertas = useMemo(() => {
    const ultimaPorPlant = {}
    proximos.forEach(e => { if (!ultimaPorPlant[e.plantilla_id]) ultimaPorPlant[e.plantilla_id] = e })  // la primera es la más reciente
    const hoyStr = hoy()
    return plantillas.filter(p => p.periodica && p.genera_alerta).map(p => {
      const u = ultimaPorPlant[p.id]
      if (!u || !u.proxima_fecha) return { p, estado: 'sin_registro', proxima: null }
      const limite = addDias(hoyStr, p.dias_aviso)
      if (u.proxima_fecha < hoyStr) return { p, estado: 'vencido', proxima: u.proxima_fecha }
      if (u.proxima_fecha <= limite) return { p, estado: 'proximo', proxima: u.proxima_fecha }
      return { p, estado: 'ok', proxima: u.proxima_fecha }
    }).filter(a => a.estado === 'vencido' || a.estado === 'proximo' || a.estado === 'sin_registro')
  }, [proximos, plantillas])

  const gruposPlant = useMemo(() => {
    const m = {}
    plantillas.forEach(p => { (m[p.programa || 'Otros'] ||= []).push(p) })
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [plantillas])

  const campos = sel ? (Array.isArray(sel.campos) ? sel.campos : []) : []

  const entradasBase = esLibroOrdenes ? entradasOrdenes : esLibroProduccion ? entradasProduccion : entradas
  const esLibroAuto = esLibroOrdenes || esLibroProduccion
  const entradasFiltradas = entradasBase.filter(e => {
    if (desde && e.fecha < desde) return false
    if (hasta && e.fecha > hasta) return false
    if (buscar) {
      const txt = [e.responsable, e.observaciones, ...Object.values(e.datos || {})].join(' ').toLowerCase()
      if (!txt.includes(buscar.toLowerCase())) return false
    }
    return true
  })

  // ---- Diligenciar entrada ----
  const abrirEntrada = () => {
    const d = {}
    campos.forEach(c => { d[c.key] = c.tipo === 'checkbox' ? false : '' })
    setEntradaForm({ fecha: hoy(), datos: d, observaciones: '', responsable: profile?.nombre || '' })
    setEntradaFile(null); setEntradaModal(true)
  }
  const guardarEntrada = async () => {
    for (const c of campos) {
      if (c.requerido && (entradaForm.datos[c.key] === '' || entradaForm.datos[c.key] == null)) { toast(`Falta: ${c.label}`, 'warning'); return }
    }
    setSaving(true)
    try {
      let storage_path = null, storage_url = null, archivo_nombre = null
      if (entradaFile) {
        const ext = entradaFile.name.split('.').pop()
        storage_path = `registros/${sel.id}/${Date.now()}.${ext}`
        storage_url = await uploadFile(BUCKET, storage_path, entradaFile)
        archivo_nombre = entradaFile.name
      }
      const proxima = sel.periodica && sel.dias_periodo > 0 ? addDias(entradaForm.fecha, sel.dias_periodo) : null
      const { error } = await supabase.from('registro_entradas').insert({
        plantilla_id: sel.id, fecha: entradaForm.fecha, datos: entradaForm.datos,
        observaciones: entradaForm.observaciones, responsable: entradaForm.responsable,
        proxima_fecha: proxima, storage_path, storage_url, archivo_nombre, creado_por: profile?.nombre || '',
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['registro_entradas', sel.id] })
      qc.invalidateQueries({ queryKey: ['registro_proximos'] })
      setEntradaModal(false)
      toast('Registro guardado ✓')
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  const eliminarEntrada = useMutation({
    mutationFn: async (e) => {
      if (e.storage_path) await supabase.storage.from(BUCKET).remove([e.storage_path]).catch(() => {})
      const { error } = await supabase.from('registro_entradas').delete().eq('id', e.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['registro_entradas', sel?.id] }); qc.invalidateQueries({ queryKey: ['registro_proximos'] }); toast('Registro eliminado') },
  })

  const descargarEvidencia = async (e) => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(e.storage_path); if (error) throw error
      const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = e.archivo_nombre || 'evidencia'
      document.body.appendChild(a); a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 300)
    } catch (er) { toast('Error: ' + er.message, 'error') }
  }

  // ---- Plantillas (admin) ----
  const abrirNuevaPlantilla = () => { setPlantillaForm(EMPTY_PLANTILLA); setPlantillaEditId(null); setPlantillaModal(true) }
  const abrirEditarPlantilla = (p) => {
    setPlantillaForm({ ...EMPTY_PLANTILLA, ...p, campos: Array.isArray(p.campos) ? p.campos : [] })
    setPlantillaEditId(p.id); setPlantillaModal(true)
  }
  const setCampo = (i, k, v) => setPlantillaForm(f => ({ ...f, campos: f.campos.map((c, idx) => idx === i ? { ...c, [k]: v, ...(k === 'label' ? { key: slug(v) } : {}) } : c) }))
  const addCampo = () => setPlantillaForm(f => ({ ...f, campos: [...f.campos, { key: '', label: '', tipo: 'text', requerido: false }] }))
  const delCampo = (i) => setPlantillaForm(f => ({ ...f, campos: f.campos.filter((_, idx) => idx !== i) }))

  const guardarPlantilla = async () => {
    if (!plantillaForm.nombre.trim()) { toast('Nombre del registro requerido', 'warning'); return }
    const campos = plantillaForm.campos.filter(c => c.label?.trim()).map(c => ({ ...c, key: c.key || slug(c.label), opciones: c.tipo === 'select' ? (Array.isArray(c.opciones) ? c.opciones : String(c.opciones || '').split(',').map(s => s.trim()).filter(Boolean)) : undefined }))
    if (!campos.length) { toast('Agrega al menos un campo', 'warning'); return }
    setSaving(true)
    try {
      const datos = {
        codigo: plantillaForm.codigo, nombre: plantillaForm.nombre, programa: plantillaForm.programa,
        descripcion: plantillaForm.descripcion, campos, periodica: plantillaForm.periodica,
        dias_periodo: parseInt(plantillaForm.dias_periodo) || 0, genera_alerta: plantillaForm.genera_alerta,
        dias_aviso: parseInt(plantillaForm.dias_aviso) || 7, activo: plantillaForm.activo,
      }
      if (plantillaEditId) {
        const { error } = await supabase.from('registro_plantillas').update(datos).eq('id', plantillaEditId); if (error) throw error
      } else {
        datos.creado_por = profile?.nombre || ''
        const { error } = await supabase.from('registro_plantillas').insert(datos); if (error) throw error
      }
      qc.invalidateQueries({ queryKey: ['registro_plantillas'] })
      setPlantillaModal(false); toast('Registro configurado ✓')
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  const eliminarPlantilla = useMutation({
    mutationFn: async (p) => { const { error } = await supabase.from('registro_plantillas').delete().eq('id', p.id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['registro_plantillas'] }); setSel(null); toast('Plantilla eliminada') },
  })

  const sembrarPlantillas = async () => {
    const ok = await confirmar(`Se crearán ${PLANTILLAS_BASE.length} libros de registro recurrentes del SGC (temperaturas, cloro/pH, limpieza, fumigación, mantenimiento, inspección de personal). ¿Continuar?`, { title: 'Cargar plantillas base' })
    if (!ok) return
    setSaving(true)
    try {
      const existentes = new Set(plantillas.map(p => (p.codigo || '').toUpperCase()))
      const nuevos = PLANTILLAS_BASE.filter(p => !existentes.has(p.codigo.toUpperCase())).map(p => ({ ...p, activo: true, creado_por: profile?.nombre || '' }))
      if (!nuevos.length) { toast('Las plantillas base ya están creadas', 'info'); return }
      const { error } = await supabase.from('registro_plantillas').insert(nuevos); if (error) throw error
      qc.invalidateQueries({ queryKey: ['registro_plantillas'] }); toast(`${nuevos.length} libros creados ✓`)
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  const renderInput = (c) => {
    const val = entradaForm.datos[c.key] ?? ''
    const set = (v) => setEntradaForm(f => ({ ...f, datos: { ...f.datos, [c.key]: v } }))
    if (c.tipo === 'checkbox') return <input type="checkbox" checked={!!entradaForm.datos[c.key]} onChange={e => set(e.target.checked)} />
    if (c.tipo === 'select') return <select className="form-control" value={val} onChange={e => set(e.target.value)}><option value="">—</option>{(c.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
    if (c.tipo === 'textarea') return <textarea className="form-control" rows={2} value={val} onChange={e => set(e.target.value)} />
    if (c.tipo === 'number') return <input type="number" className="form-control" value={val} onChange={e => set(e.target.value)} />
    if (c.tipo === 'date') return <input type="date" className="form-control" value={val} onChange={e => set(e.target.value)} />
    if (c.tipo === 'hora') return <input type="time" className="form-control" value={val} onChange={e => set(e.target.value)} />
    return <input className="form-control" value={val} onChange={e => set(e.target.value)} />
  }

  // ===== Vista LIBRO (plantilla seleccionada) =====
  if (sel) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title"><Ico as={NotebookText} size={14} />{sel.nombre} {sel.codigo && <small style={{ color: 'var(--texto-suave)' }}>({sel.codigo})</small>}</h1>
          <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSel(null)}>← Volver</button>
            {esLibroOrdenes && <button className="btn btn-secondary btn-sm" onClick={() => navigate('/ordenes')}><Ico as={Link2} size={14} />Abrir módulo</button>}
            {esLibroProduccion && <button className="btn btn-secondary btn-sm" onClick={() => navigate('/produccion')}><Ico as={Link2} size={14} />Abrir módulo</button>}
            {!esLibroAuto && <button className="btn btn-primary btn-sm" onClick={abrirEntrada}>+ Nuevo registro</button>}
          </div>
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', marginBottom: 12 }}>
          {sel.programa} {sel.periodica ? `· Periódico cada ${sel.dias_periodo} días` : ''}{sel.descripcion ? ` · ${sel.descripcion}` : ''}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-control" placeholder="Buscar..." value={buscar} onChange={e => setBuscar(e.target.value)} style={{ maxWidth: 220 }} />
          <label style={{ fontSize: '0.8rem' }}>Desde <input type="date" className="form-control" value={desde} onChange={e => setDesde(e.target.value)} style={{ display: 'inline-block', width: 'auto' }} /></label>
          <label style={{ fontSize: '0.8rem' }}>Hasta <input type="date" className="form-control" value={hasta} onChange={e => setHasta(e.target.value)} style={{ display: 'inline-block', width: 'auto' }} /></label>
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--texto-suave)' }}>{entradasFiltradas.length} registro(s)</span>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Fecha</th>
                {campos.map(c => <th key={c.key}>{c.label}</th>)}
                <th>Responsable</th>
                {sel.periodica && <th>Próxima</th>}
                <th>Evidencia</th>
                {esAdmin && <th></th>}
              </tr></thead>
              <tbody>
                {entradasFiltradas.length === 0
                  ? <tr><td colSpan={campos.length + 5} className="empty-table">Sin registros. Usa "+ Nuevo registro".</td></tr>
                  : entradasFiltradas.map(e => (
                    <tr key={e.id}>
                      <td>{fFecha(e.fecha)}</td>
                      {campos.map(c => <td key={c.key}>{c.tipo === 'checkbox' ? (e.datos?.[c.key] ? '✓' : '—') : (e.datos?.[c.key] ?? '—')}</td>)}
                      <td>{e.responsable || e.creado_por || '—'}{(e._orden || e._registro) && e.estado ? <span className="badge badge-azul" style={{ marginLeft: 6, fontSize: '0.62rem' }}>{e.estado}</span> : null}</td>
                      {sel.periodica && <td>{e.proxima_fecha ? fFecha(e.proxima_fecha) : '—'}</td>}
                      <td>{(e._orden || e._registro) ? '—' : (e.storage_path ? <button className="btn btn-xs btn-secondary" onClick={() => descargarEvidencia(e)}><Download size={13} aria-hidden="true" /></button> : '—')}</td>
                      {esAdmin && <td>{(e._orden || e._registro) ? '' : <button className="btn btn-xs btn-danger" onClick={() => confirmar('¿Eliminar este registro?').then(ok => ok && eliminarEntrada.mutate(e))}><X size={13} aria-hidden="true" /></button>}</td>}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal nueva entrada */}
        <Modal open={entradaModal} onClose={() => setEntradaModal(false)} title={`+ ${sel.nombre}`}
          footer={<><button className="btn btn-secondary" onClick={() => setEntradaModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarEntrada} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button></>}>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Fecha</label><input type="date" className="form-control" value={entradaForm.fecha} onChange={e => setEntradaForm(f => ({ ...f, fecha: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Responsable</label><input className="form-control" value={entradaForm.responsable} onChange={e => setEntradaForm(f => ({ ...f, responsable: e.target.value }))} /></div>
          </div>
          {campos.map(c => (
            <div className="form-group" key={c.key}>
              <label className="form-label">{c.label}{c.requerido && ' *'}</label>
              {renderInput(c)}
            </div>
          ))}
          <div className="form-group"><label className="form-label">Observaciones</label><textarea className="form-control" rows={2} value={entradaForm.observaciones} onChange={e => setEntradaForm(f => ({ ...f, observaciones: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Evidencia (foto/archivo, opcional)</label><input type="file" onChange={e => setEntradaFile(e.target.files[0] || null)} />{entradaFile && <div style={{ fontSize: '0.8rem', color: 'var(--selva)' }}>📎 {entradaFile.name}</div>}</div>
          {sel.periodica && <div className="alert alert-info" style={{ fontSize: '0.8rem' }}>Próxima ejecución: <strong>{fFecha(addDias(entradaForm.fecha, sel.dias_periodo))}</strong> (cada {sel.dias_periodo} días)</div>}
        </Modal>
      </div>
    )
  }

  // ===== Vista LISTA de libros =====
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><Ico as={NotebookText} size={14} />Libros de Registro (BPM)</h1>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={sembrarPlantillas} disabled={saving}><Ico as={Download} size={14} />Cargar plantillas base</button>}
          {esAdmin && <button className="btn btn-primary btn-sm" onClick={abrirNuevaPlantilla}>+ Nuevo libro</button>}
        </div>
      </div>

      {/* Alertas de vencimientos */}
      {alertas.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--dorado)' }}>
          <div className="card-title" style={{ fontSize: '0.95rem' }}><Ico as={Bell} size={14} />Próximos vencimientos / pendientes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alertas.map(a => (
              <div key={a.p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                <span className={`badge ${a.estado === 'vencido' ? 'badge-rojo' : a.estado === 'proximo' ? 'badge-dorado' : 'badge-azul'}`}>
                  {a.estado === 'vencido' ? 'VENCIDO' : a.estado === 'proximo' ? 'PRÓXIMO' : 'SIN REGISTRO'}
                </span>
                <strong>{a.p.nombre}</strong>
                {a.proxima && <span style={{ color: 'var(--texto-suave)' }}>— vence {fFecha(a.proxima)}</span>}
                <button className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setSel(a.p)}>Diligenciar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {plantillas.length === 0
        ? <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--texto-suave)' }}>
            📒 Aún no hay libros de registro. {esAdmin ? 'Usa "Cargar plantillas base" o crea uno nuevo.' : 'El administrador aún no ha configurado los registros.'}
          </div>
        : gruposPlant.map(([programa, libros]) => (
            <div className="card" key={programa} style={{ marginBottom: 16 }}>
              <div className="card-title">{programa} <span className="badge badge-verde" style={{ marginLeft: 8 }}>{libros.length}</span></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Código</th><th>Registro</th><th>Periodicidad</th><th>Campos</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {libros.map(p => (
                      <tr key={p.id}>
                        <td><strong>{p.codigo || '—'}</strong></td>
                        <td>{p.nombre}</td>
                        <td>{p.periodica ? `Cada ${p.dias_periodo} días` : 'Eventual'}{p.genera_alerta ? ' 🔔' : ''}</td>
                        <td className="td-number">{(Array.isArray(p.campos) ? p.campos.length : 0)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-xs btn-primary" onClick={() => setSel(p)}>📖 Abrir</button>{' '}
                          {esAdmin && <>
                            <button className="btn btn-xs btn-secondary" onClick={() => abrirEditarPlantilla(p)}><Pencil size={13} aria-hidden="true" /></button>{' '}
                            <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Eliminar el libro "${p.nombre}" y todos sus registros?`).then(ok => ok && eliminarPlantilla.mutate(p))}><X size={13} aria-hidden="true" /></button>
                          </>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
      }

      {/* Modal configurar plantilla (admin) */}
      <Modal open={plantillaModal} onClose={() => setPlantillaModal(false)} title={plantillaEditId ? '✏ Editar libro de registro' : '+ Nuevo libro de registro'} size="modal-lg"
        footer={<><button className="btn btn-secondary" onClick={() => setPlantillaModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarPlantilla} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button></>}>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Código (opcional)</label><input className="form-control" value={plantillaForm.codigo} onChange={e => setPlantillaForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ej: PTZ-RG-02" /></div>
          <div className="form-group"><label className="form-label">Programa / Procedimiento</label><input className="form-control" value={plantillaForm.programa} onChange={e => setPlantillaForm(f => ({ ...f, programa: e.target.value }))} placeholder="Ej: 15. Trazabilidad" /></div>
        </div>
        <div className="form-group"><label className="form-label">Nombre del registro</label><input className="form-control" value={plantillaForm.nombre} onChange={e => setPlantillaForm(f => ({ ...f, nombre: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Descripción (opcional)</label><input className="form-control" value={plantillaForm.descripcion} onChange={e => setPlantillaForm(f => ({ ...f, descripcion: e.target.value }))} /></div>

        <div className="card-title" style={{ fontSize: '0.9rem' }}>Campos del registro</div>
        {plantillaForm.campos.map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1.4fr auto auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <input className="form-control" placeholder="Etiqueta" value={c.label} onChange={e => setCampo(i, 'label', e.target.value)} />
            <select className="form-control" value={c.tipo} onChange={e => setCampo(i, 'tipo', e.target.value)}>{Object.entries(TIPOS_CAMPO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            {c.tipo === 'select'
              ? <input className="form-control" placeholder="opciones, separadas por coma" value={Array.isArray(c.opciones) ? c.opciones.join(', ') : (c.opciones || '')} onChange={e => setCampo(i, 'opciones', e.target.value)} />
              : <span />}
            <label style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}><input type="checkbox" checked={!!c.requerido} onChange={e => setCampo(i, 'requerido', e.target.checked)} /> Oblig.</label>
            <button className="btn btn-xs btn-danger" onClick={() => delCampo(i)}><X size={13} aria-hidden="true" /></button>
          </div>
        ))}
        <button className="btn btn-sm btn-secondary" onClick={addCampo}>+ Agregar campo</button>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--crema-oscuro)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input type="checkbox" checked={plantillaForm.periodica} onChange={e => setPlantillaForm(f => ({ ...f, periodica: e.target.checked }))} /> Es un registro <strong>periódico</strong> (se repite cada cierto tiempo)
          </label>
          {plantillaForm.periodica && (
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Frecuencia (días)</label><input type="number" className="form-control" value={plantillaForm.dias_periodo} onChange={e => setPlantillaForm(f => ({ ...f, dias_periodo: e.target.value }))} placeholder="30 = mensual" /></div>
              <div className="form-group"><label className="form-label">Avisar (días antes)</label><input type="number" className="form-control" value={plantillaForm.dias_aviso} onChange={e => setPlantillaForm(f => ({ ...f, dias_aviso: e.target.value }))} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={plantillaForm.genera_alerta} onChange={e => setPlantillaForm(f => ({ ...f, genera_alerta: e.target.checked }))} /> Generar alerta de vencimiento
              </label>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile } from '../lib/supabase'
import { fFecha } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'

const BUCKET = 'documentos'

const TIPOS = {
  manual: 'Manual', programa: 'Programa', procedimiento: 'Procedimiento', protocolo: 'Protocolo',
  registro: 'Registro', formato: 'Formato', cronograma: 'Cronograma', listado: 'Listado',
  matriz: 'Matriz', poes: 'POES', pos: 'POS', ficha_tecnica: 'Ficha técnica', ambiental: 'Ambiental',
}
const tipoLabel = (t) => TIPOS[t] || t || '—'

const EMPTY = { codigo: '', nombre: '', tipo: 'procedimiento', proceso: '', descripcion: '', version: '1', vigente: true, modulo_link: '' }

// Catálogo base del Sistema Documental (se siembra una sola vez con el botón "Cargar catálogo base")
const CATALOGO_BASE = [
  { proceso: '01. Manual BPM', codigo: 'M-BPM-01', nombre: 'Manual BPM MUMI', tipo: 'manual' },
  // 02 Limpieza y Desinfección
  { proceso: '02. Limpieza y Desinfección', codigo: 'P-L&D-02', nombre: 'Programa de Limpieza y Desinfección', tipo: 'programa' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-CR-01', nombre: 'Cronograma POES', tipo: 'cronograma' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-CR-02', nombre: 'Cronograma POS', tipo: 'cronograma' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-CR-03', nombre: 'Cronograma rotación detergentes y desinfectantes', tipo: 'cronograma' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-RG-01', nombre: 'Registro de actividades', tipo: 'registro' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-RG-02', nombre: 'Resultados análisis fisicoquímicos', tipo: 'registro' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-RG-03', nombre: 'Resultados análisis microbiológicos', tipo: 'registro' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POES-1', nombre: 'POES Balanzas', tipo: 'poes' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POES-2', nombre: 'POES Báscula de piso', tipo: 'poes' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POES-3', nombre: 'POES Canecas', tipo: 'poes' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POES-4', nombre: 'POES Estibas', tipo: 'poes' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POES-6', nombre: 'POES Lavamanos', tipo: 'poes' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POES-7', nombre: 'POES Mesas de trabajo', tipo: 'poes' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POES-8', nombre: 'POES Mezcladora', tipo: 'poes' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POES-9', nombre: 'POES Pisos y drenajes', tipo: 'poes' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POES-10', nombre: 'POES Tanque de agua', tipo: 'poes' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POES-11', nombre: 'POES Utensilios', tipo: 'poes' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POS-1', nombre: 'POS Mesas y escritorios', tipo: 'pos' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POS-2', nombre: 'POS Lámparas', tipo: 'pos' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POS-3', nombre: 'POS Ventanas', tipo: 'pos' },
  { proceso: '02. Limpieza y Desinfección', codigo: 'L&D-POS-4', nombre: 'POS Puertas', tipo: 'pos' },
  // 03 Agua Potable
  { proceso: '03. Control de Agua Potable', codigo: 'P-CAP-03', nombre: 'Programa de Control de Agua Potable', tipo: 'programa' },
  { proceso: '03. Control de Agua Potable', codigo: 'CAP-RG-01', nombre: 'Control cloro y pH', tipo: 'registro' },
  { proceso: '03. Control de Agua Potable', codigo: 'CAP-RG-02', nombre: 'Lavado de tanque', tipo: 'registro' },
  // 04 Muestreo
  { proceso: '04. Muestreo', codigo: 'P-MTO-04', nombre: 'Programa de Muestreo', tipo: 'programa' },
  { proceso: '04. Muestreo', codigo: 'MTO-CR-01', nombre: 'Cronogramas', tipo: 'cronograma' },
  // 05 Plagas
  { proceso: '05. Control de Plagas', codigo: 'P-CDP-05', nombre: 'Programa de Control de Plagas', tipo: 'programa' },
  { proceso: '05. Control de Plagas', codigo: 'CDP-CR-01', nombre: 'Cronograma fumigaciones', tipo: 'cronograma' },
  { proceso: '05. Control de Plagas', codigo: 'CDP-RG-02', nombre: 'Control avistamiento de plagas', tipo: 'registro' },
  { proceso: '05. Control de Plagas', codigo: 'CDP-RG-03', nombre: 'Registro de fumigación', tipo: 'registro' },
  // 06 Residuos
  { proceso: '06. Residuos Sólidos y Líquidos', codigo: 'P-RSL-06', nombre: 'Programa de Residuos Sólidos y Líquidos', tipo: 'programa' },
  { proceso: '06. Residuos Sólidos y Líquidos', codigo: 'RSL-MZ-02', nombre: 'Matriz de generación', tipo: 'matriz' },
  { proceso: '06. Residuos Sólidos y Líquidos', codigo: 'RSL-RG-01', nombre: 'Control generación de residuos', tipo: 'registro' },
  // 07 Higiene
  { proceso: '07. Higiene Personal', codigo: 'P-HPL-07', nombre: 'Programa de Higiene Personal', tipo: 'programa' },
  { proceso: '07. Higiene Personal', codigo: 'HPL-RG-01', nombre: 'Control entrega dotaciones y EPP', tipo: 'registro' },
  { proceso: '07. Higiene Personal', codigo: 'HPL-RG-02', nombre: 'Control visitantes y proveedores', tipo: 'registro' },
  { proceso: '07. Higiene Personal', codigo: 'HPL-RG-03', nombre: 'Control inspección de personal', tipo: 'registro' },
  { proceso: '07. Higiene Personal', codigo: 'HPL-RG-04', nombre: 'Control enfermedades personal interno', tipo: 'registro' },
  // 08 Capacitación
  { proceso: '08. Capacitación', codigo: 'P-CAN-08', nombre: 'Programa de Capacitación', tipo: 'programa' },
  { proceso: '08. Capacitación', codigo: 'CAN-CR-01', nombre: 'Cronograma de capacitaciones', tipo: 'cronograma' },
  { proceso: '08. Capacitación', codigo: 'CAN-CR-03', nombre: 'Formato encuesta capacitación', tipo: 'formato' },
  { proceso: '08. Capacitación', codigo: 'CAN-FM-04', nombre: 'Formato evaluación de la capacitación', tipo: 'formato' },
  { proceso: '08. Capacitación', codigo: 'CAN-RG-02', nombre: 'Acta de capacitación', tipo: 'registro' },
  // 09 Producto No Conforme
  { proceso: '09. Producto No Conforme', codigo: 'PR-PNC-09', nombre: 'Procedimiento de Producto No Conforme', tipo: 'procedimiento' },
  { proceso: '09. Producto No Conforme', codigo: 'PNC-MZ-01', nombre: 'Matriz no conformes', tipo: 'matriz' },
  { proceso: '09. Producto No Conforme', codigo: 'PNC-RG-02', nombre: 'Registro no conformes externas', tipo: 'registro' },
  { proceso: '09. Producto No Conforme', codigo: 'PNC-RG-03', nombre: 'Registro no conformes internas', tipo: 'registro' },
  // 10 Liberación
  { proceso: '10. Liberación de Producto', codigo: 'PT-LPT-10', nombre: 'Protocolo de Liberación de Producto', tipo: 'protocolo' },
  { proceso: '10. Liberación de Producto', codigo: 'LPT-RG-02', nombre: 'Registro control de lotes', tipo: 'registro' },
  { proceso: '10. Liberación de Producto', codigo: 'LTP-FM-02', nombre: 'Formato liberación de producto terminado', tipo: 'formato' },
  // 11 Especificaciones
  { proceso: '11. Especificaciones de Producto', codigo: 'PR-CEP-11', nombre: 'Procedimiento y Control de Especificaciones de Producto', tipo: 'procedimiento' },
  { proceso: '11. Especificaciones de Producto', codigo: 'CEP-FTP-02', nombre: 'Formato ficha técnica', tipo: 'formato' },
  { proceso: '11. Especificaciones de Producto', codigo: 'CEP-RG-01', nombre: 'Registro control de actualización de fichas técnicas', tipo: 'registro' },
  { proceso: '11. Especificaciones de Producto', codigo: 'FT-ARAZA', nombre: 'Ficha técnica Arazá', tipo: 'ficha_tecnica' },
  { proceso: '11. Especificaciones de Producto', codigo: 'FT-ASAI', nombre: 'Ficha técnica Asaí', tipo: 'ficha_tecnica' },
  { proceso: '11. Especificaciones de Producto', codigo: 'FT-CACAY', nombre: 'Ficha técnica Cacay', tipo: 'ficha_tecnica' },
  { proceso: '11. Especificaciones de Producto', codigo: 'FT-COPOAZU', nombre: 'Ficha técnica Copoazú', tipo: 'ficha_tecnica' },
  { proceso: '11. Especificaciones de Producto', codigo: 'FT-MORICHE', nombre: 'Ficha técnica Moriche', tipo: 'ficha_tecnica' },
  // 12 Mantenimiento y Calibración
  { proceso: '12. Mantenimiento y Calibración', codigo: 'P-MYC-12', nombre: 'Programa de Mantenimiento y Calibración', tipo: 'programa' },
  { proceso: '12. Mantenimiento y Calibración', codigo: 'MYC-CR-01', nombre: 'Cronograma calibración de equipos', tipo: 'cronograma' },
  { proceso: '12. Mantenimiento y Calibración', codigo: 'MYC-CR-02', nombre: 'Cronograma calibración equipos de medición', tipo: 'cronograma' },
  { proceso: '12. Mantenimiento y Calibración', codigo: 'MYC-CR-03', nombre: 'Cronograma mantenimiento locativo', tipo: 'cronograma' },
  { proceso: '12. Mantenimiento y Calibración', codigo: 'MYC-LI-01', nombre: 'Lista de chequeo instalaciones', tipo: 'listado' },
  { proceso: '12. Mantenimiento y Calibración', codigo: 'MYC-RG-01', nombre: 'Clasificación de equipos de medición', tipo: 'registro' },
  { proceso: '12. Mantenimiento y Calibración', codigo: 'MYC-RG-02', nombre: 'Clasificación de equipos', tipo: 'registro' },
  { proceso: '12. Mantenimiento y Calibración', codigo: 'MYC-RG-03', nombre: 'Registro de mantenimiento y calibración', tipo: 'registro' },
  // 13 RRHH
  { proceso: '13. Recursos Humanos', codigo: 'PR-RH-13', nombre: 'Procedimiento de Recursos Humanos', tipo: 'procedimiento' },
  { proceso: '13. Recursos Humanos', codigo: 'RH-LI-01', nombre: 'Listado maestro de personal', tipo: 'listado', modulo_link: '/nomina' },
  // 14 Compras
  { proceso: '14. Compras y Proveedores', codigo: 'PR-CPS-14', nombre: 'Procedimiento de Compras y Proveedores', tipo: 'procedimiento' },
  { proceso: '14. Compras y Proveedores', codigo: 'CPS-FM-01', nombre: 'Formato visita a proveedores', tipo: 'formato' },
  { proceso: '14. Compras y Proveedores', codigo: 'CPS-LI-01', nombre: 'Listado maestro proveedores', tipo: 'listado' },
  { proceso: '14. Compras y Proveedores', codigo: 'CPS-MZ-01', nombre: 'Matriz entregas proveedores', tipo: 'matriz' },
  { proceso: '14. Compras y Proveedores', codigo: 'CPS-RG-01', nombre: 'Requisición compra', tipo: 'registro' },
  // 15 Trazabilidad (varios con módulo en el sistema)
  { proceso: '15. Trazabilidad', codigo: 'PR-PTZ-15', nombre: 'Procedimiento de Trazabilidad', tipo: 'procedimiento' },
  { proceso: '15. Trazabilidad', codigo: 'LTP-CR-01', nombre: 'Cronograma de trazabilidad', tipo: 'cronograma' },
  { proceso: '15. Trazabilidad', codigo: 'PTZ-FM-01', nombre: 'Simulacro trazabilidad', tipo: 'formato' },
  { proceso: '15. Trazabilidad', codigo: 'PTZ-OR-01', nombre: 'Orden de producción', tipo: 'formato', modulo_link: '/ordenes' },
  { proceso: '15. Trazabilidad', codigo: 'PTZ-RG-01', nombre: 'Registro control de despachos', tipo: 'registro' },
  { proceso: '15. Trazabilidad', codigo: 'PTZ-RG-02', nombre: 'Registro control de temperaturas y humedad', tipo: 'registro' },
  { proceso: '15. Trazabilidad', codigo: 'PTZ-RG-03', nombre: 'Registro control producción diaria', tipo: 'registro', modulo_link: '/produccion' },
  { proceso: '15. Trazabilidad', codigo: 'PTZ-RG-04', nombre: 'Registro control vehículos transporte', tipo: 'registro' },
  { proceso: '15. Trazabilidad', codigo: 'PTZ-RG-05', nombre: 'Registro entrada de MP a producción', tipo: 'registro', modulo_link: '/inventario' },
  { proceso: '15. Trazabilidad', codigo: 'PTZ-RG-06', nombre: 'Registro entrada PT a bodega', tipo: 'registro' },
  { proceso: '15. Trazabilidad', codigo: 'PTZ-RG-07', nombre: 'Registro recibo cajas de cartón', tipo: 'registro' },
  { proceso: '15. Trazabilidad', codigo: 'PTZ-RG-08', nombre: 'Registro recibo de empaques', tipo: 'registro' },
  { proceso: '15. Trazabilidad', codigo: 'PTZ-RG-09', nombre: 'Registro recibo de materia prima', tipo: 'registro', modulo_link: '/inventario' },
  // 16 Almacenamiento
  { proceso: '16. Almacenamiento y Transporte', codigo: 'P-AYL-16', nombre: 'Programa de Almacenamiento y Transporte', tipo: 'programa' },
  { proceso: '16. Almacenamiento y Transporte', codigo: 'ALMT-RG-01', nombre: 'Inspección de vehículos', tipo: 'registro' },
  { proceso: '16. Almacenamiento y Transporte', codigo: 'ALT-SP-01', nombre: 'Solicitud de despacho', tipo: 'formato' },
  // 17 ACPM
  { proceso: '17. Acciones Correctivas y de Mejora', codigo: 'PR-CPM-17', nombre: 'Procedimiento de Acciones Correctivas, Preventivas y de Mejora', tipo: 'procedimiento' },
  { proceso: '17. Acciones Correctivas y de Mejora', codigo: 'CPM-RG-01', nombre: 'Registro control ACPM', tipo: 'registro' },
  { proceso: '17. Acciones Correctivas y de Mejora', codigo: 'CPM-RG-02', nombre: 'Registro seguimiento ACPM', tipo: 'registro' },
  { proceso: '17. Acciones Correctivas y de Mejora', codigo: 'CPM-RG-03', nombre: 'Informe ACPM', tipo: 'registro' },
]

export default function Documentos() {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const esAdmin = profile?.rol === 'admin'
  const fileRef = useRef()

  const [filtroProceso, setFiltroProceso] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [buscar, setBuscar] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [verVers, setVerVers] = useState(null)   // documento para ver versiones

  const { data: documentos = [] } = useQuery({
    queryKey: ['documentos'],
    queryFn: async () => {
      const { data } = await supabase.from('documentos').select('*').order('proceso').order('codigo')
      return data || []
    },
  })

  const { data: versiones = [] } = useQuery({
    queryKey: ['documento_versiones', verVers?.id],
    enabled: !!verVers,
    queryFn: async () => {
      const { data } = await supabase.from('documento_versiones').select('*').eq('documento_id', verVers.id).order('created_at', { ascending: false })
      return data || []
    },
  })

  const procesos = useMemo(() => [...new Set(documentos.map(d => d.proceso).filter(Boolean))].sort(), [documentos])

  const filtrados = documentos.filter(d =>
    (!filtroProceso || d.proceso === filtroProceso) &&
    (!filtroTipo || d.tipo === filtroTipo) &&
    (!buscar || `${d.codigo} ${d.nombre}`.toLowerCase().includes(buscar.toLowerCase()))
  )
  // Agrupar por proceso
  const grupos = useMemo(() => {
    const m = {}
    filtrados.forEach(d => { (m[d.proceso || 'Sin proceso'] ||= []).push(d) })
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtrados])

  const abrirNuevo = () => { setForm(EMPTY); setEditId(null); setFile(null); setModal(true) }
  const abrirEditar = (d) => {
    setForm({ codigo: d.codigo || '', nombre: d.nombre || '', tipo: d.tipo || 'procedimiento', proceso: d.proceso || '', descripcion: d.descripcion || '', version: d.version || '1', vigente: d.vigente !== false, modulo_link: d.modulo_link || '' })
    setEditId(d.id); setFile(null); setModal(true)
  }

  const guardar = async () => {
    if (!form.nombre.trim()) { toast('Ingresa el nombre del documento', 'warning'); return }
    setSaving(true)
    try {
      let storage_path = null, storage_url = null, archivo_nombre = null
      if (file) {
        const ext = file.name.split('.').pop()
        storage_path = `docs/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
        storage_url = await uploadFile(BUCKET, storage_path, file)
        archivo_nombre = file.name
      }
      if (editId) {
        const prev = documentos.find(d => d.id === editId)
        const datos = { ...form }
        if (file) {
          // Archivar la versión anterior y subir como nueva versión
          if (prev?.storage_path) {
            await supabase.from('documento_versiones').insert({
              documento_id: editId, version: prev.version, storage_path: prev.storage_path,
              storage_url: prev.storage_url, archivo_nombre: prev.archivo_nombre, nota: 'Reemplazado',
              creado_por: profile?.nombre || '',
            })
          }
          datos.storage_path = storage_path; datos.storage_url = storage_url; datos.archivo_nombre = archivo_nombre
        }
        datos.updated_at = new Date().toISOString()
        const { error } = await supabase.from('documentos').update(datos).eq('id', editId)
        if (error) throw error
        toast('Documento actualizado ✓')
      } else {
        const datos = { ...form, creado_por: profile?.nombre || '' }
        if (file) { datos.storage_path = storage_path; datos.storage_url = storage_url; datos.archivo_nombre = archivo_nombre }
        const { error } = await supabase.from('documentos').insert(datos)
        if (error) throw error
        toast('Documento creado ✓')
      }
      qc.invalidateQueries({ queryKey: ['documentos'] })
      qc.invalidateQueries({ queryKey: ['documento_versiones'] })
      setModal(false)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const descargar = async (d) => {
    if (!d.storage_path) { toast('Este documento aún no tiene archivo cargado', 'warning'); return }
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(d.storage_path)
      if (error) throw error
      const url = URL.createObjectURL(data)
      const a = document.createElement('a'); a.href = url; a.download = d.archivo_nombre || `${d.codigo || d.nombre}`
      document.body.appendChild(a); a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 300)
    } catch (e) { toast('Error al descargar: ' + e.message, 'error') }
  }

  const descargarVersion = async (v) => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(v.storage_path)
      if (error) throw error
      const url = URL.createObjectURL(data)
      const a = document.createElement('a'); a.href = url; a.download = v.archivo_nombre || 'documento'
      document.body.appendChild(a); a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 300)
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  const eliminar = useMutation({
    mutationFn: async (d) => {
      if (d.storage_path) await supabase.storage.from(BUCKET).remove([d.storage_path]).catch(() => {})
      const { error } = await supabase.from('documentos').delete().eq('id', d.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documentos'] }); toast('Documento eliminado') },
    onError: (e) => toast(e.message, 'error'),
  })

  const sembrarCatalogo = async () => {
    const ok = await confirmar(`Se cargarán ${CATALOGO_BASE.length} documentos del Sistema Documental (sin archivos). Luego podrás subir el archivo de cada uno. ¿Continuar?`, { title: 'Cargar catálogo base' })
    if (!ok) return
    setSaving(true)
    try {
      const existentes = new Set(documentos.map(d => (d.codigo || '').toUpperCase()))
      const nuevos = CATALOGO_BASE.filter(c => !existentes.has(c.codigo.toUpperCase()))
        .map(c => ({ ...c, version: '1', vigente: true, creado_por: profile?.nombre || '' }))
      if (!nuevos.length) { toast('El catálogo ya está cargado', 'info'); return }
      const { error } = await supabase.from('documentos').insert(nuevos)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['documentos'] })
      toast(`${nuevos.length} documentos cargados ✓`)
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📁 Gestión Documental</h1>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          {esAdmin && documentos.length === 0 && <button className="btn btn-secondary btn-sm" onClick={sembrarCatalogo} disabled={saving}>📥 Cargar catálogo base</button>}
          {esAdmin && <button className="btn btn-primary btn-sm" onClick={abrirNuevo}>+ Nuevo documento</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" value={filtroProceso} onChange={e => setFiltroProceso(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Todos los procesos</option>
          {procesos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="form-control" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="form-control" placeholder="Buscar por código o nombre..." value={buscar} onChange={e => setBuscar(e.target.value)} style={{ maxWidth: 260 }} />
      </div>

      {documentos.length === 0
        ? <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--texto-suave)' }}>
            📁 Aún no hay documentos. {esAdmin ? 'Usa "Cargar catálogo base" para crear la estructura del Sistema Documental, o agrega uno nuevo.' : 'El administrador aún no ha cargado documentos.'}
          </div>
        : grupos.map(([proceso, docs]) => (
            <div className="card" key={proceso} style={{ marginBottom: 16 }}>
              <div className="card-title">{proceso} <span className="badge badge-verde" style={{ marginLeft: 8 }}>{docs.length}</span></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Código</th><th>Documento</th><th>Tipo</th><th>Versión</th><th>Estado</th><th>Archivo</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {docs.map(d => (
                      <tr key={d.id}>
                        <td><strong>{d.codigo || '—'}</strong></td>
                        <td>{d.nombre}{d.descripcion && <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>{d.descripcion}</div>}</td>
                        <td><span className="badge badge-azul">{tipoLabel(d.tipo)}</span></td>
                        <td className="td-number">v{d.version || '1'}</td>
                        <td>{d.vigente !== false ? <span className="badge badge-verde">Vigente</span> : <span className="badge badge-dorado">Obsoleto</span>}</td>
                        <td>
                          {d.storage_path
                            ? <button className="btn btn-xs btn-secondary" onClick={() => descargar(d)}>⬇ Descargar</button>
                            : <span style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>Sin archivo</span>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {d.modulo_link && <button className="btn btn-xs btn-dorado" title="Abrir módulo digital" onClick={() => navigate(d.modulo_link)}>🔗 Módulo</button>}{' '}
                          {esAdmin && <>
                            <button className="btn btn-xs btn-secondary" onClick={() => abrirEditar(d)}>✏</button>{' '}
                            <button className="btn btn-xs btn-secondary" title="Ver versiones anteriores" onClick={() => setVerVers(d)}>🕑</button>{' '}
                            <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Eliminar "${d.nombre}"?`).then(ok => ok && eliminar.mutate(d))}>✕</button>
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

      {/* Modal nuevo/editar */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? '✏ Editar documento' : '+ Nuevo documento'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </>}>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Código</label><input className="form-control" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ej: PR-PTZ-15" /></div>
          <div className="form-group"><label className="form-label">Tipo</label>
            <select className="form-control" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group"><label className="form-label">Nombre del documento</label><input className="form-control" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Proceso</label><input className="form-control" value={form.proceso} onChange={e => setForm(f => ({ ...f, proceso: e.target.value }))} placeholder="Ej: 15. Trazabilidad" list="procesos-list" />
            <datalist id="procesos-list">{procesos.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="form-group"><label className="form-label">Versión</label><input className="form-control" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label className="form-label">Descripción (opcional)</label><input className="form-control" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Vínculo a módulo (opcional)</label>
          <select className="form-control" value={form.modulo_link} onChange={e => setForm(f => ({ ...f, modulo_link: e.target.value }))}>
            <option value="">— Ninguno —</option>
            <option value="/produccion">Registro de Producción</option>
            <option value="/ordenes">Órdenes de Producción</option>
            <option value="/inventario">Inventario MP</option>
            <option value="/nomina">Asistencia & Nómina</option>
            <option value="/costos">Calculadora de Costos / Fichas</option>
          </select>
        </div>
        <div className="form-group">
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={form.vigente} onChange={e => setForm(f => ({ ...f, vigente: e.target.checked }))} /> Documento vigente
          </label>
        </div>
        <div className="form-group">
          <label className="form-label">{editId ? 'Reemplazar archivo (sube una nueva versión)' : 'Archivo (Word, Excel, PDF…)'}</label>
          <input type="file" ref={fileRef} onChange={e => setFile(e.target.files[0] || null)} />
          {file && <div style={{ fontSize: '0.8rem', color: 'var(--selva)', marginTop: 4 }}>📎 {file.name}</div>}
          {editId && <small style={{ color: 'var(--texto-suave)' }}>Si subes un archivo, la versión anterior se guarda en el historial.</small>}
        </div>
      </Modal>

      {/* Modal versiones */}
      <Modal open={!!verVers} onClose={() => setVerVers(null)} title={`🕑 Versiones — ${verVers?.codigo || verVers?.nombre || ''}`}>
        {versiones.length === 0
          ? <p className="empty-table">No hay versiones anteriores archivadas.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Versión</th><th>Archivo</th><th>Reemplazado por</th><th>Fecha</th><th></th></tr></thead>
              <tbody>
                {versiones.map(v => (
                  <tr key={v.id}>
                    <td>v{v.version}</td>
                    <td>{v.archivo_nombre || '—'}</td>
                    <td>{v.creado_por || '—'}</td>
                    <td>{fFecha(v.created_at)}</td>
                    <td>{v.storage_path && <button className="btn btn-xs btn-secondary" onClick={() => descargarVersion(v)}>⬇</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>}
      </Modal>
    </div>
  )
}

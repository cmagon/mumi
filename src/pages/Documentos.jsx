import { useState, useRef, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile } from '../lib/supabase'
import { fFecha } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm, usePrompt } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { puedeVer } from '../lib/permisos'
import { useReorder } from '../hooks/useReorder'
import JSZip from 'jszip'
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

// Solo los nombres de los procesos (grupos), sin documentos — el contenido lo personaliza cada empresa
const PROCESOS_BASE = [...new Set(CATALOGO_BASE.map(c => c.proceso))]

export default function Documentos() {
  const toast = useToast()
  const confirmar = useConfirm()
  const pedir = usePrompt()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const esAdmin = profile?.rol === 'admin'
  // Usuarios con acceso al módulo pueden crear carpetas/subcarpetas (no editar config ni documentos)
  const puedeEditarDocs = esAdmin || puedeVer(profile?.rol, 'documentos')
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
  const [vista, setVista] = useState('carpetas')   // 'carpetas' | 'grupos' | 'lista'
  const [compartir, setCompartir] = useState(null)   // documento a compartir
  const [expHoras, setExpHoras] = useState(168)      // vigencia del enlace (horas) — 7 días
  const [enlace, setEnlace] = useState('')           // enlace temporal generado
  const [genEnlace, setGenEnlace] = useState(false)
  const [zipProc, setZipProc] = useState('')         // proceso en descarga ZIP
  const [compartirGrupo, setCompartirGrupo] = useState(null)   // { titulo, docs } a compartir
  const [enlaceGrupoLink, setEnlaceGrupoLink] = useState('')   // enlace único a la vista pública
  const [genGrupo, setGenGrupo] = useState(false)
  const [tokenGrupo, setTokenGrupo] = useState('')             // token del enlace generado
  const [mostrarCorreo, setMostrarCorreo] = useState(false)    // mostrar campo de correo al compartir
  const [emailInvitado, setEmailInvitado] = useState('')
  const [permisoEdicion, setPermisoEdicion] = useState(false)
  const [ruta, setRuta] = useState('')   // ruta actual en la navegación de carpetas ('' = raíz)
  const [editandoProceso, setEditandoProceso] = useState(null) // proceso en edición inline (doble clic)
  const [nombreTmp, setNombreTmp] = useState('')

  const { data: documentos = [] } = useQuery({
    queryKey: ['documentos'],
    queryFn: async () => {
      const { data } = await supabase.from('documentos').select('*').is('eliminado_at', null).order('proceso').order('codigo')
      return data || []
    },
  })

  // Papelera: documentos con borrado suave (recuperables hasta 90 días)
  const [modalPapelera, setModalPapelera] = useState(false)
  const { data: papelera = [] } = useQuery({
    queryKey: ['documentos_papelera'],
    queryFn: async () => {
      const { data } = await supabase.from('documentos').select('*').not('eliminado_at', 'is', null).order('eliminado_at', { ascending: false })
      return data || []
    },
  })
  const diasEnPapelera = (d) => Math.floor((Date.now() - new Date(d.eliminado_at).getTime()) / 86400000)
  // Purga automática de los que superan 90 días (definitivo)
  useEffect(() => {
    if (!esAdmin || !papelera.length) return
    const vencidos = papelera.filter(d => diasEnPapelera(d) >= 90)
    if (!vencidos.length) return
    ;(async () => {
      for (const d of vencidos) {
        if (d.storage_path) await supabase.storage.from(BUCKET).remove([d.storage_path]).catch(() => {})
        await supabase.from('documentos').delete().eq('id', d.id)
      }
      qc.invalidateQueries({ queryKey: ['documentos_papelera'] })
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papelera, esAdmin])

  const restaurar = useMutation({
    mutationFn: async (d) => { const { error } = await supabase.from('documentos').update({ eliminado_at: null }).eq('id', d.id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documentos'] }); qc.invalidateQueries({ queryKey: ['documentos_papelera'] }); toast('Documento restaurado ✓') },
    onError: (e) => toast(e.message, 'error'),
  })
  const eliminarDefinitivo = useMutation({
    mutationFn: async (d) => {
      if (d.storage_path) await supabase.storage.from(BUCKET).remove([d.storage_path]).catch(() => {})
      const { error } = await supabase.from('documentos').delete().eq('id', d.id); if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documentos_papelera'] }); toast('Eliminado definitivamente') },
    onError: (e) => toast(e.message, 'error'),
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

  // Orden personalizado de los procesos (arrastrar y soltar), persistido en app_settings (id=2)
  const { data: ordenGuardado } = useQuery({
    queryKey: ['doc_orden_procesos'],
    queryFn: async () => { const { data } = await supabase.from('app_settings').select('data').eq('id', 2).maybeSingle(); return Array.isArray(data?.data?.orden) ? data.data.orden : [] },
  })
  const [ordenProcesos, setOrdenProcesos] = useState([])
  useEffect(() => {
    // Conserva TODAS las carpetas guardadas (con o sin documentos) en la posición del usuario,
    // agrega al final los procesos que tengan documentos y aún no estén, y "Sin proceso" solo si aplica.
    const guardado = ordenGuardado || []
    const haySinProceso = documentos.some(d => !d.proceso)
    const merged = guardado.filter(p => p !== 'Sin proceso' || haySinProceso)
    procesos.forEach(p => { if (!merged.includes(p)) merged.push(p) })
    if (haySinProceso && !merged.includes('Sin proceso')) merged.push('Sin proceso')
    setOrdenProcesos(merged)
  }, [ordenGuardado, procesos, documentos])

  const persistirOrden = async (arr) => {
    // Optimista: refleja el nuevo orden de inmediato en la caché (evita que algo "salte" mientras llega el servidor)
    qc.setQueryData(['doc_orden_procesos'], arr)
    try { await supabase.from('app_settings').upsert({ id: 2, data: { orden: arr }, updated_at: new Date().toISOString() }, { onConflict: 'id' }) }
    catch (e) { toast('No se pudo guardar el orden: ' + e.message, 'error'); qc.invalidateQueries({ queryKey: ['doc_orden_procesos'] }) }
  }
  // El arrastre reordena la lista mostrada en el nivel actual (ref) y reconstruye el orden global
  // por reemplazo de posiciones (sirve igual para la raíz que para subcarpetas).
  const listaReorderRef = useRef([])
  const ordReorder = useReorder((updater) => {
    const actual = listaReorderRef.current || []
    const next = typeof updater === 'function' ? updater(actual) : updater
    const set = new Set(actual); const queue = [...next]
    const nuevoOrden = ordenProcesos.map(p => set.has(p) ? queue.shift() : p)
    next.forEach(p => { if (!nuevoOrden.includes(p)) nuevoOrden.push(p) })
    setOrdenProcesos(nuevoOrden)
    persistirOrden(nuevoOrden)
  })

  const filtrados = documentos.filter(d =>
    (!filtroProceso || d.proceso === filtroProceso) &&
    (!filtroTipo || d.tipo === filtroTipo) &&
    (!buscar || `${d.codigo} ${d.nombre}`.toLowerCase().includes(buscar.toLowerCase()))
  )
  const hayFiltro = !!(filtroProceso || filtroTipo || buscar)
  // Documentos agrupados por proceso
  const gruposMap = useMemo(() => {
    const m = {}
    filtrados.forEach(d => { (m[d.proceso || 'Sin proceso'] ||= []).push(d) })
    return m
  }, [filtrados])
  // Procesos a mostrar (incluye grupos vacíos cuando no hay filtro) según el orden personalizado
  const procesosMostrados = useMemo(() => {
    const conDocs = Object.keys(gruposMap)
    const base = hayFiltro ? conDocs : [...new Set([...ordenProcesos, ...conDocs])]
    const idx = (p) => { const i = ordenProcesos.indexOf(p); return i < 0 ? 9999 : i }
    return base.sort((a, b) => idx(a) - idx(b) || a.localeCompare(b))
  }, [gruposMap, ordenProcesos, hayFiltro])
  const puedeReordenar = puedeEditarDocs && !hayFiltro && (vista === 'grupos' || vista === 'carpetas')

  // ---- Navegación por carpetas anidadas (modo rutas "Carpeta/Subcarpeta") ----
  const prefijo = ruta ? ruta + '/' : ''
  const rutasTodas = useMemo(() => [...new Set([...ordenProcesos, ...documentos.map(d => d.proceso).filter(Boolean)])], [ordenProcesos, documentos])
  const subcarpetas = useMemo(() => {
    const segs = []
    rutasTodas.forEach(p => {
      if (ruta && !p.startsWith(prefijo)) return
      const resto = ruta ? p.slice(prefijo.length) : p
      const seg = resto.split('/')[0]
      if (seg) { const full = prefijo + seg; if (!segs.includes(full)) segs.push(full) }
    })
    const idx = (p) => { const i = ordenProcesos.indexOf(p); return i < 0 ? 9999 : i }
    return segs.sort((a, b) => idx(a) - idx(b) || a.localeCompare(b))
  }, [rutasTodas, ruta, prefijo, ordenProcesos])
  const docsAqui = filtrados.filter(d => (d.proceso || '') === ruta)
  const docsSubtree = (path) => documentos.filter(d => { const pr = d.proceso || ''; return pr === path || pr.startsWith(path + '/') })
  const nombreSeg = (p) => p.split('/').pop()
  listaReorderRef.current = vista === 'carpetas' ? subcarpetas : procesosMostrados

  // Recordar la vista preferida del usuario (localStorage)
  useEffect(() => { const v = localStorage.getItem('mumi_docs_vista'); if (v) setVista(v) }, [])
  const cambiarVista = (v) => { setVista(v); localStorage.setItem('mumi_docs_vista', v) }

  // Eliminar un proceso vacío (sin documentos) de la configuración de orden
  const eliminarProcesoVacio = async (proceso) => {
    if (documentos.some(d => (d.proceso || 'Sin proceso') === proceso)) {
      toast('No se puede eliminar: el proceso tiene documentos. Muévelos o elimínalos primero.', 'warning'); return
    }
    if (!await confirmar(`¿Eliminar el proceso vacío "${proceso}"?`, { title: 'Eliminar proceso' })) return
    const nuevoOrden = ordenProcesos.filter(p => p !== proceso)
    await persistirOrden(nuevoOrden); setOrdenProcesos(nuevoOrden)
    if (carpetaAbierta === proceso) setCarpetaAbierta(null)
    toast('Proceso eliminado')
  }

  // Renombrar un proceso: actualiza los documentos y el orden guardado
  const aplicarRenombre = async (viejo, nuevo) => {
    const n = (nuevo || '').trim().replace(/^\/+|\/+$/g, ''); if (!n || n === viejo) return
    // Renombra el segmento manteniendo el padre, y arrastra todas las subrutas
    const padre = viejo.includes('/') ? viejo.slice(0, viejo.lastIndexOf('/')) : ''
    const destino = padre ? `${padre}/${n.split('/').pop()}` : n.split('/').pop()
    const remap = (p) => p === viejo ? destino : (p.startsWith(viejo + '/') ? destino + p.slice(viejo.length) : p)
    try {
      const nuevoOrden = ordenProcesos.map(remap)
      setOrdenProcesos(nuevoOrden)
      await persistirOrden(nuevoOrden)
      qc.setQueryData(['documentos'], prev => (prev || []).map(d => ({ ...d, proceso: remap(d.proceso || '') })))
      if (ruta === viejo || ruta.startsWith(viejo + '/')) setRuta(remap(ruta))
      // BD: actualizar el documento exacto y los de subrutas
      const afectados = documentos.filter(d => { const pr = d.proceso || ''; return pr === viejo || pr.startsWith(viejo + '/') })
      for (const d of afectados) { const { error } = await supabase.from('documentos').update({ proceso: remap(d.proceso || '') }).eq('id', d.id); if (error) throw error }
      toast('Carpeta renombrada ✓')
    } catch (e) { toast(e.message, 'error'); qc.invalidateQueries({ queryKey: ['documentos'] }) }
  }
  const renombrarProceso = async (viejo) => {
    const nuevo = await pedir('Nuevo nombre del proceso:', { defaultValue: viejo, title: 'Renombrar proceso' })
    if (nuevo == null) return
    await aplicarRenombre(viejo, nuevo)
  }

  const abrirNuevo = (procesoDefault = '') => { setForm({ ...EMPTY, proceso: procesoDefault }); setEditId(null); setFile(null); setModal(true) }
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

  // Abrir el modal para compartir un documento con enlace temporal de solo lectura
  const abrirCompartir = (d) => {
    if (!d.storage_path) { toast('Este documento aún no tiene archivo cargado', 'warning'); return }
    setCompartir(d); setEnlace(''); setExpHoras(168)
  }
  // Genera un enlace temporal (solo lectura) que expira en `expHoras`
  const generarEnlace = async () => {
    if (!compartir?.storage_path) return
    setGenEnlace(true)
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(compartir.storage_path, Math.round(expHoras * 3600))
      if (error) throw error
      setEnlace(data.signedUrl)
    } catch (e) { toast('No se pudo generar el enlace: ' + e.message, 'error') } finally { setGenEnlace(false) }
  }
  const copiarEnlace = async () => { try { await navigator.clipboard.writeText(enlace); toast('Enlace copiado ✓') } catch { toast('Copia manual el enlace', 'info') } }
  const enviarPorCorreo = () => {
    const venceTxt = expHoras >= 24 ? `${Math.round(expHoras / 24)} día(s)` : `${expHoras} hora(s)`
    const asunto = encodeURIComponent(`Documento compartido: ${compartir?.nombre || ''}`)
    const cuerpo = encodeURIComponent(`Hola,\n\nTe comparto el documento "${compartir?.nombre || ''}" (${compartir?.codigo || ''}) en modo solo lectura.\n\nEnlace (válido por ${venceTxt}):\n${enlace}\n\nSaludos.`)
    window.location.href = `mailto:?subject=${asunto}&body=${cuerpo}`
  }

  // Crear una nueva carpeta. Si `parent` viene, se crea como subcarpeta (ruta padre/nombre)
  const crearCarpeta = async (parent = '') => {
    const nombre = await pedir(parent ? `Nueva subcarpeta dentro de "${parent}":` : 'Nombre de la nueva carpeta:', { title: 'Nueva carpeta' })
    if (nombre == null) return
    const n = nombre.trim().replace(/\//g, '-'); if (!n) return
    const full = parent ? `${parent}/${n}` : n
    if (ordenProcesos.includes(full)) { toast('Ya existe una carpeta con ese nombre aquí', 'warning'); return }
    const nuevo = [...ordenProcesos, full]
    setOrdenProcesos(nuevo); await persistirOrden(nuevo)
    toast('Carpeta creada ✓')
  }
  // Eliminar carpeta solo si está vacía (sin documentos ni subcarpetas en su subárbol)
  const eliminarCarpeta = async (path) => {
    const tieneDocs = documentos.some(d => { const pr = d.proceso || ''; return pr === path || pr.startsWith(path + '/') })
    const tieneSub = ordenProcesos.some(p => p.startsWith(path + '/'))
    if (tieneDocs || tieneSub) { toast('No se puede eliminar: la carpeta tiene contenido. Vacíala primero.', 'warning'); return }
    if (!await confirmar(`¿Eliminar la carpeta vacía "${path}"?`, { title: 'Eliminar carpeta' })) return
    const nuevo = ordenProcesos.filter(p => p !== path)
    setOrdenProcesos(nuevo); await persistirOrden(nuevo)
    toast('Carpeta eliminada')
  }

  // Compartir: recibe `grupos` = [{ proceso, docs }] (una o varias carpetas, incluso vacías)
  const abrirCompartirGrupo = (titulo, grupos) => {
    if (!grupos.length) { toast('No hay carpetas para compartir', 'warning'); return }
    setCompartirGrupo({ titulo, grupos }); setEnlaceGrupoLink(''); setExpHoras(168)
    setTokenGrupo(''); setMostrarCorreo(false); setEmailInvitado(''); setPermisoEdicion(false)
  }
  // Atajos: compartir una sola carpeta, o compartir todas (estructura completa, con carpetas vacías)
  const compartirUnaCarpeta = (proceso, docs) => abrirCompartirGrupo(proceso, [{ proceso, docs: docs || [] }])
  const compartirTodo = () => abrirCompartirGrupo('Todos los documentos', procesosMostrados.map(p => ({ proceso: p, docs: gruposMap[p] || [] })))

  // Genera UN enlace a una vista pública de solo lectura con la estructura de carpetas
  const generarEnlacesGrupo = async () => {
    if (!compartirGrupo) return
    setGenGrupo(true)
    try {
      const grupos = []
      const docIds = []
      for (const g of compartirGrupo.grupos) {
        const items = []
        for (const d of (g.docs || [])) {
          if (!d.storage_path) continue
          const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, Math.round(expHoras * 3600))
          if (!error && data) { items.push({ id: d.id, nombre: d.nombre, codigo: d.codigo || '', descripcion: d.descripcion || '', url: data.signedUrl }); docIds.push(String(d.id)) }
        }
        grupos.push({ proceso: g.proceso, items })
      }
      const expira_at = new Date(Date.now() + expHoras * 3600 * 1000).toISOString()
      const { data: row, error } = await supabase.from('document_shares')
        .insert({ titulo: compartirGrupo.titulo, items: [], grupos, doc_ids: docIds, expira_at, creado_por: profile?.nombre || '' })
        .select('token').single()
      if (error) throw error
      setTokenGrupo(row.token)
      setEnlaceGrupoLink(`${window.location.origin}/compartido/${row.token}`)
    } catch (e) { toast('Error al compartir: ' + e.message, 'error') } finally { setGenGrupo(false) }
  }
  const copiarGrupo = async () => { try { await navigator.clipboard.writeText(enlaceGrupoLink); toast('Enlace copiado ✓') } catch { toast('Copia manual', 'info') } }
  // Enviar por correo: si se marcó edición, registra el correo invitado y el permiso en el enlace
  const enviarGrupoCorreo = async () => {
    const email = emailInvitado.trim().toLowerCase()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Escribe un correo válido', 'warning'); return }
    try {
      if (tokenGrupo) {
        await supabase.from('document_shares').update({
          email_invitado: email, permiso: permisoEdicion ? 'edicion' : 'lectura',
        }).eq('token', tokenGrupo)
      }
    } catch (e) { toast('No se pudo registrar el invitado: ' + e.message, 'error'); return }
    const venceTxt = expHoras >= 24 ? `${Math.round(expHoras / 24)} día(s)` : `${expHoras} hora(s)`
    const modoTxt = permisoEdicion
      ? `en modo EDICIÓN (deberás verificar tu identidad con un código enviado a ${email})`
      : 'en modo solo lectura'
    const titulo = compartirGrupo?.titulo || ''
    const asunto = `Documentos compartidos: ${titulo}`
    const textoPlano = `Hola,\n\nTe comparto la carpeta "${titulo}" ${modoTxt} (válida por ${venceTxt}):\n\n${enlaceGrupoLink}\n\nSaludos.`
    const html = `<p>Hola,</p><p>Te comparto la carpeta <strong>${titulo}</strong> ${modoTxt} (válida por ${venceTxt}).</p><p><a href="${enlaceGrupoLink}">Abrir documentos compartidos</a></p><p style="color:#888;font-size:12px">${enlaceGrupoLink}</p>`
    // 1) Intento de envío automático (Edge Function). 2) Si falla, abre la app de correo.
    try {
      const { error } = await supabase.functions.invoke('enviar-correo', { body: { to: email, subject: asunto, html } })
      if (error) throw error
      toast(`Correo enviado a ${email} ✓`)
      setMostrarCorreo(false)
    } catch {
      toast('Envío automático no disponible — abriendo tu app de correo', 'info')
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(textoPlano)}`
    }
  }

  // Descargar todos los documentos (con archivo) de un proceso en un ZIP
  const descargarZip = async (proceso, docs) => {
    const conArchivo = docs.filter(d => d.storage_path)
    if (!conArchivo.length) { toast('Este proceso no tiene archivos para descargar', 'warning'); return }
    setZipProc(proceso)
    try {
      const zip = new JSZip()
      for (const d of conArchivo) {
        const { data, error } = await supabase.storage.from(BUCKET).download(d.storage_path)
        if (error) continue
        const nombre = d.archivo_nombre || `${d.codigo || d.nombre}`
        zip.file(`${(d.codigo ? d.codigo + ' - ' : '')}${nombre}`, data)
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${proceso}.zip`
      document.body.appendChild(a); a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 300)
      toast('ZIP descargado ✓')
    } catch (e) { toast('Error al generar ZIP: ' + e.message, 'error') } finally { setZipProc('') }
  }

  const eliminar = useMutation({
    mutationFn: async (d) => {
      // Borrado suave → va a la papelera (recuperable hasta 90 días)
      const { error } = await supabase.from('documentos').update({ eliminado_at: new Date().toISOString() }).eq('id', d.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documentos'] }); qc.invalidateQueries({ queryKey: ['documentos_papelera'] }); toast('Documento enviado a la papelera') },
    onError: (e) => toast(e.message, 'error'),
  })

  // Carga SOLO la estructura de grupos (procesos), sin documentos. Cada empresa agrega los suyos.
  const sembrarGrupos = async () => {
    const ok = await confirmar(`Se cargará la estructura de ${PROCESOS_BASE.length} procesos (grupos) del Sistema Documental. Los documentos los agregas tú dentro de cada grupo. ¿Continuar?`, { title: 'Cargar grupos base' })
    if (!ok) return
    setSaving(true)
    try {
      const actuales = ordenProcesos.filter(p => p !== 'Sin proceso')
      const merged = [...actuales, ...PROCESOS_BASE.filter(p => !actuales.includes(p))]
      await persistirOrden(merged)
      setOrdenProcesos(merged)
      toast('Estructura de procesos cargada ✓ — ahora agrega tus documentos')
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  // Nombre del proceso editable con doble clic (solo admin)
  const tituloEditable = (proceso) => editandoProceso === proceso
    ? <input className="form-control" autoFocus value={nombreTmp} style={{ maxWidth: 320 }}
        onChange={e => setNombreTmp(e.target.value)}
        onClick={e => e.stopPropagation()}
        onBlur={() => { aplicarRenombre(proceso, nombreTmp); setEditandoProceso(null) }}
        onKeyDown={e => { if (e.key === 'Enter') { aplicarRenombre(proceso, nombreTmp); setEditandoProceso(null) } if (e.key === 'Escape') setEditandoProceso(null) }} />
    : <span
        onDoubleClick={(e) => { if (esAdmin && proceso !== 'Sin proceso') { e.stopPropagation(); setEditandoProceso(proceso); setNombreTmp(proceso) } }}
        title={esAdmin ? 'Doble clic para renombrar' : undefined}
        style={{ cursor: esAdmin && proceso !== 'Sin proceso' ? 'text' : 'default' }}>{proceso}</span>

  // Fila de un documento (reutilizable en vista por grupos y vista lista)
  const filaDoc = (d, conProceso) => (
    <tr key={d.id}>
      <td><strong>{d.codigo || '—'}</strong></td>
      <td>{d.nombre}{d.descripcion && <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>{d.descripcion}</div>}</td>
      {conProceso && <td style={{ fontSize: '0.8rem' }}>{d.proceso || '—'}</td>}
      <td><span className="badge badge-azul">{tipoLabel(d.tipo)}</span></td>
      <td className="td-number">v{d.version || '1'}</td>
      <td>{d.vigente !== false ? <span className="badge badge-verde">Vigente</span> : <span className="badge badge-dorado">Obsoleto</span>}</td>
      <td>
        {d.storage_path
          ? <button className="btn btn-xs btn-secondary" onClick={() => descargar(d)}>⬇ Descargar</button>
          : <span style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>Sin archivo</span>}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {d.storage_path && <button className="btn btn-xs btn-secondary" title="Compartir (enlace temporal de solo lectura)" onClick={() => abrirCompartir(d)}>🔗 Compartir</button>}{' '}
        {d.modulo_link && <button className="btn btn-xs btn-dorado" title="Abrir módulo digital" onClick={() => navigate(d.modulo_link)}>🔗 Módulo</button>}{' '}
        {esAdmin && <>
          <button className="btn btn-xs btn-secondary" onClick={() => abrirEditar(d)}>✏</button>{' '}
          <button className="btn btn-xs btn-secondary" title="Ver versiones anteriores" onClick={() => setVerVers(d)}>🕑</button>{' '}
          <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Eliminar "${d.nombre}"?`).then(ok => ok && eliminar.mutate(d))}>✕</button>
        </>}
      </td>
    </tr>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📁 Gestión Documental</h1>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className={`btn btn-sm ${vista === 'carpetas' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { cambiarVista('carpetas'); setCarpetaAbierta(null) }} title="Vista de carpetas">📁</button>
            <button className={`btn btn-sm ${vista === 'grupos' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => cambiarVista('grupos')} title="Vista por grupos">▦</button>
            <button className={`btn btn-sm ${vista === 'lista' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => cambiarVista('lista')} title="Vista de lista">☰</button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={compartirTodo} title="Compartir todas las carpetas">🔗 Compartir</button>
          {esAdmin && ordenProcesos.length === 0 && <button className="btn btn-secondary btn-sm" onClick={sembrarGrupos} disabled={saving}>📥 Cargar grupos base</button>}
          {puedeEditarDocs && vista !== 'carpetas' && <button className="btn btn-secondary btn-sm" onClick={() => crearCarpeta('')}>📁 Nueva carpeta</button>}
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={() => setModalPapelera(true)}>🗑 Papelera{papelera.length > 0 ? ` (${papelera.length})` : ''}</button>}
          {esAdmin && vista !== 'carpetas' && <button className="btn btn-primary btn-sm" onClick={() => abrirNuevo()}>+ Nuevo documento</button>}
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
      {puedeReordenar && procesosMostrados.length > 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginBottom: 10 }}>⠿ Arrastra las tarjetas por el asa para reordenar los procesos; la numeración se ajusta sola y se guarda para todos.</div>
      )}

      {documentos.length === 0 && ordenProcesos.length === 0
        ? <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--texto-suave)' }}>
            📁 Aún no hay nada. {esAdmin ? 'Usa "Cargar grupos base" para crear la estructura de procesos, o agrega un documento nuevo.' : 'El administrador aún no ha configurado los documentos.'}
          </div>
        : vista === 'carpetas'
        ? (
          <div>
            {/* Migas de pan + crear subcarpeta */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              <button className="btn btn-xs btn-secondary" onClick={() => setRuta('')}>🏠 Inicio</button>
              {ruta && ruta.split('/').map((seg, i, arr) => {
                const hasta = arr.slice(0, i + 1).join('/')
                return <span key={hasta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--texto-suave)' }}>/</span>
                  <button className="btn btn-xs btn-secondary" onClick={() => setRuta(hasta)}>{seg}</button>
                </span>
              })}
              {puedeEditarDocs && <button className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => crearCarpeta(ruta)}>📁 Nueva {ruta ? 'subcarpeta' : 'carpeta'}</button>}
              {esAdmin && <button className="btn btn-xs btn-primary" style={{ marginLeft: puedeEditarDocs ? 0 : 'auto' }} onClick={() => abrirNuevo(ruta)}>+ Nuevo documento{ruta ? ' aquí' : ''}</button>}
            </div>

            {/* Subcarpetas del nivel actual */}
            {subcarpetas.length > 0 && (
              <div className="docs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
                {subcarpetas.map((full, fi) => {
                  const sub = docsSubtree(full)
                  const conArchivo = sub.filter(d => d.storage_path)
                  const vacia = sub.length === 0 && !ordenProcesos.some(p => p.startsWith(full + '/'))
                  const nSub = ordenProcesos.filter(p => p.startsWith(full + '/')).length
                  return (
                    <div key={full} className={`card doc-folder ${puedeReordenar ? ordReorder.rowClassName(fi) : ''}`} style={{ cursor: 'pointer', textAlign: 'center', padding: 16, margin: 0, position: 'relative' }} onClick={() => setRuta(full)} {...(puedeReordenar ? ordReorder.rowProps(fi) : {})}>
                      {puedeReordenar && <span {...ordReorder.handleProps(fi)} onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 6, left: 8, cursor: 'grab', color: 'var(--texto-suave)' }}>⠿</span>}
                      <span style={{ position: 'absolute', top: 6, right: 10, fontWeight: 700, color: 'var(--dorado)', fontSize: '0.85rem' }}>{fi + 1}</span>
                      <div style={{ fontSize: '2.6rem', lineHeight: 1 }}>📁</div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: 6 }}>{nombreSeg(full)}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)', marginTop: 2 }}>{sub.length} doc{sub.length === 1 ? '' : 's'}{nSub > 0 ? ` · ${nSub} subcarpeta(s)` : ''}</div>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                        {conArchivo.length > 0 && <button className="btn btn-xs btn-secondary" title="Compartir carpeta (incluye subcarpetas)" onClick={() => compartirUnaCarpeta(full, sub)}>🔗</button>}
                        {conArchivo.length > 0 && <button className="btn btn-xs btn-secondary" title="Descargar ZIP" disabled={zipProc === full} onClick={() => descargarZip(full, sub)}>⬇</button>}
                        {puedeEditarDocs && <button className="btn btn-xs btn-secondary" title="Renombrar" onClick={() => renombrarProceso(full)}>✏</button>}
                        {puedeEditarDocs && vacia && <button className="btn btn-xs btn-danger" title="Eliminar carpeta vacía" onClick={() => eliminarCarpeta(full)}>🗑</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Documentos directamente en esta carpeta */}
            {(docsAqui.length > 0 || (ruta && subcarpetas.length === 0)) && (
              <div className="card">
                <div className="card-title">📄 Documentos {ruta && <>en {nombreSeg(ruta)}</>} <span className="badge badge-verde" style={{ marginLeft: 6 }}>{docsAqui.length}</span></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Código</th><th>Documento</th><th>Tipo</th><th>Versión</th><th>Estado</th><th>Archivo</th><th>Acciones</th></tr></thead>
                    <tbody>
                      {docsAqui.length === 0
                        ? <tr><td colSpan={7} className="empty-table">Sin documentos aquí. {esAdmin && 'Usa "+ Nuevo documento".'}</td></tr>
                        : docsAqui.map(d => filaDoc(d, false))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {subcarpetas.length === 0 && docsAqui.length === 0 && !ruta && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--texto-suave)' }}>📁 Aún no hay carpetas. {esAdmin && 'Crea una con "📁 Nueva carpeta".'}</div>
            )}
          </div>
        )
        : vista === 'lista'
        ? (
          <div className="card">
            <div className="card-title">📄 Todos los documentos <span className="badge badge-verde" style={{ marginLeft: 8 }}>{filtrados.length}</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Código</th><th>Documento</th><th>Proceso</th><th>Tipo</th><th>Versión</th><th>Estado</th><th>Archivo</th><th>Acciones</th></tr></thead>
                <tbody>
                  {filtrados.length === 0
                    ? <tr><td colSpan={8} className="empty-table">Sin documentos</td></tr>
                    : filtrados.map(d => filaDoc(d, true))}
                </tbody>
              </table>
            </div>
          </div>
        )
        : procesosMostrados.map((proceso, gi) => {
            const docs = gruposMap[proceso] || []
            return (
            <div className={`card ${puedeReordenar ? ordReorder.rowClassName(gi) : ''}`} key={proceso} style={{ marginBottom: 16 }} {...(puedeReordenar ? ordReorder.rowProps(gi) : {})}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {puedeReordenar && <span {...ordReorder.handleProps(gi)}>⠿</span>}
                <span style={{ color: 'var(--dorado)', fontWeight: 700 }}>{gi + 1}.</span>
                {tituloEditable(proceso)} <span className="badge badge-verde" style={{ marginLeft: 4 }}>{docs.length}</span>
                {docs.some(d => d.storage_path) && <button className="btn btn-xs btn-secondary" title="Compartir esta carpeta" style={{ marginLeft: 'auto' }} onClick={() => compartirUnaCarpeta(proceso, docs)}>🔗 Compartir</button>}
                {docs.some(d => d.storage_path) && <button className="btn btn-xs btn-secondary" title="Descargar todos en ZIP" disabled={zipProc === proceso} onClick={() => descargarZip(proceso, docs)}>{zipProc === proceso ? 'Generando…' : '⬇ ZIP'}</button>}
                {puedeEditarDocs && proceso !== 'Sin proceso' && <button className="btn btn-xs btn-secondary" title="Renombrar proceso" onClick={() => renombrarProceso(proceso)}>✏ Renombrar</button>}
                {puedeEditarDocs && docs.length === 0 && !documentos.some(d => (d.proceso || 'Sin proceso') === proceso) && <button className="btn btn-xs btn-danger" title="Eliminar proceso vacío" onClick={() => eliminarProcesoVacio(proceso)}>🗑</button>}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Código</th><th>Documento</th><th>Tipo</th><th>Versión</th><th>Estado</th><th>Archivo</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {docs.length === 0
                      ? <tr><td colSpan={7} className="empty-table">Sin documentos en este proceso. {esAdmin && 'Usa "+ Nuevo documento".'}</td></tr>
                      : docs.map(d => filaDoc(d, false))}
                  </tbody>
                </table>
              </div>
            </div>
          )})
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
          <div className="form-group"><label className="form-label">Carpeta / Grupo</label>
            <select className="form-control" value={form.proceso} onChange={async e => {
              if (e.target.value === '__nueva__') {
                const nombre = await pedir('Nombre de la nueva carpeta / grupo:', { title: 'Nueva carpeta' })
                const n = (nombre || '').trim(); if (!n) return
                if (!ordenProcesos.includes(n)) { const nuevo = [...ordenProcesos, n]; await persistirOrden(nuevo); setOrdenProcesos(nuevo) }
                setForm(f => ({ ...f, proceso: n }))
              } else setForm(f => ({ ...f, proceso: e.target.value }))
            }}>
              <option value="">— Selecciona carpeta/grupo —</option>
              {[...new Set([...ordenProcesos.filter(p => p !== 'Sin proceso'), ...(form.proceso ? [form.proceso] : [])])].map(p => <option key={p} value={p}>{p}</option>)}
              <option value="__nueva__">➕ Crear nueva carpeta…</option>
            </select>
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

      {/* Modal compartir (enlace temporal de solo lectura) */}
      <Modal open={!!compartir} onClose={() => setCompartir(null)} title={`🔗 Compartir — ${compartir?.nombre || ''}`}
        footer={<button className="btn btn-secondary" onClick={() => setCompartir(null)}>Cerrar</button>}>
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>
          Genera un <strong>enlace temporal de solo lectura</strong>. Quien lo reciba puede ver/descargar el archivo hasta que expire (no puede editarlo).
        </p>
        <div className="form-group">
          <label className="form-label">Vigencia del enlace</label>
          <select className="form-control" value={expHoras} onChange={e => { setExpHoras(parseInt(e.target.value)); setEnlace('') }}>
            <option value={1}>1 hora</option>
            <option value={24}>1 día</option>
            <option value={72}>3 días</option>
            <option value={168}>7 días</option>
            <option value={720}>30 días</option>
          </select>
        </div>
        {!enlace
          ? <button className="btn btn-primary" onClick={generarEnlace} disabled={genEnlace}>{genEnlace ? 'Generando…' : '🔗 Generar enlace'}</button>
          : (
            <>
              <div className="form-group">
                <label className="form-label">Enlace temporal</label>
                <input className="form-control" value={enlace} readOnly onClick={e => e.target.select()} style={{ fontSize: '0.78rem' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={copiarEnlace}>📋 Copiar</button>
                <button className="btn btn-primary" onClick={enviarPorCorreo}>✉ Enviar por correo</button>
                <button className="btn btn-secondary" onClick={() => setEnlace('')}>↻ Regenerar</button>
              </div>
              <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 8 }}>"Enviar por correo" abre tu app de correo con el enlace listo. El enlace es de solo lectura y expira automáticamente.</small>
            </>
          )}
      </Modal>

      {/* Modal papelera */}
      <Modal open={modalPapelera} onClose={() => setModalPapelera(false)} title="🗑 Papelera" size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={() => setModalPapelera(false)}>Cerrar</button>}>
        <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
          Los documentos eliminados se conservan aquí <strong>hasta 90 días</strong> y luego se borran definitivamente. Puedes <strong>restaurarlos</strong> antes de ese plazo.
        </div>
        {papelera.length === 0
          ? <p className="empty-table">La papelera está vacía.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Documento</th><th>Proceso</th><th>Eliminado</th><th>Días restantes</th><th>Acciones</th></tr></thead>
              <tbody>
                {papelera.map(d => {
                  const rest = 90 - diasEnPapelera(d)
                  return (
                    <tr key={d.id}>
                      <td><strong>{d.codigo ? d.codigo + ' — ' : ''}</strong>{d.nombre}</td>
                      <td style={{ fontSize: '0.8rem' }}>{d.proceso || '—'}</td>
                      <td style={{ fontSize: '0.8rem' }}>{fFecha(d.eliminado_at)}</td>
                      <td><span className={`badge ${rest <= 7 ? 'badge-rojo' : 'badge-dorado'}`}>{Math.max(0, rest)} día(s)</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-xs btn-success" onClick={() => restaurar.mutate(d)}>↩ Restaurar</button>{' '}
                        <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Eliminar definitivamente "${d.nombre}"? No se podrá recuperar.`, { title: 'Eliminar definitivo' }).then(ok => ok && eliminarDefinitivo.mutate(d))}>✕ Definitivo</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>}
      </Modal>

      {/* Modal compartir grupo/carpeta (enlaces temporales de solo lectura) */}
      <Modal open={!!compartirGrupo} onClose={() => setCompartirGrupo(null)} title={`🔗 Compartir — ${compartirGrupo?.titulo || ''}`}
        footer={<button className="btn btn-secondary" onClick={() => setCompartirGrupo(null)}>Cerrar</button>}>
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>
          Se generará <strong>un enlace de solo lectura</strong> a la(s) carpeta(s) ({compartirGrupo?.grupos?.length || 0} carpeta(s), {(compartirGrupo?.grupos || []).reduce((s, g) => s + (g.docs || []).filter(d => d.storage_path).length, 0)} archivo(s)). Quien lo reciba verá las carpetas y documentos hasta que expire.
        </p>
        <div className="form-group">
          <label className="form-label">Vigencia del enlace</label>
          <select className="form-control" value={expHoras} onChange={e => { setExpHoras(parseInt(e.target.value)); setEnlaceGrupoLink('') }}>
            <option value={1}>1 hora</option><option value={24}>1 día</option><option value={72}>3 días</option><option value={168}>7 días</option><option value={720}>30 días</option>
          </select>
        </div>
        {!enlaceGrupoLink
          ? <button className="btn btn-primary" onClick={generarEnlacesGrupo} disabled={genGrupo}>{genGrupo ? 'Generando…' : '🔗 Generar enlace de la carpeta'}</button>
          : (
            <>
              <div className="form-group">
                <label className="form-label">Enlace de la carpeta (vista de solo lectura)</label>
                <input className="form-control" value={enlaceGrupoLink} readOnly onClick={e => e.target.select()} style={{ fontSize: '0.78rem' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={copiarGrupo}>📋 Copiar</button>
                <button className="btn btn-primary" onClick={() => setMostrarCorreo(v => !v)}>✉ Enviar por correo</button>
                <button className="btn btn-secondary" onClick={() => { setEnlaceGrupoLink(''); setTokenGrupo(''); setMostrarCorreo(false) }}>↻ Regenerar</button>
              </div>
              {mostrarCorreo && (
                <div style={{ marginTop: 10, padding: 10, background: 'rgba(124,179,66,0.06)', borderRadius: 'var(--radio)' }}>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">Correo del invitado</label>
                    <input type="email" className="form-control" value={emailInvitado} onChange={e => setEmailInvitado(e.target.value)} placeholder="persona@correo.com" />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={permisoEdicion} onChange={e => setPermisoEdicion(e.target.checked)} />
                    ✏ Permitir edición (el invitado verifica su identidad con un código enviado a su correo)
                  </label>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={enviarGrupoCorreo}>✉ Enviar a este correo</button>
                  <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 6 }}>
                    {permisoEdicion ? 'Solo ese correo podrá editar (tras ingresar el código). Otros correos solo verán.' : 'El invitado verá los documentos en solo lectura.'}
                  </small>
                </div>
              )}
              <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem', display: 'block', marginTop: 8 }}>Quien abra el enlace verá las carpetas y documentos hasta que expire. La edición solo aplica al correo invitado.</small>
            </>
          )}
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

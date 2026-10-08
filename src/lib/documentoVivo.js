// "Documento vivo": un documento de Gestión Documental cuyo ARCHIVO es la fuente de verdad que
// usa un módulo (p. ej. la plantilla PTZ-OR-01 de las Órdenes de Producción). Si el archivo se
// reemplaza en Gestión Documental, el módulo lo refleja; si se publica desde el módulo, queda
// en Gestión Documental (con historial de versiones). Es la misma lógica de reemplazo que usa
// la pantalla Documentos.
import { supabase, uploadFile } from './supabase'

export const BUCKET_DOCUMENTOS = 'documentos'
export const COD_ORDEN = 'PTZ-OR-01'

// Datos con los que se crea el documento si todavía no existe en el catálogo
const ALTA = {
  [COD_ORDEN]: { codigo: COD_ORDEN, nombre: 'Orden de producción', tipo: 'formato', proceso: '15. Trazabilidad', modulo_link: '/ordenes', version: '1', vigente: true },
}

export async function obtenerDocumentoVivo(codigo) {
  const { data } = await supabase.from('documentos')
    .select('id, codigo, nombre, version, storage_path, storage_url, archivo_nombre, updated_at, created_at')
    .is('eliminado_at', null).eq('codigo', codigo).order('updated_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
  return data || null
}

// ¿El documento tiene un archivo .xlsx utilizable como plantilla?
export const esArchivoExcel = (doc) => !!doc?.storage_url && /\.xlsx$/i.test(doc.archivo_nombre || doc.storage_path || doc.storage_url || '')

// Publica `file` como el archivo vigente del documento `codigo`.
// · Si el documento existe: archiva la versión anterior en documento_versiones y sube la nueva
//   (la versión numérica sube en 1).
// · Si no existe: lo crea en Gestión Documental.
export async function publicarArchivoDocumento({ codigo, file, creadoPor = '', nota = 'Reemplazado desde Órdenes de Producción' }) {
  const ext = (file.name.split('.').pop() || 'xlsx').toLowerCase()
  const storage_path = `docs/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
  const storage_url = await uploadFile(BUCKET_DOCUMENTOS, storage_path, file)
  const archivo_nombre = file.name

  const prev = await obtenerDocumentoVivo(codigo)
  if (prev) {
    if (prev.storage_path) {
      await supabase.from('documento_versiones').insert({
        documento_id: prev.id, version: prev.version, storage_path: prev.storage_path,
        storage_url: prev.storage_url, archivo_nombre: prev.archivo_nombre, nota, creado_por: creadoPor,
      })
    }
    const sig = /^\d+$/.test(String(prev.version || '').trim()) ? String(parseInt(prev.version, 10) + 1) : prev.version
    const { error } = await supabase.from('documentos')
      .update({ storage_path, storage_url, archivo_nombre, version: sig, updated_at: new Date().toISOString() }).eq('id', prev.id)
    if (error) throw error
    return { ...prev, storage_path, storage_url, archivo_nombre, version: sig }
  }
  const alta = ALTA[codigo]
  if (!alta) throw new Error(`No se conoce el documento ${codigo}.`)
  const { data, error } = await supabase.from('documentos')
    .insert({ ...alta, storage_path, storage_url, archivo_nombre, creado_por: creadoPor }).select().single()
  if (error) throw error
  return data
}

// "Documento vivo": un documento de Gestión Documental cuyo ARCHIVO es la fuente de verdad que
// usa un módulo (p. ej. la plantilla PTZ-OR-01 de las Órdenes de Producción). Si el archivo se
// reemplaza en Gestión Documental, el módulo lo refleja; si se publica desde el módulo, queda
// en Gestión Documental (con historial de versiones). Es la misma lógica de reemplazo que usa
// la pantalla Documentos.
import { supabase, uploadFile } from './supabase'

export const BUCKET_DOCUMENTOS = 'documentos'
export const COD_ORDEN = 'PTZ-OR-01'

// ── Plantillas por ámbito ──────────────────────────────────────────────────────
// La orden usa, en este orden: la plantilla de su CATEGORÍA (galleta, bocadillo, aromática…),
// la de PRODUCTO INTERNO si lo es, la GENERAL (PTZ-OR-01) y, si no hay ninguna, el diseño original.
// Cada variante es un documento propio en Gestión Documental con código PTZ-OR-01-<CATEGORÍA>
// (sin tablas nuevas: el código se deriva del nombre de la categoría).
export const AMBITO_INTERNO = '@interno'
export const slugCategoria = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
// ámbito: '' = general · '@interno' · nombre de categoría
export const codigoAmbito = (ambito) => !ambito ? COD_ORDEN : `${COD_ORDEN}-${ambito === AMBITO_INTERNO ? 'INTERNO' : slugCategoria(ambito)}`
export const etiquetaAmbito = (ambito) => !ambito ? 'General (todos los productos)' : ambito === AMBITO_INTERNO ? 'Producto interno' : `Categoría: ${ambito}`
// Ámbitos que se prueban para una orden, en orden de prioridad
export const ambitosCandidatos = ({ esSubproducto = false, categorias = [], tipo = '' } = {}) => {
  const out = []
  if (esSubproducto) out.push(AMBITO_INTERNO)
  for (const c of categorias) if (c) out.push(c)
  if (tipo && !['final', 'subproducto', 'mp', 'otro'].includes(tipo)) out.push(tipo)   // `tipo` legado = categoría
  out.push('')
  return [...new Set(out)]
}

// Datos con los que se crea el documento si todavía no existe en el catálogo
const ALTA = {
  [COD_ORDEN]: { codigo: COD_ORDEN, nombre: 'Orden de producción', tipo: 'formato', proceso: '15. Trazabilidad', modulo_link: '/ordenes', version: '1', vigente: true },
}

// Todas las plantillas de orden (general + variantes) vigentes en Gestión Documental
export async function obtenerPlantillasOrden() {
  const { data } = await supabase.from('documentos')
    .select('id, codigo, nombre, version, storage_path, storage_url, archivo_nombre, updated_at, created_at')
    .is('eliminado_at', null).like('codigo', `${COD_ORDEN}%`)
  return data || []
}

// Quita (papelera) la plantilla de un ámbito: las órdenes vuelven a usar la siguiente en la cadena.
export async function quitarDocumento(codigo) {
  const { error } = await supabase.from('documentos').update({ eliminado_at: new Date().toISOString() }).is('eliminado_at', null).eq('codigo', codigo)
  if (error) throw error
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
export async function publicarArchivoDocumento({ codigo, file, creadoPor = '', nota = 'Reemplazado desde Órdenes de Producción', nombre = '' }) {
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
  const alta = ALTA[codigo] || (codigo.startsWith(COD_ORDEN + '-')
    ? { ...ALTA[COD_ORDEN], codigo, nombre: nombre || `Orden de producción — ${codigo.slice(COD_ORDEN.length + 1)}` }
    : null)
  if (!alta) throw new Error(`No se conoce el documento ${codigo}.`)
  const { data, error } = await supabase.from('documentos')
    .insert({ ...alta, storage_path, storage_url, archivo_nombre, creado_por: creadoPor }).select().single()
  if (error) throw error
  return data
}

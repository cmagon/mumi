// Exportación de la base de datos (datos + esquema) y de los archivos de Storage.
//
// Recibe un «adaptador» para poder probarse sin red:
//   api.rpc(nombre, args)                     → { data, error }      (funciones v184 de Supabase)
//   api.descargar(bucket, nombre)             → Blob | Uint8Array    (Storage)
// En la app se crea con crearApi(supabase).
import JSZip from 'jszip'
import { generarEsquemaSql, limpiarFilaSensible } from './esquema'
import { generarLeeme } from './leeme'

export const VERSION_RESPALDO = 1

export const crearApi = (supabase) => ({
  rpc: (fn, args) => supabase.rpc(fn, args),
  descargar: async (bucket, nombre) => {
    const { data, error } = await supabase.storage.from(bucket).download(nombre)
    if (!error && data) return data
    // Bucket público: se intenta por su URL pública
    const { data: u } = supabase.storage.from(bucket).getPublicUrl(nombre)
    const r = await fetch(u.publicUrl)
    if (!r.ok) throw new Error(error?.message || `No se pudo descargar ${nombre}`)
    return await r.blob()
  },
  subir: async (bucket, nombre, contenido, tipo) => {
    const { error } = await supabase.storage.from(bucket).upload(nombre, contenido, { upsert: true, ...(tipo ? { contentType: tipo } : {}) })
    if (error) throw error
  },
})

const revisar = (cancelado) => { if (cancelado && cancelado()) throw new Error('Cancelado por el usuario') }
const llamar = async (api, fn, args) => {
  const { data, error } = await api.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message || error}`)
  return data
}

// ───────────────────────── Datos + esquema ─────────────────────────
export async function exportarDatos({ api, origenUrl = '', excluir = [], pagina = 500, onProgreso = () => {}, cancelado, salida = 'blob' } = {}) {
  onProgreso({ fase: 'catalogo', mensaje: 'Leyendo la estructura de la base…' })
  const cat = await llamar(api, 'respaldo_catalogo')
  const tablas = (cat.tablas || []).map(t => t.nombre).filter(n => !excluir.includes(n))
  const zip = new JSZip()
  const conteo = {}, advertencias = []
  const generado = new Date().toISOString()

  // Esquema
  const { completo, partes } = generarEsquemaSql(cat, { origen: origenUrl })
  zip.file('esquema/esquema_completo.sql', completo)
  for (const p of partes) zip.file(`esquema/${p.n}_${p.nombre}.sql`, p.sql)
  zip.file('catalogo.json', JSON.stringify(cat))

  // Datos, una tabla por archivo
  let hechas = 0
  for (const t of tablas) {
    revisar(cancelado)
    const esperadas = Number(cat.filas?.[t] ?? 0)
    const filas = []
    for (let desde = 0; ; desde += pagina) {
      revisar(cancelado)
      const lote = await llamar(api, 'respaldo_leer', { p_tabla: t, p_desde: desde, p_limite: pagina })
      for (const f of lote) filas.push(limpiarFilaSensible(t, f))
      onProgreso({ fase: 'datos', tabla: t, hechas, total: tablas.length, filas: filas.length, esperadas })
      if (lote.length < pagina) break
    }
    if (filas.length !== esperadas) advertencias.push(`La tabla ${t} tenía ${esperadas} filas al empezar y se exportaron ${filas.length} (hubo cambios durante la exportación). Repite el respaldo en un momento sin uso si necesitas exactitud.`)
    zip.file(`datos/${t}.json`, JSON.stringify(filas))
    conteo[t] = filas.length
    hechas += 1
  }

  const manifest = {
    tipo: 'datos', version: VERSION_RESPALDO, generado, origen: origenUrl,
    servidor: cat.servidor, tablas: conteo, excluidas: excluir,
    buckets: (cat.buckets || []).map(b => ({ id: b.id, publico: b.publico })),
    nota: 'alegra_config.token se exporta vacío a propósito.',
    advertencias,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('LEEME.md', generarLeeme({ origenUrl, generado, tablas: conteo, excluidas: excluir, advertencias }))

  onProgreso({ fase: 'comprimir', mensaje: 'Comprimiendo el archivo…' })
  const blob = await zip.generateAsync({ type: salida, compression: 'DEFLATE', compressionOptions: { level: 6 } },
    m => onProgreso({ fase: 'comprimir', mensaje: `Comprimiendo… ${Math.round(m.percent)}%`, porcentaje: m.percent }))
  return { blob, manifest, nombre: `mumi-respaldo-datos-${generado.slice(0, 10)}.zip` }
}

// ───────────────────────── Archivos de Storage ─────────────────────────
// Parte el bucket en varios ZIP (≈ maxBytesParte cada uno) para no agotar la memoria del navegador.
export async function exportarArchivos({ api, bucket, origenUrl = '', maxBytesParte = 250 * 1024 * 1024, onParte, onProgreso = () => {}, cancelado } = {}) {
  const lista = []
  for (let desde = 0; ; desde += 1000) {
    const lote = await llamar(api, 'respaldo_archivos', { p_bucket: bucket, p_desde: desde, p_limite: 1000 })
    lista.push(...lote)
    if (lote.length < 1000) break
  }
  const generado = new Date().toISOString()
  const fallidos = []
  let zip = new JSZip(), tam = 0, enParte = [], numero = 1, totalSubidos = 0

  const cerrar = async () => {
    if (!enParte.length) return
    zip.file('manifest.json', JSON.stringify({ tipo: 'archivos', version: VERSION_RESPALDO, generado, origen: origenUrl, bucket, parte: numero, archivos: enParte }, null, 2))
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })   // imágenes/PDF ya vienen comprimidos
    await onParte({ blob, nombre: `mumi-respaldo-archivos-${bucket}-parte${numero}-${generado.slice(0, 10)}.zip`, archivos: enParte.length })
    numero += 1; zip = new JSZip(); tam = 0; enParte = []
  }

  let i = 0
  for (const a of lista) {
    revisar(cancelado)
    i += 1
    onProgreso({ fase: 'archivos', bucket, hechas: i - 1, total: lista.length, nombre: a.nombre })
    try {
      const contenido = await api.descargar(bucket, a.nombre)
      zip.file(`archivos/${bucket}/${a.nombre}`, contenido, { binary: true })
      enParte.push({ nombre: a.nombre, tamano: a.tamano ?? null, tipo: a.tipo ?? null })
      tam += Number(a.tamano) || contenido.size || contenido.length || 0
      totalSubidos += 1
    } catch (e) { fallidos.push(`${a.nombre}: ${e.message || e}`) }
    if (tam >= maxBytesParte) await cerrar()
  }
  await cerrar()
  return { total: lista.length, exportados: totalSubidos, fallidos, partes: numero - 1 }
}

export const descargarArchivoNavegador = (blob, nombre) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

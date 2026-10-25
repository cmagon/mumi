// Importación de un respaldo (ZIP de datos y/o de archivos) en el proyecto ACTUAL.
// Misma convención de adaptador que exportar.js: api.rpc / api.subir.
import JSZip from 'jszip'
import { ordenarTablasPorFk, reemplazarUrls, trocearFilas, TABLAS_DE_USUARIOS } from './esquema'

const revisar = (cancelado) => { if (cancelado && cancelado()) throw new Error('Cancelado por el usuario') }
const llamar = async (api, fn, args) => {
  const { data, error } = await api.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message || error}`)
  return data
}

// Abre un ZIP de respaldo y lo describe (sin importar nada todavía)
export async function leerPaquete(archivo) {
  const zip = await JSZip.loadAsync(archivo)
  const f = zip.file('manifest.json')
  if (!f) throw new Error('El archivo no es un respaldo de Mumi (falta manifest.json).')
  const manifest = JSON.parse(await f.async('string'))
  if (!['datos', 'archivos'].includes(manifest.tipo)) throw new Error('Tipo de respaldo desconocido.')
  return { zip, manifest }
}

// ───────────────────────── Datos ─────────────────────────
export async function importarDatos({
  api, zip, manifest, destinoUrl = '', modo = 'omitir', incluirUsuarios = false,
  onProgreso = () => {}, cancelado,
} = {}) {
  if (manifest.tipo !== 'datos') throw new Error('Este ZIP no contiene datos.')
  const cat = await llamar(api, 'respaldo_catalogo')   // estructura del DESTINO
  const enDestino = new Set((cat.tablas || []).map(t => t.nombre))
  const delArchivo = Object.keys(manifest.tablas || {})
  const resumen = { tablas: {}, sinTabla: [], omitidasPorUsuario: [], erroresMensajes: [] }

  const aImportar = ordenarTablasPorFk(cat).filter(t => delArchivo.includes(t))
  for (const t of delArchivo) if (!enDestino.has(t)) resumen.sinTabla.push(t)
  const filtradas = aImportar.filter(t => {
    if (!incluirUsuarios && TABLAS_DE_USUARIOS.has(t)) { resumen.omitidasPorUsuario.push(t); return false }
    return true
  })

  const urlVieja = (manifest.origen || '').replace(/\/+$/, '')
  const urlNueva = (destinoUrl || '').replace(/\/+$/, '')

  const subir = async (t, filas) => {
    const acum = { recibidas: 0, insertadas: 0, omitidas: 0, errores: 0 }
    for (const bloque of trocearFilas(filas)) {
      revisar(cancelado)
      const r = await llamar(api, 'respaldo_importar', { p_tabla: t, p_filas: bloque, p_modo: modo })
      acum.recibidas += r.recibidas; acum.insertadas += r.insertadas; acum.omitidas += r.omitidas; acum.errores += r.errores
      for (const m of r.mensajes || []) if (resumen.erroresMensajes.length < 20) resumen.erroresMensajes.push(`${t}: ${m}`)
    }
    return acum
  }
  const leerFilas = async (t) => {
    const f = zip.file(`datos/${t}.json`)
    if (!f) return []
    const texto = reemplazarUrls(await f.async('string'), urlVieja, urlNueva)   // las URLs de Storage pasan al proyecto nuevo
    return JSON.parse(texto)
  }

  let hechas = 0
  for (const t of filtradas) {
    revisar(cancelado)
    const filas = await leerFilas(t)
    onProgreso({ fase: 'datos', tabla: t, hechas, total: filtradas.length, filas: filas.length })
    resumen.tablas[t] = filas.length ? await subir(t, filas) : { recibidas: 0, insertadas: 0, omitidas: 0, errores: 0 }
    hechas += 1
  }

  // Segunda pasada: lo que falló por dependencias circulares se reintenta ya con todo lo demás cargado
  for (const t of filtradas.filter(x => resumen.tablas[x]?.errores > 0)) {
    revisar(cancelado)
    onProgreso({ fase: 'reintento', tabla: t, hechas, total: filtradas.length })
    const filas = await leerFilas(t)
    const previo = resumen.tablas[t]
    const r2 = await subir(t, filas)
    resumen.tablas[t] = { recibidas: previo.recibidas, insertadas: previo.insertadas + r2.insertadas, omitidas: r2.omitidas, errores: r2.errores }
  }

  onProgreso({ fase: 'secuencias', mensaje: 'Ajustando contadores…' })
  resumen.secuencias = await llamar(api, 'respaldo_ajustar_secuencias')
  return resumen
}

// ───────────────────────── Archivos de Storage ─────────────────────────
export async function importarArchivos({ api, zip, manifest, onProgreso = () => {}, cancelado } = {}) {
  if (manifest.tipo !== 'archivos') throw new Error('Este ZIP no contiene archivos de Storage.')
  const bucket = manifest.bucket
  const fallidos = []
  let ok = 0, i = 0
  for (const a of manifest.archivos || []) {
    revisar(cancelado)
    onProgreso({ fase: 'archivos', bucket, hechas: i, total: manifest.archivos.length, nombre: a.nombre })
    i += 1
    const f = zip.file(`archivos/${bucket}/${a.nombre}`)
    if (!f) { fallidos.push(`${a.nombre}: no está en el ZIP`); continue }
    try { await api.subir(bucket, a.nombre, await f.async('blob'), a.tipo || undefined); ok += 1 }
    catch (e) { fallidos.push(`${a.nombre}: ${e.message || e}`) }
  }
  return { bucket, total: (manifest.archivos || []).length, subidos: ok, fallidos }
}

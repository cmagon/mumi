// Importador masivo de documentos hacia el módulo Documentos (tabla `documentos` + Storage `documentos`).
//
// USO:
//   1) Prueba (no sube nada, solo muestra el mapeo):
//        node scripts/importarDocumentos.mjs
//   2) Subida real (requiere la SERVICE ROLE key de Supabase):
//        SUPABASE_URL=https://XXXX.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/importarDocumentos.mjs --upload
//
// Es IDEMPOTENTE: si ya existe un documento con el mismo `codigo` (no eliminado), lo omite
// (usa --reemplazar para actualizarlo). Carpetas POES/POS/FICHAS TECNICAS quedan como subcarpeta.
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, extname, basename, relative, sep } from 'node:path'

const RAIZ = 'docs'
const BUCKET = 'documentos'
const UPLOAD = process.argv.includes('--upload')
const REEMPLAZAR = process.argv.includes('--reemplazar')
const REVERTIR = process.argv.includes('--revertir')

// Nombre de proceso (carpeta del módulo) según la carpeta de primer nivel
const PROCESO_POR_NUM = {
  1: '01. Manual BPM', 2: '02. Limpieza y Desinfección', 3: '03. Control de Agua Potable',
  4: '04. Muestreo', 5: '05. Control de Plagas', 6: '06. Residuos Sólidos y Líquidos',
  7: '07. Higiene Personal', 8: '08. Capacitación', 9: '09. Producto No Conforme',
  10: '10. Liberación de Producto', 11: '11. Especificaciones de Producto',
  12: '12. Mantenimiento y Calibración', 13: '13. Recursos Humanos',
  14: '14. Compras y Proveedores', 15: '15. Trazabilidad',
  16: '16. Almacenamiento y Transporte', 17: '17. Acciones Correctivas y de Mejora (ACPM)',
}

function listarArchivos(dir) {
  const out = []
  for (const nombre of readdirSync(dir)) {
    if (nombre.startsWith('~$')) continue
    const full = join(dir, nombre)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...listarArchivos(full))
    else if (/\.(docx?|xlsx?|pdf)$/i.test(nombre)) out.push(full)
  }
  return out
}

function procesoDe(rel) {
  const partes = rel.split(sep)
  if (partes[0] === 'MANUAL BPM') return '01. Manual BPM'
  if (partes[0] === 'Gestión ambiental') {
    // Mantiene subcarpetas para no perder la estructura del entregable ambiental
    const sub = partes.slice(1, -1).join(' / ')
    return '18. Gestión Ambiental' + (sub ? ' / ' + sub : '')
  }
  if (partes[0] === 'SISTEMA DOCUMENTAL') {
    const carpeta = partes[1] || ''
    const m = carpeta.match(/^(\d+)\./)
    let base = m ? (PROCESO_POR_NUM[+m[1]] || carpeta) : 'Otros'
    // Subcarpeta (POES, POS, FICHAS TECNICAS, PMIRS, ENTREGABLES…)
    const sub = partes.slice(2, -1).join(' / ')
    return base + (sub ? ' / ' + sub : '')
  }
  return 'Otros'
}

const TIPO_SEG = { RG: 'registro', CR: 'cronograma', FM: 'formato', FTP: 'formato', SP: 'formato', LI: 'listado', MZ: 'matriz', POES: 'poes', POS: 'pos', OR: 'formato' }
const TIPO_PREFIJO = { M: 'manual', P: 'programa', PR: 'procedimiento', PT: 'protocolo', PG: 'programa' }

function parsearNombre(archivo) {
  const nom = basename(archivo, extname(archivo)).replace(/\s+/g, ' ').trim()
  // Código = token inicial tipo "L&D-POES-1", "PTZ-RG-03", "M-BPM-01", "PR-CEP-11"
  const m = nom.match(/^([A-ZÑ&]{1,5}(?:-[A-Z0-9&]+){1,3})\s+(.*)$/i)
  let codigo = '', titulo = nom
  if (m) { codigo = m[1].toUpperCase().replace(/\s+/g, ''); titulo = m[2].trim() }
  // Tipo por el segmento del código (RG, CR, FM, POES…) o por el prefijo (M, P, PR, PT)
  let tipo = 'documento'
  if (codigo) {
    const segs = codigo.split('-')
    const segTipo = segs.find(s => TIPO_SEG[s])
    if (segTipo) tipo = TIPO_SEG[segTipo]
    else if (TIPO_PREFIJO[segs[0]]) tipo = TIPO_PREFIJO[segs[0]]
  }
  return { codigo, nombre: titulo || nom, tipo }
}

const archivos = listarArchivos(RAIZ)
const filas = archivos.map(full => {
  const rel = relative(RAIZ, full)
  const { codigo, nombre, tipo } = parsearNombre(full)
  return { full, rel, proceso: procesoDe(rel), codigo, nombre, tipo, archivo_nombre: basename(full), ext: extname(full).slice(1).toLowerCase() }
})

// ---- Modo prueba: mostrar el mapeo y salir ----
if (!UPLOAD && !REVERTIR) {
  console.log(`\n${filas.length} archivos encontrados.\n`)
  const porProceso = {}
  for (const f of filas) (porProceso[f.proceso] ||= []).push(f)
  for (const proc of Object.keys(porProceso).sort()) {
    console.log(`\n=== ${proc} (${porProceso[proc].length}) ===`)
    for (const f of porProceso[proc]) console.log(`  [${f.tipo.padEnd(12)}] ${f.codigo ? f.codigo.padEnd(14) : '(sin código)'.padEnd(14)} ${f.nombre}`)
  }
  console.log(`\nModo PRUEBA. Para subir: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/importarDocumentos.mjs --upload\n`)
  process.exit(0)
}

// ---- Modo subida real ----
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.'); process.exit(1) }

const { createClient } = await import('@supabase/supabase-js')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ---- Modo REVERTIR: borra lo que este importador subió (por nombre de archivo + código) ----
if (REVERTIR) {
  let borrados = 0, sinCoincidencia = 0, errores = 0
  for (const f of filas) {
    try {
      let q = supabase.from('documentos').select('id, storage_path, codigo, nombre').eq('archivo_nombre', f.archivo_nombre)
      if (f.codigo) q = q.eq('codigo', f.codigo)
      const { data: filasBD, error } = await q
      if (error) throw error
      if (!filasBD || filasBD.length === 0) { sinCoincidencia++; continue }
      for (const row of filasBD) {
        if (row.storage_path) { const r = await supabase.storage.from(BUCKET).remove([row.storage_path]); if (r.error) console.error(`  aviso storage: ${r.error.message}`) }
        const del = await supabase.from('documentos').delete().eq('id', row.id)
        if (del.error) throw del.error
        console.log(`✗ borrado ${row.codigo || row.nombre}`)
        borrados++
      }
    } catch (e) { console.error(`! ${f.rel}: ${e.message || e}`); errores++ }
  }
  console.log(`\nRevertido. Borrados: ${borrados} · Sin coincidencia: ${sinCoincidencia} · Errores: ${errores}`)
  process.exit(0)
}

const CT = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' }
let subidos = 0, omitidos = 0, errores = 0
for (const f of filas) {
  try {
    // Idempotencia por código (si tiene)
    if (f.codigo) {
      const { data: ya } = await supabase.from('documentos').select('id').eq('codigo', f.codigo).is('eliminado_at', null).maybeSingle()
      if (ya && !REEMPLAZAR) { console.log(`· omitido (ya existe ${f.codigo})`); omitidos++; continue }
    }
    const path = `docs/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${f.ext}`
    const buf = readFileSync(f.full)
    const up = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: CT[f.ext] || 'application/octet-stream', upsert: true })
    if (up.error) throw up.error
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const registro = {
      codigo: f.codigo || null, nombre: f.nombre, proceso: f.proceso, tipo: f.tipo,
      version: '1', vigente: true, storage_path: path, storage_url: urlData.publicUrl, archivo_nombre: f.archivo_nombre,
    }
    let res
    if (f.codigo && REEMPLAZAR) res = await supabase.from('documentos').upsert(registro, { onConflict: 'codigo' })
    else res = await supabase.from('documentos').insert(registro)
    if (res.error) throw res.error
    console.log(`✓ ${f.codigo || f.nombre}`)
    subidos++
  } catch (e) { console.error(`✗ ${f.rel}: ${e.message || e}`); errores++ }
}
console.log(`\nListo. Subidos: ${subidos} · Omitidos: ${omitidos} · Errores: ${errores}`)

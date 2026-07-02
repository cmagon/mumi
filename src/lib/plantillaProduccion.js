// Plantilla de importación de REGISTROS DE PRODUCCIÓN históricos, con el mismo formato del
// PTZ-RG-03 (Control de Producción Diaria). Genera un Excel para llenar y un parser para leerlo.
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'

const VERDE = 'FF2D5A3D'
const VERDE2 = 'FF3D7A52'
const DORADO = 'FFC8A94A'
const CREMA = 'FFF5F0E8'
const borde = { top: { style: 'thin', color: { argb: 'FFBBBBBB' } }, left: { style: 'thin', color: { argb: 'FFBBBBBB' } }, bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } }, right: { style: 'thin', color: { argb: 'FFBBBBBB' } } }

// Columnas de la plantilla (orden fijo). Los encabezados se buscan por texto al importar,
// así que el usuario puede reordenar columnas mientras conserve los nombres.
export const COLUMNAS_PLANTILLA = [
  { key: 'fecha',        label: 'FECHA',              ancho: 14, tipo: 'fecha' },
  { key: 'lote',         label: 'LOTE',               ancho: 16, tipo: 'texto' },
  { key: 'vence',        label: 'FECHA VENCIMIENTO',  ancho: 16, tipo: 'fecha' },
  { key: 'producto',     label: 'PRODUCTO',           ancho: 30, tipo: 'texto' },
  { key: 'unidades',     label: 'UNIDADES',           ancho: 11, tipo: 'num' },
  { key: 'cajas',        label: 'CAJAS',              ancho: 10, tipo: 'num' },
  { key: 'inicio',       label: 'HORA INICIO',        ancho: 12, tipo: 'hora' },
  { key: 'fin',          label: 'HORA FINAL',         ancho: 12, tipo: 'hora' },
  { key: 'labor',        label: 'LABOR',              ancho: 16, tipo: 'texto' },
  { key: 'responsable',  label: 'RESPONSABLE',        ancho: 20, tipo: 'texto' },
  { key: 'obs',          label: 'OBSERVACIONES',      ancho: 30, tipo: 'texto' },
]

async function fetchLogoBase64(url) {
  try { const res = await fetch(url); const blob = await res.blob(); return await new Promise((ok) => { const r = new FileReader(); r.onloadend = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(blob) }) } catch { return null }
}

// Descarga la plantilla EXACTA. Usa la URL del documento vivo (sección Documentación) si se pasa;
// si no, cae al archivo empaquetado. Así, si el documento se actualiza allí, este botón lo refleja.
export async function descargarPlantillaProduccion(url) {
  const res = await fetch(url || PTZ_URL)
  if (!res.ok) throw new Error('No se encontró la plantilla original PTZ-RG-03.')
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'PTZ-RG-03 REGISTRO CONTROL PRODUCCIÓN DIARIA.xlsx'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// ---- Lectura de la plantilla ----
const norm = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/[ÁÀÂ]/g, 'A').replace(/[ÉÈÊ]/g, 'E').replace(/[ÍÌÎ]/g, 'I').replace(/[ÓÒÔ]/g, 'O').replace(/[ÚÙÛ]/g, 'U')

// Convierte un serial de Excel (días desde 1899-12-30) a Date UTC, sin efectos de zona horaria.
const serialAFecha = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000)

const toYMD = (v) => {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v)) { const y = v.getUTCFullYear(); const m = String(v.getUTCMonth() + 1).padStart(2, '0'); const d = String(v.getUTCDate()).padStart(2, '0'); return `${y}-${m}-${d}` }
  // Serial numérico de Excel (fecha almacenada como número).
  if (typeof v === 'number' && v > 59 && v < 200000) { const dt = serialAFecha(v); const y = dt.getUTCFullYear(); const m = String(dt.getUTCMonth() + 1).padStart(2, '0'); const d = String(dt.getUTCDate()).padStart(2, '0'); return `${y}-${m}-${d}` }
  const s = String(v).trim()
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)   // dd/mm/aaaa
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; return `${y}-${String(+mo).padStart(2, '0')}-${String(+d).padStart(2, '0')}` }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)                     // aaaa-mm-dd
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`
  return null
}

const toHM = (v) => {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v)) return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`
  if (typeof v === 'number') { const mins = Math.round(v * 24 * 60); const h = Math.floor(mins / 60) % 24; const mm = mins % 60; return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/)
  if (m) return `${String(+m[1]).padStart(2, '0')}:${m[2]}`
  return null
}

const toNum = (v) => { const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.')); return isNaN(n) ? 0 : n }

// Devuelve { filas: [...], errores: [...] } a partir del archivo Excel.
export async function leerPlantillaProduccion(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })   // seriales crudos: las fechas se convierten manualmente (sin desfase de zona horaria)
  const sh = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', blankrows: true })
  // Buscar la fila de encabezados (la que contenga FECHA y PRODUCTO)
  let hRow = -1
  for (let i = 0; i < matrix.length; i++) {
    const set = matrix[i].map(norm)
    if (set.includes('FECHA') && set.includes('PRODUCTO')) { hRow = i; break }
  }
  if (hRow < 0) return { filas: [], errores: ['No se encontró la fila de encabezados (debe incluir FECHA y PRODUCTO). ¿Usaste la plantilla?'] }
  // El archivo es el formato ORIGINAL PTZ-RG-03: las columnas están en posiciones fijas
  // (celdas fusionadas → el valor queda en la columna ancla del grupo).
  const idxPorNombre = (txt) => matrix[hRow].map(norm).findIndex(h => h === norm(txt))
  const COL = {
    fecha: 0, lote: 3, vence: 6, producto: 9, unidades: 17, cajas: 19,
    inicio: 21, fin: 24, labor: 27, responsable: 30, obs: 33,
  }
  // Si el encabezado real está corrido (otra versión), reajusta por nombre cuando se encuentre.
  const ajusta = (k, ...nombres) => { for (const n of nombres) { const j = idxPorNombre(n); if (j >= 0) { COL[k] = j; return } } }
  ajusta('fecha', 'FECHA'); ajusta('lote', 'LOTE'); ajusta('vence', 'FECHA DE VENCIMIENTO', 'FECHA VENCIMIENTO', 'VENCIMIENTO')
  ajusta('producto', 'PRODUCTO'); ajusta('labor', 'LABOR'); ajusta('responsable', 'RESPONSABLE'); ajusta('obs', 'OBSERVACIONES')
  // Sub-encabezado UNIDAD/CAJAS (fila siguiente al encabezado en el formato original)
  const sub = (matrix[hRow + 1] || []).map(norm)
  const jUnidad = sub.findIndex(h => h === 'UNIDAD' || h === 'UNIDADES'); if (jUnidad >= 0) COL.unidades = jUnidad
  const jCajas = sub.findIndex(h => h === 'CAJAS'); if (jCajas >= 0) COL.cajas = jCajas
  const dataIni = (sub.includes('UNIDAD') || sub.includes('UNIDADES') || sub.includes('CAJAS')) ? hRow + 2 : hRow + 1
  const filas = [], errores = []
  for (let i = dataIni; i < matrix.length; i++) {
    const row = matrix[i]
    const get = (k) => row[COL[k]]
    const producto = String(get('producto') || '').trim()
    const fecha = toYMD(get('fecha'))
    const unidades = toNum(get('unidades'))
    const cajas = toNum(get('cajas'))
    // salta filas totalmente vacías
    if (!producto && !fecha && !unidades && !cajas && !String(get('lote') || '').trim()) continue
    if (!producto) { errores.push(`Fila ${i + 1}: falta el PRODUCTO — se omite.`); continue }
    if (!fecha) { errores.push(`Fila ${i + 1}: fecha inválida o vacía — se omite.`); continue }
    filas.push({
      _fila: i + 1,
      producto,
      fecha,
      lote: String(get('lote') || '').trim(),
      vence: toYMD(get('vence')),
      unidades, cajas,
      inicio: toHM(get('inicio')),
      fin: toHM(get('fin')),
      labor: String(get('labor') || '').trim() || 'PRODUCCIÓN',
      responsable: String(get('responsable') || '').trim(),
      obs: String(get('obs') || '').trim(),
    })
  }
  return { filas, errores }
}

// ============================================================================
// EXPORTACIÓN de registros usando la MISMA plantilla original PTZ-RG-03.
// ============================================================================
const PTZ_URL = '/plantillas/PTZ-RG-03.xlsx'
const DATA_ROW_INI = 9        // primera fila de datos en el formato original
const DATA_ROW_FIN = 46       // última fila con formato preexistente
// Grupos de columnas fusionadas por celda (1-based) y columna ancla donde se escribe el valor
const GRUPOS = [
  { key: 'fecha',       anchor: 1,  span: [1, 3] },
  { key: 'lote',        anchor: 4,  span: [4, 6] },
  { key: 'vence',       anchor: 7,  span: [7, 9] },
  { key: 'producto',    anchor: 10, span: [10, 17] },
  { key: 'unidades',    anchor: 18, span: [18, 19] },
  { key: 'cajas',       anchor: 20, span: [20, 21] },
  { key: 'inicio',      anchor: 22, span: [22, 24] },
  { key: 'fin',         anchor: 25, span: [25, 27] },
  { key: 'labor',       anchor: 28, span: [28, 30] },
  { key: 'responsable', anchor: 31, span: [31, 33] },
  { key: 'obs',         anchor: 34, span: [34, 37] },
]
const fmtDMY = (ymd) => { if (!ymd) return ''; const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(ymd) }
const hm = (t) => { if (!t) return ''; const m = String(t).match(/^(\d{1,2}):(\d{2})/); return m ? `${String(+m[1]).padStart(2, '0')}:${m[2]}` : String(t) }
// Normaliza un registro de la BD a los campos de las columnas del formato
const aFila = (r) => {
  const empaque = String(r.empaque || 'UNIDADES').toUpperCase()
  const cant = parseFloat(r.cantidad) || 0
  return {
    fecha: fmtDMY(r.fecha), lote: r.lote || '', vence: fmtDMY(r.vence), producto: r.producto || '',
    unidades: empaque.includes('CAJA') ? '' : (cant || ''), cajas: empaque.includes('CAJA') ? (cant || '') : '',
    inicio: hm(r.inicio), fin: hm(r.fin), labor: r.labor || '', responsable: r.responsable || '', obs: r.obs || '',
  }
}

export async function exportarRegistrosExcelPTZ(registros = [], { templateUrl = '' } = {}) {
  const filas = registros.map(aFila)
  const wb = new ExcelJS.Workbook()
  const res = await fetch(templateUrl || PTZ_URL)
  if (!res.ok) throw new Error('No se encontró la plantilla original PTZ-RG-03.')
  await wb.xlsx.load(await res.arrayBuffer())
  const ws = wb.worksheets[0]
  const bordeFino = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

  filas.forEach((f, i) => {
    const row = DATA_ROW_INI + i
    // Si sobrepasan las filas preexistentes, replicar fusiones y bordes del formato
    if (row > DATA_ROW_FIN) {
      for (const g of GRUPOS) {
        try { ws.mergeCells(row, g.span[0], row, g.span[1]) } catch { /* ya fusionada */ }
        for (let c = g.span[0]; c <= g.span[1]; c++) ws.getCell(row, c).border = bordeFino
      }
      ws.getRow(row).height = 16
    }
    for (const g of GRUPOS) {
      const cell = ws.getCell(row, g.anchor)
      cell.value = f[g.key] === '' ? null : f[g.key]
      cell.alignment = { vertical: 'middle', horizontal: g.key === 'producto' || g.key === 'obs' ? 'left' : 'center', wrapText: true }
    }
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'PTZ-RG-03 REGISTRO CONTROL PRODUCCIÓN DIARIA.xlsx'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// PDF: mismo formato PTZ-RG-03, renderizado como HTML e impreso a PDF por el navegador.
export function exportarRegistrosPDFPTZ(registros = [], { empresa = 'Mumi Amazonia', logoUrl = '' } = {}) {
  const filas = registros.map(aFila)
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const filasHtml = filas.map(f => `<tr>
    <td>${esc(f.fecha)}</td><td>${esc(f.lote)}</td><td>${esc(f.vence)}</td><td class="l">${esc(f.producto)}</td>
    <td>${esc(f.unidades)}</td><td>${esc(f.cajas)}</td><td>${esc(f.inicio)}</td><td>${esc(f.fin)}</td>
    <td>${esc(f.labor)}</td><td>${esc(f.responsable)}</td><td class="l">${esc(f.obs)}</td></tr>`).join('')
  // completar hasta 20 filas vacías para conservar el aspecto del formato
  const vacias = Math.max(0, 20 - filas.length)
  const filasVacias = Array.from({ length: vacias }).map(() => '<tr>' + '<td></td>'.repeat(11) + '</tr>').join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>PTZ-RG-03 Registro Control Producción Diaria</title>
  <style>
    @page { size: landscape; margin: 10mm; }
    body { font-family: Arial, sans-serif; color:#222; }
    .head { display:flex; border:1px solid #333; }
    .head .logo { width:90px; border-right:1px solid #333; display:flex; align-items:center; justify-content:center; padding:4px; }
    .head .logo img { max-width:82px; max-height:60px; }
    .head .titulo { flex:1; display:flex; align-items:center; justify-content:center; text-align:center; font-weight:bold; font-size:15px; }
    .head .meta { width:170px; border-left:1px solid #333; font-size:10px; }
    .head .meta div { display:flex; border-bottom:1px solid #333; }
    .head .meta div:last-child { border-bottom:none; }
    .head .meta b { width:52%; padding:2px 4px; border-right:1px solid #333; background:#f3f0e8; }
    .head .meta span { padding:2px 4px; }
    table { width:100%; border-collapse:collapse; margin-top:6px; font-size:9px; }
    th, td { border:1px solid #333; padding:3px 4px; text-align:center; }
    th { background:#e9e4d6; }
    td.l, th.l { text-align:left; }
  </style></head><body>
    <div class="head">
      <div class="logo">${logoUrl ? `<img src="${esc(logoUrl)}">` : ''}</div>
      <div class="titulo">${esc(empresa.toUpperCase())}<br>CONTROL DE PRODUCCIÓN DIARIA</div>
      <div class="meta">
        <div><b>CÓDIGO</b><span>PTZ-RG-03</span></div>
        <div><b>VERSIÓN</b><span>1</span></div>
        <div><b>PÁGINA</b><span>1</span></div>
        <div><b>FECHA</b><span>${esc(fmtDMY(new Date().toISOString().slice(0, 10)))}</span></div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th>FECHA</th><th>LOTE</th><th>FECHA DE VENCIMIENTO</th><th class="l">PRODUCTO</th>
        <th>UNIDAD</th><th>CAJAS</th><th>HORA INICIO</th><th>HORA FINAL</th>
        <th>LABOR</th><th>RESPONSABLE</th><th class="l">OBSERVACIONES</th>
      </tr></thead>
      <tbody>${filasHtml}${filasVacias}</tbody>
    </table>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) throw new Error('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes para descargar el PDF.')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print() }, 400)
}

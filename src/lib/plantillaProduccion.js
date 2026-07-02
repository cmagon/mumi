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

export async function descargarPlantillaProduccion({ empresa = 'Mumi Amazonia', logoUrl = '', ejemplos = [] } = {}) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('PRODUCCIÓN DIARIA', { properties: { defaultRowHeight: 15 }, pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 } })
  ws.columns = COLUMNAS_PLANTILLA.map(c => ({ width: c.ancho }))
  const nCols = COLUMNAS_PLANTILLA.length
  const lastColLetter = ws.getColumn(nCols).letter

  // ===== Encabezado tipo PTZ-RG-03 =====
  ws.mergeCells(`A1:${ws.getColumn(nCols - 2).letter}4`)
  const head = ws.getCell('A1')
  head.value = `${empresa.toUpperCase()}\nCONTROL DE PRODUCCIÓN DIARIA`
  head.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  head.fill = { type: 'gradient', gradient: 'angle', degree: 0, stops: [{ position: 0, color: { argb: VERDE } }, { position: 1, color: { argb: VERDE2 } }] }
  for (let i = 1; i <= 4; i++) ws.getRow(i).height = 20
  if (logoUrl) {
    const b64 = await fetchLogoBase64(logoUrl)
    if (b64) { try { const ext = (b64.match(/^data:image\/(\w+);/) || [])[1] || 'png'; const id = wb.addImage({ base64: b64, extension: ext === 'jpeg' ? 'jpeg' : (ext === 'svg+xml' ? 'png' : ext) }); ws.addImage(id, { tl: { col: 0.1, row: 0.1 }, ext: { width: 66, height: 58 } }) } catch { /* svg */ } }
  }
  // Bloque de código/versión a la derecha
  const metaCol = nCols - 1
  const meta = [['CÓDIGO', 'PTZ-RG-03'], ['VERSIÓN', '1'], ['PÁGINA', '1']]
  meta.forEach((m, i) => {
    const rr = i + 1
    const a = ws.getCell(rr, metaCol), b = ws.getCell(rr, nCols)
    a.value = m[0]; b.value = m[1]
    a.font = { bold: true, size: 9 }; b.font = { size: 9 }
    a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREMA } }
    a.border = borde; b.border = borde
    a.alignment = { horizontal: 'center', vertical: 'middle' }; b.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  const fRow = ws.getCell(4, metaCol); fRow.value = 'FECHA'; fRow.font = { bold: true, size: 9 }; fRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREMA } }; fRow.border = borde; fRow.alignment = { horizontal: 'center', vertical: 'middle' }
  const fVal = ws.getCell(4, nCols); fVal.border = borde

  // ===== Fila de instrucciones =====
  ws.mergeCells(`A5:${lastColLetter}5`)
  const ins = ws.getCell('A5')
  ins.value = 'Llena una fila por registro. Fechas en formato dd/mm/aaaa · Horas en formato HH:MM (24h) · UNIDADES o CAJAS según cómo se contó · No borres la fila de encabezados.'
  ins.font = { italic: true, size: 9, color: { argb: VERDE } }
  ins.alignment = { horizontal: 'left', vertical: 'middle' }
  ins.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREMA } }

  // ===== Encabezados de columnas (fila 6) =====
  const HEADER_ROW = 6
  COLUMNAS_PLANTILLA.forEach((c, i) => {
    const cell = ws.getCell(HEADER_ROW, i + 1)
    cell.value = c.label
    cell.font = { bold: true, size: 10, color: { argb: VERDE } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DORADO } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = borde
  })
  ws.getRow(HEADER_ROW).height = 24
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }]

  // ===== Filas de ejemplo o vacías con bordes y formato =====
  const filas = ejemplos.length ? ejemplos : [
    { fecha: new Date(), lote: 'EJ0107', producto: 'Ejemplo — bocadillo', unidades: '', cajas: 40, inicio: '08:00', fin: '12:30', labor: 'PRODUCCIÓN', responsable: 'Nombre operario', obs: 'Fila de ejemplo (puedes borrarla)' },
  ]
  const TOTAL_FILAS = Math.max(filas.length + 30, 40)
  for (let r = 0; r < TOTAL_FILAS; r++) {
    const rowIdx = HEADER_ROW + 1 + r
    const data = filas[r] || {}
    COLUMNAS_PLANTILLA.forEach((c, i) => {
      const cell = ws.getCell(rowIdx, i + 1)
      const v = data[c.key]
      if (v !== undefined && v !== '') cell.value = v
      cell.border = borde
      if (c.tipo === 'fecha') cell.numFmt = 'dd/mm/yyyy'
      if (c.tipo === 'hora') cell.numFmt = 'hh:mm'
      if (c.tipo === 'num') cell.alignment = { horizontal: 'right' }
      cell.font = { size: 10 }
    })
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'Plantilla PTZ-RG-03 Produccion.xlsx'
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
  const matrix = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', blankrows: false })
  // Buscar la fila de encabezados (la que contenga FECHA y PRODUCTO)
  let hRow = -1
  for (let i = 0; i < matrix.length; i++) {
    const set = matrix[i].map(norm)
    if (set.includes('FECHA') && set.includes('PRODUCTO')) { hRow = i; break }
  }
  if (hRow < 0) return { filas: [], errores: ['No se encontró la fila de encabezados (debe incluir FECHA y PRODUCTO). ¿Usaste la plantilla?'] }
  const headers = matrix[hRow].map(norm)
  const idx = {}
  for (const c of COLUMNAS_PLANTILLA) {
    // acepta variantes: "FECHA VENCIMIENTO" o "FECHA DE VENCIMIENTO"
    const posibles = [norm(c.label), norm(c.label.replace('VENCIMIENTO', 'DE VENCIMIENTO'))]
    idx[c.key] = headers.findIndex(h => posibles.includes(h))
  }
  const filas = [], errores = []
  for (let i = hRow + 1; i < matrix.length; i++) {
    const row = matrix[i]
    const get = (k) => idx[k] >= 0 ? row[idx[k]] : ''
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

// Genera y descarga la FICHA DE COSTOS de un producto como Excel con estilo (logo, colores,
// bordes) y FÓRMULAS VIVAS (al editar cantidades/precios, los costos se recalculan en Excel).
import ExcelJS from 'exceljs'

const VERDE = 'FF2D5A3D'      // selva
const VERDE2 = 'FF3D7A52'
const DORADO = 'FFC8A94A'
const CREMA = 'FFF5F0E8'
const GRIS = 'FFEDEAE2'
const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []) } catch { return [] } }
const num = (v) => parseFloat(v) || 0

const borde = { top: { style: 'thin', color: { argb: 'FFBBBBBB' } }, left: { style: 'thin', color: { argb: 'FFBBBBBB' } }, bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } }, right: { style: 'thin', color: { argb: 'FFBBBBBB' } } }
const money = '"$"#,##0'

async function fetchLogoBase64(url) {
  try {
    const res = await fetch(url); const blob = await res.blob()
    return await new Promise((ok) => { const r = new FileReader(); r.onloadend = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(blob) })
  } catch { return null }
}

export async function descargarFichaExcel(ficha, { empresa = 'Mumi Amazonia', logoUrl = '', cifItems = [] } = {}) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Ficha de costos', { properties: { defaultRowHeight: 16 }, pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 } })
  ws.columns = [{ width: 34 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 4 }]

  // ===== Encabezado: logo + nombre grande =====
  ws.mergeCells('A1:E4')
  const head = ws.getCell('A1')
  head.value = ficha.nombre || 'Producto'
  head.font = { name: 'Arial', size: 22, bold: true, color: { argb: 'FFFFFFFF' } }
  head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  head.fill = { type: 'gradient', gradient: 'angle', degree: 0, stops: [{ position: 0, color: { argb: VERDE } }, { position: 1, color: { argb: VERDE2 } }] }
  ws.getRow(1).height = 22; ws.getRow(2).height = 22; ws.getRow(3).height = 22; ws.getRow(4).height = 22
  if (logoUrl) {
    const b64 = await fetchLogoBase64(logoUrl)
    if (b64) { try { const ext = (b64.match(/^data:image\/(\w+);/) || [])[1] || 'png'; const id = wb.addImage({ base64: b64, extension: ext === 'jpeg' ? 'jpeg' : (ext === 'svg+xml' ? 'png' : ext) }); ws.addImage(id, { tl: { col: 0.1, row: 0.15 }, ext: { width: 70, height: 60 } }) } catch { /* svg no soportado */ } }
  }
  ws.mergeCells('A5:E5')
  const sub = ws.getCell('A5')
  sub.value = `${empresa}  ·  Ficha de costos${ficha.sku ? '  ·  SKU ' + ficha.sku : ''}`
  sub.font = { name: 'Arial', size: 10, italic: true, color: { argb: VERDE } }
  sub.alignment = { horizontal: 'center' }
  ws.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREMA } }

  let r = 7
  const seccion = (titulo) => {
    ws.mergeCells(`A${r}:E${r}`)
    const c = ws.getCell(`A${r}`); c.value = titulo
    c.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
    c.alignment = { vertical: 'middle' }; ws.getRow(r).height = 18
    r++
  }
  const headerRow = (cols) => {
    cols.forEach((t, i) => { const c = ws.getCell(r, i + 1); c.value = t; c.font = { bold: true, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DORADO } }; c.alignment = { horizontal: i === 0 ? 'left' : 'right' }; c.border = borde })
    r++
  }

  // ===== Parámetros =====
  seccion('PARÁMETROS DE PRODUCCIÓN')
  const pPar = r
  const par = [['Rendimiento (%)', num(ficha.rendimiento) || 62], ['Desperdicio (%)', num(ficha.desperdicio) || 2], ['Peso por unidad (g)', num(ficha.peso_unidad) || 1000]]
  par.forEach(([k, v]) => { ws.getCell(r, 1).value = k; ws.getCell(r, 1).border = borde; const c = ws.getCell(r, 2); c.value = v; c.border = borde; c.alignment = { horizontal: 'right' }; r++ })
  const cellRend = `B${pPar}`, cellDesp = `B${pPar + 1}`, cellPeso = `B${pPar + 2}`

  // ===== Ingredientes (con fórmulas) =====
  r++
  seccion('INGREDIENTES (por bache)')
  headerRow(['Ingrediente', 'Cant. (g)', 'Precio', 'Pres. (g)', 'Costo'])
  const ings = parse(ficha.ingredientes).filter(i => (i.nombre || '').trim())
  const ingIni = r
  for (const i of ings) {
    ws.getCell(r, 1).value = i.nombre
    ws.getCell(r, 2).value = num(i.cantidad)
    ws.getCell(r, 3).value = num(i.precio)
    ws.getCell(r, 4).value = num(i.presentacion) || 1000
    ws.getCell(r, 5).value = { formula: `C${r}/D${r}*B${r}` }
    for (let c = 1; c <= 5; c++) { ws.getCell(r, c).border = borde; if (c > 1) ws.getCell(r, c).alignment = { horizontal: 'right' } }
    ws.getCell(r, 3).numFmt = money; ws.getCell(r, 5).numFmt = money
    r++
  }
  const ingFin = r - 1
  ws.getCell(r, 1).value = 'TOTAL MEZCLA / COSTO MP (bache)'; ws.getCell(r, 1).font = { bold: true }
  ws.getCell(r, 2).value = ings.length ? { formula: `SUM(B${ingIni}:B${ingFin})` } : 0
  ws.getCell(r, 5).value = ings.length ? { formula: `SUM(E${ingIni}:E${ingFin})` } : 0
  for (let c = 1; c <= 5; c++) { ws.getCell(r, c).border = borde; ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }; if (c > 1) ws.getCell(r, c).alignment = { horizontal: 'right' } }
  ws.getCell(r, 5).numFmt = money
  const cellMezclaTot = `B${r}`, cellCostoMP = `E${r}`
  r += 2

  // ===== Unidades por bache (fórmula) =====
  ws.getCell(r, 1).value = 'Unidades por bache (= mezcla × rend% × (1−desp%) ÷ peso/unidad)'; ws.getCell(r, 1).font = { bold: true }
  ws.getCell(r, 5).value = { formula: `${cellMezclaTot}*${cellRend}/100*(1-${cellDesp}/100)/${cellPeso}` }
  ws.getCell(r, 5).alignment = { horizontal: 'right' }; ws.getCell(r, 5).numFmt = '#,##0.0'
  const cellUnids = `E${r}`
  r += 2

  // ===== Mano de obra =====
  seccion('MANO DE OBRA (por bache)')
  ws.getCell(r, 1).value = 'Costo por minuto ($)'; ws.getCell(r, 1).font = { bold: true }
  ws.getCell(r, 2).value = num(ficha._costoMinuto)   // editable; pre-cargado si se conoce
  ws.getCell(r, 2).numFmt = money; ws.getCell(r, 2).border = borde; ws.getCell(r, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREMA } }
  const cellMin = `B${r}`; r++
  headerRow(['Proceso', 'Minutos', '', '', 'Costo'])
  const procs = parse(ficha.procesos).filter(p => (p.nombre || '').trim() || num(p.minutos))
  const procIni = r
  for (const p of procs) {
    ws.getCell(r, 1).value = p.nombre || '—'; ws.getCell(r, 2).value = num(p.minutos)
    ws.getCell(r, 5).value = { formula: `B${r}*${cellMin}` }
    for (const c of [1, 2, 5]) { ws.getCell(r, c).border = borde; if (c > 1) ws.getCell(r, c).alignment = { horizontal: 'right' } }
    ws.getCell(r, 5).numFmt = money; r++
  }
  const procFin = r - 1
  ws.getCell(r, 1).value = 'TOTAL MANO DE OBRA (bache)'; ws.getCell(r, 1).font = { bold: true }
  ws.getCell(r, 5).value = procs.length ? { formula: `SUM(E${procIni}:E${procFin})` } : 0
  for (const c of [1, 5]) { ws.getCell(r, c).border = borde; ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } } }
  ws.getCell(r, 5).numFmt = money; ws.getCell(r, 5).alignment = { horizontal: 'right' }
  const cellManoTot = `E${r}`; r += 2

  // ===== Empaque (por unidad) =====
  seccion('EMPAQUE Y ENVASE (por unidad)')
  headerRow(['Material', 'Precio', 'Pres.', 'Cant.', 'Costo'])
  const emps = parse(ficha.empaque).filter(e => (e.nombre || '').trim())
  const empIni = r
  for (const e of emps) {
    ws.getCell(r, 1).value = e.nombre; ws.getCell(r, 2).value = num(e.precio); ws.getCell(r, 3).value = num(e.presentacion) || 1; ws.getCell(r, 4).value = num(e.cantidad)
    ws.getCell(r, 5).value = { formula: `B${r}/C${r}*D${r}` }
    for (let c = 1; c <= 5; c++) { ws.getCell(r, c).border = borde; if (c > 1) ws.getCell(r, c).alignment = { horizontal: 'right' } }
    ws.getCell(r, 2).numFmt = money; ws.getCell(r, 5).numFmt = money; r++
  }
  const empFin = r - 1
  ws.getCell(r, 1).value = 'TOTAL EMPAQUE (unidad)'; ws.getCell(r, 1).font = { bold: true }
  ws.getCell(r, 5).value = emps.length ? { formula: `SUM(E${empIni}:E${empFin})` } : 0
  for (const c of [1, 5]) { ws.getCell(r, c).border = borde; ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } } }
  ws.getCell(r, 5).numFmt = money; ws.getCell(r, 5).alignment = { horizontal: 'right' }
  const cellEmpTot = `E${r}`; r += 2

  // ===== Resumen de costo unitario (fórmulas) =====
  seccion('RESUMEN DE COSTO POR UNIDAD')
  const resumen = [
    ['Costo MP por unidad', { formula: `IF(${cellUnids}=0,0,${cellCostoMP}/${cellUnids})` }, money],
    ['Mano de obra por unidad', { formula: `IF(${cellUnids}=0,0,${cellManoTot}/${cellUnids})` }, money],
    ['Empaque por unidad', { formula: `${cellEmpTot}` }, money],
  ]
  const resIni = r
  for (const [k, v, fmt] of resumen) { ws.getCell(r, 1).value = k; ws.getCell(r, 1).border = borde; const c = ws.getCell(r, 5); c.value = v; c.numFmt = fmt; c.border = borde; c.alignment = { horizontal: 'right' }; ws.getCell(r, 1).fill = undefined; r++ }
  // Costos adicionales por unidad (depreciación, etc. — editable; el CIF/overhead YA está incluido
  // arriba en "Mano de obra por unidad" vía el costo/minuto, que reparte todo el CIF por tiempo.
  // Sumar además el CIF-por-unidad (método de absorción por unidades) aquí duplicaría el overhead.)
  ws.getCell(r, 1).value = 'Costos adicionales por unidad'; ws.getCell(r, 1).border = borde
  ws.getCell(r, 5).value = num(ficha._adicUnidad); ws.getCell(r, 5).numFmt = money; ws.getCell(r, 5).border = borde; ws.getCell(r, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREMA } }
  const cellCif = `E${r}`; r++
  ws.getCell(r, 1).value = 'COSTO TOTAL POR UNIDAD'; ws.getCell(r, 1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  ws.getCell(r, 5).value = { formula: `SUM(E${resIni}:E${r - 1})` }
  for (let c = 1; c <= 5; c++) { ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }; ws.getCell(r, c).border = borde }
  ws.getCell(r, 5).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }; ws.getCell(r, 5).numFmt = money; ws.getCell(r, 5).alignment = { horizontal: 'right' }
  r += 2

  // ===== Precios de venta =====
  seccion('PRECIOS DE VENTA')
  const precios = [['Precio mayorista', num(ficha.precio_mayor)], ['Precio al detal', num(ficha.precio_detal)]]
  for (const [k, v] of precios) { ws.getCell(r, 1).value = k; ws.getCell(r, 1).border = borde; const c = ws.getCell(r, 5); c.value = v; c.numFmt = money; c.border = borde; c.alignment = { horizontal: 'right' }; c.font = { bold: true, color: { argb: VERDE } }; r++ }

  // ===== Hoja CIF (backup de los costos indirectos) =====
  const wsCif = wb.addWorksheet('CIF')
  wsCif.columns = [{ width: 36 }, { width: 18 }, { width: 16 }, { width: 16 }]
  wsCif.mergeCells('A1:D1')
  const ch = wsCif.getCell('A1'); ch.value = `Costos Indirectos de Fabricación (CIF) — ${empresa}`
  ch.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }; ch.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }; ch.alignment = { vertical: 'middle' }
  wsCif.getRow(1).height = 20
  ;['Descripción', 'Categoría', 'Frecuencia', 'Valor'].forEach((t, i) => { const c = wsCif.getCell(3, i + 1); c.value = t; c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DORADO } }; c.border = borde })
  let rc = 4
  for (const it of (cifItems || [])) {
    wsCif.getCell(rc, 1).value = it.descripcion || ''
    wsCif.getCell(rc, 2).value = it.categoria || ''
    wsCif.getCell(rc, 3).value = it.frecuencia || ''
    const v = wsCif.getCell(rc, 4); v.value = num(it.valor); v.numFmt = money; v.alignment = { horizontal: 'right' }
    for (let c = 1; c <= 4; c++) wsCif.getCell(rc, c).border = borde
    rc++
  }
  wsCif.getCell(rc, 1).value = 'TOTAL CIF'; wsCif.getCell(rc, 1).font = { bold: true }
  wsCif.getCell(rc, 4).value = cifItems.length ? { formula: `SUM(D4:D${rc - 1})` } : 0
  wsCif.getCell(rc, 4).numFmt = money; for (let c = 1; c <= 4; c++) { wsCif.getCell(rc, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }; wsCif.getCell(rc, c).border = borde }

  // ===== Hoja DATOS (estructurada, para RE-IMPORTAR la ficha si se borra de la base) =====
  // NO incluye CIF (es global). El import lee esta hoja por pares campo/valor.
  const wsD = wb.addWorksheet('Datos')
  wsD.columns = [{ width: 24 }, { width: 90 }]
  wsD.getCell('A1').value = 'campo'; wsD.getCell('B1').value = 'valor'
  wsD.getRow(1).font = { bold: true }
  const datos = [
    ['nombre', ficha.nombre || ''], ['tipo', ficha.tipo || 'galleta'], ['sku', ficha.sku || ''],
    ['rendimiento', num(ficha.rendimiento) || 62], ['desperdicio', num(ficha.desperdicio) || 2], ['peso_unidad', num(ficha.peso_unidad) || 1000],
    ['precio_mayor', num(ficha.precio_mayor)], ['precio_detal', num(ficha.precio_detal)],
    ['merma', num(ficha.merma)], ['comision', num(ficha.comision)], ['presentacion', ficha.presentacion || 'Unidad'],
    ['bache', num(ficha.bache)], ['baches_mes', num(ficha.baches_mes)],
    ['ingredientes', typeof ficha.ingredientes === 'string' ? ficha.ingredientes : JSON.stringify(ficha.ingredientes || [])],
    ['procesos', typeof ficha.procesos === 'string' ? ficha.procesos : JSON.stringify(ficha.procesos || [])],
    ['empaque', typeof ficha.empaque === 'string' ? ficha.empaque : JSON.stringify(ficha.empaque || [])],
    ['parametros_calidad', JSON.stringify(ficha.parametros_calidad || [])],
    ['campos_personalizados', JSON.stringify(ficha.campos_personalizados || [])],
  ]
  datos.forEach((d, i) => { wsD.getCell(i + 2, 1).value = d[0]; wsD.getCell(i + 2, 2).value = d[1] })

  // ===== Descargar =====
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `Ficha - ${(ficha.nombre || 'producto').replace(/[\\/:*?"<>|]/g, '')}.xlsx`
  a.click(); URL.revokeObjectURL(url)
}

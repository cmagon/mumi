// Motor de plantillas de Excel para la Orden de Producción (PTZ-OR-01).
//
//   leerModelo(buffer)            Excel → modelo neutro (columnas, filas, estilos, combinadas, imágenes)
//   escanearPlantilla(buffer)     marcadores {{id}} encontrados / desconocidos (validación al cargar)
//   aplicarDatos(modelo, datos)   reemplaza marcadores y repite las filas de tabla (ing., proc., cal., extra.)
//   modeloAHtml(modelo)           modelo → HTML (misma tubería de PDF/impresión de las órdenes)
//   htmlOrdenDesdePlantilla()     atajo: buffer + datos → HTML listo para PDF
//   generarPlantillaBase()        Excel base editable (con hojas _INSTRUCTIVO y _BIBLIOTECA)
//
// Se usa ExcelJS (carga diferida): conserva estilos, combinadas, anchos e imágenes del diseño del usuario.
import {
  TOKEN_RE, CAMPO_POR_ID, IDS_SINO, IDS_IMAGEN, GRUPOS_EXPANDIDOS, LISTAS, INSTRUCTIVO,
  prefijoLista, normalizarId,
} from './plantillaCampos'

const cargarExcelJS = async () => { const m = await import('exceljs'); return m.default || m }

const MAX_FILAS = 400, MAX_COLS = 40, MAX_CELDAS = 30000
const ANCHO_UTIL_PX = 741   // 196 mm (ancho útil de carta con márgenes de 10 mm) a 96 dpi

// ─────────────────────────── Colores ───────────────────────────
const TEMA = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47']
function aplicarTinte(hex, tint) {
  if (!tint) return hex
  const ch = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
  const out = ch.map(c => Math.round(tint < 0 ? c * (1 + tint) : c + (255 - c) * tint))
  return out.map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')
}
function colorCss(c) {
  if (!c) return null
  // Solo hexadecimal válido: el valor viene del archivo y termina dentro de un atributo style
  if (c.argb) { const s = String(c.argb); return /^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(s) ? '#' + (s.length === 8 ? s.slice(2) : s) : null }
  if (c.theme != null) return '#' + aplicarTinte(TEMA[Number(c.theme)] ?? '000000', Number(c.tint) || 0)
  return null
}

// ─────────────────────────── Utilidades ───────────────────────────
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const colALetra = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
const letraACol = (s) => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0)
const bytesABase64 = (bytes) => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  return btoa(bin)
}
const MIME = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', gif: 'image/gif' }

function textoDeCelda(cell) {
  const v = cell.value
  if (v == null) return ''
  if (v instanceof Date) return v.toLocaleDateString('es-CO')
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('')
    if ('result' in v) return v.result == null ? '' : String(v.result)
    if (v.text != null) return String(v.text)
    return ''
  }
  return String(v)
}

const tokensDe = (texto) => {
  const out = []
  String(texto || '').replace(TOKEN_RE, (m, id) => { out.push(normalizarId(id)); return m })
  return out
}

// ─────────────────────────── 1) Excel → modelo ───────────────────────────
export async function leerModelo(buffer) {
  const ExcelJS = await cargarExcelJS()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets.find(w => w.state !== 'hidden' && !String(w.name || '').startsWith('_'))
  if (!ws) throw new Error('El archivo no tiene una hoja visible para usar como plantilla (las hojas que empiezan por «_» se ignoran).')
  const nFilas = Math.max(ws.rowCount || 0, ws.dimensions?.bottom || 0)
  const nCols = Math.max(ws.columnCount || 0, ws.dimensions?.right || 0)
  if (!nFilas || !nCols) throw new Error('La primera hoja está vacía.')
  if (nFilas > MAX_FILAS || nCols > MAX_COLS || nFilas * nCols > MAX_CELDAS) {
    throw new Error(`La plantilla es demasiado grande (máx. ${MAX_FILAS} filas × ${MAX_COLS} columnas).`)
  }

  // Combinadas
  const merges = []
  for (const rango of (ws.model.merges || [])) {
    const m = String(rango).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
    if (m) merges.push({ r1: +m[2], c1: letraACol(m[1]), r2: +m[4], c2: letraACol(m[3]) })
  }
  const maestra = new Map(), cubierta = new Set()
  for (const m of merges) {
    maestra.set(`${m.r1},${m.c1}`, m)
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) cubierta.add(`${r},${c}`)
  }

  const cols = []
  for (let c = 1; c <= nCols; c++) {
    const col = ws.getColumn(c)
    cols.push({ w: col.width || 8.43, hidden: !!col.hidden })
  }

  const filas = []
  for (let r = 1; r <= nFilas; r++) {
    const row = ws.getRow(r)
    const cells = []
    for (let c = 1; c <= nCols; c++) {
      if (cubierta.has(`${r},${c}`)) { cells.push({ cov: true }); continue }
      const cell = row.getCell(c)
      const st = cell.style || {}
      const m = maestra.get(`${r},${c}`)
      let border = st.border || null
      if (m) {   // los bordes de una combinada viven en las celdas de su perímetro
        const b = (rr, cc) => ws.getCell(rr, cc).border || {}
        border = { top: b(m.r1, m.c1).top, left: b(m.r1, m.c1).left, bottom: b(m.r2, m.c1).bottom, right: b(m.r1, m.c2).right }
      }
      cells.push({ t: textoDeCelda(cell), font: st.font || null, fill: st.fill || null, border, align: st.alignment || null })
    }
    filas.push({ h: row.height || null, hidden: !!row.hidden, cells })
  }

  // Imágenes fijas del diseño (logos del usuario, etc.)
  const imagenes = []
  try {
    for (const im of (ws.getImages() || [])) {
      const media = wb.getImage(Number(im.imageId))
      if (!media?.buffer) continue
      const rg = im.range || {}
      const tl = rg.tl || {}
      const colI = Math.floor(tl.nativeCol ?? tl.col ?? 0), rowI = Math.floor(tl.nativeRow ?? tl.row ?? 0)
      const pxCol = (c) => Math.round((cols[c]?.w || 8.43) * 7 + 5)
      const pxFila = (r) => Math.round((filas[r]?.h || 15) * 4 / 3)
      let w = rg.ext?.width, h = rg.ext?.height
      if (!w || !h) {
        const br = rg.br || {}
        const c2 = br.nativeCol ?? br.col ?? colI + 1, r2 = br.nativeRow ?? br.row ?? rowI + 1
        w = 0; for (let c = colI; c < Math.ceil(c2); c++) w += pxCol(c)
        h = 0; for (let r = rowI; r < Math.ceil(r2); r++) h += pxFila(r)
      }
      imagenes.push({ r: rowI + 1, c: colI + 1, w, h, src: `data:${MIME[media.extension] || 'image/png'};base64,${bytesABase64(media.buffer)}` })
    }
  } catch { /* sin imágenes */ }

  return { hoja: ws.name, cols, filas, merges, imagenes }
}

// ─────────────────────────── 2) Validación ───────────────────────────
export async function escanearPlantilla(buffer) {
  const modelo = await leerModelo(buffer)
  const tokens = new Set()
  for (const f of modelo.filas) for (const c of f.cells) for (const id of tokensDe(c.t)) tokens.add(id)
  const lista = [...tokens]
  const conocidos = lista.filter(id => CAMPO_POR_ID[id])
  const desconocidos = lista.filter(id => !CAMPO_POR_ID[id])
  const listas = [...new Set(conocidos.map(prefijoLista).filter(Boolean))]
  // ¿una misma fila mezcla tablas distintas?
  const mezcladas = []
  modelo.filas.forEach((f, i) => {
    const ps = new Set(f.cells.flatMap(c => tokensDe(c.t)).map(prefijoLista).filter(Boolean))
    if (ps.size > 1) mezcladas.push(`fila ${i + 1}: ${[...ps].join(' + ')}`)
  })
  return {
    ok: conocidos.length > 0, hoja: modelo.hoja, nFilas: modelo.filas.length, nCols: modelo.cols.length,
    imagenes: modelo.imagenes.length, tokens: lista, conocidos, desconocidos, listas, mezcladas,
  }
}

// ─────────────────────────── 3) Aplicar datos ───────────────────────────
function valorEscalar(id, datos) {
  if (datos.v && id in datos.v) return String(datos.v[id] ?? '')
  const m = id.match(/^(.*)\.(si|no)$/)
  if (m && IDS_SINO.has(m[1])) {
    const val = datos.sino?.[m[1]]
    return (m[2] === 'si' && val === true) || (m[2] === 'no' && val === false) ? 'X' : ''
  }
  if (IDS_SINO.has(id)) { const val = datos.sino?.[id]; return val === true ? 'SI' : val === false ? 'NO' : '' }
  return ''
}

function reemplazar(texto, datos, itemLista, prefLista) {
  return String(texto || '').replace(TOKEN_RE, (m, raw) => {
    const id = normalizarId(raw)
    const p = prefijoLista(id)
    if (p) {
      if (p !== prefLista || !itemLista) return ''
      return String(itemLista[id.slice(p.length + 1)] ?? '')
    }
    if (IDS_IMAGEN.has(id)) return ''
    return valorEscalar(id, datos)
  })
}

export function aplicarDatos(modelo, datos) {
  datos = datos || {}
  const filasNuevas = []
  const mapa = []   // fila vieja (1-based) → { inicio, n }  (1-based en la salida)

  modelo.filas.forEach((fila, idx) => {
    const todos = fila.cells.flatMap(c => tokensDe(c.t))
    const pref = todos.map(prefijoLista).find(Boolean) || null
    const items = pref ? ((datos.listas || {})[pref] || []) : null
    const veces = pref ? Math.max(1, items.length) : 1
    const inicio = filasNuevas.length + 1
    for (let k = 0; k < veces; k++) {
      const item = pref ? (items[k] ? { n: k + 1, ...items[k] } : null) : null
      const cells = fila.cells.map(c => {
        if (c.cov) return c
        const trim = String(c.t || '').trim()
        const unico = trim.match(/^\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}$/)
        const idImg = unico && IDS_IMAGEN.has(normalizarId(unico[1])) ? normalizarId(unico[1]) : null
        const tieneTokens = TOKEN_RE.test(c.t || ''); TOKEN_RE.lastIndex = 0
        return {
          ...c,
          t: idImg ? '' : reemplazar(c.t, datos, item, pref),
          img: idImg ? ((datos.imagenes || {})[idImg] || null) : null,
          conTokens: tieneTokens,
        }
      })
      filasNuevas.push({ ...fila, cells })
    }
    mapa[idx + 1] = { inicio, n: veces }
  })

  // Combinadas: se replican en filas repetidas; las que abarcan varias filas se estiran
  const merges = []
  for (const m of modelo.merges) {
    const a = mapa[m.r1], b = mapa[m.r2]
    if (m.r1 === m.r2 && a.n > 1) { for (let k = 0; k < a.n; k++) merges.push({ r1: a.inicio + k, r2: a.inicio + k, c1: m.c1, c2: m.c2 }) }
    else merges.push({ r1: a.inicio, r2: b.inicio + b.n - 1, c1: m.c1, c2: m.c2 })
  }
  // Las filas clonadas necesitan que sus celdas «cubiertas» coincidan con las nuevas combinadas
  const cubierta = new Set(), maestra = new Map()
  for (const m of merges) {
    maestra.set(`${m.r1},${m.c1}`, m)
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) cubierta.add(`${r},${c}`)
  }
  filasNuevas.forEach((f, i) => {
    const r = i + 1
    f.cells = f.cells.map((c, j) => {
      const cc = j + 1
      if (cubierta.has(`${r},${cc}`)) return { cov: true }
      const m = maestra.get(`${r},${cc}`)
      // Una celda clonada que era «cubierta» pero ahora es maestra (o viceversa) se normaliza
      const base = c.cov ? { t: '', font: null, fill: null, border: null, align: null } : c
      return { ...base, rs: m ? m.r2 - m.r1 + 1 : 1, cs: m ? m.c2 - m.c1 + 1 : 1 }
    })
  })
  const imagenes = modelo.imagenes.map(im => ({ ...im, r: (mapa[im.r] || { inicio: im.r }).inicio }))
  return { ...modelo, filas: filasNuevas, merges, imagenes }
}

// ─────────────────────────── 4) Modelo → HTML ───────────────────────────
const BORDE = { thin: '1px solid', hair: '1px solid', medium: '2px solid', thick: '3px solid', dotted: '1px dotted', dashed: '1px dashed', double: '3px double', mediumDashed: '2px dashed', dashDot: '1px dashed' }
const cssBorde = (b) => (b && b.style ? `${BORDE[b.style] || '1px solid'} ${colorCss(b.color) || '#000'}` : null)

export function modeloAHtml(m, { titulo = 'Orden de producción', marcaAgua = '' } = {}) {
  const colPx = m.cols.map(c => c.hidden ? 0 : Math.round((Number(c.w) || 8.43) * 7 + 5))
  const total = colPx.reduce((a, b) => a + b, 0) || 1
  const escala = Math.max(0.35, Math.min(2.2, ANCHO_UTIL_PX / total))
  const em = (px) => (px * escala / 11).toFixed(3) + 'em'
  const filaPx = (f) => Math.round((Number(f.h) || 15) * 4 / 3)

  const imgPorCelda = new Map()
  for (const im of m.imagenes || []) {
    const k = `${im.r},${im.c}`
    if (!imgPorCelda.has(k)) imgPorCelda.set(k, [])
    imgPorCelda.get(k).push(im)
  }

  const colgroup = m.cols.map((c, i) => c.hidden ? '' : `<col style="width:${(colPx[i] / total * 100).toFixed(3)}%">`).join('')
  const filasHtml = m.filas.map((f, ri) => {
    if (f.hidden) return ''
    const tds = f.cells.map((c, ci) => {
      if (c.cov || m.cols[ci].hidden) return ''
      const rs = c.rs || 1, cs = c.cs || 1
      let colspan = 0; for (let k = ci; k < ci + cs; k++) if (!m.cols[k]?.hidden) colspan++
      let rowspan = 0, altoPx = 0
      for (let k = ri; k < ri + rs; k++) if (m.filas[k] && !m.filas[k].hidden) { rowspan++; altoPx += filaPx(m.filas[k]) }
      const font = c.font || {}, al = c.align || {}, bd = c.border || {}
      const css = []
      const pt = Number(font.size) || 11
      css.push(`font-size:${em(pt * 4 / 3)}`)
      if (font.bold) css.push('font-weight:700')
      if (font.italic) css.push('font-style:italic')
      const deco = [font.underline ? 'underline' : '', font.strike ? 'line-through' : ''].filter(Boolean).join(' ')
      if (deco) css.push(`text-decoration:${deco}`)
      const col = colorCss(font.color); if (col) css.push(`color:${col}`)
      const fuente = String(font.name || '').replace(/[^\w \-áéíóúñÁÉÍÓÚÑ]/g, '').trim()
      if (fuente) css.push(`font-family:'${fuente}',Arial,sans-serif`)
      const fill = c.fill && c.fill.type === 'pattern' && c.fill.pattern === 'solid' ? colorCss(c.fill.fgColor) : null
      if (fill) css.push(`background:${fill}`)
      for (const [lado, nombre] of [['top', 'border-top'], ['right', 'border-right'], ['bottom', 'border-bottom'], ['left', 'border-left']]) {
        const b = cssBorde(bd[lado]); if (b) css.push(`${nombre}:${b}`)
      }
      const h = al.horizontal
      css.push(`text-align:${h === 'center' || h === 'centerContinuous' ? 'center' : h === 'right' ? 'right' : h === 'justify' ? 'justify' : 'left'}`)
      css.push(`vertical-align:${al.vertical === 'top' ? 'top' : al.vertical === 'middle' || al.vertical === 'center' ? 'middle' : 'bottom'}`)
      // Las celdas con marcadores siempre ajustan texto: un dato largo no debe quedar cortado
      css.push(al.wrapText || c.conTokens ? 'white-space:pre-wrap;word-break:break-word' : 'white-space:nowrap')
      if (al.indent) css.push(`padding-left:${al.indent * 0.8}em`)
      const fijas = imgPorCelda.get(`${ri + 1},${ci + 1}`) || []
      if (fijas.length) css.push('position:relative')
      let interior = esc(c.t).replace(/\n/g, '<br>')
      if (c.img) interior = `<img src="${esc(c.img)}" crossorigin="anonymous" style="display:block;margin:0 auto;width:100%;height:${em(Math.max(altoPx - 4, 12))};object-fit:contain">`
      for (const im of fijas) interior += `<img src="${im.src}" style="position:absolute;left:0;top:0;width:${em(Number(im.w) || 0)};height:${em(Number(im.h) || 0)};max-width:none">`
      return `<td${colspan > 1 ? ` colspan="${colspan}"` : ''}${rowspan > 1 ? ` rowspan="${rowspan}"` : ''} style="${css.join(';')}">${interior}</td>`
    }).join('')
    return `<tr style="height:${em(filaPx(f))}">${tds}</tr>`
  }).join('')

  return `<html><head><title>${esc(titulo)}</title><style>
    @page { size: letter; margin: 10mm; }
    * { box-sizing: border-box; }
    html,body { margin:0; }
    body { font-family: Calibri, Arial, sans-serif; color:#222; font-size:11px; }
    #content { width:196mm; margin:0 auto; position:relative; padding-bottom:6px; }
    table.xl { width:100%; border-collapse:collapse; table-layout:fixed; }
    table.xl td { padding:0.08em 0.3em; overflow:hidden; line-height:1.2; }
    .marca-agua { position:absolute; top:45%; left:50%; transform:translate(-50%,-50%) rotate(-32deg); font-size:64px; font-weight:900; color:rgba(192,57,43,0.28); letter-spacing:4px; white-space:nowrap; z-index:999; pointer-events:none; }
  </style></head><body><div id="content">${marcaAgua ? `<div class="marca-agua">${esc(marcaAgua)}</div>` : ''}<table class="xl"><colgroup>${colgroup}</colgroup><tbody>${filasHtml}</tbody></table></div></body></html>`
}

export async function htmlOrdenDesdePlantilla(buffer, datos, opts = {}) {
  const modelo = await leerModelo(buffer)
  return modeloAHtml(aplicarDatos(modelo, datos), opts)
}

// ─────────────────────────── 5) Plantilla base (Excel editable) ───────────────────────────
const VERDE = 'FF2D5A3D', CREMA = 'FFF3F6F1', GRIS = 'FF555555'
const bTodos = { top: { style: 'thin', color: { argb: GRIS } }, left: { style: 'thin', color: { argb: GRIS } }, bottom: { style: 'thin', color: { argb: GRIS } }, right: { style: 'thin', color: { argb: GRIS } } }

export async function generarPlantillaBase() {
  const ExcelJS = await cargarExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mumi Amazonia'
  const ws = wb.addWorksheet('ORDEN', { pageSetup: { paperSize: 1, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 } })
  const anchos = [26, 18, 16, 22, 15, 17]
  anchos.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // Aplica estilo a un rango y lo combina
  const celda = (rango, valor, op = {}) => {
    const mm = rango.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/)
    const c1 = letraACol(mm[1]), r1 = +mm[2], c2 = mm[3] ? letraACol(mm[3]) : c1, r2 = mm[4] ? +mm[4] : r1
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const x = ws.getCell(r, c)
      if (op.borde !== false) x.border = bTodos
      if (op.fill) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: op.fill } }
      x.font = { name: 'Calibri', size: op.size || 11, bold: !!op.bold, color: { argb: op.color || 'FF222222' } }
      x.alignment = { horizontal: op.h || 'left', vertical: op.v || 'middle', wrapText: op.wrap !== false }
    }
    ws.getCell(r1, c1).value = valor
    if (r2 > r1 || c2 > c1) ws.mergeCells(r1, c1, r2, c2)
  }
  const etiqueta = (rango, txt) => celda(rango, txt, { bold: true, fill: CREMA })
  const seccion = (fila, txt) => celda(`A${fila}:F${fila}`, txt, { bold: true, fill: VERDE, color: 'FFFFFFFF' })
  const alto = (fila, h) => { ws.getRow(fila).height = h }

  // Encabezado del formato
  celda('A1:A3', '{{empresa.logo}}', { h: 'center' })
  celda('B1:D3', 'ORDEN DE PRODUCCIÓN N° {{orden.numero}}', { bold: true, size: 16, h: 'center' })
  celda('E1:F1', 'Código: {{doc.codigo}}'); celda('E2:F2', 'Versión: {{doc.version}}'); celda('E3:F3', 'Fecha emisión: {{doc.fecha_emision}}')
  ;[1, 2, 3].forEach(r => alto(r, 22))
  celda('A4:F4', '{{empresa.nombre}} · NIT {{empresa.nit}} · {{empresa.direccion}} {{empresa.ciudad}} · Tel {{empresa.telefono}}', { size: 9, h: 'center', borde: false })
  celda('A5:F5', '{{orden.es_prueba}}', { bold: true, color: 'FFC0392B', h: 'center', borde: false })

  seccion(6, 'DATOS DE LA ORDEN')
  etiqueta('A7', 'Nombre comercial'); celda('B7:F7', '{{producto.nombre}}', { bold: true, size: 14, color: 'FF2D5A3D' }); alto(7, 26)
  etiqueta('A8', 'Lote'); celda('B8:C8', '{{lote.numero}}'); etiqueta('D8', 'Presentación'); celda('E8:F8', '{{producto.presentacion_g}}')
  etiqueta('A9', 'Fecha de fabricación'); celda('B9:C9', '{{lote.fecha_fabricacion}}'); etiqueta('D9', 'Fecha de vencimiento'); celda('E9:F9', '{{lote.fecha_vencimiento}}')
  etiqueta('A10', 'Cantidad a producir'); celda('B10:C10', '{{cantidad.planificada_unidad}}'); etiqueta('D10', 'Operario'); celda('E10:F10', '{{personal.operario}}')
  etiqueta('A11', 'Cantidad producida'); celda('B11:C11', '{{cantidad.producida}}'); etiqueta('D11', 'Empaque utilizado'); celda('E11:F11', '{{cantidad.empaque_utilizado}}')
  etiqueta('A12', '¿Producto conforme?'); celda('B12', 'SI  {{check.conforme.si}}', { h: 'center' }); celda('C12', 'NO  {{check.conforme.no}}', { h: 'center' })
  etiqueta('D12', '¿Empacó surtido?'); celda('E12', 'SI  {{check.empaco_surtido.si}}', { h: 'center' }); celda('F12', 'NO  {{check.empaco_surtido.no}}', { h: 'center' })
  etiqueta('A13', '¿Quedó sin empacar?'); celda('B13', 'SI  {{check.hay_sobrante.si}}', { h: 'center' }); celda('C13', 'NO  {{check.hay_sobrante.no}}', { h: 'center' })
  etiqueta('D13', 'Cantidad sobrante'); celda('E13:F13', '{{cantidad.sobrante}}')

  seccion(14, 'LISTA DE INGREDIENTES Y TRAZABILIDAD')
  ;['Ingrediente', 'Lote MP', 'Vence', 'Proveedor', '% mezcla', 'Cantidad (g)'].forEach((t, i) => celda(`${colALetra(i + 1)}15`, t, { bold: true, fill: 'FFE9EFE7' }))
  ;['{{ing.nombre}}', '{{ing.lote}}', '{{ing.vence}}', '{{ing.proveedor}}', '{{ing.porcentaje}}', '{{ing.cantidad_g}}'].forEach((t, i) => celda(`${colALetra(i + 1)}16`, t, { size: i === 0 ? 11 : 10, h: i >= 4 ? 'right' : 'left' }))

  seccion(17, 'TIEMPOS')
  etiqueta('A18', 'Hora de inicio'); celda('B18:C18', '{{tiempo.hora_inicio}}'); etiqueta('D18', 'Hora de finalización'); celda('E18:F18', '{{tiempo.hora_fin}}')
  celda('A19:C19', 'Proceso / subproceso', { bold: true, fill: 'FFE9EFE7' }); celda('D19', 'Fecha', { bold: true, fill: 'FFE9EFE7' }); celda('E19', 'Inicio', { bold: true, fill: 'FFE9EFE7' }); celda('F19', 'Fin', { bold: true, fill: 'FFE9EFE7' })
  celda('A20:C20', '{{proc.nombre}}'); celda('D20', '{{proc.fecha}}'); celda('E20', '{{proc.inicio}}'); celda('F20', '{{proc.fin}}')

  seccion(21, 'ROTULADO DEL PRODUCTO FINAL')
  etiqueta('A22', 'Lote (Lot.)'); celda('B22:C22', '{{rotulo.lote}}'); etiqueta('D22', 'Vence (Exp.) ddmmaa'); celda('E22:F22', '{{rotulo.vence}}')
  etiqueta('A23', 'Empacado surtido con lote(s)'); celda('B23:F23', '{{lote.mezcla}}')

  seccion(24, 'PARÁMETROS DE CALIDAD')
  celda('A25:B25', 'Parámetro', { bold: true, fill: 'FFE9EFE7' }); celda('C25', 'Especificación', { bold: true, fill: 'FFE9EFE7' }); celda('D25', 'Valor obtenido', { bold: true, fill: 'FFE9EFE7' }); celda('E25:F25', '¿Cumple?', { bold: true, fill: 'FFE9EFE7' })
  celda('A26:B26', '{{cal.nombre}}'); celda('C26', '{{cal.esperado}}'); celda('D26', '{{cal.obtenido}}'); celda('E26:F26', '{{cal.cumple}}')

  seccion(27, 'DATOS ADICIONALES')
  etiqueta('A28', '{{extra.nombre}}'); celda('B28:F28', '{{extra.valor}}')

  seccion(29, 'CONTROLES DE PROCESO Y CALIDAD')
  const sino = (fila, txt, id, col) => {   // «SI [X]  NO [X]» en dos celdas pequeñas
    const [a, b] = col === 1 ? ['B', 'C'] : ['E', 'F']
    celda(`${a}${fila}`, `SI  {{${id}.si}}`, { h: 'center' }); celda(`${b}${fila}`, `NO  {{${id}.no}}`, { h: 'center' })
    etiqueta(col === 1 ? `A${fila}` : `D${fila}`, txt)
  }
  sino(30, 'Despeje de línea realizado', 'check.despeje_linea', 1); sino(30, 'Equipos limpios y desinfectados', 'check.equipos_limpios', 2)
  sino(31, 'Materia prima verificada', 'check.mp_verificada', 1); sino(31, 'Balanzas calibradas', 'check.balanzas_calibradas', 2)
  etiqueta('A32', 'Temp. de proceso (°C)'); celda('B32:C32', '{{calidad.temp_proceso}}'); etiqueta('D32', '°Brix'); celda('E32:F32', '{{calidad.brix}}')
  etiqueta('A33', 'pH'); celda('B33:C33', '{{calidad.ph}}'); etiqueta('D33', 'Temp. de envasado (°C)'); celda('E33:F33', '{{calidad.temp_envasado}}')
  sino(34, 'Sellado conforme', 'check.sellado_ok', 1); sino(34, 'Pasó detector de metales', 'check.detector_metales', 2)
  etiqueta('A35', 'Organolépticos'); celda('B35:F35', 'Color: {{calidad.color}}  ·  Olor: {{calidad.olor}}  ·  Sabor: {{calidad.sabor}}  ·  Textura: {{calidad.textura}}', { size: 10 }); alto(35, 30)

  seccion(36, 'LIBERACIÓN DEL LOTE Y DESPACHO')
  etiqueta('A37', 'Estado del lote'); celda('B37:C37', '{{liberacion.estado}}'); etiqueta('D37', 'Aprobado por'); celda('E37:F37', '{{liberacion.aprobado_por}}')
  etiqueta('A38', 'Fecha de liberación'); celda('B38:C38', '{{liberacion.fecha}}'); etiqueta('D38', 'Destino'); celda('E38:F38', '{{traza.destino}}')

  seccion(39, 'NO CONFORMIDADES Y ACCIONES')
  etiqueta('A40', 'Descripción'); celda('B40:F40', '{{nc.descripcion}}', { v: 'top' }); alto(40, 34)
  etiqueta('A41', 'Acción correctiva'); celda('B41:C41', '{{nc.accion_correctiva}}'); etiqueta('D41', 'Disposición'); celda('E41:F41', '{{nc.disposicion}}')

  seccion(42, 'OBSERVACIONES')
  celda('A43:F43', '{{obs.notas}}', { v: 'top' }); alto(43, 60)

  alto(44, 44)
  celda('A45:C45', 'ENTREGADO POR', { h: 'center', borde: false }); celda('D45:F45', 'RECIBIDO POR', { h: 'center', borde: false })
  for (let c = 1; c <= 6; c++) ws.getCell(45, c).border = { top: { style: 'thin', color: { argb: GRIS } } }

  // Hoja de instructivo
  const wi = wb.addWorksheet('_INSTRUCTIVO')
  wi.getColumn(1).width = 120
  let fi = 1
  const tit = wi.getCell(fi++, 1); tit.value = 'INSTRUCTIVO — Cómo personalizar la plantilla de la Orden de Producción (PTZ-OR-01)'
  tit.font = { bold: true, size: 14, color: { argb: VERDE } }; fi++
  for (const sec of INSTRUCTIVO) {
    const t = wi.getCell(fi++, 1); t.value = sec.titulo; t.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }; t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
    for (const it of sec.items) { const c = wi.getCell(fi++, 1); c.value = '• ' + it; c.alignment = { wrapText: true, vertical: 'top' } }
    fi++
  }

  // Hoja de biblioteca
  const wbib = wb.addWorksheet('_BIBLIOTECA')
  ;[34, 44, 22, 12, 30, 22].forEach((w, i) => { wbib.getColumn(i + 1).width = w })
  const enc = ['MARCADOR (copiar tal cual)', 'Qué es', 'Grupo', 'Tipo', 'Ejemplo', 'Estado']
  enc.forEach((t, i) => { const c = wbib.getCell(1, i + 1); c.value = t; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } } })
  let fb = 2
  const volcar = (grupo, campos, esTabla) => {
    for (const c of campos) {
      const fila = [`{{${c.id}}}`, c.label + (c.desc ? ` — ${c.desc}` : ''), grupo, esTabla ? 'tabla' : c.tipo, c.ejemplo || '', c.estado === 'auto' ? 'El sistema lo llena' : c.estado === 'captura' ? 'Lo captura el operario en la orden' : 'Queda en blanco (escribir a mano)']
      fila.forEach((v, i) => { const x = wbib.getCell(fb, i + 1); x.value = v; x.alignment = { wrapText: true, vertical: 'top' }; if (i === 5 && c.estado === 'blanco') x.font = { color: { argb: 'FF9A6A00' } } })
      fb++
    }
  }
  for (const g of GRUPOS_EXPANDIDOS) volcar(g.titulo, g.campos, false)
  for (const l of LISTAS) volcar(l.titulo + ' (tabla: repite la fila)', l.campos, true)
  wbib.views = [{ state: 'frozen', ySplit: 1 }]
  wbib.autoFilter = { from: 'A1', to: 'F1' }

  return await wb.xlsx.writeBuffer()
}

export function descargarBlob(data, nombre, tipo) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: tipo || 'application/octet-stream' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

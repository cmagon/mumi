/**
 * Método de loteo por producto (ficha) → autosugerencia al diligenciar órdenes.
 *
 * Config moderna: { metodo: 'patron', partes: [...], reinicio }
 * Compat: métodos legacy (seq_aa, fecha_ddmmaa, …) se convierten a partes.
 *
 * Sin config / sin partes → no se sugiere nada.
 */

export const METODO_NINGUNO = 'ninguno'

/** Fichas clicables para armar el patrón de lote. */
export const FICHAS_LOTEO = [
  { id: 'seq', tipo: 'seq', label: 'Numeración', hint: '01 → 02…', unica: true },
  { id: 'aa', tipo: 'aa', label: 'Año aa', hint: '26', grupoAnio: true },
  { id: 'aaaa', tipo: 'aaaa', label: 'Año aaaa', hint: '2026', grupoAnio: true },
  { id: 'mm', tipo: 'mm', label: 'Mes mm', hint: '08', unica: true },
  { id: 'dd', tipo: 'dd', label: 'Día dd', hint: '06', unica: true },
  { id: 'texto', tipo: 'texto', label: 'Texto', hint: 'ABC…', pideValor: true },
  { id: 'sep', tipo: 'sep', label: 'Separador', hint: '-', pideValor: true, defaultValor: '-' },
]

const p2 = (n) => String(n).padStart(2, '0')

function padSeq(n, ancho) {
  return String(n).padStart(Math.max(1, ancho || 2), '0')
}

function anioStr(fecha, formato) {
  const y = fecha.getFullYear()
  return formato === 'aaaa' ? String(y) : String(y).slice(2)
}

/** Convierte config legacy → array de partes. */
export function configAPartes(raw) {
  if (!raw || typeof raw !== 'object') return []
  if (Array.isArray(raw.partes) && raw.partes.length) {
    return raw.partes.map(normalizarParte).filter(Boolean)
  }
  const metodo = String(raw.metodo || '').trim()
  const ancho = Math.min(8, Math.max(1, parseInt(raw.ancho_seq, 10) || 2))
  const prefijo = String(raw.prefijo || '').trim()
  const sep = raw.separador != null ? String(raw.separador) : ''

  switch (metodo) {
    case 'patron':
      return []
    case 'seq_aa':
      return [{ tipo: 'seq', ancho }, { tipo: 'aa' }]
    case 'seq_aaaa':
      return [{ tipo: 'seq', ancho }, { tipo: 'aaaa' }]
    case 'seq':
      return [{ tipo: 'seq', ancho }]
    case 'fecha_ddmmaa':
      return [{ tipo: 'dd' }, { tipo: 'mm' }, { tipo: 'aa' }]
    case 'fecha_ddmmaaaa':
      return [{ tipo: 'dd' }, { tipo: 'mm' }, { tipo: 'aaaa' }]
    case 'prefijo_seq':
      return [
        ...(prefijo ? [{ tipo: 'texto', valor: prefijo }] : []),
        { tipo: 'seq', ancho },
      ]
    case 'anio_seq': {
      const partes = [{ tipo: raw.formato_anio === 'aaaa' ? 'aaaa' : 'aa' }]
      if (sep) partes.push({ tipo: 'sep', valor: sep })
      partes.push({ tipo: 'seq', ancho })
      return partes
    }
    default:
      return []
  }
}

function normalizarParte(p) {
  if (!p || typeof p !== 'object') return null
  const tipo = String(p.tipo || '').trim()
  if (!tipo) return null
  if (tipo === 'seq') {
    return { tipo: 'seq', ancho: Math.min(8, Math.max(1, parseInt(p.ancho, 10) || 2)) }
  }
  if (tipo === 'texto' || tipo === 'sep') {
    const valor = String(p.valor ?? (tipo === 'sep' ? '-' : '')).trim()
    if (tipo === 'texto' && !valor) return { tipo: 'texto', valor: '' }
    return { tipo, valor: valor || (tipo === 'sep' ? '-' : '') }
  }
  if (['aa', 'aaaa', 'mm', 'dd'].includes(tipo)) return { tipo }
  return null
}

/**
 * Normaliza cualquier forma de config a { metodo:'patron', partes, reinicio } o null.
 */
export function normalizarMetodoLoteo(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (String(raw.metodo || '') === METODO_NINGUNO) return null
  const partes = configAPartes(raw)
  if (!partes.length) return null
  const tieneAnio = partes.some(p => p.tipo === 'aa' || p.tipo === 'aaaa')
  const reinicio = raw.reinicio === 'nunca' ? 'nunca' : (tieneAnio ? 'anual' : 'nunca')
  return { metodo: 'patron', partes, reinicio }
}

/** Etiqueta corta de una parte para chips. */
export function etiquetaParte(parte) {
  if (!parte) return ''
  if (parte.tipo === 'seq') return `Nº (${parte.ancho || 2})`
  if (parte.tipo === 'aa') return 'aa'
  if (parte.tipo === 'aaaa') return 'aaaa'
  if (parte.tipo === 'mm') return 'mm'
  if (parte.tipo === 'dd') return 'dd'
  if (parte.tipo === 'texto') return parte.valor ? `"${parte.valor}"` : 'Texto…'
  if (parte.tipo === 'sep') return parte.valor || '-'
  return parte.tipo
}

/** Valor de ejemplo / real de una parte (sin secuencia). */
function valorParteFija(parte, fecha) {
  if (parte.tipo === 'aa') return anioStr(fecha, 'aa')
  if (parte.tipo === 'aaaa') return anioStr(fecha, 'aaaa')
  if (parte.tipo === 'mm') return p2(fecha.getMonth() + 1)
  if (parte.tipo === 'dd') return p2(fecha.getDate())
  if (parte.tipo === 'texto' || parte.tipo === 'sep') return parte.valor || ''
  return null
}

/** Longitud fija de una parte (null = variable / seq). */
function lenFija(parte) {
  if (parte.tipo === 'aa' || parte.tipo === 'mm' || parte.tipo === 'dd') return 2
  if (parte.tipo === 'aaaa') return 4
  if (parte.tipo === 'texto' || parte.tipo === 'sep') return (parte.valor || '').length
  return null
}

/**
 * Construye el lote a partir de partes + número de secuencia.
 * Si no hay seq, arma solo con fecha/texto.
 */
export function construirLote(partes, seqNum, fecha = new Date()) {
  const list = (partes || []).map(normalizarParte).filter(Boolean)
  if (!list.length) return null
  let out = ''
  for (const p of list) {
    if (p.tipo === 'seq') out += padSeq(seqNum, p.ancho)
    else out += valorParteFija(p, fecha) ?? ''
  }
  return out
}

/**
 * Extrae el número de secuencia de un lote según el patrón.
 * Devuelve null si no encaja.
 */
export function parseSeqDeLote(lote, config, fechaRef = new Date()) {
  const c = normalizarMetodoLoteo(config)
  const L = String(lote || '').trim()
  if (!c || !L) return null

  const partes = c.partes
  const idxSeq = partes.findIndex(p => p.tipo === 'seq')
  if (idxSeq < 0) return null

  // Consumir prefijo fijo (izquierda)
  let i = 0
  for (let k = 0; k < idxSeq; k++) {
    const p = partes[k]
    const v = valorParteFija(p, fechaRef)
    const len = lenFija(p)
    if (p.tipo === 'texto' || p.tipo === 'sep') {
      if (!L.startsWith(p.valor || '', i)) return null
      i += (p.valor || '').length
      continue
    }
    // fecha: validar dígitos de longitud fija; con reinicio anual exigir año actual
    if (len == null) return null
    const slice = L.slice(i, i + len)
    if (!/^\d+$/.test(slice) || slice.length !== len) return null
    if ((p.tipo === 'aa' || p.tipo === 'aaaa') && c.reinicio === 'anual' && slice !== v) return null
    if ((p.tipo === 'mm' || p.tipo === 'dd') && c.reinicio === 'anual') {
      // mes/día no filtran el año; solo validamos dígitos
    }
    i += len
  }

  // Consumir sufijo fijo (derecha)
  let j = L.length
  for (let k = partes.length - 1; k > idxSeq; k--) {
    const p = partes[k]
    const v = valorParteFija(p, fechaRef)
    const len = lenFija(p)
    if (p.tipo === 'texto' || p.tipo === 'sep') {
      const lit = p.valor || ''
      if (L.slice(j - lit.length, j) !== lit) return null
      j -= lit.length
      continue
    }
    if (len == null) return null
    const slice = L.slice(j - len, j)
    if (!/^\d+$/.test(slice) || slice.length !== len) return null
    if ((p.tipo === 'aa' || p.tipo === 'aaaa') && c.reinicio === 'anual' && slice !== v) return null
    j -= len
  }

  const seqPart = L.slice(i, j)
  if (!/^\d+$/.test(seqPart)) return null
  return parseInt(seqPart, 10)
}

/**
 * Sugiere el siguiente lote. `lotesPrevios`: strings de lotes del mismo producto.
 * Devuelve null si no hay método configurado.
 */
export function sugerirSiguienteLote(config, lotesPrevios = [], { fecha = new Date() } = {}) {
  const c = normalizarMetodoLoteo(config)
  if (!c) return null

  const previos = (lotesPrevios || []).map(l => String(l || '').trim()).filter(Boolean)
  const tieneSeq = c.partes.some(p => p.tipo === 'seq')

  // Solo fecha/texto: lote del día; si ya existe → base-2, base-3…
  if (!tieneSeq) {
    const base = construirLote(c.partes, 1, fecha)
    if (!base) return null
    if (!previos.includes(base)) return base
    let n = 2
    while (previos.includes(`${base}-${n}`)) n += 1
    return `${base}-${n}`
  }

  let max = 0
  for (const l of previos) {
    const seq = parseSeqDeLote(l, c, fecha)
    if (seq != null && Number.isFinite(seq)) max = Math.max(max, seq)
  }
  return construirLote(c.partes, max + 1, fecha)
}

/** Ejemplo del primer lote con la config actual. */
export function ejemploLote(config, fecha = new Date()) {
  return sugerirSiguienteLote(config, [], { fecha }) || '—'
}

/** Agrega una ficha al patrón (respeta unicidad aa/aaaa, seq, mm, dd). */
export function agregarParte(partes, ficha, valorExtra = '') {
  const list = [...(partes || []).map(normalizarParte).filter(Boolean)]
  const tipo = ficha.tipo

  if (ficha.grupoAnio) {
    const sinAnio = list.filter(p => p.tipo !== 'aa' && p.tipo !== 'aaaa')
    return [...sinAnio, { tipo }]
  }
  if (tipo === 'seq') {
    if (list.some(p => p.tipo === 'seq')) {
      return list.map(p => (p.tipo === 'seq' ? { tipo: 'seq', ancho: p.ancho || 2 } : p))
    }
    return [...list, { tipo: 'seq', ancho: 2 }]
  }
  if (tipo === 'mm' || tipo === 'dd') {
    if (list.some(p => p.tipo === tipo)) return list
    return [...list, { tipo }]
  }
  if (tipo === 'texto') {
    return [...list, { tipo: 'texto', valor: String(valorExtra || '').toUpperCase() }]
  }
  if (tipo === 'sep') {
    return [...list, { tipo: 'sep', valor: String(valorExtra || ficha.defaultValor || '-') }]
  }
  return [...list, { tipo }]
}

export function quitarParte(partes, index) {
  return (partes || []).filter((_, i) => i !== index)
}

export function actualizarParte(partes, index, patch) {
  return (partes || []).map((p, i) => {
    if (i !== index) return p
    return normalizarParte({ ...p, ...patch }) || p
  }).filter(Boolean)
}

/** Config lista para guardar en DB a partir de partes. */
export function configDesdePartes(partes) {
  const list = (partes || []).map(normalizarParte).filter(Boolean)
  if (!list.length) return null
  const tieneAnio = list.some(p => p.tipo === 'aa' || p.tipo === 'aaaa')
  return { metodo: 'patron', partes: list, reinicio: tieneAnio ? 'anual' : 'nunca' }
}

// --- Compat con UI antigua (presets list) ---
export const PRESETS_LOTEO = [
  { id: 'ninguno', label: 'Sin autosugerencia', desc: '', config: null },
  { id: 'seq_aa', label: 'Secuencia + año (aa)', desc: '', config: { metodo: 'seq_aa', ancho_seq: 2, reinicio: 'anual' } },
  { id: 'seq_aaaa', label: 'Secuencia + año (aaaa)', desc: '', config: { metodo: 'seq_aaaa', ancho_seq: 2, reinicio: 'anual' } },
  { id: 'seq_2', label: 'Solo secuencia (2)', desc: '', config: { metodo: 'seq', ancho_seq: 2 } },
  { id: 'fecha_ddmmaa', label: 'Fecha ddmmaa', desc: '', config: { metodo: 'fecha_ddmmaa' } },
]

export function presetIdDeConfig(config) {
  const c = normalizarMetodoLoteo(config)
  if (!c) return 'ninguno'
  return 'custom'
}

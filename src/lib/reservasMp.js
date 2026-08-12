const ESTADOS_ABIERTOS = new Set(['pendiente', 'en_proceso', 'rechazada'])
const EPS = 0.001

export function esCategoriaEmpaque(categoria) {
  return /empaque|envase/i.test(String(categoria || ''))
}

/** Cantidad de un ítem de snapshot que NO tiene respaldo de lote PEPS (empaque / sin lote). */
export function cantidadSinLotes(it) {
  const lotes = Array.isArray(it?.lotes) ? it.lotes : []
  const qLotes = lotes.reduce((s, l) => s + (Number(l.cantidad) || 0), 0)
  if (Number(it?.sin_lote_cantidad) > 0) return Number(it.sin_lote_cantidad)
  if (it?.es_empaque || it?.sin_lote) return Math.max(0, (Number(it?.consumo) || 0) - qLotes)
  if (!lotes.length) return Number(it?.consumo) || 0
  return 0
}

/** Reservas abiertas por MP: con lote PEPS vs solo stock (empaque / sin lote). */
export function resumenReservasPorMp(ordenes) {
  const byMp = new Map()
  for (const o of ordenes || []) {
    const abierta = ESTADOS_ABIERTOS.has(o.estado)
    const items = Array.isArray(o.lotes_reservados) ? o.lotes_reservados : []
    for (const it of items) {
      const key = String(it.mp_id)
      const cur = byMp.get(key) || { conLotes: 0, sinLotes: 0, abiertas: 0 }
      const lotes = Array.isArray(it.lotes) ? it.lotes : []
      const qLotes = lotes.reduce((s, l) => s + (Number(l.cantidad) || 0), 0)
      if (abierta) {
        cur.conLotes += qLotes
        cur.sinLotes += cantidadSinLotes(it)
        cur.abiertas += 1
      }
      byMp.set(key, cur)
    }
  }
  return byMp
}

export function reservadoEnLotes(lotesDeMp) {
  return (lotesDeMp || []).reduce((s, l) => s + (Number(l.cantidad_reservada) || 0), 0)
}

/**
 * Interpreta stock vs lotes vs reservas de órdenes.
 * - ok: stock = disponible PEPS
 * - reserva_sin_peps: el hueco es empaque/sin lote amarrado a una orden (NO igualar)
 * - reserva_peps: hay cantidad_reservada en lotes (debe verse en Reservas MP)
 * - descuadre: hueco real, Igualar/Crear PEPS sí aplica
 */
export function explicarDescuadrePeps({ stock, porLotes, reservadoLotes = 0, sinLotesOrdenes = 0 }) {
  const st = Number(stock) || 0
  const actual = Number(porLotes) || 0
  const reserved = Number(reservadoLotes) || 0
  const sinPeps = Number(sinLotesOrdenes) || 0
  const diff = st - actual
  if (Math.abs(diff) <= EPS && reserved <= EPS && sinPeps <= EPS) {
    return null
  }
  // Stock bajó al reservar empaque, pero los lotes no: el hueco cabe en lo amarrado sin PEPS
  if (diff < -EPS && sinPeps > EPS && (-diff) <= sinPeps + EPS) {
    return { stock: st, porLotes: actual, diff, reservadoLotes: reserved, sinLotesOrdenes: sinPeps, tipo: 'reserva_sin_peps', igualar: false }
  }
  // Parte del hueco (lotes > stock) está explicada por reservas sin PEPS
  if (diff < -EPS && sinPeps > EPS && (-diff) - sinPeps > EPS) {
    const resto = -diff - sinPeps
    return { stock: st, porLotes: actual, diff, reservadoLotes: reserved, sinLotesOrdenes: sinPeps, resto, tipo: 'mixto_sin_peps', igualar: true }
  }
  // Stock no bajó al reservar PEPS: stock - actual ≈ reservado en lotes
  if (diff > EPS && Math.abs(diff - reserved) <= EPS) {
    return { stock: st, porLotes: actual, diff, reservadoLotes: reserved, sinLotesOrdenes: sinPeps, tipo: 'reserva_peps', igualar: false }
  }
  if (Math.abs(diff) <= EPS) {
    if (reserved > EPS) {
      return { stock: st, porLotes: actual, diff: 0, reservadoLotes: reserved, sinLotesOrdenes: sinPeps, tipo: 'reserva_peps', igualar: false }
    }
    return null
  }
  return { stock: st, porLotes: actual, diff, reservadoLotes: reserved, sinLotesOrdenes: sinPeps, tipo: 'descuadre', igualar: true }
}

/**
 * Si la reserva bajó raw_materials.stock al tomarse.
 * - stock_movido explícito (reservas nuevas de empaque e ingredientes)
 * - empaque sin flag: ventana en la que el empaque NO bajaba stock (no devolver)
 * - resto (ingredientes clásicos): sí bajó
 */
export function stockSeMovioAlReservar(it) {
  if (typeof it?.stock_movido === 'boolean') return it.stock_movido
  if (it?.es_empaque) return false
  return true
}

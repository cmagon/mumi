import { supabase } from './supabase'

// Crea un lote a partir de una ENTRADA de materia prima.
// `orden_id` (opcional) marca el lote que produjo una orden, para poder revertirlo si se devuelve.
export async function crearLoteEntrada({ mp_id, lote, vencimiento, fecha, cantidad, costo_unitario, creado_por, proveedor, orden_id }) {
  const base = {
    mp_id, lote: lote || '', vencimiento: vencimiento || null,
    fecha_entrada: fecha || new Date().toISOString().split('T')[0],
    cantidad_inicial: cantidad, cantidad_actual: cantidad,
    costo_unitario: costo_unitario || 0, creado_por: creado_por || '',
    ...(proveedor ? { proveedor } : {}),
  }
  if (!orden_id) { await supabase.from('raw_material_lots').insert(base); return }
  // La columna orden_id es de la migración v127; si no está, se inserta sin ella
  const { error } = await supabase.from('raw_material_lots').insert({ ...base, orden_id })
  if (error && /orden_id/i.test(error.message || '')) await supabase.from('raw_material_lots').insert(base)
}

// Revierte los lotes que generó una orden de producción (al devolverla). Solo descuenta lo que
// siga disponible: si ya se consumió parte de ese lote, esa parte no se puede deshacer.
// Devuelve { revertido, noRevertible } en unidades.
export async function revertirLotesDeOrden(orden_id) {
  if (!orden_id) return { revertido: 0, noRevertible: 0 }
  const { data: lotes, error } = await supabase.from('raw_material_lots').select('*').eq('orden_id', orden_id)
  if (error || !lotes?.length) return { revertido: 0, noRevertible: 0 }
  let revertido = 0, noRevertible = 0
  for (const l of lotes) {
    const disponible = Number(l.cantidad_actual) || 0
    const inicial = Number(l.cantidad_inicial) || 0
    revertido += disponible
    noRevertible += Math.max(0, inicial - disponible)   // ya consumido o reservado por otra orden
    await supabase.from('raw_material_lots').delete().eq('id', l.id)
  }
  return { revertido, noRevertible }
}

// Costo total y unitario PEPS de una lista de lotes tomados. Es el costo REAL de lo consumido
// (cada lote a su propio costo de entrada), a diferencia del promedio ponderado que guarda
// raw_materials.precio. `faltante` es la parte sin respaldo de lote: se valora al precio de
// referencia que se pase, porque no hay lote del cual tomar su costo.
export function costoPEPS(tomados = [], faltante = 0, precioReferencia = 0) {
  const costoLotes = tomados.reduce((s, l) => s + (l.cantidad || 0) * (l.costo_unitario || 0), 0)
  const cantLotes  = tomados.reduce((s, l) => s + (l.cantidad || 0), 0)
  const costoTotal = costoLotes + (faltante || 0) * (precioReferencia || 0)
  const cantTotal  = cantLotes + (faltante || 0)
  return { costoTotal, cantidad: cantTotal, costoUnitario: cantTotal > 0 ? costoTotal / cantTotal : 0, sinLote: faltante || 0 }
}

// Consume `cantidad` aplicando PEPS: primero el lote más próximo a vencer y más antiguo.
// Devuelve { consumidos: [{lote,vencimiento,cantidad,costo_unitario}], faltante }.
export async function consumirPEPS({ mp_id, cantidad }) {
  const { data: lotes } = await supabase.from('raw_material_lots').select('*')
    .eq('mp_id', mp_id).gt('cantidad_actual', 0)
    .order('vencimiento', { ascending: true, nullsFirst: false })
    .order('fecha_entrada', { ascending: true })
  let restante = cantidad
  const consumidos = []
  for (const l of (lotes || [])) {
    if (restante <= 0) break
    const toma = Math.min(l.cantidad_actual, restante)
    await supabase.from('raw_material_lots').update({ cantidad_actual: l.cantidad_actual - toma }).eq('id', l.id)
    // Se arrastra el costo del lote para poder valorar la salida a costo real PEPS
    consumidos.push({ lote: l.lote, vencimiento: l.vencimiento, cantidad: toma, costo_unitario: l.costo_unitario || 0 })
    restante -= toma
  }
  return { consumidos, faltante: restante > 0 ? restante : 0 }
}

// RESERVA `cantidad` aplicando PEPS: mueve de "disponible" (cantidad_actual) a "reservado"
// (cantidad_reservada). Se usa cuando una orden inicia producción. Devuelve los lotes tomados.
// Versión ATÓMICA en SQL (migración v90): toda la reserva ocurre en una transacción en la BD
// (con bloqueo de filas), así no queda a medias si se cae la red / se cierra la pestaña y no
// hay carreras entre dos usuarios reservando a la vez. Si la función SQL aún no está desplegada,
// cae al método anterior (escrituras desde el cliente) para no romper la producción.
export async function reservarPEPS({ mp_id, cantidad, preferLoteId = null }) {
  const { data, error } = await supabase.rpc('reservar_peps_lotes', { p_mp_id: mp_id, p_cantidad: cantidad, p_prefer_lote: preferLoteId || null })
  if (!error && data) {
    let reservados = data.reservados || []
    // Si la BD aún no tiene la migración v126, la RPC no devuelve el costo del lote: se completa
    // aquí para que la orden pueda valorar su consumo a costo real PEPS igualmente.
    if (reservados.length && reservados.some(r => r.costo_unitario == null)) {
      try {
        const { data: costos } = await supabase.from('raw_material_lots')
          .select('id, costo_unitario').in('id', reservados.map(r => r.id).filter(Boolean))
        const porId = Object.fromEntries((costos || []).map(c => [String(c.id), c.costo_unitario || 0]))
        reservados = reservados.map(r => ({ ...r, costo_unitario: r.costo_unitario ?? (porId[String(r.id)] || 0) }))
      } catch { /* sin costos: la orden cae al precio promedio */ }
    }
    return { reservados, faltante: Number(data.faltante) || 0 }
  }
  // Fallback (migración v90 sin correr): método anterior, no atómico
  const { data: raw } = await supabase.from('raw_material_lots').select('*')
    .eq('mp_id', mp_id).gt('cantidad_actual', 0)
    .order('vencimiento', { ascending: true, nullsFirst: false })
    .order('fecha_entrada', { ascending: true })
  let lotes = raw || []
  if (preferLoteId) {
    const pref = lotes.filter(l => String(l.id) === String(preferLoteId))
    const resto = lotes.filter(l => String(l.id) !== String(preferLoteId))
    lotes = [...pref, ...resto]
  }
  const reservados = []
  let restante = cantidad
  for (const l of lotes) {
    if (restante <= 0) break
    const toma = Math.min(l.cantidad_actual, restante)
    await supabase.from('raw_material_lots').update({
      cantidad_actual: l.cantidad_actual - toma,
      cantidad_reservada: (l.cantidad_reservada || 0) + toma,
    }).eq('id', l.id)
    reservados.push({ id: l.id, lote: l.lote, vencimiento: l.vencimiento, cantidad: toma, costo_unitario: l.costo_unitario || 0 })
    restante -= toma
  }
  return { reservados, faltante: restante > 0 ? restante : 0 }
}

// LIBERA reservas (orden eliminada/no ejecutada): vuelve de "reservado" a "disponible".
export async function liberarReservaLotes(reservas = []) {
  const conId = (reservas || []).filter(r => r.id)
  if (!conId.length) return
  const { error } = await supabase.rpc('liberar_reserva_lotes', { p_reservas: conId.map(r => ({ id: r.id, cantidad: r.cantidad })) })
  if (!error) return
  // Fallback (migración v90 sin correr)
  for (const r of conId) {
    const { data: l } = await supabase.from('raw_material_lots').select('cantidad_actual, cantidad_reservada').eq('id', r.id).single()
    if (!l) continue
    await supabase.from('raw_material_lots').update({
      cantidad_actual: (l.cantidad_actual || 0) + r.cantidad,
      cantidad_reservada: Math.max(0, (l.cantidad_reservada || 0) - r.cantidad),
    }).eq('id', r.id)
  }
}

// CONSUME definitivo (orden cerrada/enviada): quita de "reservado" (ya salió de disponible al reservar).
export async function consumirReservaLotes(reservas = []) {
  const conId = (reservas || []).filter(r => r.id)
  if (!conId.length) return
  const { error } = await supabase.rpc('consumir_reserva_lotes', { p_reservas: conId.map(r => ({ id: r.id, cantidad: r.cantidad })) })
  if (!error) return
  // Fallback (migración v90 sin correr)
  for (const r of conId) {
    const { data: l } = await supabase.from('raw_material_lots').select('cantidad_reservada').eq('id', r.id).single()
    if (!l) continue
    await supabase.from('raw_material_lots').update({
      cantidad_reservada: Math.max(0, (l.cantidad_reservada || 0) - r.cantidad),
    }).eq('id', r.id)
  }
}

// Consume de un LOTE específico (para ajustes manuales donde se fuerza el lote).
// Devuelve { consumidos, faltante }.
export async function consumirLote({ lote_id, cantidad }) {
  const { data: l } = await supabase.from('raw_material_lots').select('*').eq('id', lote_id).single()
  if (!l) return { consumidos: [], faltante: cantidad }
  const toma = Math.min(l.cantidad_actual || 0, cantidad)
  if (toma > 0) await supabase.from('raw_material_lots').update({ cantidad_actual: (l.cantidad_actual || 0) - toma }).eq('id', l.id)
  return { consumidos: toma > 0 ? [{ lote: l.lote, vencimiento: l.vencimiento, cantidad: toma }] : [], faltante: cantidad - toma }
}

// Estado de un lote según su vencimiento
export function estadoLote(vencimiento, diasAviso = 15) {
  if (!vencimiento) return 'ok'
  const hoy = new Date().toISOString().split('T')[0]
  const limite = new Date(); limite.setDate(limite.getDate() + diasAviso)
  const lim = limite.toISOString().split('T')[0]
  if (vencimiento < hoy) return 'vencido'
  if (vencimiento <= lim) return 'por_vencer'
  return 'ok'
}

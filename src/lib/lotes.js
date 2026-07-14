import { supabase } from './supabase'

// Crea un lote a partir de una ENTRADA de materia prima.
export async function crearLoteEntrada({ mp_id, lote, vencimiento, fecha, cantidad, costo_unitario, creado_por, proveedor }) {
  await supabase.from('raw_material_lots').insert({
    mp_id, lote: lote || '', vencimiento: vencimiento || null,
    fecha_entrada: fecha || new Date().toISOString().split('T')[0],
    cantidad_inicial: cantidad, cantidad_actual: cantidad,
    costo_unitario: costo_unitario || 0, creado_por: creado_por || '',
    ...(proveedor ? { proveedor } : {}),
  })
}

// Consume `cantidad` aplicando PEPS: primero el lote más próximo a vencer y más antiguo.
// Devuelve { consumidos: [{lote,vencimiento,cantidad}], faltante }.
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
    consumidos.push({ lote: l.lote, vencimiento: l.vencimiento, cantidad: toma })
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
  if (!error && data) return { reservados: data.reservados || [], faltante: Number(data.faltante) || 0 }
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
    reservados.push({ id: l.id, lote: l.lote, vencimiento: l.vencimiento, cantidad: toma })
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

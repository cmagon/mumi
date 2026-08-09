import { supabase } from './supabase'

// Código de lote para stock sin trazabilidad (empaque, ajustes, MP históricas sin PEPS).
export const LOTE_SIN_CODIGO = 'sin lote'

export function esLoteSinCodigo(lote) {
  const t = String(lote || '').trim().toLowerCase()
  return !t || t === LOTE_SIN_CODIGO || t === 's/n' || t === '(s/n)'
}

function codigoLoteEntrada(lote) {
  const t = String(lote || '').trim()
  return t || LOTE_SIN_CODIGO
}

// Crea un lote a partir de una ENTRADA de materia prima.
// Sin código de lote → se registra como "sin lote" (sigue entrando al PEPS).
// `orden_id` (opcional) marca el lote que produjo una orden, para poder revertirlo si se devuelve.
// Devuelve { id } del lote creado (o null si el insert no devolvió fila).
export async function crearLoteEntrada({ mp_id, lote, vencimiento, fecha, cantidad, costo_unitario, creado_por, proveedor, orden_id }) {
  const prov = String(proveedor || '').trim() || null
  const base = {
    mp_id, lote: codigoLoteEntrada(lote), vencimiento: vencimiento || null,
    fecha_entrada: fecha || new Date().toISOString().split('T')[0],
    cantidad_inicial: cantidad, cantidad_actual: cantidad,
    costo_unitario: costo_unitario || 0, creado_por: creado_por || '',
    proveedor: prov,
  }
  const insertar = async (row) => {
    const { data, error } = await supabase.from('raw_material_lots').insert(row).select('id, proveedor').single()
    if (error) throw error
    return data
  }
  // orden_id (v127): si falta la columna, reintenta sin ella.
  // proveedor (v89/v140): si el usuario escribió uno y la columna no existe, ERROR claro
  // (antes se omitía en silencio y el lote quedaba sin proveedor).
  const intentar = async (row) => {
    try {
      return await insertar(row)
    } catch (e) {
      const msg = e?.message || ''
      if (/proveedor/i.test(msg) && 'proveedor' in row) {
        if (row.proveedor) {
          throw new Error('No se pudo guardar el proveedor: falta la columna en la base de datos (aplica la migración v89 o v140).')
        }
        const { proveedor: _p, ...rest } = row
        return intentar(rest)
      }
      if (/orden_id/i.test(msg) && 'orden_id' in row) {
        const { orden_id: _o, ...rest } = row
        return intentar(rest)
      }
      throw e
    }
  }
  const data = await intentar(orden_id ? { ...base, orden_id } : base)
  const id = data?.id ?? null
  // Segunda pasada: si el insert no trajo proveedor (caché de esquema / null forzado),
  // lo escribe con UPDATE explícito.
  if (id && prov && !data?.proveedor) {
    const { error: uErr } = await supabase.from('raw_material_lots').update({ proveedor: prov }).eq('id', id)
    if (uErr) throw new Error('El lote se creó pero el proveedor no se guardó: ' + (uErr.message || 'error desconocido'))
  }
  return { id }
}

/**
 * Corrige la cantidad disponible de un lote PEPS concreto (reconteo o ingreso mal digitado).
 * Ajusta el stock de la MP por el delta. No puede bajar de lo reservado para órdenes.
 * Si el lote no se ha tocado (inicial === actual), también alinea cantidad_inicial.
 */
export async function corregirCantidadLote({ lote_id, cantidad_nueva }) {
  const { data: l, error } = await supabase.from('raw_material_lots').select('*').eq('id', lote_id).single()
  if (error || !l) throw new Error('El lote no existe')
  const actual = Number(l.cantidad_actual) || 0
  const reservado = Number(l.cantidad_reservada) || 0
  const inicial = Number(l.cantidad_inicial) || 0
  const nueva = Number(cantidad_nueva)
  if (!Number.isFinite(nueva) || nueva < 0) throw new Error('Cantidad inválida')
  if (nueva + 0.0001 < reservado) {
    throw new Error(`No puedes dejar menos de lo reservado en órdenes (${reservado})`)
  }
  const delta = nueva - actual
  if (Math.abs(delta) <= 0.0001) return { delta: 0, mp_id: l.mp_id, lote: l, costo_unitario: Number(l.costo_unitario) || 0 }

  const upd = { cantidad_actual: nueva }
  // Ingreso mal digitado sin consumo aún → también corrige el "inicial" del lote.
  if (Math.abs(inicial - actual) <= 0.0001) upd.cantidad_inicial = nueva

  const { error: uErr } = await supabase.from('raw_material_lots').update(upd).eq('id', lote_id)
  if (uErr) throw uErr
  const { error: sErr } = await supabase.rpc('ajustar_stock_mp', { p_mp_id: l.mp_id, p_delta: delta })
  if (sErr) throw sErr
  return {
    delta, mp_id: l.mp_id, lote: l,
    costo_unitario: Number(l.costo_unitario) || 0,
  }
}

/** Actualiza el proveedor de un lote (corrección / dato omitido al ingresar). */
export async function actualizarProveedorLote({ lote_id, proveedor }) {
  const { error } = await supabase.from('raw_material_lots')
    .update({ proveedor: String(proveedor || '').trim() || null })
    .eq('id', lote_id)
  if (error) throw error
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
    const reservado = Number(l.cantidad_reservada) || 0
    const inicial = Number(l.cantidad_inicial) || 0
    // No borrar un lote que otra orden todavía tiene reservado: dejaría reservas fantasma.
    if (reservado > 0) {
      noRevertible += inicial
      continue
    }
    revertido += disponible
    noRevertible += Math.max(0, inicial - disponible)
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

// Suma de cantidad_actual de los lotes. Debe cuadrar con raw_materials.stock: al reservar
// para una orden se baja stock y cantidad_actual a la vez (lo reservado ya no cuenta aquí).
export function stockDesdeLotes(lotes = []) {
  return (lotes || []).reduce((s, l) => s + (Number(l.cantidad_actual) || 0), 0)
}

// Busca el lote "sin lote" (o vacío) de una MP, el de mayor cantidad_actual.
async function buscarLoteSinCodigo(mp_id) {
  const { data } = await supabase.from('raw_material_lots')
    .select('*').eq('mp_id', mp_id)
    .order('cantidad_actual', { ascending: false })
  return (data || []).find(l => esLoteSinCodigo(l.lote)) || null
}

// Suma o resta cantidad al lote "sin lote" de la MP (lo crea si no existe y cantidad > 0).
// No toca raw_materials.stock — solo el respaldo PEPS. Devuelve { id, tomado, creado }.
export async function ajustarLoteSinCodigo({ mp_id, cantidad, costo_unitario = 0, creado_por = '' }) {
  const delta = Number(cantidad) || 0
  if (!mp_id || Math.abs(delta) <= 0.0001) return { id: null, tomado: 0, creado: false }

  if (delta > 0) {
    const existente = await buscarLoteSinCodigo(mp_id)
    if (existente) {
      await supabase.from('raw_material_lots').update({
        cantidad_actual: (Number(existente.cantidad_actual) || 0) + delta,
        cantidad_inicial: (Number(existente.cantidad_inicial) || 0) + delta,
      }).eq('id', existente.id)
      return { id: existente.id, tomado: delta, creado: false }
    }
    const { id } = await crearLoteEntrada({
      mp_id, lote: LOTE_SIN_CODIGO, cantidad: delta,
      costo_unitario, creado_por: creado_por || 'sistema',
    })
    return { id, tomado: delta, creado: true }
  }

  // delta < 0: bajar primero del "sin lote", luego PEPS del resto (solo lotes, sin stock)
  let restante = Math.abs(delta)
  const sin = await buscarLoteSinCodigo(mp_id)
  if (sin) {
    const toma = Math.min(Number(sin.cantidad_actual) || 0, restante)
    if (toma > 0) {
      await supabase.from('raw_material_lots').update({
        cantidad_actual: (Number(sin.cantidad_actual) || 0) - toma,
      }).eq('id', sin.id)
      restante -= toma
    }
  }
  if (restante > 0.0001) {
    await consumirPEPS({ mp_id, cantidad: restante, ajustarStock: false })
  }
  return { id: sin?.id || null, tomado: Math.abs(delta) - restante, creado: false }
}

// Alinea los lotes PEPS al stock general SIN cambiar raw_materials.stock.
// · stock > lotes → crea/suma lote "sin lote" por la diferencia
// · stock < lotes → consume PEPS (sin tocar stock) por la diferencia
// Sirve para MP históricas sin PEPS, empaque y descuadres.
export async function sincronizarPEPSAlStock({ mp_id, stock, costo_unitario = 0, creado_por = '' }) {
  const { data: lotes } = await supabase.from('raw_material_lots')
    .select('id, cantidad_actual, lote').eq('mp_id', mp_id)
  const porLotes = stockDesdeLotes(lotes || [])
  const objetivo = Number(stock) || 0
  const diff = objetivo - porLotes
  if (Math.abs(diff) <= 0.001) {
    return { diff: 0, porLotes, stock: objetivo, accion: 'ok' }
  }
  if (diff > 0) {
    const r = await ajustarLoteSinCodigo({
      mp_id, cantidad: diff, costo_unitario, creado_por,
    })
    return { diff, porLotes, stock: objetivo, accion: r.creado ? 'crear_sin_lote' : 'sumar_sin_lote', lote_id: r.id }
  }
  // lotes de más: consumir sin mover stock
  await consumirPEPS({ mp_id, cantidad: Math.abs(diff), ajustarStock: false })
  return { diff, porLotes, stock: objetivo, accion: 'consumir_exceso' }
}

function mapConsumidos(lista) {
  return (lista || []).map(c => ({
    id: c.id,
    lote: c.lote,
    vencimiento: c.vencimiento,
    cantidad: Number(c.cantidad) || 0,
    costo_unitario: Number(c.costo_unitario) || 0,
  }))
}

// Consume `cantidad` aplicando PEPS. Con `ajustarStock: true` (v138) baja también raw_materials.stock
// en la misma transacción — úsalo en salidas de Inventario para no dejar ventana de carrera.
// Devuelve { consumidos, faltante, stockAjustado }.
export async function consumirPEPS({ mp_id, cantidad, ajustarStock = false }) {
  const { data, error } = await supabase.rpc('consumir_peps_lotes', {
    p_mp_id: mp_id, p_cantidad: cantidad, p_ajustar_stock: !!ajustarStock,
  })
  if (!error && data) {
    return {
      consumidos: mapConsumidos(data.consumidos),
      faltante: Number(data.faltante) || 0,
      stockAjustado: !!data.stock_ajustado,
    }
  }
  // Fallback (migración v137/v138 sin correr): solo lotes; el caller ajusta stock
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
    consumidos.push({ id: l.id, lote: l.lote, vencimiento: l.vencimiento, cantidad: toma, costo_unitario: l.costo_unitario || 0 })
    restante -= toma
  }
  if (ajustarStock && cantidad > 0) {
    await supabase.rpc('ajustar_stock_mp', { p_mp_id: mp_id, p_delta: -cantidad })
    return { consumidos, faltante: restante > 0 ? restante : 0, stockAjustado: true }
  }
  return { consumidos, faltante: restante > 0 ? restante : 0, stockAjustado: false }
}

// RESERVA `cantidad` aplicando PEPS: mueve de "disponible" (cantidad_actual) a "reservado"
// (cantidad_reservada). Se usa cuando una orden inicia producción. Devuelve los lotes tomados.
export async function reservarPEPS({ mp_id, cantidad, preferLoteId = null }) {
  const { data, error } = await supabase.rpc('reservar_peps_lotes', { p_mp_id: mp_id, p_cantidad: cantidad, p_prefer_lote: preferLoteId || null })
  if (!error && data) {
    let reservados = data.reservados || []
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
  for (const r of conId) {
    const { data: l } = await supabase.from('raw_material_lots').select('cantidad_actual, cantidad_reservada').eq('id', r.id).single()
    if (!l) continue
    const pedido = Number(r.cantidad) || 0
    const lib = Math.min(Number(l.cantidad_reservada) || 0, pedido)
    if (lib <= 0) continue
    await supabase.from('raw_material_lots').update({
      cantidad_actual: (l.cantidad_actual || 0) + lib,
      cantidad_reservada: Math.max(0, (l.cantidad_reservada || 0) - lib),
    }).eq('id', r.id)
  }
}

// CONSUME definitivo (orden cerrada/enviada): quita de "reservado".
export async function consumirReservaLotes(reservas = []) {
  const conId = (reservas || []).filter(r => r.id)
  if (!conId.length) return
  const { error } = await supabase.rpc('consumir_reserva_lotes', { p_reservas: conId.map(r => ({ id: r.id, cantidad: r.cantidad })) })
  if (!error) return
  for (const r of conId) {
    const { data: l } = await supabase.from('raw_material_lots').select('cantidad_reservada').eq('id', r.id).single()
    if (!l) continue
    const pedido = Number(r.cantidad) || 0
    const toma = Math.min(Number(l.cantidad_reservada) || 0, pedido)
    await supabase.from('raw_material_lots').update({
      cantidad_reservada: Math.max(0, (l.cantidad_reservada || 0) - toma),
    }).eq('id', r.id)
  }
}

// Consume de un LOTE específico. Con ajustarStock:true también baja raw_materials.stock (v138).
export async function consumirLote({ lote_id, cantidad, ajustarStock = false }) {
  const { data, error } = await supabase.rpc('consumir_lote_especifico', {
    p_lote_id: lote_id, p_cantidad: cantidad, p_ajustar_stock: !!ajustarStock,
  })
  if (!error && data) {
    return {
      consumidos: mapConsumidos(data.consumidos),
      faltante: Number(data.faltante) || 0,
      stockAjustado: !!data.stock_ajustado,
    }
  }
  const { data: l } = await supabase.from('raw_material_lots').select('*').eq('id', lote_id).single()
  if (!l) {
    if (ajustarStock && cantidad > 0) {
      // Sin lote: el caller debe pasar mp_id vía stock aparte; aquí no sabemos la MP
      return { consumidos: [], faltante: cantidad, stockAjustado: false }
    }
    return { consumidos: [], faltante: cantidad, stockAjustado: false }
  }
  const toma = Math.min(l.cantidad_actual || 0, cantidad)
  if (toma > 0) await supabase.from('raw_material_lots').update({ cantidad_actual: l.cantidad_actual - toma }).eq('id', l.id)
  if (ajustarStock && cantidad > 0) {
    await supabase.rpc('ajustar_stock_mp', { p_mp_id: l.mp_id, p_delta: -cantidad })
    return {
      consumidos: toma > 0
        ? [{ id: l.id, lote: l.lote, vencimiento: l.vencimiento, cantidad: toma, costo_unitario: l.costo_unitario || 0 }]
        : [],
      faltante: cantidad - toma,
      stockAjustado: true,
    }
  }
  return {
    consumidos: toma > 0
      ? [{ id: l.id, lote: l.lote, vencimiento: l.vencimiento, cantidad: toma, costo_unitario: l.costo_unitario || 0 }]
      : [],
    faltante: cantidad - toma,
    stockAjustado: false,
  }
}

// Baja atómica de un lote (vence/daño): descuenta lote + stock MP en una sola transacción (v137).
export async function bajarLote({ lote_id, cantidad }) {
  const { data, error } = await supabase.rpc('bajar_lote_mp', { p_lote_id: lote_id, p_cantidad: cantidad })
  if (!error && data) {
    return {
      mp_id: data.mp_id,
      tomado: Number(data.tomado) || 0,
      costo_unitario: Number(data.costo_unitario) || 0,
      lote: data.lote || '',
      vencimiento: data.vencimiento || null,
    }
  }
  if (error && !/bajar_lote_mp|function/i.test(error.message || '')) throw error
  const { data: l } = await supabase.from('raw_material_lots').select('*').eq('id', lote_id).single()
  if (!l) throw new Error('El lote no existe')
  const disp = Number(l.cantidad_actual) || 0
  if (!(cantidad > 0)) throw new Error('La cantidad a dar de baja debe ser mayor que cero')
  if (cantidad > disp + 0.0001) throw new Error(`No hay suficiente disponible en el lote (disponible: ${disp})`)
  await supabase.from('raw_material_lots').update({ cantidad_actual: disp - cantidad }).eq('id', l.id)
  await supabase.rpc('ajustar_stock_mp', { p_mp_id: l.mp_id, p_delta: -cantidad })
  return {
    mp_id: l.mp_id,
    tomado: cantidad,
    costo_unitario: Number(l.costo_unitario) || 0,
    lote: l.lote || '',
    vencimiento: l.vencimiento || null,
  }
}

// Devuelve cantidades exactas a lotes por id (anular una salida). No toca stock.
export async function reponerCantidadesLotes(items = []) {
  const conId = (items || []).filter(r => r.id && (Number(r.cantidad) || 0) > 0)
    .map(r => ({ id: r.id, cantidad: Number(r.cantidad) || 0 }))
  if (!conId.length) return
  const { error } = await supabase.rpc('reponer_cantidades_lotes', { p_items: conId })
  if (!error) return
  for (const r of conId) {
    const { data: l } = await supabase.from('raw_material_lots').select('cantidad_actual').eq('id', r.id).single()
    if (!l) continue
    await supabase.from('raw_material_lots').update({
      cantidad_actual: (Number(l.cantidad_actual) || 0) + r.cantidad,
    }).eq('id', r.id)
  }
}

// Reduce un lote por id (anular una entrada). No toca stock ni reservado.
export async function reducirLote({ lote_id, cantidad }) {
  const { data, error } = await supabase.rpc('reducir_lote_mp', { p_lote_id: lote_id, p_cantidad: cantidad })
  if (!error && data) return { tomado: Number(data.tomado) || 0, ok: !!data.ok }
  const { data: l } = await supabase.from('raw_material_lots').select('cantidad_actual').eq('id', lote_id).single()
  if (!l) return { tomado: 0, ok: false }
  const toma = Math.min(Number(l.cantidad_actual) || 0, cantidad)
  if (toma > 0) await supabase.from('raw_material_lots').update({ cantidad_actual: (Number(l.cantidad_actual) || 0) - toma }).eq('id', lote_id)
  return { tomado: toma, ok: true }
}

// Repone cantidad a lotes preferidos (p. ej. los de la orden) y luego al más reciente.
// Con ajustarStock:true también sube raw_materials.stock (v138).
export async function reponerPEPS({ mp_id, cantidad, preferLotes = [], ajustarStock = false }) {
  const prefer = (preferLotes || []).filter(r => r.id).map(r => ({
    id: r.id,
    ...(r.cantidad != null ? { cantidad: Number(r.cantidad) || 0 } : {}),
  }))
  const { data, error } = await supabase.rpc('reponer_peps_lotes', {
    p_mp_id: mp_id,
    p_cantidad: cantidad,
    p_prefer: prefer,
    p_ajustar_stock: !!ajustarStock,
  })
  if (!error && data) {
    return {
      repuestos: mapConsumidos(data.repuestos),
      faltante: Number(data.faltante) || 0,
      stockAjustado: !!data.stock_ajustado,
    }
  }
  // Fallback
  let restante = cantidad
  const repuestos = []
  for (const r of prefer) {
    if (restante <= 0) break
    const { data: l } = await supabase.from('raw_material_lots').select('*').eq('id', r.id).eq('mp_id', mp_id).maybeSingle()
    if (!l) continue
    const cap = r.cantidad != null && r.cantidad > 0 ? r.cantidad : restante
    const toma = Math.min(restante, cap)
    await supabase.from('raw_material_lots').update({
      cantidad_actual: (Number(l.cantidad_actual) || 0) + toma,
    }).eq('id', l.id)
    repuestos.push({ id: l.id, lote: l.lote, cantidad: toma, costo_unitario: l.costo_unitario || 0 })
    restante -= toma
  }
  if (restante > 0) {
    const { data: ls } = await supabase.from('raw_material_lots').select('*')
      .eq('mp_id', mp_id).order('fecha_entrada', { ascending: false }).limit(1)
    const l = ls?.[0]
    if (l) {
      await supabase.from('raw_material_lots').update({
        cantidad_actual: (Number(l.cantidad_actual) || 0) + restante,
      }).eq('id', l.id)
      repuestos.push({ id: l.id, lote: l.lote, cantidad: restante, costo_unitario: l.costo_unitario || 0 })
      restante = 0
    } else {
      const { data: nuevo } = await supabase.from('raw_material_lots').insert({
        mp_id, lote: 'reposición', fecha_entrada: new Date().toISOString().split('T')[0],
        cantidad_inicial: restante, cantidad_actual: restante, costo_unitario: 0, creado_por: 'sistema',
      }).select('id, lote, costo_unitario').single()
      if (nuevo) {
        repuestos.push({ id: nuevo.id, lote: nuevo.lote, cantidad: restante, costo_unitario: 0 })
        restante = 0
      }
    }
  }
  if (ajustarStock && cantidad > 0) {
    await supabase.rpc('ajustar_stock_mp', { p_mp_id: mp_id, p_delta: cantidad })
    return { repuestos, faltante: restante, stockAjustado: true }
  }
  return { repuestos, faltante: restante, stockAjustado: false }
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

// Empaque SURTIDO autocontenido (para el modal simple de "Productos por Empacar").
//
// Registra todo el empaque de un producto surtido SIN pasar por el modal grande de órdenes:
//  1) Crea la orden de empaque en segundo plano → queda en el historial de órdenes y en el
//     libro PTZ-OR-01 (que muestra todas las órdenes reales), conservando la trazabilidad.
//  2) Descuenta los saldos consumidos de cada sabor. Lo que NO se consume sigue en "por empacar".
//  3) Deja el registro de producción del surtido (para reportes y trazabilidad).
//  4) Suma el stock del producto terminado surtido (si un admin la cierra y quedó conforme).
//     Para operarios la orden queda 'ejecutada' y el admin la aprueba después: ahí se suma el
//     stock por el flujo existente (sin volver a descontar saldos).
//
// Toda la contabilidad de inventario (descontar saldos + sumar stock idempotente) replica la del
// cierre de órdenes para el caso surtido, para no divergir del comportamiento ya probado.

import { supabase } from './supabase'

const hoyISO = () => new Date().toISOString().split('T')[0]

// Suma stock del producto terminado surtido (idempotente por orden). Igual criterio que
// sumarProductoTerminado del módulo de órdenes: resuelve el terminado por nombre.
async function sumarStockSurtido({ orden, productoSurtido, cantidad, loteCaja, fecha, creadoPor }) {
  const nombre = (productoSurtido || '').trim()
  if (!(cantidad > 0) || !nombre) return
  let fp = null
  { const { data } = await supabase.from('finished_products').select('id, stock').eq('nombre', nombre).maybeSingle(); fp = data }
  if (!fp && orden.origen_id) { const { data } = await supabase.from('finished_products').select('id, stock').eq('product_id', orden.origen_id).maybeSingle(); fp = data }
  if (!fp) return   // no está en el catálogo de Producto Terminado → no se puede sumar
  const loteMov = loteCaja || orden.lote || ''
  // Idempotencia: si esta orden ya sumó este producto+lote, no repetir.
  const { data: ya } = await supabase.from('finished_movements')
    .select('id').eq('ref', String(orden.id)).eq('origen', 'produccion').eq('tipo', 'entrada')
    .eq('finished_id', fp.id).eq('lote', loteMov).maybeSingle()
  if (ya) return
  const { error: rpcErr } = await supabase.rpc('ajustar_stock_finished', { p_finished_id: fp.id, p_delta: cantidad })
  if (rpcErr) await supabase.from('finished_products').update({ stock: (Number(fp.stock) || 0) + cantidad }).eq('id', fp.id)
  await supabase.from('finished_movements').insert({
    finished_id: fp.id, product_id: orden.origen_id, tipo: 'entrada', cantidad, lote: loteMov,
    fecha: fecha || hoyISO(), origen: 'produccion', ref: String(orden.id),
    obs: `Empaque surtido (${nombre})`, creado_por: creadoPor || '',
  })
  try { await supabase.functions.invoke('alegra-push-stock', { body: { finished_id: fp.id } }) } catch { /* no bloquea */ }
}

/**
 * Ejecuta un empaque surtido completo.
 *
 * @param {object} p
 * @param {{id, producto, origen_id, unidad}} p.base  saldo "base" del surtido
 * @param {Array<{saldo_id, lote, producto, unidad, cantidad}>} p.consumos  consumo de cada lote (base + combinados)
 * @param {string} p.productoSurtido  nombre del producto terminado surtido (del catálogo)
 * @param {string} p.loteCaja  lote que llevará la caja
 * @param {string} p.vence     fecha de vencimiento (YYYY-MM-DD)
 * @param {string} p.fecha     fecha de empaque (YYYY-MM-DD)
 * @param {string} p.horaInicio, p.horaFin
 * @param {number} p.cajas     cantidad de cajas empacadas
 * @param {boolean} p.conforme
 * @param {string} p.responsable, p.obs, p.creadoPor
 * @param {boolean} p.esAdmin
 * @returns {Promise<{ ok:boolean, ordenId:number }>}
 */
export async function registrarEmpaqueSurtido(p) {
  const {
    base, consumos = [], productoSurtido, loteCaja, vence, fecha,
    horaInicio, horaFin, cajas, conforme, responsable, obs, creadoPor, esAdmin,
  } = p
  if (!base) throw new Error('Falta el saldo base del surtido')
  if (!(Number(cajas) > 0)) throw new Error('Indica cuántas cajas se empacaron')
  if (!productoSurtido) throw new Error('Elige el producto surtido resultante')
  const activos = consumos.filter(c => (Number(c.cantidad) || 0) > 0)
  if (!activos.length) throw new Error('Indica cuánto se consume de cada lote')

  const cant = Number(cajas)
  const fechaEf = fecha || hoyISO()
  const estadoOrden = esAdmin ? 'aprobada' : 'ejecutada'
  const estadoRec = conforme ? 'conforme' : 'no conforme'
  // Lotes COMBINADOS (todos menos el base) → texto "lote_mezcla" que usa el motor/rotulado.
  const loteMezcla = activos
    .filter(c => String(c.saldo_id) !== String(base.id))
    .map(c => String(c.lote || '').trim()).filter(Boolean).join(', ')

  // origen_id: se prefiere la ficha del PRODUCTO SURTIDO (para que quede enlazado a su terminado);
  // si no se resuelve, cae al producto base del saldo.
  let origenId = base.origen_id ? parseInt(base.origen_id) : null
  try {
    const { data: fpSurt } = await supabase.from('finished_products').select('product_id').eq('nombre', productoSurtido).maybeSingle()
    if (fpSurt?.product_id) origenId = fpSurt.product_id
  } catch { /* usa el del base */ }

  // 1) Crear la orden de empaque (queda en el historial y en PTZ-OR-01).
  const campos = {
    producto: base.producto || '', origen: 'producto', origen_id: origenId,
    es_subproducto: false,
    cantidad_plan: cant, unidad: 'unidades',
    operario: responsable || creadoPor || '',
    lote: loteCaja || '', vence: vence || null,
    empaque_saldo: true,
    saldo_pack: activos.map(c => ({ saldo_id: c.saldo_id, cantidad: Number(c.cantidad) || 0, unidad: c.unidad || '', unidades: Number(c.cantidad) || 0 })),
    surtido: true, lote_mezcla: loteMezcla || null,
    producto_surtido: productoSurtido, surtido_cantidad: cant,
    estado: estadoOrden,
    cantidad_result: cant,
    fecha_inicio: fechaEf, inicio: horaInicio || null, fin: horaFin || null,
    fecha_prod: fechaEf,
    obs_result: obs || null,
    creado_por: creadoPor || '',
    ...(esAdmin ? { aprobado_por: creadoPor || 'admin', fecha_aprob: new Date().toISOString() } : {}),
  }
  const { data: orden, error: eOrden } = await supabase.from('production_orders').insert(campos).select().single()
  if (eOrden) throw new Error('No se pudo crear la orden de empaque: ' + eOrden.message)

  // 2) Descontar los saldos consumidos (lo no consumido sigue en "por empacar").
  for (const c of activos) {
    const consumido = Number(c.cantidad) || 0
    const { data: sal } = await supabase.from('mezcla_saldos').select('peso').eq('id', c.saldo_id).single()
    const restante = Math.max(0, (Number(sal?.peso) || 0) - consumido)
    await supabase.from('mezcla_saldos').update({ peso: restante, estado: restante <= 0 ? 'agotado' : 'disponible' }).eq('id', c.saldo_id)
  }

  // 3) Registro de producción del surtido (trazabilidad).
  await supabase.from('production_records').insert({
    producto: productoSurtido, fecha: fechaEf, lote: loteCaja || '', vence: vence || null,
    empaque: 'UNIDADES', cantidad: cant, inicio: horaInicio || null, fin: horaFin || null,
    labor: 'PRODUCCION', responsable: responsable || creadoPor || '', obs: obs || '',
    estado: estadoRec, completado: true, orden_id: orden.id, aprobado: !!esAdmin,
    tipo_registro: 'final', surtido: true, producto_surtido: productoSurtido,
    lote_mezcla: loteMezcla || null, surtido_cantidad: cant, lotes_origen: loteMezcla || '',
  })

  // 4) Sumar stock del terminado surtido (solo si un admin cierra y quedó conforme).
  //    En operario queda 'ejecutada' → el admin la aprueba después y ahí se suma (flujo existente,
  //    sin volver a descontar saldos).
  if (esAdmin && conforme) {
    await sumarStockSurtido({ orden, productoSurtido, cantidad: cant, loteCaja, fecha: fechaEf, creadoPor })
  }

  return { ok: true, ordenId: orden.id }
}

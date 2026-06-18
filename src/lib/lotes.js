import { supabase } from './supabase'

// Crea un lote a partir de una ENTRADA de materia prima.
export async function crearLoteEntrada({ mp_id, lote, vencimiento, fecha, cantidad, costo_unitario, creado_por }) {
  await supabase.from('raw_material_lots').insert({
    mp_id, lote: lote || '', vencimiento: vencimiento || null,
    fecha_entrada: fecha || new Date().toISOString().split('T')[0],
    cantidad_inicial: cantidad, cantidad_actual: cantidad,
    costo_unitario: costo_unitario || 0, creado_por: creado_por || '',
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

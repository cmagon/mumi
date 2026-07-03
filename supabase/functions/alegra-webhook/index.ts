// Edge Function: webhook de Alegra — SINCRONIZACIÓN DE STOCK (solo inventario).
//
// FACTURAS:
//   - emitida            -> descuenta stock de producto terminado (PEPS por lote).
//   - anulada/nota crédito -> DEVUELVE el stock.
//   - si la factura proviene de una REMISIÓN (item.remission.id / data.remissions) ->
//                           además LIBERA la reserva (reservado -= cant).
// REMISIONES:
//   - creada             -> RESERVA el producto (reservado += cant). No baja el stock total;
//                           baja el "disponible" (disponible = stock - reservado).
//   - anulada/eliminada  -> LIBERA la reserva (reservado -= cant).
//
// La contabilidad y los márgenes viven en Alegra; aquí solo mantenemos el stock en sincronía.
//
// Despliegue:  supabase functions deploy alegra-webhook --no-verify-jwt
// En Alegra suscribe los eventos de FACTURA (creada/anulada) y de REMISIÓN (creada/anulada) a:
//   https://<proyecto>.supabase.co/functions/v1/alegra-webhook?secret=TU_SECRETO

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('ALEGRA_WEBHOOK_SECRET') || ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  // Fallar CERRADO: sin secreto configurado, o con secreto incorrecto, se rechaza.
  // Configura el secreto con: supabase secrets set ALEGRA_WEBHOOK_SECRET=...
  if (!WEBHOOK_SECRET) return json({ error: 'webhook no configurado' }, 503)
  if (url.searchParams.get('secret') !== WEBHOOK_SECRET) return json({ error: 'no autorizado' }, 401)

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  try {
    const body = await req.json()
    const doc = body?.data || body?.invoice || body
    const docId = String(doc?.id ?? body?.id ?? '')
    const evento = String(body?.event || body?.type || '').toLowerCase()
    // Ping de verificación de Alegra (body vacío al crear la suscripción): responder 2XX.
    if (!docId) return json({ ok: true, msg: 'ping' })

    const txt = (evento + ' ' + String(doc?.status || '')).toLowerCase()
    const esRemision = /remission|remisi/.test(txt) || doc?.numberTemplate?.documentType === 'remission'
    const esReversa = /void|cancel|delete|anul|credit|nota.?cr|reembol|refund|inactiv/.test(txt)
    const docTipo = esRemision ? 'remision' : 'factura'
    const accion = esReversa ? 'reversa' : 'alta'

    // Idempotencia por tipo+documento+acción (evita doble proceso y colisión de IDs entre tipos)
    const eventoKey = `${docTipo}:${docId}:${accion}`
    const { data: yaProc } = await supabase.from('alegra_eventos').select('id').eq('id', eventoKey).maybeSingle()
    if (yaProc) return json({ ok: true, msg: 'evento ya procesado' })

    const items: any[] = doc?.items || []
    const resultados: any[] = []
    // ¿la factura viene de una remisión? (referencia a nivel de documento o de ítem)
    const remisionDoc = !!(doc?.remissions?.length || doc?.remission?.id || doc?.relatedDocuments?.some?.((d: any) => /remiss|remisi/i.test(String(d?.type || d?.documentType || ''))))

    const buscarProd = async (it: any) => {
      const sku = String(it?.reference ?? it?.code ?? it?.sku ?? '').trim()
      if (sku) { const { data } = await supabase.from('finished_products').select('id, stock, reservado, nombre').eq('sku', sku).maybeSingle(); if (data) return data }
      const aid = String(it?.id ?? it?.item?.id ?? '').trim()   // respaldo: id del ítem de Alegra
      if (aid) { const { data } = await supabase.from('finished_products').select('id, stock, reservado, nombre').eq('alegra_item_id', aid).maybeSingle(); if (data) return data }
      return null
    }

    for (const it of items) {
      const cant = Number(it?.quantity ?? it?.qty ?? 0)
      if (!(cant > 0)) continue
      const prod = await buscarProd(it)
      if (!prod) { resultados.push({ ref: it?.reference || it?.id, estado: 'producto no encontrado' }); continue }
      const itemRemision = remisionDoc || !!(it?.remission?.id || it?.remissionId)

      // ===== REMISIÓN =====
      if (esRemision) {
        const nuevoRes = Math.max(0, Number(prod.reservado || 0) + (esReversa ? -cant : cant))
        await supabase.from('finished_products').update({ reservado: nuevoRes }).eq('id', prod.id)
        await supabase.from('finished_movements').insert({ finished_id: prod.id, tipo: esReversa ? 'reserva_liberada' : 'reserva', cantidad: cant, origen: 'alegra', ref: docId, obs: `${esReversa ? 'Remisión anulada' : 'Remisión'} Alegra #${docId}` })
        resultados.push({ producto: prod.nombre, reservado: nuevoRes })
        continue
      }

      // ===== FACTURA =====
      if (esReversa) {
        // Devuelve stock; si venía de remisión, vuelve a reservar lo devuelto
        const upd: any = { stock: Number(prod.stock || 0) + cant }
        if (itemRemision) upd.reservado = Number(prod.reservado || 0) + cant
        await supabase.from('finished_products').update(upd).eq('id', prod.id)
        await supabase.from('finished_movements').insert({ finished_id: prod.id, tipo: 'entrada', cantidad: cant, origen: 'alegra', ref: docId, obs: `Reversa factura Alegra #${docId}` })
        resultados.push({ producto: prod.nombre, devuelto: cant, reservado: itemRemision })
        continue
      }

      // Venta: descuenta stock (PEPS por lote). Si viene de remisión, libera la reserva.
      const { data: movs } = await supabase.from('finished_movements')
        .select('lote, cantidad, tipo, fecha').eq('finished_id', prod.id).order('fecha', { ascending: true })
      const porLote = new Map<string, { lote: string; disp: number; fecha: string }>()
      for (const m of (movs || [])) {
        if (m.tipo !== 'entrada' && m.tipo !== 'salida') continue   // ignora movimientos de reserva
        const k = m.lote || ''
        const cur = porLote.get(k) || { lote: k, disp: 0, fecha: m.fecha }
        cur.disp += (m.tipo === 'entrada' ? 1 : -1) * Number(m.cantidad || 0)
        porLote.set(k, cur)
      }
      const lotesOrden = [...porLote.values()].filter(l => l.disp > 0).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
      let restante = cant
      const lotesUsados: any[] = []
      for (const l of lotesOrden) { if (restante <= 0) break; const toma = Math.min(l.disp, restante); lotesUsados.push({ lote: l.lote, cantidad: toma }); restante -= toma }
      if (restante > 0) lotesUsados.push({ lote: '', cantidad: restante })

      const upd: any = { stock: Number(prod.stock || 0) - cant }
      if (itemRemision) upd.reservado = Math.max(0, Number(prod.reservado || 0) - cant)
      await supabase.from('finished_products').update(upd).eq('id', prod.id)
      for (const lt of lotesUsados) {
        await supabase.from('finished_movements').insert({ finished_id: prod.id, tipo: 'salida', cantidad: lt.cantidad, lote: lt.lote || '', origen: 'alegra', ref: docId, obs: `Factura Alegra #${docId}${itemRemision ? ' (desde remisión)' : ''}` })
      }
      resultados.push({ producto: prod.nombre, descontado: cant, desdeRemision: itemRemision, lotes: lotesUsados })
    }

    await supabase.from('alegra_eventos').insert({ id: eventoKey, tipo: evento || docTipo, payload: body })
    return json({ ok: true, doc: docId, tipo: docTipo, accion, resultados })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

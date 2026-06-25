// Edge Function: webhook de Alegra — SINCRONIZACIÓN DE STOCK (solo inventario).
// - Factura emitida   -> descuenta stock de producto terminado (PEPS por lote).
// - Factura anulada/cancelada/nota crédito -> DEVUELVE el stock.
// La contabilidad y los márgenes viven en Alegra; aquí solo mantenemos el stock en sincronía.
//
// Despliegue:
//   supabase functions deploy alegra-webhook --no-verify-jwt
// Secrets:
//   ALEGRA_WEBHOOK_SECRET -> texto secreto que también va en la URL (?secret=...)
//
// En Alegra: webhook del evento de factura (creada y anulada) ->
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
  if (WEBHOOK_SECRET && url.searchParams.get('secret') !== WEBHOOK_SECRET) return json({ error: 'no autorizado' }, 401)

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  try {
    const body = await req.json()
    const factura = body?.data || body?.invoice || body
    const facturaId = String(factura?.id ?? body?.id ?? '')
    const evento = String(body?.event || body?.type || 'invoice')
    if (!facturaId) return json({ error: 'sin id de factura' }, 400)

    const ev = (evento + ' ' + String(factura?.status || '')).toLowerCase()
    const esReversa = /void|cancel|delete|anul|credit|nota.?cr|reembol|refund/.test(ev)
    const accion = esReversa ? 'reversa' : 'venta'

    // Idempotencia por acción (permite procesar una venta y luego su reversa)
    const eventoKey = `${facturaId}:${accion}`
    const { data: yaProc } = await supabase.from('alegra_eventos').select('id').eq('id', eventoKey).maybeSingle()
    if (yaProc) return json({ ok: true, msg: 'evento ya procesado' })

    const items: any[] = factura?.items || []
    const resultados: any[] = []

    for (const it of items) {
      const sku = String(it?.reference ?? it?.code ?? it?.sku ?? '').trim()
      const cantidad = Number(it?.quantity ?? it?.qty ?? 0)
      if (!sku || !(cantidad > 0)) continue

      const { data: prod } = await supabase.from('finished_products').select('id, stock').eq('sku', sku).maybeSingle()
      if (!prod) { resultados.push({ sku, estado: 'producto no encontrado' }); continue }

      if (esReversa) {
        // Devuelve stock (reingreso simple)
        await supabase.from('finished_products').update({ stock: Number(prod.stock || 0) + cantidad }).eq('id', prod.id)
        await supabase.from('finished_movements').insert({ finished_id: prod.id, tipo: 'entrada', cantidad, origen: 'alegra', ref: facturaId, obs: `Reversa factura Alegra #${facturaId}` })
        resultados.push({ sku, devuelto: cantidad })
        continue
      }

      // VENTA: PEPS sobre el kardex de producto terminado para descontar por lote
      const { data: movs } = await supabase.from('finished_movements')
        .select('lote, cantidad, tipo, fecha').eq('finished_id', prod.id).order('fecha', { ascending: true })
      const porLote = new Map<string, { lote: string; disp: number; fecha: string }>()
      for (const m of (movs || [])) {
        const k = m.lote || ''
        const cur = porLote.get(k) || { lote: k, disp: 0, fecha: m.fecha }
        cur.disp += (m.tipo === 'entrada' ? 1 : -1) * Number(m.cantidad || 0)
        porLote.set(k, cur)
      }
      const lotesOrden = [...porLote.values()].filter(l => l.disp > 0).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
      let restante = cantidad
      const lotesUsados: any[] = []
      for (const l of lotesOrden) {
        if (restante <= 0) break
        const toma = Math.min(l.disp, restante)
        lotesUsados.push({ lote: l.lote, cantidad: toma }); restante -= toma
      }
      if (restante > 0) lotesUsados.push({ lote: '', cantidad: restante })

      await supabase.from('finished_products').update({ stock: Number(prod.stock || 0) - cantidad }).eq('id', prod.id)
      for (const lt of lotesUsados) {
        await supabase.from('finished_movements').insert({ finished_id: prod.id, tipo: 'salida', cantidad: lt.cantidad, lote: lt.lote || '', origen: 'alegra', ref: facturaId, obs: `Factura Alegra #${facturaId}` })
      }
      resultados.push({ sku, descontado: cantidad, lotes: lotesUsados })
    }

    await supabase.from('alegra_eventos').insert({ id: eventoKey, tipo: evento, payload: body })
    return json({ ok: true, factura: facturaId, accion, resultados })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

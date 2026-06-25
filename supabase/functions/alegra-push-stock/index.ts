// Edge Function: empuja el stock de PRODUCTO TERMINADO de la app hacia Alegra.
// La app es la fuente de verdad; al aprobar producción esta función actualiza la cantidad
// disponible del ítem en Alegra para que las cantidades cuadren al facturar.
//
// Se llama desde la app autenticada (lleva el JWT del usuario), así la API key de Alegra
// nunca queda expuesta en el navegador.
//
// Despliegue (con verificación de JWT, por defecto):
//   supabase functions deploy alegra-push-stock
// Secrets:
//   ALEGRA_EMAIL  -> correo de tu cuenta Alegra
//   ALEGRA_TOKEN  -> token de API de Alegra (Configuración > API)
//
// Cuerpo aceptado:
//   { finished_id: "uuid" }  -> empuja ese producto terminado
//   { all: true }            -> empuja todos los terminados con alegra_item_id

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALEGRA_BASE = 'https://api.alegra.com/api/v1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function getCreds(supabase: any) {
  const { data } = await supabase.from('alegra_config').select('email, token').eq('id', 1).maybeSingle()
  const email = (data?.email || Deno.env.get('ALEGRA_EMAIL') || '').trim()
  const token = (data?.token || Deno.env.get('ALEGRA_TOKEN') || '').trim()
  return { email, token }
}

// 1) Actualiza nombre, precio y costo del ítem (PUT /items). El stock NO se setea aquí.
async function pushDatos(authHeader: string, itemId: string, costo?: number, nombre?: string, precio?: number) {
  const body: Record<string, unknown> = {}
  if (nombre && nombre.trim()) body.name = nombre.trim()
  if (typeof precio === 'number' && precio > 0) body.price = precio
  if (typeof costo === 'number' && costo > 0) body.inventory = { unitCost: costo }
  if (Object.keys(body).length === 0) return
  const res = await fetch(`${ALEGRA_BASE}/items/${itemId}`, {
    method: 'PUT', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`PUT item ${itemId}: ${res.status} ${txt}`)
}

// 2) Ajusta el stock vía ajuste de inventario (Alegra usa DELTA in/out, no valor absoluto).
//    Lee la cantidad actual del ítem y crea el movimiento para igualar al stock de la app.
async function ajustarStock(authHeader: string, itemId: string, objetivo: number, costo?: number) {
  const r = await fetch(`${ALEGRA_BASE}/items/${itemId}`, { headers: { 'Authorization': authHeader } })
  const it = await r.json().catch(() => ({}))
  const actual = Number(it?.inventory?.availableQuantity ?? 0)
  const delta = Math.round((objetivo - actual) * 1000) / 1000
  if (delta === 0) return { actual, objetivo, delta: 0 }
  const body = {
    date: new Date().toISOString().slice(0, 10),
    observations: 'Sincronización de stock desde Mumi',
    items: [{ id: itemId, type: delta > 0 ? 'in' : 'out', quantity: Math.abs(delta), unitCost: Number(costo || it?.inventory?.unitCost || 0) }],
  }
  const res = await fetch(`${ALEGRA_BASE}/inventory-adjustments`, {
    method: 'POST', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`Ajuste stock ${itemId}: ${res.status} ${txt}`)
  return { actual, objetivo, delta }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token } = await getCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' }, 400)
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)
  try {
    const { finished_id, all } = await req.json().catch(() => ({}))
    let query = supabase.from('finished_products').select('id, nombre, sku, alegra_item_id, stock, costo_unitario, precio_mayor')
    if (!all) query = query.eq('id', finished_id)
    else query = query.not('alegra_item_id', 'is', null)
    const { data: prods } = await query
    if (!prods?.length) return json({ ok: true, msg: 'sin productos para sincronizar' })

    const resultados: any[] = []
    for (const p of prods) {
      if (!p.alegra_item_id) { resultados.push({ producto: p.nombre, estado: 'sin alegra_item_id' }); continue }
      try {
        const id = String(p.alegra_item_id)
        await pushDatos(authHeader, id, Number(p.costo_unitario || 0), p.nombre, Number(p.precio_mayor || 0))
        const stockRes = await ajustarStock(authHeader, id, Number(p.stock || 0), Number(p.costo_unitario || 0))
        resultados.push({ producto: p.nombre, stock: Number(p.stock || 0), ajuste: stockRes, estado: 'ok' })
      } catch (e) {
        resultados.push({ producto: p.nombre, estado: 'error', detalle: String((e as Error)?.message || e) })
      }
    }
    return json({ ok: true, resultados })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

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

// Actualiza la cantidad disponible (y el costo unitario si se envía) de un ítem en Alegra
async function pushItem(authHeader: string, itemId: string, cantidad: number, costo?: number) {
  const inventory: Record<string, number> = { availableQuantity: cantidad }
  if (typeof costo === 'number' && costo > 0) inventory.unitCost = costo
  const res = await fetch(`${ALEGRA_BASE}/items/${itemId}`, {
    method: 'PUT',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inventory }),
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`Alegra item ${itemId}: ${res.status} ${txt}`)
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token } = await getCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' }, 400)
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)
  try {
    const { finished_id, all } = await req.json().catch(() => ({}))
    let query = supabase.from('finished_products').select('id, nombre, sku, alegra_item_id, stock, costo_unitario')
    if (!all) query = query.eq('id', finished_id)
    else query = query.not('alegra_item_id', 'is', null)
    const { data: prods } = await query
    if (!prods?.length) return json({ ok: true, msg: 'sin productos para sincronizar' })

    const resultados: any[] = []
    for (const p of prods) {
      if (!p.alegra_item_id) { resultados.push({ producto: p.nombre, estado: 'sin alegra_item_id' }); continue }
      try {
        await pushItem(authHeader, String(p.alegra_item_id), Number(p.stock || 0), Number(p.costo_unitario || 0))
        resultados.push({ producto: p.nombre, cantidad: Number(p.stock || 0), costo: Number(p.costo_unitario || 0), estado: 'ok' })
      } catch (e) {
        resultados.push({ producto: p.nombre, estado: 'error', detalle: String((e as Error)?.message || e) })
      }
    }
    return json({ ok: true, resultados })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

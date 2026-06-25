// Edge Function: crea en Alegra un producto INVENTARIABLE a partir de un producto terminado
// de la app que aún no existe allá (sin alegra_item_id). Guarda el id devuelto en la app.
//
// Despliegue:  supabase functions deploy alegra-create-item
// Cuerpo:      { finished_id: "uuid" }

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
  const { data } = await supabase.from('alegra_config').select('email, token, price_list_mayor, price_list_detal').eq('id', 1).maybeSingle()
  return {
    email: (data?.email || Deno.env.get('ALEGRA_EMAIL') || '').trim(),
    token: (data?.token || Deno.env.get('ALEGRA_TOKEN') || '').trim(),
    listaMayor: data?.price_list_mayor || '', listaDetal: data?.price_list_detal || '',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token, listaMayor, listaDetal } = await getCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' })
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)

  try {
    const { finished_id } = await req.json().catch(() => ({}))
    const { data: p } = await supabase.from('finished_products')
      .select('id, nombre, sku, alegra_item_id, stock, costo_unitario, precio_mayor, precio_detal').eq('id', finished_id).maybeSingle()
    if (!p) return json({ error: 'Producto no encontrado' })
    if (p.alegra_item_id) return json({ error: 'Este producto ya está enlazado a Alegra' })

    // Precio: arreglo por listas si están mapeadas; si no, el mayor como número
    const price: any[] = []
    if (listaMayor && Number(p.precio_mayor) > 0) price.push({ idPriceList: Number(listaMayor), price: Number(p.precio_mayor) })
    if (listaDetal && Number(p.precio_detal) > 0) price.push({ idPriceList: Number(listaDetal), price: Number(p.precio_detal) })
    const body: Record<string, unknown> = {
      name: (p.nombre || '').slice(0, 150),
      type: 'product',                            // inventariable
      reference: p.sku || undefined,
      price: price.length ? price : (Number(p.precio_mayor) || 0),
      inventory: {
        unit: 'unit',
        unitCost: Number(p.costo_unitario) || 0,
        initialQuantity: Number(p.stock) || 0,
        negativeSale: true,            // permite venta en negativo
      },
    }
    const res = await fetch(`${ALEGRA_BASE}/items`, {
      method: 'POST', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const txt = await res.text()
    if (!res.ok) return json({ error: `Alegra ${res.status}: ${txt}` }, 200)
    let creado: any = {}
    try { creado = JSON.parse(txt) } catch { /* */ }
    const newId = String(creado?.id || '')
    if (newId) await supabase.from('finished_products').update({ alegra_item_id: newId }).eq('id', p.id)
    return json({ ok: true, id: newId, nombre: p.nombre })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) })
  }
})

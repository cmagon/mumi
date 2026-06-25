// Edge Function: lista los ítems de Alegra (para enlazar productos y probar la conexión).
// Las credenciales se leen de la tabla alegra_config (configurable desde la app); si están
// vacías, usa los secrets ALEGRA_EMAIL / ALEGRA_TOKEN como respaldo.
//
// Despliegue:  supabase functions deploy alegra-items
//
// Respuesta: { ok, total, items: [{ id, name, reference, price, available }] }

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token } = await getCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' }, 400)
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)

  try {
    const items: any[] = []
    const limit = 30
    for (let start = 0; start < 600; start += limit) {
      const res = await fetch(`${ALEGRA_BASE}/items?limit=${limit}&start=${start}&order_direction=ASC&order_field=name`, {
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      })
      const txt = await res.text()
      if (!res.ok) return json({ error: `Alegra ${res.status}: ${txt}` }, res.status)
      let pagina: any[]
      try { pagina = JSON.parse(txt) } catch { pagina = [] }
      if (!Array.isArray(pagina) || pagina.length === 0) break
      for (const it of pagina) {
        items.push({
          id: String(it.id),
          name: it.name || '',
          reference: it.reference || it.code || '',
          price: Array.isArray(it.price) ? (it.price[0]?.price ?? 0) : (it.price ?? 0),
          available: it.inventory?.availableQuantity ?? null,
          // Señales para distinguir producto (con inventario) de "solo facturación" (servicio)
          inventoriable: it.inventory != null && it.inventory?.availableQuantity != null,
          type: it.type || '',
          esServicio: String(it.type || '').toLowerCase() === 'service',
        })
      }
      if (pagina.length < limit) break
    }
    return json({ ok: true, total: items.length, items })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

// Edge Function: lista los ítems de Alegra (para enlazar productos y probar la conexión).
// Credenciales: secrets ALEGRA_EMAIL / ALEGRA_TOKEN y, si no están puestos, la tabla
// alegra_config como respaldo (ver _shared/alegra.ts).
//
// Solo admin: devuelve el catálogo completo de Alegra, que es información comercial.
//
// Despliegue:  supabase functions deploy alegra-items
//
// Respuesta: { ok, total, items: [{ id, name, reference, price, available }] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAdmin } from '../_shared/auth.ts'
import { getAlegraCreds } from '../_shared/alegra.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALEGRA_BASE = 'https://api.alegra.com/api/v1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const getCreds = (supabase: any) => getAlegraCreds(supabase)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const guard = await requireAdmin(req); if (guard.resp) return guard.resp
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token } = await getCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' }, 400)
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)

  try {
    // Paginación EN PARALELO (tandas de 6 páginas) y tope amplio: antes el tope era 600 ítems
    // en serie — si la cuenta tenía más, los últimos nunca aparecían en la app.
    const LIMIT = 30, MAX_PAGES = 200, BATCH = 6   // hasta 6000 ítems
    const crudos: any[] = []
    let pagina = 0
    while (pagina < MAX_PAGES) {
      const tanda = Array.from({ length: BATCH }, (_, i) => pagina + i).filter(p => p < MAX_PAGES)
      const resultados = await Promise.all(tanda.map(async (p) => {
        const res = await fetch(`${ALEGRA_BASE}/items?limit=${LIMIT}&start=${p * LIMIT}&order_direction=ASC&order_field=name`, {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        })
        const txt = await res.text()
        if (!res.ok) return { p, ok: false, status: res.status, txt }
        let arr: any[]
        try { arr = JSON.parse(txt) } catch { arr = [] }
        return { p, ok: true, arr: Array.isArray(arr) ? arr : [] }
      }))
      resultados.sort((a, b) => a.p - b.p)
      let detener = false
      for (const r of resultados) {
        if (!r.ok) { if (r.p === 0) return json({ error: `Alegra ${r.status}: ${r.txt}` }, r.status); detener = true; break }
        if (!r.arr.length) { detener = true; break }
        crudos.push(...r.arr)
        if (r.arr.length < LIMIT) detener = true
      }
      if (detener) break
      pagina += BATCH
    }
    const items: any[] = []
    for (const it of crudos) {
      // Omite los ítems inactivos en Alegra
      if (String(it.status || '').toLowerCase() === 'inactive') continue
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
    return json({ ok: true, total: items.length, items })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

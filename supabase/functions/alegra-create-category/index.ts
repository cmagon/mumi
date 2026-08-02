// Edge Function: crea una categoría de ítems nueva en Alegra.
// Confirmado contra la documentación oficial: POST https://api.alegra.com/api/v1/item-categories
// (https://developer.alegra.com/reference/post_item-categories) — body { name }, respuesta con id/name.
// Despliegue:  supabase functions deploy alegra-create-category
// Body:        { name: string }
// Respuesta:   { ok, id, name }

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
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' })
  const { name } = await req.json().catch(() => ({}))
  const nombre = String(name || '').trim()
  if (!nombre) return json({ error: 'Falta el nombre de la categoría.' })
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)
  try {
    const res = await fetch(`${ALEGRA_BASE}/item-categories`, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nombre }),
    })
    const txt = await res.text()
    if (!res.ok) return json({ error: `Alegra ${res.status}: ${txt}` })
    let data: any
    try { data = JSON.parse(txt) } catch { data = {} }
    return json({ ok: true, id: String(data.id), name: data.name || nombre })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) })
  }
})

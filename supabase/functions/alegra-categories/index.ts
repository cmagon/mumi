// Edge Function: lista las categorías de ítems de Alegra (para asignarlas a los productos).
// Despliegue:  supabase functions deploy alegra-categories
// Respuesta:   { ok, items: [{ id, name }] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'

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
  return { email: (data?.email || Deno.env.get('ALEGRA_EMAIL') || '').trim(), token: (data?.token || Deno.env.get('ALEGRA_TOKEN') || '').trim() }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const guard = await requireUser(req); if (guard.resp) return guard.resp
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token } = await getCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' })
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)
  try {
    const res = await fetch(`${ALEGRA_BASE}/item-categories`, { headers: { 'Authorization': authHeader } })
    const txt = await res.text()
    if (!res.ok) return json({ error: `Alegra ${res.status}: ${txt}` })
    let arr: any[]
    try { arr = JSON.parse(txt) } catch { arr = [] }
    // Aplana posibles categorías anidadas (children)
    const out: any[] = []
    const walk = (list: any[]) => { for (const c of (list || [])) { out.push({ id: String(c.id), name: c.name || '' }); if (Array.isArray(c.children)) walk(c.children) } }
    walk(Array.isArray(arr) ? arr : [])
    return json({ ok: true, items: out })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) })
  }
})

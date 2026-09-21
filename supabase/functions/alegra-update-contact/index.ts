// Edge Function: actualiza en Alegra los datos EDITABLES de un contacto cliente.
// La identidad/facturación (NIT y razón social/nombre) NO se toca — es de solo lectura en la
// app y se administra en Alegra. Solo se empujan: correo, teléfono, dirección y ciudad.
//
// Despliegue:  supabase functions deploy alegra-update-contact
// Cuerpo:      { alegra_id: "123", email, telefono, direccion, ciudad }
// Respuesta:   { ok } | { error }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAdmin } from '../_shared/auth.ts'
import { getAlegraCreds } from '../_shared/alegra.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALEGRA_BASE = 'https://api.alegra.com/api/v1'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const guard = await requireAdmin(req); if (guard.resp) return guard.resp
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email: aEmail, token } = await getAlegraCreds(supabase)
  if (!aEmail || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' }, 400)
  const authHeader = 'Basic ' + btoa(`${aEmail}:${token}`)

  try {
    const { alegra_id, email, telefono, direccion, ciudad } = await req.json().catch(() => ({}))
    const id = String(alegra_id ?? '').trim()
    if (!id) return json({ error: 'Falta el id del contacto de Alegra' }, 400)

    // Solo campos editables. name / identification NO se envían (quedan como están en Alegra).
    const body: Record<string, unknown> = {}
    if (email != null) body.email = String(email).trim()
    if (telefono != null) body.phonePrimary = String(telefono).trim()
    if (direccion != null || ciudad != null) {
      body.address = { address: String(direccion ?? '').trim(), city: String(ciudad ?? '').trim() }
    }

    const res = await fetch(`${ALEGRA_BASE}/contacts/${id}`, {
      method: 'PUT', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const txt = await res.text()
    if (!res.ok) return json({ error: `Alegra ${res.status}: ${txt.slice(0, 200)}` }, 200)
    return json({ ok: true })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) })
  }
})

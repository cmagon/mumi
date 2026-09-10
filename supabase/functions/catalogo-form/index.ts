// Supabase Edge Function: recibe envíos de formularios públicos del catálogo (contacto y
// suscripción), verifica el captcha Turnstile del lado servidor y solo entonces escribe en
// la base de datos con la service_role key.
//
// Desplegar:  supabase functions deploy catalogo-form   (Verify JWT: OFF)
// Secreto:    supabase secrets set TURNSTILE_SECRET_KEY=0x...
//
// Si TURNSTILE_SECRET_KEY no está configurada, la función rechaza los envíos (para no dejar
// un endpoint sin protección). El frontend solo enruta aquí cuando hay site key; si no la
// hay, escribe por las RPC anónimas como antes.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/

async function verificarTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) return false
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
    const data = await r.json()
    return !!data.success
  } catch { return false }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))
    const accion = String(body.accion || '')
    const token = String(body.token || '')
    if (!token) return json({ error: 'Falta la verificación del captcha.' }, 400)

    const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for')
    const ok = await verificarTurnstile(token, ip)
    if (!ok) return json({ error: 'La verificación de seguridad falló. Recarga e inténtalo de nuevo.' }, 403)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const email = String(body.email || '').trim().toLowerCase()
    const nombre = (String(body.nombre || '').trim()) || null
    const telefono = (String(body.telefono || '').trim()) || null

    if (accion === 'suscribir') {
      if (!EMAIL_RE.test(email)) return json({ error: 'Correo inválido.' }, 400)
      await admin.rpc('catalogo_upsert_suscriptor', {
        p_email: email, p_nombre: nombre, p_origen: String(body.origen || 'newsletter'), p_telefono: telefono,
      })
      return json({ ok: true })
    }

    if (accion === 'mensaje') {
      const mensaje = String(body.mensaje || '').trim()
      if (!mensaje) return json({ error: 'Escribe tu mensaje.' }, 400)
      await admin.from('mensajes_catalogo').insert({
        nombre, email: email || null, telefono, mensaje: mensaje.slice(0, 5000),
      })
      if (EMAIL_RE.test(email)) {
        try { await admin.rpc('catalogo_upsert_suscriptor', { p_email: email, p_nombre: nombre, p_origen: 'contacto', p_telefono: telefono }) } catch { /* noop */ }
      }
      return json({ ok: true })
    }

    return json({ error: 'Acción no soportada.' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

// Supabase Edge Function: envía un correo usando Resend (https://resend.com)
// Desplegar:  supabase functions deploy enviar-correo
// Secretos:   supabase secrets set RESEND_API_KEY=re_xxx  CORREO_FROM="Mumi <documentos@tudominio.com>"
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { to, subject, html } = await req.json()
    if (!to || !subject) return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
    const from = Deno.env.get('CORREO_FROM') || 'onboarding@resend.dev'
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })
    const data = await r.json()
    return new Response(JSON.stringify(data), { status: r.ok ? 200 : 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})

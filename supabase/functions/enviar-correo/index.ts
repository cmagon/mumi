// Supabase Edge Function: envía un correo usando Resend (https://resend.com)
// Desplegar:  supabase functions deploy enviar-correo
// Secretos:   supabase secrets set RESEND_API_KEY=re_xxx  CORREO_FROM="Mumi <documentos@tudominio.com>"
//
// Solo se usa para compartir carpetas de documentos (src/pages/Documentos.jsx), así
// que un usuario legítimo manda unos pocos correos al día. El cupo por hora está
// para que una sesión robada no pueda convertir esto en un relay de spam y quemar
// la reputación de envío del dominio.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const err = (msg: string, status: number) => json({ error: msg }, status)

const MAX_POR_HORA = 20
const MAX_ASUNTO = 300
const MAX_HTML = 100_000            // ~100 KB: de sobra para un correo, corta payloads absurdos
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    // Exigir sesión válida: evita que la función quede como relay de correo abierto.
    const authHeader = req.headers.get('Authorization') || ''
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return err('No autenticado', 401)

    const { to, subject, html } = await req.json().catch(() => ({}))

    // Un solo destinatario y con forma de correo: sin esto se puede pasar
    // "a@x.com, b@y.com, ..." y usar la función para envíos masivos.
    const destino = String(to || '').trim()
    if (!destino || !subject) return err('Faltan datos', 400)
    if (!EMAIL_RE.test(destino)) return err('Correo del destinatario inválido', 400)

    const asunto = String(subject).slice(0, MAX_ASUNTO)
    const cuerpo = String(html || '')
    if (cuerpo.length > MAX_HTML) return err('El contenido del correo es demasiado grande', 413)

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) return err('RESEND_API_KEY no configurada', 500)

    // Cupo por usuario. Se cuenta y se registra en la misma función de base de
    // datos, así dos peticiones simultáneas no pueden colarse por el hueco entre
    // "conté" y "envié".
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: permitido, error: rlErr } = await admin.rpc('registrar_envio_correo', {
      p_user_id: user.id, p_destino: destino, p_asunto: asunto, p_max: MAX_POR_HORA,
    })
    // Si la migración v134 aún no está aplicada, no se bloquea el envío: se avisa
    // en el log y se sigue con el comportamiento anterior.
    if (rlErr) console.warn('Sin control de cupo (¿falta la migración v134?):', rlErr.message)
    else if (permitido === false) {
      return err(`Alcanzaste el límite de ${MAX_POR_HORA} correos por hora. Intenta más tarde.`, 429)
    }

    const from = Deno.env.get('CORREO_FROM') || 'onboarding@resend.dev'
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [destino], subject: asunto, html: cuerpo }),
    })
    const data = await r.json()
    return json(data, r.ok ? 200 : 500)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

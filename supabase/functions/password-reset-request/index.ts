// Edge Function: decide el camino de recuperación de contraseña (NO envía correos).
//   { login, email } ->
//     - Si el usuario es ADMIN y 'email' coincide con su email_recuperacion -> { modo: 'codigo' }
//       (el cliente pide el OTP a Supabase con signInWithOtp para ese correo).
//     - Si es un usuario normal (o no coincide) -> registra aviso para el admin -> { modo: 'aviso' }.
// Respuestas genéricas para no revelar qué cuentas existen.
//
// Despliegue:  supabase functions deploy password-reset-request --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const limpiarLogin = (login: string) =>
  String(login || '').toLowerCase().trim().replace(/\s+/g, '').replace(/[^a-z0-9._-]/g, '')
const normEmail = (e: string) => String(e || '').trim().toLowerCase()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const { login, email } = await req.json().catch(() => ({}))
    const loginLimpio = limpiarLogin(login)
    if (!loginLimpio) return json({ error: 'Escribe tu usuario.' }, 400)

    const { data: perfil } = await supabase.from('user_profiles')
      .select('id, rol, email_recuperacion').eq('login', loginLimpio).maybeSingle()

    // Camino de código: admin cuyo correo de recuperación coincide con el ingresado.
    if (perfil && perfil.rol === 'admin' && perfil.email_recuperacion &&
        normEmail(perfil.email_recuperacion) === normEmail(email)) {
      return json({ ok: true, modo: 'codigo' })
    }

    // Camino de aviso: usuario existente que no aplica al código.
    if (perfil) {
      await supabase.from('password_requests').insert({ usuario: loginLimpio, mensaje: 'Recuperación de contraseña desde el login' })
    }
    return json({ ok: true, modo: 'aviso' })
  } catch (e) {
    console.error('password-reset-request:', String((e as Error)?.message || e))
    return json({ error: 'No se pudo procesar la solicitud. Intenta más tarde.' }, 500)
  }
})

// Edge Function: confirma la recuperación de contraseña.
// Se llama DESPUÉS de que el cliente verificó el OTP (supabase.auth.verifyOtp), por lo que la
// cabecera Authorization trae una sesión cuyo user.email es el correo REAL ya verificado.
//   { login, password } -> si ese correo verificado coincide con el email_recuperacion del admin
//   'login', cambia su contraseña mediante Supabase Auth.
//
// Despliegue:  supabase functions deploy password-reset-confirm   (con verify_jwt por defecto)

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
  try {
    const { login, password } = await req.json().catch(() => ({}))
    const loginLimpio = limpiarLogin(login)
    if (!loginLimpio) return json({ error: 'Datos incompletos.' }, 400)
    if (!password || String(password).length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)

    // Sesión del solicitante = correo verificado por OTP.
    const authHeader = req.headers.get('Authorization') || ''
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user?.email) return json({ error: 'Verificación de correo no válida.' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: perfil } = await admin.from('user_profiles')
      .select('id, rol, email_recuperacion').eq('login', loginLimpio).maybeSingle()

    // El correo verificado por OTP debe coincidir con el email_recuperacion del admin.
    if (!perfil || perfil.rol !== 'admin' || !perfil.email_recuperacion ||
        normEmail(perfil.email_recuperacion) !== normEmail(user.email)) {
      return json({ error: 'No autorizado para restablecer esta cuenta.' }, 403)
    }

    const { error: uErr } = await admin.auth.admin.updateUserById(perfil.id, { password })
    if (uErr) return json({ error: uErr.message }, 400)
    return json({ ok: true })
  } catch (e) {
    console.error('password-reset-confirm:', String((e as Error)?.message || e))
    return json({ error: 'No se pudo restablecer la contraseña. Intenta más tarde.' }, 500)
  }
})

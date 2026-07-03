// ============================================================
// Edge Function: admin-set-password
// Permite a un ADMINISTRADOR restablecer la contraseña de otro usuario.
// Despliegue:
//   supabase functions deploy admin-set-password
// Requiere las variables (ya disponibles por defecto en el entorno de Functions):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1) Verificar que quien llama es un admin autenticado
    const authHeader = req.headers.get('Authorization') || ''
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: uErr } = await asUser.auth.getUser()
    if (uErr || !user) return json({ error: 'No autenticado' }, 401)

    const admin = createClient(url, service)
    const { data: perfil } = await admin.from('user_profiles').select('rol').eq('id', user.id).single()
    if (perfil?.rol !== 'admin') return json({ error: 'Solo administradores' }, 403)

    // 2) Cambiar la contraseña del usuario objetivo
    const { user_id, password } = await req.json()
    if (!user_id || !password || String(password).length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)

    const { error } = await admin.auth.admin.updateUserById(user_id, { password })
    if (error) return json({ error: error.message }, 400)

    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

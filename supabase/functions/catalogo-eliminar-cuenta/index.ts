// Supabase Edge Function: elimina la cuenta del cliente autenticado del catálogo.
// Desplegar:  supabase functions deploy catalogo-eliminar-cuenta   (Verify JWT: OFF)
//
// El borrado de un usuario de auth.users requiere la service_role key, que nunca debe
// vivir en el navegador. Esta función valida el token de sesión del cliente (getUser) y
// solo entonces borra: perfil (clientes_catalogo, en cascada al borrar el usuario),
// favoritos por correo y marca de baja al suscriptor. Los pedidos se conservan como
// registro comercial.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return json({ error: 'No autenticado' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const email = (user.email || '').trim().toLowerCase()

    // Limpieza de datos personales asociados al correo (los pedidos se conservan).
    if (email) {
      try { await admin.from('favoritos_catalogo').delete().eq('email', email) } catch { /* noop */ }
      try { await admin.from('carritos_catalogo').delete().eq('email', email) } catch { /* noop */ }
      try { await admin.from('suscriptores_catalogo').update({ activo: false, unsubscribed_at: new Date().toISOString() }).eq('email', email) } catch { /* noop */ }
    }

    // clientes_catalogo se borra en cascada al eliminar el usuario (FK on delete cascade).
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) return json({ error: delErr.message }, 500)

    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

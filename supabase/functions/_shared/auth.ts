// Guard de autenticación/rol reutilizable para las Edge Functions.
// Valida el JWT del usuario que llama (cabecera Authorization) contra Supabase Auth.
//   requireUser(req)  -> exige sesión válida (cualquier usuario autenticado).
//   requireAdmin(req) -> exige además rol = 'admin' y perfil habilitado
//                        (estado activo y sin archivar).
// Devuelve { user } si pasa, o { resp } con la respuesta de error lista para retornar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const err = (msg: string, status: number) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function userClient(req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
}

export async function requireUser(req: Request): Promise<{ user?: any; resp?: Response }> {
  const { data: { user } } = await userClient(req).auth.getUser()
  if (!user) return { resp: err('No autenticado', 401) }
  return { user }
}

// Para funciones que dispara el cron (service key) o un admin desde la app.
// Acepta si la cabecera trae la service_role key, o si es un admin autenticado.
export async function requireAdminOrCron(req: Request): Promise<{ resp?: Response }> {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (bearer && bearer === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return {}
  const g = await requireAdmin(req)
  return g.resp ? { resp: g.resp } : {}
}

export async function requireAdmin(req: Request): Promise<{ user?: any; resp?: Response }> {
  const asUser = userClient(req)
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { resp: err('No autenticado', 401) }
  // Se consulta con la service key para no depender de las políticas RLS de lectura.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // select('*') y no una lista de columnas: `archivado` llegó en una migración
  // posterior y pedirla por nombre haría fallar la consulta (y con ella el guard)
  // en cualquier instalación que no la tenga.
  const { data: perfil } = await admin.from('user_profiles').select('*').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return { resp: err('Solo administradores', 403) }
  // Desactivar o archivar un usuario no invalida su JWT, que sigue siendo válido
  // hasta que expire. Sin esta comprobación, un admin al que se le acaba de quitar
  // el acceso conserva hasta una hora de poder total.
  if ((perfil.estado && perfil.estado !== 'activo') || perfil.archivado === true) {
    return { resp: err('Usuario inactivo', 403) }
  }
  return { user }
}

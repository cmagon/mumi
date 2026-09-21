// Edge Function: importa los CONTACTOS que son CLIENTES desde Alegra hacia la tabla `clients`.
// Solo clientes (type incluye "client"), nunca proveedores. La identidad/facturación (NIT y
// razón social) queda en `clients` como referencia de solo lectura; los campos locales (canal,
// observaciones) se conservan si el cliente ya existía.
//
// Deduplicación: primero por alegra_id; si no, se intenta enlazar un cliente manual existente
// que coincida por NIT o correo (y aún no tenga alegra_id) para no duplicarlo.
//
// Despliegue:  supabase functions deploy alegra-contacts
// Respuesta:   { ok, total, importados, actualizados, vinculados }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALEGRA_BASE = 'https://api.alegra.com/api/v1'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Helpers incrustados (esta función es autocontenida para poder desplegarla también desde el
// panel de Supabase, que no sube la carpeta _shared/).
// Acepta al admin autenticado O al cron (que llama con la service key), para importar contactos
// automáticamente aunque nadie tenga la app abierta.
async function requireAdminOrCron(req: Request): Promise<{ resp?: Response }> {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (bearer && bearer === SERVICE_KEY) return {}
  const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { resp: json({ error: 'No autenticado' }, 401) }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: perfil } = await admin.from('user_profiles').select('*').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return { resp: json({ error: 'Solo administradores' }, 403) }
  if ((perfil.estado && perfil.estado !== 'activo') || perfil.archivado === true) return { resp: json({ error: 'Usuario inactivo' }, 403) }
  return {}
}
async function getAlegraCreds(supabase: any): Promise<{ email: string; token: string }> {
  const { data } = await supabase.from('alegra_config').select('email, token').eq('id', 1).maybeSingle()
  const email = (Deno.env.get('ALEGRA_EMAIL') || (data as any)?.email || '').trim()
  const token = (Deno.env.get('ALEGRA_TOKEN') || (data as any)?.token || '').trim()
  return { email, token }
}

const PAGE = 30, MAX_PAGES = 250, BATCH = 6

// ¿El contacto es cliente? type puede ser string ("client") o arreglo (["client","provider"]).
function esCliente(c: any): boolean {
  const t = c?.type
  if (Array.isArray(t)) return t.some((x) => String(x).toLowerCase() === 'client')
  return String(t || '').toLowerCase().includes('client')
}

function mapContacto(c: any) {
  const idObj = c?.identificationObject || {}
  const addr = c?.address || {}
  const nombre = String(c?.name || '').trim()
  return {
    alegra_id: String(c?.id ?? '').trim(),
    nombre,
    razon_social: nombre,
    nit: String(idObj?.number ?? c?.identification ?? '').trim(),
    tipo_identificacion: String(idObj?.type ?? '').trim(),
    email: String(c?.email ?? '').trim(),
    telefono: String(c?.phonePrimary ?? c?.mobile ?? c?.phoneSecondary ?? '').trim(),
    direccion: String(addr?.address ?? '').trim(),
    ciudad: String(addr?.city ?? '').trim(),
    contacto: '',   // persona de contacto: campo local, no viene de Alegra
  }
}

async function traerTodasLasPaginas(authHeader: string, onFirstPageError?: (s: number, t: string) => void): Promise<any[]> {
  const todos: any[] = []
  let pagina = 0
  while (pagina < MAX_PAGES) {
    const tanda = Array.from({ length: BATCH }, (_, i) => pagina + i).filter((p) => p < MAX_PAGES)
    const resultados = await Promise.all(tanda.map(async (p) => {
      try {
        const res = await fetch(`${ALEGRA_BASE}/contacts?limit=${PAGE}&start=${p * PAGE}&order_direction=ASC&order_field=name`, { headers: { 'Authorization': authHeader } })
        if (!res.ok) return { p, ok: false, status: res.status, texto: await res.text() }
        let arr: any[]
        try { arr = JSON.parse(await res.text()) } catch { arr = [] }
        return { p, ok: true, arr: Array.isArray(arr) ? arr : [] }
      } catch { return { p, ok: false, status: 0, texto: '' } }
    }))
    resultados.sort((a, b) => a.p - b.p)
    let detener = false
    for (const r of resultados) {
      if (!r.ok) { if (r.p === 0 && onFirstPageError) onFirstPageError(r.status, r.texto); detener = true; break }
      if (!r.arr.length) { detener = true; break }
      todos.push(...r.arr)
      if (r.arr.length < PAGE) detener = true
    }
    if (detener) break
    pagina += BATCH
  }
  return todos
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const guard = await requireAdminOrCron(req); if (guard.resp) return guard.resp
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token } = await getAlegraCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' }, 400)
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)

  try {
    let errorPrimera: { status: number; texto: string } | null = null
    const contactos = await traerTodasLasPaginas(authHeader, (status, texto) => { errorPrimera = { status, texto } })
    if (errorPrimera) return json({ error: `Alegra ${errorPrimera.status}: ${String(errorPrimera.texto).slice(0, 160)}` })

    const soloClientes = contactos.filter(esCliente).map(mapContacto).filter((c) => c.alegra_id && c.nombre)

    // Clientes ya en la app (para deduplicar/enlazar)
    const { data: existentes } = await supabase.from('clients').select('id, alegra_id, nit, email')
    const porAlegra = new Map<string, number>()
    const porNit = new Map<string, number>()
    const porEmail = new Map<string, number>()
    for (const c of (existentes || [])) {
      if (c.alegra_id) porAlegra.set(String(c.alegra_id), c.id)
      if (!c.alegra_id && c.nit) porNit.set(String(c.nit).trim().toLowerCase(), c.id)
      if (!c.alegra_id && c.email) porEmail.set(String(c.email).trim().toLowerCase(), c.id)
    }

    const ahora = new Date().toISOString()
    let importados = 0, actualizados = 0, vinculados = 0

    for (const c of soloClientes) {
      // Campos canónicos que sí se sobreescriben desde Alegra (nunca canal/obs, que son locales).
      const canon = {
        alegra_id: c.alegra_id, nombre: c.nombre, razon_social: c.razon_social, nit: c.nit,
        tipo_identificacion: c.tipo_identificacion, email: c.email, telefono: c.telefono,
        direccion: c.direccion, ciudad: c.ciudad, alegra_sync_at: ahora,
      }
      const idExistente = porAlegra.get(c.alegra_id)
        ?? (c.nit ? porNit.get(c.nit.trim().toLowerCase()) : undefined)
        ?? (c.email ? porEmail.get(c.email.trim().toLowerCase()) : undefined)

      if (idExistente) {
        await supabase.from('clients').update(canon).eq('id', idExistente)
        if (porAlegra.has(c.alegra_id)) actualizados++; else vinculados++
      } else {
        await supabase.from('clients').insert({ ...canon, contacto: c.contacto, canal: 'mayor', fecha_reg: ahora.split('T')[0] })
        importados++
      }
    }

    return json({ ok: true, total: soloClientes.length, importados, actualizados, vinculados })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) })
  }
})

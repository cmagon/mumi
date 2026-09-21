// Edge Function: métricas de compra POR CLIENTE a partir de las FACTURAS de Alegra.
// Devuelve, por id de contacto de Alegra: total facturado, nº de facturas, primera y última
// compra, y el desglose por mes. Se usa en el módulo Clientes para ver cuánto compra cada uno.
//
// Solo facturas (compras reales), no remisiones, para que "total comprado" no infle con
// producto que aún no se factura. Ignora anuladas.
//
// Despliegue:  supabase functions deploy alegra-ventas-cliente
// Respuesta:   { ok, facturas, porCliente: { "<id>": { total, count, primera, ultima, porMes } } }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALEGRA_BASE = 'https://api.alegra.com/api/v1'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Helpers incrustados (función autocontenida: se puede desplegar también desde el panel de
// Supabase, que no sube la carpeta _shared/).
async function requireAdmin(req: Request): Promise<{ resp?: Response }> {
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

async function traerTodasLasPaginas(endpoint: string, authHeader: string, onFirstPageError?: (s: number, t: string) => void): Promise<any[]> {
  const todos: any[] = []
  let pagina = 0
  while (pagina < MAX_PAGES) {
    const tanda = Array.from({ length: BATCH }, (_, i) => pagina + i).filter((p) => p < MAX_PAGES)
    const resultados = await Promise.all(tanda.map(async (p) => {
      try {
        const res = await fetch(`${ALEGRA_BASE}/${endpoint}?limit=${PAGE}&start=${p * PAGE}&order_direction=DESC&order_field=date`, { headers: { 'Authorization': authHeader } })
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
  const guard = await requireAdmin(req); if (guard.resp) return guard.resp
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token } = await getAlegraCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' }, 400)
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)

  try {
    const valorItems = (items: any[]) => (items || []).reduce((s, it) => {
      const cant = Number(it?.quantity ?? it?.qty ?? 0)
      const precio = Number(it?.price ?? 0)
      if (!(cant > 0) || !(precio > 0)) return s
      const desc = Number(it?.discount ?? 0)
      const totalItem = it?.total != null ? Number(it.total) : precio * cant * (1 - desc / 100)
      return s + (Number.isFinite(totalItem) ? totalItem : 0)
    }, 0)

    let errorPrimera: { status: number; texto: string } | null = null
    const invoices = await traerTodasLasPaginas('invoices', authHeader, (status, texto) => { errorPrimera = { status, texto } })
    if (errorPrimera) return json({ error: `Alegra ${errorPrimera.status}: ${String(errorPrimera.texto).slice(0, 160)}` })

    const porCliente: Record<string, { total: number; count: number; primera: string; ultima: string; porMes: Record<string, number> }> = {}
    let facturas = 0
    for (const inv of invoices) {
      const status = String(inv?.status || '').toLowerCase()
      if (/void|cancel|anul/.test(status)) continue
      const cid = String(inv?.client?.id ?? inv?.client ?? '').trim()
      if (!cid) continue
      const fecha = String(inv?.date || inv?.datetime || '').slice(0, 10)   // YYYY-MM-DD
      const mes = fecha.slice(0, 7)
      const total = Number(inv?.total) || valorItems(inv?.items)
      const r = porCliente[cid] || (porCliente[cid] = { total: 0, count: 0, primera: '', ultima: '', porMes: {} })
      r.total += Number.isFinite(total) ? total : 0
      r.count++
      if (fecha) {
        if (!r.primera || fecha < r.primera) r.primera = fecha
        if (!r.ultima || fecha > r.ultima) r.ultima = fecha
        if (/^\d{4}-\d{2}$/.test(mes)) r.porMes[mes] = (r.porMes[mes] || 0) + (Number.isFinite(total) ? total : 0)
      }
      facturas++
    }

    return json({ ok: true, facturas, porCliente })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) })
  }
})

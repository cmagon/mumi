// Edge Function: agrega el HISTÓRICO DE VENTAS desde las FACTURAS + REMISIONES de Alegra (todos los años).
// Las remisiones (producto que ya salió del stock y está reservado = casi vendido) se cuentan también,
// pero solo las que aún no se facturaron, para no duplicar la venta cuando la remisión se convierte en factura.
// Devuelve, por referencia (SKU) de producto, la cantidad vendida por mes/año:
//   { ok, ventas: { "<sku>": { "2026-01": 12, "2026-02": 8, ... } }, facturas }
// Se usa para el Análisis mensual y las proyecciones de Producto Terminado.
//
// Despliegue:  supabase functions deploy alegra-ventas

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALEGRA_BASE = 'https://api.alegra.com/api/v1'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function getCreds(supabase: any) {
  const { data } = await supabase.from('alegra_config').select('email, token').eq('id', 1).maybeSingle()
  return { email: (data?.email || Deno.env.get('ALEGRA_EMAIL') || '').trim(), token: (data?.token || Deno.env.get('ALEGRA_TOKEN') || '').trim() }
}

const PAGE = 30, MAX_PAGES = 250   // tope de seguridad (~7500 documentos)
const BATCH = 6   // páginas pedidas EN PARALELO por tanda, en vez de una por una

// Trae TODAS las páginas de un recurso paginado de Alegra, pidiendo varias páginas a la vez
// (en tandas de BATCH) en lugar de esperar cada una secuencialmente — reduce mucho el tiempo
// total quen no depende de la latencia de red por-página × número de páginas.
// `onPageError` decide si un error en la página 0 debe abortar todo (ej. credenciales inválidas).
async function traerTodasLasPaginas(endpoint: string, authHeader: string, onFirstPageError?: (status: number, texto: string) => void): Promise<any[]> {
  const todos: any[] = []
  let pagina = 0
  while (pagina < MAX_PAGES) {
    const tanda = Array.from({ length: BATCH }, (_, i) => pagina + i).filter(p => p < MAX_PAGES)
    const resultados = await Promise.all(tanda.map(async (p) => {
      try {
        const res = await fetch(`${ALEGRA_BASE}/${endpoint}?limit=${PAGE}&start=${p * PAGE}&order_direction=DESC&order_field=date`, { headers: { 'Authorization': authHeader } })
        if (!res.ok) return { p, ok: false, status: res.status, texto: await res.text() }
        let arr: any[]
        try { arr = JSON.parse(await res.text()) } catch { arr = [] }
        return { p, ok: true, arr: Array.isArray(arr) ? arr : [] }
      } catch {
        return { p, ok: false, status: 0, texto: '' }
      }
    }))
    // Mantiene el orden por página (aunque no es crítico para la agregación) y detecta dónde parar.
    resultados.sort((a, b) => a.p - b.p)
    let detener = false
    for (const r of resultados) {
      if (!r.ok) {
        if (r.p === 0 && onFirstPageError) onFirstPageError(r.status, r.texto)
        detener = true; break
      }
      if (!r.arr.length) { detener = true; break }
      todos.push(...r.arr)
      if (r.arr.length < PAGE) detener = true   // última página real
    }
    if (detener) break
    pagina += BATCH
  }
  return todos
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const guard = await requireUser(req); if (guard.resp) return guard.resp
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token } = await getCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' })
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)
  try {
    const ventas: Record<string, Record<string, number>> = {}
    let facturas = 0, remisiones = 0
    // Ids de remisiones que YA se facturaron: no se cuentan otra vez desde /remissions.
    const remisionesFacturadas = new Set<string>()

    const acumItems = (items: any[], fecha: string) => {
      for (const it of (items || [])) {
        // Se agrega por ID del ítem de Alegra (mapea con finished_products.alegra_item_id).
        // Como respaldo también se acumula por reference (SKU) si existe.
        const cant = Number(it?.quantity ?? it?.qty ?? 0)
        if (!(cant > 0)) continue
        const claves = [String(it?.id ?? '').trim(), String(it?.reference ?? it?.code ?? '').trim()].filter(Boolean)
        for (const k of claves) { ventas[k] = ventas[k] || {}; ventas[k][fecha] = (ventas[k][fecha] || 0) + cant }
      }
    }
    // Detecta remisiones vinculadas a una factura (para no duplicar la venta).
    const idsRemisionDe = (doc: any): string[] => {
      const out: string[] = []
      const push = (v: any) => { const s = String(v ?? '').trim(); if (s) out.push(s) }
      for (const r of (doc?.remissions || doc?.remission || [])) push(r?.id ?? r)
      if (doc?.remission?.id) push(doc.remission.id)
      for (const rd of (doc?.relatedDocuments || [])) { if (/remis/i.test(String(rd?.type || rd?.documentType || ''))) push(rd?.id ?? rd?.number) }
      return out
    }

    // ===== 1) FACTURAS (paginación en paralelo) =====
    let errorPrimeraPagina: { status: number, texto: string } | null = null
    const invoicesArr = await traerTodasLasPaginas('invoices', authHeader, (status, texto) => { errorPrimeraPagina = { status, texto } })
    if (errorPrimeraPagina) return json({ error: `Alegra ${errorPrimeraPagina.status}: ${errorPrimeraPagina.texto.slice(0, 160)}` })
    for (const inv of invoicesArr) {
      const status = String(inv?.status || '').toLowerCase()
      if (/void|cancel|anul/.test(status)) continue   // ignora anuladas
      for (const rid of idsRemisionDe(inv)) remisionesFacturadas.add(rid)
      const fecha = String(inv?.date || inv?.datetime || '').slice(0, 7)   // YYYY-MM
      if (!/^\d{4}-\d{2}$/.test(fecha)) continue
      acumItems(inv?.items, fecha)
      facturas++
    }

    // ===== 2) REMISIONES (producto ya salió del stock y está reservado = casi vendido) =====
    // Se cuentan SOLO las que aún no tienen factura (evita doble conteo al facturar la remisión).
    // Requiere que la fase 1 (facturas) haya terminado, para saber qué remisiones ya se facturaron.
    const remissionsArr = await traerTodasLasPaginas('remissions', authHeader)
    for (const rem of remissionsArr) {
      const status = String(rem?.status || '').toLowerCase()
      if (/void|cancel|anul/.test(status)) continue
      const rid = String(rem?.id ?? '').trim()
      if (rid && remisionesFacturadas.has(rid)) continue        // ya se facturó → no duplicar
      if (rem?.invoiceId || rem?.invoice?.id || (rem?.invoices?.length)) continue  // remisión ya facturada
      const fecha = String(rem?.date || rem?.datetime || '').slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(fecha)) continue
      acumItems(rem?.items, fecha)
      remisiones++
    }

    return json({ ok: true, ventas, facturas, remisiones })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) })
  }
})

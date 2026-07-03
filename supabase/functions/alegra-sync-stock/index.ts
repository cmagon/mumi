// Edge Function: SINCRONIZACIÓN DE STOCK por POLLING (remisiones + facturas de Alegra).
// Reemplaza al webhook para el caso de REMISIONES (Alegra no ofrece eventos de remisión por webhook).
//
// Reglas:
//   - Remisión creada           -> RESERVA stock            (reservado += cant)
//   - Remisión anulada/eliminada -> LIBERA la reserva        (reservado -= cant)
//   - Factura desde remisión     -> DESCUENTA stock (PEPS) por lo facturado (parcial o total)
//                                   y LIBERA esa misma cantidad de la reserva.
//   - Factura directa            -> DESCUENTA stock.
//   - Factura anulada            -> DEVUELVE stock (y re-reserva si venía de remisión).
//
// Idempotencia: tabla alegra_eventos, clave `${tipo}:${docId}:${accion}` (una sola vez cada cosa).
// Corte inicial: alegra_config.sync_desde (fecha). Solo procesa documentos con date >= sync_desde,
//                para no reprocesar el histórico y descuadrar el stock en la primera corrida.
//
// Despliegue:  supabase functions deploy alegra-sync-stock
// Ejecución:   se dispara por cron (ver migration) o manualmente con POST.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAdminOrCron } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALEGRA_BASE = 'https://api.alegra.com/api/v1'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function getCreds(supabase: any) {
  const { data } = await supabase.from('alegra_config').select('email, token, sync_desde').eq('id', 1).maybeSingle()
  return {
    email: (data?.email || Deno.env.get('ALEGRA_EMAIL') || '').trim(),
    token: (data?.token || Deno.env.get('ALEGRA_TOKEN') || '').trim(),
    syncDesde: String(data?.sync_desde || '').slice(0, 10),
  }
}

// Localiza el producto terminado a partir de un ítem de Alegra (por SKU o por alegra_item_id).
async function buscarProd(supabase: any, it: any) {
  const sku = String(it?.reference ?? it?.code ?? it?.sku ?? '').trim()
  if (sku) { const { data } = await supabase.from('finished_products').select('id, stock, reservado, nombre').eq('sku', sku).maybeSingle(); if (data) return data }
  const aid = String(it?.id ?? it?.item?.id ?? '').trim()
  if (aid) { const { data } = await supabase.from('finished_products').select('id, stock, reservado, nombre').eq('alegra_item_id', aid).maybeSingle(); if (data) return data }
  return null
}

// ¿Ya se procesó este documento+acción?
async function yaProcesado(supabase: any, key: string) {
  const { data } = await supabase.from('alegra_eventos').select('id').eq('id', key).maybeSingle()
  return !!data
}
async function marcar(supabase: any, key: string, tipo: string, payload: unknown) {
  await supabase.from('alegra_eventos').insert({ id: key, tipo, payload })
}

// Descuento de stock por PEPS (mismo criterio que el webhook), devolviendo los lotes usados.
async function lotesPEPS(supabase: any, finishedId: string, cant: number) {
  const { data: movs } = await supabase.from('finished_movements')
    .select('lote, cantidad, tipo, fecha').eq('finished_id', finishedId).order('fecha', { ascending: true })
  const porLote = new Map<string, { lote: string; disp: number; fecha: string }>()
  for (const m of (movs || [])) {
    if (m.tipo !== 'entrada' && m.tipo !== 'salida') continue
    const k = m.lote || ''
    const cur = porLote.get(k) || { lote: k, disp: 0, fecha: m.fecha }
    cur.disp += (m.tipo === 'entrada' ? 1 : -1) * Number(m.cantidad || 0)
    porLote.set(k, cur)
  }
  const orden = [...porLote.values()].filter(l => l.disp > 0).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  let restante = cant
  const usados: any[] = []
  for (const l of orden) { if (restante <= 0) break; const toma = Math.min(l.disp, restante); usados.push({ lote: l.lote, cantidad: toma }); restante -= toma }
  if (restante > 0) usados.push({ lote: '', cantidad: restante })
  return usados
}

// Ids de remisión vinculadas a una factura (para liberar reserva y detectar "desde remisión").
const idsRemisionDe = (doc: any): string[] => {
  const out: string[] = []
  const push = (v: any) => { const s = String(v ?? '').trim(); if (s) out.push(s) }
  for (const r of (doc?.remissions || doc?.remission || [])) push(r?.id ?? r)
  if (doc?.remission?.id) push(doc.remission.id)
  for (const rd of (doc?.relatedDocuments || [])) { if (/remis/i.test(String(rd?.type || rd?.documentType || ''))) push(rd?.id ?? rd?.number) }
  return out
}

const esAnulado = (s: string) => /void|cancel|delete|anul|inactiv/.test(String(s || '').toLowerCase())

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const guard = await requireAdminOrCron(req); if (guard.resp) return guard.resp
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token, syncDesde } = await getCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' })
  if (!syncDesde) return json({ error: 'Configura alegra_config.sync_desde (fecha de inicio) antes de sincronizar.' }, 400)
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)

  const PAGE = 30, MAX_PAGES = 200
  const res: any = { reservas: 0, liberaciones: 0, descuentos: 0, devoluciones: 0, saltados: 0, errores: [] as string[] }

  // Descarga documentos DESC por fecha, deteniéndose al cruzar el corte 'syncDesde'.
  async function traer(endpoint: string): Promise<any[]> {
    const acc: any[] = []
    for (let p = 0; p < MAX_PAGES; p++) {
      let r: Response
      try { r = await fetch(`${ALEGRA_BASE}/${endpoint}?limit=${PAGE}&start=${p * PAGE}&order_direction=DESC&order_field=date`, { headers: { Authorization: authHeader } }) } catch { break }
      if (!r.ok) break
      let arr: any[]; try { arr = JSON.parse(await r.text()) } catch { arr = [] }
      if (!Array.isArray(arr) || !arr.length) break
      let cruzoCorte = false
      for (const d of arr) {
        const fecha = String(d?.date || d?.datetime || '').slice(0, 10)
        if (fecha && fecha < syncDesde) { cruzoCorte = true; continue }
        acc.push(d)
      }
      if (cruzoCorte || arr.length < PAGE) break
    }
    return acc
  }

  try {
    // ===== 1) REMISIONES: reservar / liberar =====
    const remisiones = await traer('remissions')
    for (const rem of remisiones) {
      const rid = String(rem?.id ?? '').trim()
      if (!rid) continue
      const anulada = esAnulado(rem?.status)
      const accion = anulada ? 'reversa' : 'alta'
      const key = `remision:${rid}:${accion}`
      if (await yaProcesado(supabase, key)) { res.saltados++; continue }
      // Solo liberamos si antes reservamos (evita reservas negativas por anuladas antiguas).
      if (anulada && !(await yaProcesado(supabase, `remision:${rid}:alta`))) { res.saltados++; continue }
      for (const it of (rem?.items || [])) {
        const cant = Number(it?.quantity ?? it?.qty ?? 0)
        if (!(cant > 0)) continue
        const prod = await buscarProd(supabase, it)
        if (!prod) { res.errores.push(`remisión ${rid}: producto no encontrado (${it?.reference || it?.id})`); continue }
        const nuevoRes = Math.max(0, Number(prod.reservado || 0) + (anulada ? -cant : cant))
        await supabase.from('finished_products').update({ reservado: nuevoRes }).eq('id', prod.id)
        await supabase.from('finished_movements').insert({ finished_id: prod.id, tipo: anulada ? 'reserva_liberada' : 'reserva', cantidad: cant, origen: 'alegra', ref: rid, obs: `${anulada ? 'Remisión anulada' : 'Remisión'} Alegra #${rid}` })
        anulada ? res.liberaciones++ : res.reservas++
      }
      await marcar(supabase, key, `remision_${accion}`, rem)
    }

    // ===== 2) FACTURAS: descontar stock / devolver =====
    const facturas = await traer('invoices')
    for (const inv of facturas) {
      const iid = String(inv?.id ?? '').trim()
      if (!iid) continue
      const anulada = esAnulado(inv?.status)
      const accion = anulada ? 'reversa' : 'alta'
      const key = `factura:${iid}:${accion}`
      if (await yaProcesado(supabase, key)) { res.saltados++; continue }
      if (anulada && !(await yaProcesado(supabase, `factura:${iid}:alta`))) { res.saltados++; continue }
      const desdeRemision = idsRemisionDe(inv).length > 0
      for (const it of (inv?.items || [])) {
        const cant = Number(it?.quantity ?? it?.qty ?? 0)
        if (!(cant > 0)) continue
        const prod = await buscarProd(supabase, it)
        if (!prod) { res.errores.push(`factura ${iid}: producto no encontrado (${it?.reference || it?.id})`); continue }

        if (anulada) {
          // Devuelve stock; si venía de remisión, vuelve a reservar lo devuelto.
          const upd: any = { stock: Number(prod.stock || 0) + cant }
          if (desdeRemision) upd.reservado = Number(prod.reservado || 0) + cant
          await supabase.from('finished_products').update(upd).eq('id', prod.id)
          await supabase.from('finished_movements').insert({ finished_id: prod.id, tipo: 'entrada', cantidad: cant, origen: 'alegra', ref: iid, obs: `Reversa factura Alegra #${iid}` })
          res.devoluciones++
          continue
        }

        // Venta: descuenta stock (PEPS). Si viene de remisión, libera esa cantidad de la reserva.
        const upd: any = { stock: Number(prod.stock || 0) - cant }
        if (desdeRemision) upd.reservado = Math.max(0, Number(prod.reservado || 0) - cant)
        await supabase.from('finished_products').update(upd).eq('id', prod.id)
        const usados = await lotesPEPS(supabase, prod.id, cant)
        for (const lt of usados) {
          await supabase.from('finished_movements').insert({ finished_id: prod.id, tipo: 'salida', cantidad: lt.cantidad, lote: lt.lote || '', origen: 'alegra', ref: iid, obs: `Factura Alegra #${iid}${desdeRemision ? ' (desde remisión)' : ''}` })
        }
        res.descuentos++
      }
      await marcar(supabase, key, `factura_${accion}`, inv)
    }

    return json({ ok: true, ...res })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e), parcial: res }, 500)
  }
})

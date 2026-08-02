// Edge Function: empuja el stock de PRODUCTO TERMINADO de la app hacia Alegra.
// La app es la fuente de verdad; al aprobar producción esta función actualiza la cantidad
// disponible del ítem en Alegra para que las cantidades cuadren al facturar.
//
// Se llama desde la app autenticada (lleva el JWT del usuario), así la API key de Alegra
// nunca queda expuesta en el navegador.
//
// Despliegue (con verificación de JWT, por defecto):
//   supabase functions deploy alegra-push-stock
// Secrets:
//   ALEGRA_EMAIL  -> correo de tu cuenta Alegra
//   ALEGRA_TOKEN  -> token de API de Alegra (Configuración > API)
//
// Cuerpo aceptado:
//   { finished_id: "uuid" }  -> empuja ese producto terminado
//   { all: true }            -> empuja todos los terminados con alegra_item_id

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'
import { getAlegraCreds } from '../_shared/alegra.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALEGRA_BASE = 'https://api.alegra.com/api/v1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function getCreds(supabase: any) {
  const { email, token, cfg } = await getAlegraCreds(supabase, ['price_list_mayor', 'price_list_detal'])
  return { email, token, listaMayor: (cfg.price_list_mayor as string) || '', listaDetal: (cfg.price_list_detal as string) || '' }
}

// 1) Actualiza nombre, precios (por lista) y costo del ítem (PUT /items). El stock NO se setea aquí.
async function pushDatos(authHeader: string, itemId: string, costo?: number, nombre?: string,
  precioMayor?: number, precioDetal?: number, listaMayor?: string, listaDetal?: string,
  unidad?: string, unspsc?: string, catId?: string, sku?: string, descripcion?: string) {
  const body: Record<string, unknown> = {}
  if (nombre && nombre.trim()) body.name = nombre.trim()
  if (sku && String(sku).trim()) body.reference = String(sku).trim()   // SKU / referencia
  if (descripcion && String(descripcion).trim()) body.description = String(descripcion).trim().slice(0, 500)
  // Precios: lee la estructura actual del ítem y actualiza el precio de cada lista mapeada,
  // preservando las demás listas (más robusto que enviar un arreglo nuevo).
  const hayListas = (listaMayor && (precioMayor || 0) > 0) || (listaDetal && (precioDetal || 0) > 0)
  if (hayListas) {
    let priceArr: any[] = []
    try {
      const cur = await fetch(`${ALEGRA_BASE}/items/${itemId}`, { headers: { 'Authorization': authHeader } })
      const it = await cur.json()
      if (Array.isArray(it?.price)) priceArr = it.price.map((p: any) => ({ ...p }))
    } catch { /* sin estructura previa */ }
    const setP = (listId?: string, val?: number) => {
      if (!listId || !(val && val > 0)) return
      const id = Number(listId)
      const e = priceArr.find((x: any) => Number(x.idPriceList ?? x.id) === id)
      if (e) e.price = val
      else priceArr.push({ idPriceList: id, price: val })
    }
    setP(listaMayor, precioMayor)
    setP(listaDetal, precioDetal)
    if (priceArr.length) body.price = priceArr
  } else if ((precioMayor || 0) > 0) {
    body.price = precioMayor
  }
  // Inventario: costo, venta en negativo y unidad de medida
  const inv: Record<string, unknown> = { negativeSale: true }
  if (typeof costo === 'number' && costo > 0) inv.unitCost = costo
  if (unidad && unidad.trim()) inv.unit = unidad.trim()
  body.inventory = inv
  // Categoría y código del producto/servicio (UNSPSC / productKey). Solo se envía si está definido,
  // para no borrar nunca el código que ya tenga el ítem. Los códigos del catálogo de la app son
  // UNSPSC reales (válidos para la DIAN), así que la factura los acepta.
  if (catId) body.itemCategory = { id: Number(catId) }
  if (unspsc && unspsc.trim()) body.productKey = unspsc.trim()
  if (Object.keys(body).length === 0) return { precio_enviado: null, status: 'sin cambios' }
  const res = await fetch(`${ALEGRA_BASE}/items/${itemId}`, {
    method: 'PUT', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`PUT item ${itemId}: ${res.status} ${txt}`)
  return { precio_enviado: body.price ?? null, status: res.status }
}

// 2) Ajusta el stock vía ajuste de inventario (Alegra usa DELTA in/out, no valor absoluto).
//    Lee la cantidad actual del ítem y crea el movimiento para igualar al stock de la app.
async function ajustarStock(authHeader: string, itemId: string, objetivo: number, costo?: number) {
  const r = await fetch(`${ALEGRA_BASE}/items/${itemId}`, { headers: { 'Authorization': authHeader } })
  const it = await r.json().catch(() => ({}))
  const actual = Number(it?.inventory?.availableQuantity ?? 0)
  const delta = Math.round((objetivo - actual) * 1000) / 1000
  if (delta === 0) return { actual, objetivo, delta: 0 }
  const body = {
    date: new Date().toISOString().slice(0, 10),
    observations: 'Sincronización de stock desde Mumi',
    items: [{ id: itemId, type: delta > 0 ? 'in' : 'out', quantity: Math.abs(delta), unitCost: Number(costo || it?.inventory?.unitCost || 0) }],
  }
  const res = await fetch(`${ALEGRA_BASE}/inventory-adjustments`, {
    method: 'POST', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const txt = await res.text()
  if (!res.ok) throw new Error(`Ajuste stock ${itemId}: ${res.status} ${txt}`)
  return { actual, objetivo, delta }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  // requireUser y no requireAdmin a propósito: esta función no acepta valores del
  // cliente, solo espeja hacia Alegra lo que ya está en finished_products. Quién
  // puede cambiar esos datos lo decide la RLS de esa tabla (migración v134), y el
  // admin puede conceder ajustes de stock a un operario. Exigir admin aquí dejaría
  // a Alegra desincronizado justo cuando ese operario ajusta el inventario.
  const guard = await requireUser(req); if (guard.resp) return guard.resp

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token, listaMayor, listaDetal } = await getCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' }, 400)
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)
  try {
    const { finished_id, all } = await req.json().catch(() => ({}))
    let query = supabase.from('finished_products').select('id, nombre, sku, alegra_item_id, stock, costo_unitario, precio_mayor, precio_detal, unidad_medida, codigo_unspsc, categoria_alegra_id, descripcion')
    if (!all) query = query.eq('id', finished_id)
    else query = query.not('alegra_item_id', 'is', null)
    const { data: prods } = await query
    if (!prods?.length) return json({ ok: true, msg: 'sin productos para sincronizar' })

    const resultados: any[] = []
    for (const p of prods) {
      if (!p.alegra_item_id) { resultados.push({ producto: p.nombre, estado: 'sin alegra_item_id' }); continue }
      try {
        const id = String(p.alegra_item_id)
        const datosRes = await pushDatos(authHeader, id, Number(p.costo_unitario || 0), p.nombre, Number(p.precio_mayor || 0), Number(p.precio_detal || 0), listaMayor, listaDetal, p.unidad_medida, p.codigo_unspsc, p.categoria_alegra_id, p.sku, p.descripcion)
        const stockRes = await ajustarStock(authHeader, id, Number(p.stock || 0), Number(p.costo_unitario || 0))
        resultados.push({ producto: p.nombre, stock: Number(p.stock || 0), ajuste: stockRes, estado: 'ok',
          debug: { precio_detal: Number(p.precio_detal || 0), lista_mayor: listaMayor || '(sin mapear)', lista_detal: listaDetal || '(sin mapear)', precio_enviado: datosRes?.precio_enviado } })
      } catch (e) {
        resultados.push({ producto: p.nombre, estado: 'error', detalle: String((e as Error)?.message || e) })
      }
    }
    return json({ ok: true, resultados })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

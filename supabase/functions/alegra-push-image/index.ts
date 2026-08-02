// Edge Function (EXPERIMENTAL): intenta enviar la imagen principal del producto al ítem de Alegra.
// La API pública de Alegra NO documenta soporte de imágenes para ítems, así que esta función
// prueba VARIOS métodos en orden y reporta cuál (si alguno) fue aceptado:
//   1. PUT /items/{id} con { image: { name, data(base64) } }
//   2. PUT /items/{id} con { images: [{ name, data }] }
//   3. POST /items/{id}/attachment con multipart/form-data (como facturas/contactos)
//
// Despliegue:  supabase functions deploy alegra-push-image
// Cuerpo:      { finished_id: "uuid" }
// Respuesta:   { ok, metodo, intentos: [...] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAdmin } from '../_shared/auth.ts'
import { getAlegraCreds } from '../_shared/alegra.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALEGRA_BASE = 'https://api.alegra.com/api/v1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const getCreds = (supabase: any) => getAlegraCreds(supabase)
const b64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf); let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const guard = await requireAdmin(req); if (guard.resp) return guard.resp
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { email, token } = await getCreds(supabase)
  if (!email || !token) return json({ error: 'Configura el correo y el token de Alegra en la app.' }, 400)
  const authHeader = 'Basic ' + btoa(`${email}:${token}`)

  try {
    const { finished_id } = await req.json().catch(() => ({}))
    const { data: fp } = await supabase.from('finished_products').select('nombre, alegra_item_id, product_id, imagen_url').eq('id', finished_id).maybeSingle()
    if (!fp) return json({ error: 'Producto no encontrado' }, 404)
    if (!fp.alegra_item_id) return json({ error: 'Este producto no está enlazado a un ítem de Alegra' }, 400)

    // Imagen propia del catálogo o, si no, la de la ficha base
    let url = fp.imagen_url
    if (!url && fp.product_id) {
      const { data: ficha } = await supabase.from('products_costing').select('imagen_url').eq('id', fp.product_id).maybeSingle()
      url = ficha?.imagen_url
    }
    if (!url) return json({ error: 'No hay imagen para este producto' }, 400)

    const imgRes = await fetch(url)
    if (!imgRes.ok) return json({ error: `No se pudo descargar la imagen de la app (HTTP ${imgRes.status}). Si el bucket es privado, corre la migración v93 para hacerlo público.` }, 400)
    const buf = await imgRes.arrayBuffer()
    const ct = imgRes.headers.get('content-type') || 'image/jpeg'
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
    const base64 = b64(buf)
    const nombreArchivo = `${(fp.nombre || 'producto').replace(/[^a-z0-9]/gi, '_')}.${ext}`
    const itemId = String(fp.alegra_item_id)
    const intentos: any[] = []

    // ── Método 1: PUT con { image: { name, data } } ──
    try {
      const r1 = await fetch(`${ALEGRA_BASE}/items/${itemId}`, {
        method: 'PUT', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: { name: nombreArchivo, data: base64 } }),
      })
      const t1 = await r1.text()
      // Verifica que Alegra realmente haya guardado la imagen (no solo respondido 200 ignorándola)
      let confirmada = false
      if (r1.ok) { try { const it = JSON.parse(t1); confirmada = !!(it?.image || it?.images?.length) } catch { /* */ } }
      intentos.push({ metodo: 'PUT image{name,data}', status: r1.status, confirmada, detalle: t1.slice(0, 300) })
      if (r1.ok && confirmada) return json({ ok: true, metodo: 'PUT image{name,data}', intentos })
    } catch (e) { intentos.push({ metodo: 'PUT image{name,data}', error: String(e) }) }

    // ── Método 2: PUT con { images: [{ name, data }] } ──
    try {
      const r2 = await fetch(`${ALEGRA_BASE}/items/${itemId}`, {
        method: 'PUT', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [{ name: nombreArchivo, data: base64 }] }),
      })
      const t2 = await r2.text()
      let confirmada = false
      if (r2.ok) { try { const it = JSON.parse(t2); confirmada = !!(it?.image || it?.images?.length) } catch { /* */ } }
      intentos.push({ metodo: 'PUT images[]', status: r2.status, confirmada, detalle: t2.slice(0, 300) })
      if (r2.ok && confirmada) return json({ ok: true, metodo: 'PUT images[]', intentos })
    } catch (e) { intentos.push({ metodo: 'PUT images[]', error: String(e) }) }

    // ── Método 3: POST /items/{id}/attachment con multipart (como facturas/contactos) ──
    try {
      const fd = new FormData()
      fd.append('attachment', new Blob([buf], { type: ct }), nombreArchivo)
      const r3 = await fetch(`${ALEGRA_BASE}/items/${itemId}/attachment`, {
        method: 'POST', headers: { 'Authorization': authHeader }, body: fd,
      })
      const t3 = await r3.text()
      intentos.push({ metodo: 'POST attachment multipart', status: r3.status, confirmada: r3.ok, detalle: t3.slice(0, 300) })
      if (r3.ok) return json({ ok: true, metodo: 'POST attachment multipart', intentos })
    } catch (e) { intentos.push({ metodo: 'POST attachment multipart', error: String(e) }) }

    return json({ ok: false, error: 'Alegra no aceptó la imagen por ninguno de los 3 métodos (su API pública no soporta imágenes de ítems). Detalle en "intentos".', intentos })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

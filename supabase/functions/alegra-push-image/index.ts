// Edge Function (EXPERIMENTAL): envía la imagen del producto (de la ficha) al ítem de Alegra.
// La imagen vive en products_costing.imagen_url (URL pública de Storage); solo los productos base
// tienen imagen. Devuelve la respuesta cruda de Alegra para poder ajustar el formato si hace falta.
//
// Despliegue:  supabase functions deploy alegra-push-image
// Cuerpo:      { finished_id: "uuid" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALEGRA_BASE = 'https://api.alegra.com/api/v1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function getCreds(supabase: any) {
  const { data } = await supabase.from('alegra_config').select('email, token').eq('id', 1).maybeSingle()
  return { email: (data?.email || Deno.env.get('ALEGRA_EMAIL') || '').trim(), token: (data?.token || Deno.env.get('ALEGRA_TOKEN') || '').trim() }
}
const b64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf); let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const guard = await requireUser(req); if (guard.resp) return guard.resp
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
    if (!imgRes.ok) return json({ error: 'No se pudo descargar la imagen de la app' }, 400)
    const ct = imgRes.headers.get('content-type') || 'image/jpeg'
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
    const base64 = b64(await imgRes.arrayBuffer())
    const nombreArchivo = `${(fp.nombre || 'producto').replace(/[^a-z0-9]/gi, '_')}.${ext}`

    // Alegra: imagen como objeto { name, data } con base64 puro
    const res = await fetch(`${ALEGRA_BASE}/items/${fp.alegra_item_id}`, {
      method: 'PUT',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: { name: nombreArchivo, data: base64 } }),
    })
    const txt = await res.text()
    return json({ ok: res.ok, status: res.status, alegra: txt.slice(0, 1500) })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

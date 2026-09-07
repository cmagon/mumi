// Edge Function: sincroniza productos del catálogo público → Google Sheets (feed Meta/Facebook).
//
// Escribe TODOS los campos mapeables en cada sync (nombre, descripción, precios, imágenes,
// stock, variantes, etiquetas, envío, etc.). La hoja debe tener los encabezados Meta en fila 2;
// el Apps Script escribe por nombre de columna (p. ej. additional_image_link en AF).
//
// Secrets: GOOGLE_SHEETS_WEBAPP_URL
// Opcional: GOOGLE_SHEETS_ID (default: hoja Mumi)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBAPP_URL = (Deno.env.get('GOOGLE_SHEETS_WEBAPP_URL') || '').trim()
const SHEET_ID = (Deno.env.get('GOOGLE_SHEETS_ID') || '1L-Wj2A-uKw5d8ocdbce1s_3YRgYDvGd8FMpaPJBuzs0').trim()

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

async function requireUserOrCron(req: Request) {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (bearer && bearer === SERVICE_KEY) return {}
  return requireUser(req)
}

const slugify = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70)

const sinHtml = (s: string) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function priceFeed(n: unknown) {
  const v = Math.max(0, Number(n) || 0)
  return `${v.toFixed(2)} COP`
}

function esUrlImagen(u: string) {
  const s = (u || '').trim()
  if (!/^https?:\/\//i.test(s)) return false
  if (/\/product-images\/?$/i.test(s)) return false
  return true
}

function parseImagenes(raw: unknown): any[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

function urlsDeProducto(p: { imagen_url?: unknown; imagenes?: unknown } | null | undefined): string[] {
  if (!p) return []
  const out: string[] = []
  const add = (u: unknown) => {
    const s = String(u || '').trim()
    if (esUrlImagen(s) && !out.includes(s)) out.push(s)
  }
  for (const x of parseImagenes(p.imagenes)) {
    if (typeof x === 'string') add(x)
    else if (x && typeof x === 'object') {
      add((x as any).url)
      add((x as any).src)
    }
  }
  add(p.imagen_url)
  for (const x of parseImagenes(p.imagenes)) {
    if (x && typeof x === 'object') add((x as any).url_mobile)
  }
  return out
}

function imgPrincipal(
  p: any,
  porFicha: Map<string, { imagen_url?: unknown; imagenes?: unknown }>,
): string {
  const propias = urlsDeProducto(p)
  if (propias[0]) return propias[0]
  const ficha = p?.product_id != null ? porFicha.get(String(p.product_id)) : null
  const deFicha = urlsDeProducto(ficha)
  if (deFicha[0]) return deFicha[0]
  for (const key of ['surtido_a', 'surtido_b']) {
    const id = p?.[key]
    if (id == null) continue
    const u = urlsDeProducto(porFicha.get(String(id)))
    if (u[0]) return u[0]
  }
  return ''
}

/** Meta: hasta 10 URLs adicionales, separadas por coma (sin la principal). */
function additionalImageLink(urls: string[], principal: string): string {
  const rest = urls.filter((u) => u && u !== principal).slice(0, 10)
  return rest.join(',')
}

function arrDe(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p.map(String).filter(Boolean) : (v ? [v] : [])
    } catch {
      return v ? [v] : []
    }
  }
  return []
}

/** Categoría Google/Meta aproximada para alimentos naturales. */
function googleCategory(categoria: string) {
  const c = (categoria || '').toLowerCase()
  if (/infusion|té|te\b/.test(c)) return 'Food, Beverages & Tobacco > Beverages > Tea & Infusions'
  if (/galleta|dulce|bocadillo|snack/.test(c)) return 'Food, Beverages & Tobacco > Food Items > Snack Foods'
  if (/miel|jarabe/.test(c)) return 'Food, Beverages & Tobacco > Food Items > Candy & Chocolate'
  return 'Food, Beverages & Tobacco > Food Items'
}

type Ctx = {
  marca: string
  origin: string
  porFicha: Map<string, { imagen_url?: unknown; imagenes?: unknown }>
}

function buildMetaRow(p: any, extra: any, ctx: Ctx): Record<string, string> | null {
  const merged = {
    ...p,
    surtido_a: extra.surtido_a,
    surtido_b: extra.surtido_b,
    product_id: p.product_id ?? extra.product_id,
    sku: extra.sku ?? p.sku,
    imagen_url: p.imagen_url || extra.imagen_url,
    imagenes: p.imagenes ?? extra.imagenes,
  }
  if (!urlsDeProducto(merged).length && (extra.imagen_url || extra.imagenes)) {
    merged.imagen_url = extra.imagen_url || merged.imagen_url
    merged.imagenes = extra.imagenes || merged.imagenes
  }

  const urls = urlsDeProducto(merged)
  const principal = imgPrincipal(merged, ctx.porFicha)
  if (!principal) return null

  const stock = Number(p.stock) || 0
  const slug = slugify(p.nombre || '')
  const link = ctx.origin && slug ? `${ctx.origin}/producto/${slug}` : (ctx.origin || '')
  const oferta = Number(p.precio_oferta) || 0
  const detal = Number(p.precio_detal) || 0
  const enOferta = oferta > 0 && detal > 0 && oferta < detal
  const categoria = String(p.categoria || extra.categoria_alegra_nombre || '').trim()

  // Meta title = nombre comercial del producto terminado (no SEO title)
  const nombre = String(p.nombre || extra.nombre || '').trim()
  const titulo = nombre.slice(0, 200)
  // Meta/Catálogo usa la "Descripción corta" (resumen); fallback a las características / contenido
  let descripcion = sinHtml(p.resumen || p.descripcion || p.contenido || '')
  if (p.seo_desc && !descripcion.includes(sinHtml(p.seo_desc))) {
    descripcion = descripcion ? `${descripcion} ${sinHtml(p.seo_desc)}` : sinHtml(p.seo_desc)
  }
  if (!descripcion) descripcion = nombre
  if (p.origen) descripcion = `${descripcion} Origen: ${sinHtml(p.origen)}.`.trim()
  const beneficios = arrDe(p.beneficios)
  if (beneficios.length) descripcion = `${descripcion} ${beneficios.join('. ')}.`.trim()
  descripcion = descripcion.slice(0, 9999)

  const frutos = arrDe(p.frutos)
  const tags: string[] = []
  if (categoria) tags.push(categoria)
  if (frutos.length) tags.push(frutos.join(', '))
  if (p.destacado) tags.push('destacado')
  if (p.novedad) tags.push('novedad')

  const sku = String(merged.sku || '').trim()
  const gtin = /^\d{8,14}$/.test(sku.replace(/\D/g, '')) ? sku.replace(/\D/g, '') : ''

  return {
    id: String(p.id),
    title: titulo,
    description: descripcion,
    availability: stock > 0 ? 'in stock' : 'out of stock',
    condition: 'new',
    price: priceFeed(detal > 0 ? detal : oferta),
    link,
    image_link: principal,
    additional_image_link: additionalImageLink(urls, principal),
    brand: ctx.marca,
    google_product_category: googleCategory(categoria),
    fb_product_category: categoria || 'Alimentos',
    quantity_to_sell_on_facebook: '',
    sale_price: enOferta ? priceFeed(oferta) : '',
    sale_price_effective_date: '',
    item_group_id: p.grupo ? String(p.grupo) : '',
    gender: '',
    color: '',
    size: p.pack_label ? String(p.pack_label) : '',
    age_group: 'all ages',
    material: p.origen ? sinHtml(p.origen).slice(0, 200) : 'Natural',
    pattern: '',
    shipping: '',
    shipping_weight: '',
    gtin,
    'product_tags[0]': tags[0] || '',
    'product_tags[1]': tags[1] || '',
    'product_tags[2]': tags[2] || '',
    'product_tags[3]': tags[3] || '',
    'product_tags[4]': tags[4] || '',
    'style[0]': p.novedad ? 'novedad' : (p.destacado ? 'destacado' : ''),
    internal_label: sku || String(p.id).slice(0, 8),
    custom_label_0: categoria,
    custom_label_1: p.grupo ? String(p.grupo) : '',
    custom_label_2: p.pack_label ? String(p.pack_label) : '',
    custom_label_3: stock > 0 ? 'disponible' : 'agotado',
    custom_label_4: enOferta ? 'oferta' : '',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const gate = await requireUserOrCron(req)
    if (gate.resp) return gate.resp

    if (!WEBAPP_URL) {
      return json({
        error: 'Falta GOOGLE_SHEETS_WEBAPP_URL. Despliega el Apps Script de la hoja y guarda la URL como secret.',
        sheet_id: SHEET_ID,
      }, 400)
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY)

    const [{ data: prods, error: eProd }, { data: cfg }, { data: fichas }, { data: terminados }] = await Promise.all([
      sb.from('catalogo_productos').select('*').order('nombre'),
      sb.from('config_catalogo').select('nombre_tienda, url_publica').eq('id', 1).maybeSingle(),
      sb.from('products_costing').select('id, imagen_url, imagenes'),
      sb.from('finished_products')
        .select('id, product_id, nombre, surtido_a, surtido_b, sku, imagen_url, imagenes, categoria_alegra_nombre')
        .eq('catalogo_visible', true),
    ])
    if (eProd) throw eProd

    const porFicha = new Map<string, { imagen_url?: unknown; imagenes?: unknown }>()
    for (const f of fichas || []) porFicha.set(String(f.id), f)

    const extraPorId = new Map<string, any>()
    for (const t of terminados || []) extraPorId.set(String(t.id), t)

    const ctx: Ctx = {
      marca: (cfg?.nombre_tienda || 'Mumi Amazonia').trim() || 'Mumi Amazonia',
      origin: String(cfg?.url_publica || '').trim().replace(/\/+$/, ''),
      porFicha,
    }

    const omitidos: string[] = []
    const rows: Record<string, string>[] = []
    for (const p of prods || []) {
      const row = buildMetaRow(p, extraPorId.get(String(p.id)) || {}, ctx)
      if (!row) {
        omitidos.push(String(p.nombre || p.id))
        continue
      }
      rows.push(row)
    }

    const res = await fetch(WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify({
        sheetId: SHEET_ID,
        rows,
        syncedAt: new Date().toISOString(),
      }),
    })
    const text = await res.text()
    let payload: any = null
    try { payload = JSON.parse(text) } catch { payload = { raw: text.slice(0, 500) } }

    if (!res.ok || payload?.ok === false) {
      return json({
        error: payload?.error || `Apps Script respondió ${res.status}`,
        detail: payload,
        enviados: rows.length,
      }, 502)
    }

    return json({
      ok: true,
      productos: rows.length,
      en_stock: rows.filter((r) => r.availability === 'in stock').length,
      sin_stock: rows.filter((r) => r.availability === 'out of stock').length,
      con_imagenes_extra: rows.filter((r) => r.additional_image_link).length,
      omitidos_sin_imagen: omitidos.length,
      omitidos_nombres: omitidos.slice(0, 20),
      columnas_hoja: payload?.columns || null,
      sheet_id: SHEET_ID,
      synced_at: payload?.syncedAt || new Date().toISOString(),
    })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

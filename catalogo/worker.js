// Worker del catálogo con prerender de Open Graph para /producto/:id.
// Los rastreadores de WhatsApp/Facebook NO ejecutan JS, así que inyectamos las meta tags
// (título, descripción e imagen) en el HTML servido para esa ruta. El resto de rutas y
// assets se sirven tal cual (con fallback SPA para React Router).

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const m = url.pathname.match(/^\/producto\/([^/]+)\/?$/)
    if ((request.method === 'GET' || request.method === 'HEAD') && m) {
      try {
        const raw = decodeURIComponent(m[1])
        const prod = await getProducto(env, raw)
        if (prod) {
          const res = await env.ASSETS.fetch(new Request(new URL('/', url).toString(), { method: 'GET' }))
          const html = inyectar(await res.text(), prod, url)
          return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } })
        }
      } catch (e) { /* si algo falla, se sirve el SPA normal abajo */ }
    }
    return env.ASSETS.fetch(request)
  },
}

const slugify = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70)

async function getProducto(env, param) {
  const base = env.SUPABASE_URL, key = env.SUPABASE_ANON_KEY
  if (!base || !key) return null
  const headers = { apikey: key, authorization: `Bearer ${key}` }
  // Enlace antiguo <slug>--<uuid>: resolver directo por id
  if (param.includes('--')) {
    const id = param.split('--').pop()
    const r = await fetch(`${base}/rest/v1/catalogo_productos?id=eq.${encodeURIComponent(id)}&select=nombre,descripcion,precio_detal,imagen_url,seo_titulo,seo_desc&limit=1`, { headers })
    if (r.ok) { const rows = await r.json(); if (rows[0]) return rows[0] }
  }
  // URL corta por slug: el nombre es único, así que buscamos por slug del nombre
  const r = await fetch(`${base}/rest/v1/catalogo_productos?select=nombre,descripcion,precio_detal,imagen_url,seo_titulo,seo_desc`, { headers })
  if (!r.ok) return null
  const rows = await r.json()
  return rows.find(p => slugify(p.nombre) === param) || null
}

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inyectar(html, p, url) {
  // Usa el SEO configurado del producto; si no, su nombre y descripción
  const title = `${p.seo_titulo || p.nombre} · Mumi Amazonia`
  const limpio = String(p.seo_desc || p.descripcion || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  const desc = (limpio || 'Sabores de la selva del Guaviare. 100% natural.').slice(0, 180)
  const img = p.imagen_url || ''
  const tags = [
    `<meta property="og:type" content="product">`,
    `<meta property="og:site_name" content="Mumi Amazonia">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url.href)}">`,
    img ? `<meta property="og:image" content="${esc(img)}">` : '',
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    img ? `<meta name="twitter:image" content="${esc(img)}">` : '',
  ].filter(Boolean).join('\n    ')
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}">`)
  html = html.replace('</head>', `    ${tags}\n  </head>`)
  return html
}

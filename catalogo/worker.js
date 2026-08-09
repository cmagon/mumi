// Worker del catálogo: SEO server-side (robots, sitemap, meta OG/Twitter, JSON-LD).
// Los rastreadores sociales no ejecutan JS; por eso se inyecta HTML en rutas clave.
// Assets y SPA fallback se sirven vía ASSETS (Wrangler).

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = (url.pathname.replace(/\/+$/, '') || '/')
    const method = request.method

    if (method === 'GET' || method === 'HEAD') {
      try {
        if (path === '/robots.txt') return robotsTxt(env, url)
        if (path === '/sitemap.xml') return sitemapXml(env, url)
        if (path === '/feeds/google-merchant.txt') return merchantFeed(env, url)

        const prodMatch = path.match(/^\/producto\/([^/]+)$/)
        if (prodMatch) {
          const prod = await getProducto(env, decodeURIComponent(prodMatch[1]))
          if (prod) {
            const html = await shellHtml(env, url)
            return htmlRes(inyectarProducto(html, prod, url, await getCfg(env)), 300)
          }
        }

        const page = await pageSeo(env, path, url)
        if (page) {
          const html = await shellHtml(env, url)
          return htmlRes(inyectarPagina(html, page), 300)
        }
      } catch { /* fallback SPA */ }
    }

    return env.ASSETS.fetch(request)
  },
}

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const slugify = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70)
const sinHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()

function sb(env) {
  const base = env.SUPABASE_URL, key = env.SUPABASE_ANON_KEY
  if (!base || !key) return null
  return { base, headers: { apikey: key, authorization: `Bearer ${key}` } }
}

async function sbGet(env, path) {
  const c = sb(env); if (!c) return null
  const r = await fetch(`${c.base}/rest/v1/${path}`, { headers: c.headers })
  if (!r.ok) return null
  return r.json()
}

async function getCfg(env) {
  const rows = await sbGet(env, 'config_catalogo?id=eq.1&select=*&limit=1')
  return rows?.[0] || null
}

async function shellHtml(env, url) {
  const res = await env.ASSETS.fetch(new Request(new URL('/', url).toString(), { method: 'GET' }))
  return res.text()
}

function htmlRes(html, maxAge = 300) {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` },
  })
}

function textRes(body, type, maxAge = 3600) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': type, 'cache-control': `public, max-age=${maxAge}` },
  })
}

function originOf(cfg, url) {
  const u = (cfg?.url_publica || '').trim().replace(/\/+$/, '')
  return u || url.origin
}

async function robotsTxt(env, url) {
  const cfg = await getCfg(env)
  const origin = originOf(cfg, url)
  const indexar = cfg?.seo_indexar !== false && !cfg?.mantenimiento_activo
  const body = indexar
    ? [
      'User-agent: *',
      'Allow: /',
      'Disallow: /favoritos',
      'Disallow: /mayorista',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
      '',
    ].join('\n')
    : ['User-agent: *', 'Disallow: /', ''].join('\n')
  return textRes(body, 'text/plain; charset=utf-8', 3600)
}

async function sitemapXml(env, url) {
  const cfg = await getCfg(env)
  const origin = originOf(cfg, url)
  if (cfg?.seo_indexar === false || cfg?.mantenimiento_activo) {
    return textRes('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', 'application/xml; charset=utf-8')
  }
  const urls = new Set(['/', '/tienda', '/nosotros', '/contacto', '/galeria'])
  const paginas = Array.isArray(cfg?.paginas) ? cfg.paginas : []
  for (const p of paginas) {
    if (p?.slug && !p?.oculta) urls.add(`/p/${encodeURIComponent(p.slug)}`)
  }
  const prods = await sbGet(env, 'catalogo_productos?select=nombre&order=nombre') || []
  for (const p of prods) {
    if (p?.nombre) urls.add(`/producto/${slugify(p.nombre)}`)
  }
  const now = new Date().toISOString()
  const items = [...urls].map((path) => {
    const loc = `${origin}${path === '/' ? '/' : path}`
    const pri = path === '/' || path === '/tienda' ? '1.0' : path.startsWith('/producto/') ? '0.8' : '0.6'
    return `  <url><loc>${esc(loc)}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${pri}</priority></url>`
  }).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>`
  return textRes(xml, 'application/xml; charset=utf-8', 600)
}

async function getProducto(env, param) {
  const cols = 'nombre,descripcion,precio_detal,precio_oferta,imagen_url,seo_titulo,seo_desc,stock,categoria'
  if (param.includes('--')) {
    const id = param.split('--').pop()
    const rows = await sbGet(env, `catalogo_productos?id=eq.${encodeURIComponent(id)}&select=${cols}&limit=1`)
    if (rows?.[0]) return rows[0]
  }
  const rows = await sbGet(env, `catalogo_productos?select=${cols}`)
  if (!rows) return null
  return rows.find(p => slugify(p.nombre) === param) || null
}

async function pageSeo(env, path, url) {
  const cfg = await getCfg(env)
  if (!cfg) return null
  const origin = originOf(cfg, url)
  const marca = (cfg.nombre_tienda || 'Mumi Amazonia').trim()
  const siteTitle = cfg.seo_titulo || marca
  const siteDesc = cfg.seo_descripcion || [marca, cfg.slogan].filter(Boolean).join(' — ') || 'Productos naturales de la selva del Guaviare. Pedidos por WhatsApp en Colombia.'
  const seoPag = cfg.seo_paginas && typeof cfg.seo_paginas === 'object' ? cfg.seo_paginas : {}
  const siteImg = cfg.seo_imagen || cfg.logo_url || ''
  const noindex = cfg.seo_indexar === false || !!cfg.mantenimiento_activo

  const base = {
    siteName: marca,
    image: siteImg,
    keywords: cfg.seo_keywords || '',
    verification: cfg.seo_verificacion || '',
    noindex,
    locale: 'es_CO',
  }

  if (path === '/' || path === '/tienda') {
    const sp = seoPag.tienda || {}
    const title = sp.titulo || siteTitle
    return {
      ...base,
      title: `${title}${title.includes(marca) ? '' : ` · ${marca}`}`,
      desc: sp.desc || siteDesc,
      url: `${origin}${path === '/tienda' ? '/tienda' : '/'}`,
      type: 'website',
      jsonLd: jsonLdSitio(cfg, origin),
    }
  }
  if (path === '/nosotros') {
    const sp = seoPag.nosotros || {}
    return {
      ...base,
      title: `${sp.titulo || 'Nosotros'} · ${marca}`,
      desc: sp.desc || sinHtml(cfg.nosotros_texto).slice(0, 180) || siteDesc,
      url: `${origin}/nosotros`,
      type: 'website',
    }
  }
  if (path === '/contacto') {
    const sp = seoPag.contacto || {}
    return {
      ...base,
      title: `${sp.titulo || 'Contacto'} · ${marca}`,
      desc: sp.desc || `Contacta a ${marca}. Pedidos, mayoristas y alianzas por WhatsApp.`,
      url: `${origin}/contacto`,
      type: 'website',
    }
  }
  if (path === '/galeria' || path.startsWith('/galeria/')) {
    const sp = seoPag.galeria || {}
    return {
      ...base,
      title: `${sp.titulo || cfg.galeria_titulo || 'Galería'} · ${marca}`,
      desc: sp.desc || cfg.galeria_subtitulo || siteDesc,
      url: `${origin}${path}`,
      type: 'website',
    }
  }
  const pm = path.match(/^\/p\/([^/]+)$/)
  if (pm) {
    const slug = decodeURIComponent(pm[1])
    const pag = (Array.isArray(cfg.paginas) ? cfg.paginas : []).find(p => p.slug === slug)
    if (!pag) return null
    return {
      ...base,
      title: `${pag.seo_titulo || pag.titulo || slug} · ${marca}`,
      desc: sinHtml(pag.seo_desc || pag.subtitulo || '').slice(0, 180) || siteDesc,
      image: pag.seo_imagen || siteImg,
      url: `${origin}/p/${encodeURIComponent(slug)}`,
      type: 'website',
    }
  }
  if (path === '/favoritos' || path === '/mayorista') {
    return {
      ...base,
      title: path === '/favoritos' ? `Favoritos · ${marca}` : `Mayorista · ${marca}`,
      desc: siteDesc,
      url: `${origin}${path}`,
      type: 'website',
      noindex: true,
    }
  }
  return null
}

function jsonLdSitio(cfg, origin) {
  const marca = (cfg.nombre_tienda || 'Mumi Amazonia').trim()
  const logo = cfg.seo_imagen || cfg.logo_url || undefined
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: marca,
        url: origin,
        logo: logo || undefined,
        description: cfg.seo_descripcion || cfg.slogan || undefined,
        telephone: cfg.whatsapp || undefined,
      },
      {
        '@type': 'WebSite',
        name: marca,
        url: origin,
        inLanguage: 'es-CO',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${origin}/tienda?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }
}

function jsonLdProducto(cfg, p, url) {
  const marca = (cfg?.nombre_tienda || 'Mumi Amazonia').trim()
  const precio = p.precio_oferta > 0 && p.precio_oferta < (p.precio_detal || 0) ? p.precio_oferta : (p.precio_detal || 0)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.seo_titulo || p.nombre,
    description: sinHtml(p.seo_desc || p.descripcion).slice(0, 500) || undefined,
    image: p.imagen_url ? [p.imagen_url] : undefined,
    url: url.href,
    brand: { '@type': 'Brand', name: marca },
    category: p.categoria || undefined,
    offers: {
      '@type': 'Offer',
      url: url.href,
      priceCurrency: 'COP',
      price: precio > 0 ? String(precio) : undefined,
      availability: (p.stock ?? 1) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: marca },
    },
  }
}

function inyectarMeta(html, {
  title, desc, url, image, type = 'website', siteName = 'Mumi Amazonia',
  noindex = false, keywords = '', verification = '', jsonLd = null,
}) {
  const tags = [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">`,
    keywords ? `<meta name="keywords" content="${esc(keywords)}">` : '',
    verification ? `<meta name="google-site-verification" content="${esc(verification)}">` : '',
    `<meta property="og:type" content="${esc(type)}">`,
    `<meta property="og:site_name" content="${esc(siteName)}">`,
    `<meta property="og:locale" content="es_CO">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    image ? `<meta name="twitter:image" content="${esc(image)}">` : '',
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : '',
  ].filter(Boolean).join('\n    ')

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
  if (/<meta\s+name=["']description["']/i.test(html)) {
    html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${esc(desc)}">`)
  } else {
    html = html.replace('</head>', `    <meta name="description" content="${esc(desc)}">\n  </head>`)
  }
  html = html.replace('</head>', `    ${tags}\n  </head>`)
  return html
}

function inyectarProducto(html, p, url, cfg) {
  const marca = (cfg?.nombre_tienda || 'Mumi Amazonia').trim()
  const title = `${p.seo_titulo || p.nombre} · ${marca}`
  const desc = (sinHtml(p.seo_desc || p.descripcion) || 'Producto natural de la selva del Guaviare.').slice(0, 180)
  const img = p.imagen_url || cfg?.seo_imagen || cfg?.logo_url || ''
  return inyectarMeta(html, {
    title, desc, url: url.href, image: img, type: 'product', siteName: marca,
    keywords: cfg?.seo_keywords || '', verification: cfg?.seo_verificacion || '',
    noindex: cfg?.seo_indexar === false || !!cfg?.mantenimiento_activo,
    jsonLd: jsonLdProducto(cfg, p, url),
  })
}

function inyectarPagina(html, page) {
  return inyectarMeta(html, {
    title: page.title,
    desc: (page.desc || '').slice(0, 180),
    url: page.url,
    image: page.image,
    type: page.type || 'website',
    siteName: page.siteName,
    noindex: page.noindex,
    keywords: page.keywords,
    verification: page.verification,
    jsonLd: page.jsonLd,
  })
}

async function merchantFeed(env, url) {
  const cfg = await getCfg(env)
  const origin = originOf(cfg, url)
  const marca = (cfg?.nombre_tienda || 'Mumi Amazonia').trim()
  const cols = 'id,nombre,descripcion,precio_detal,precio_oferta,imagen_url,seo_titulo,seo_desc,stock,categoria'
  const prods = await sbGet(env, `catalogo_productos?select=${cols}&order=nombre`) || []
  const escTsv = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim()
  const header = ['id', 'title', 'description', 'link', 'image_link', 'availability', 'price', 'brand', 'condition', 'identifier_exists']
  const lines = [header.join('\t')]
  for (const p of prods) {
    if (!p?.nombre || !p?.id) continue
    const precio = p.precio_oferta > 0 && p.precio_oferta < (p.precio_detal || 0) ? p.precio_oferta : (p.precio_detal || 0)
    if (!(precio > 0) || !p.imagen_url) continue
    const link = `${origin}/producto/${slugify(p.nombre)}`
    const title = escTsv(p.seo_titulo || p.nombre).slice(0, 150)
    const description = escTsv(sinHtml(p.seo_desc || p.descripcion) || title).slice(0, 5000)
    lines.push([
      escTsv(p.id),
      title,
      description,
      link,
      escTsv(p.imagen_url),
      (p.stock ?? 1) > 0 ? 'in_stock' : 'out_of_stock',
      `${Number(precio).toFixed(0)} COP`,
      escTsv(marca),
      'new',
      'no',
    ].join('\t'))
  }
  return textRes(lines.join('\n') + '\n', 'text/tab-separated-values; charset=utf-8', 600)
}

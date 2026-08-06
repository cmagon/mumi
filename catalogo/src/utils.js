import { supabase } from './supabase'

// Carga (o actualiza) las fuentes de Google usadas por el catálogo
export function cargarGoogleFonts(familias) {
  if (typeof document === 'undefined') return
  const uniq = [...new Set((familias || []).filter(Boolean))]
  if (!uniq.length) return
  const fam = uniq.map(f => 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;500;600;700;800').join('&')
  const href = `https://fonts.googleapis.com/css2?${fam}&display=swap`
  let l = document.getElementById('mumi-fonts')
  if (!l) { l = document.createElement('link'); l.id = 'mumi-fonts'; l.rel = 'stylesheet'; document.head.appendChild(l) }
  if (l.href !== href) l.href = href
}

// Envía un mensaje al panel de administración (cuando el catálogo corre dentro del iframe del editor)
export const postCanvas = (msg) => { try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*') } catch { /* noop */ } }

// Favoritos: desactivado por ahora (se reactiva cuando haya cuentas de usuario)
export const FAVORITOS = false
// Buscador del catálogo
export const BUSCADOR = true

// ---- Formato moneda COP ----
export const fCOP = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')

// ---- Imágenes de un producto (galería) ----
// Formato nuevo: { url, url_mobile }. Formato legado: string URL.
export const normalizeImg = (x) => {
  if (!x) return null
  if (typeof x === 'string') return { url: x, url_mobile: x }
  const url = x.url || x.src || ''
  if (!url) return null
  return { url, url_mobile: x.url_mobile || url }
}
export const imgSrc = (x, mobile = false) => {
  const n = normalizeImg(x)
  if (!n) return ''
  return mobile ? (n.url_mobile || n.url) : n.url
}
// ¿Viewport móvil? (para elegir url_mobile en cards/ficha)
export const esMovil = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches
export const imgsDe = (p) => {
  try {
    const a = Array.isArray(p.imagenes) ? p.imagenes : JSON.parse(p.imagenes || '[]')
    const list = (a.length ? a : (p.imagen_url ? [p.imagen_url] : [])).map(normalizeImg).filter(Boolean)
    return list
  } catch {
    return p.imagen_url ? [normalizeImg(p.imagen_url)].filter(Boolean) : []
  }
}
// URLs planas (lightbox / compat): siempre la versión web de mayor resolución
export const imgsUrls = (p) => imgsDe(p).map(i => i.url)
export const sinTildes = (s) => (s || '').toLowerCase().normalize('NFD').replace(new RegExp('[̀-ͯ]', 'g'), '')
// Quita etiquetas HTML y colapsa espacios (la descripción del catálogo es texto enriquecido)
export const sinHtml = (s) => (s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()

// ---- URLs amigables de producto: /producto/<slug> ----
// El nombre del producto es único, así que el slug basta (URL corta y legible).
export const slugify = (s) => sinTildes(s).replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 70)
export const rutaProducto = (p) => `/producto/${slugify(p.nombre)}`

// Redes soportadas para insertar videos/publicaciones con solo el enlace
export const REDES_VIDEO = [
  { id: 'youtube', label: 'YouTube' }, { id: 'vimeo', label: 'Vimeo' }, { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' }, { id: 'tiktok', label: 'TikTok' }, { id: 'x', label: 'X (Twitter)' },
]
// Detecta la red a partir del enlace
export function detectRed(url) {
  const u = (url || '').toLowerCase()
  if (/youtu\.be|youtube\.com/.test(u)) return 'youtube'
  if (/vimeo\.com/.test(u)) return 'vimeo'
  if (/facebook\.com|fb\.watch/.test(u)) return 'facebook'
  if (/instagram\.com/.test(u)) return 'instagram'
  if (/tiktok\.com/.test(u)) return 'tiktok'
  if (/twitter\.com|x\.com/.test(u)) return 'x'
  return ''
}
// Proporción por defecto según la red (TikTok/Reels son verticales)
export const formatoRed = (red) => red === 'tiktok' ? '9 / 16' : red === 'instagram' ? '4 / 5' : '16 / 9'

// Convierte el enlace de una publicación en la URL de inserción para el <iframe>
export function videoEmbed(url, red = '') {
  const u = (url || '').trim()
  if (!u) return ''
  const r = red || detectRed(u)
  let m
  if (r === 'youtube') { m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/); return m ? `https://www.youtube.com/embed/${m[1]}` : '' }
  if (r === 'vimeo') { m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/); return m ? `https://player.vimeo.com/video/${m[1]}` : '' }
  if (r === 'facebook') return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false`
  if (r === 'instagram') { m = u.match(/instagram\.com\/(p|reel|reels|tv)\/([\w-]+)/); return m ? `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/embed` : '' }
  if (r === 'tiktok') { m = u.match(/tiktok\.com\/.*?\/video\/(\d+)/) || u.match(/tiktok\.com\/v\/(\d+)/); return m ? `https://www.tiktok.com/embed/v2/${m[1]}` : '' }
  if (r === 'x') { m = u.match(/(?:twitter|x)\.com\/\w+\/status\/(\d+)/); return m ? `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}` : '' }
  // Si ya es un enlace de inserción, se usa tal cual
  if (/\/embed|player\.|\/video\.php/.test(u)) return u
  return ''
}
// Miniatura de un video (YouTube) o null si no se puede derivar
export function videoThumb(url) {
  const m = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/)
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null
}
// Busca una página personalizada por su slug
export const paginaPorSlug = (paginas, slug) => (paginas || []).find(p => p.slug === slug)
// Compatibilidad: enlaces antiguos venían como <slug>--<uuid>; devolvemos la parte útil.
export const idDeParam = (param) => { const s = String(param || ''); return s.includes('--') ? s.split('--').pop() : s }
// Resuelve un producto por su slug (o por id/uuid de enlaces antiguos)
export const buscarPorSlug = (productos, param) => {
  const s = String(param || '')
  const posibleId = s.includes('--') ? s.split('--').pop() : s
  return (productos || []).find(p => slugify(p.nombre) === s) || (productos || []).find(p => String(p.id) === posibleId)
}

// ---- Categorías: la etiqueta se deriva del tipo de la ficha (ej: 'galleta' → 'Galletas') ----
const PLURALES = { galleta: 'Galletas', infusion: 'Infusiones', dulce: 'Dulces', confite: 'Confites', granel: 'A granel', mermelada: 'Mermeladas', bocadillo: 'Bocadillos' }
export const labelCategoria = (id) => PLURALES[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Otros')

// ---- Frutos amazónicos (cargados desde la BD: frutos_catalogo) ----
let _frutos = []
export function cargarFrutos(list) { _frutos = list || [] }
export function getFrutos() { return _frutos }
export const emojiFruto = (id) => _frutos.find(f => f.id === id)?.emoji || '🌿'
export const labelFruto = (id) => _frutos.find(f => f.id === id)?.nombre || id
// Emoji del primer fruto de un producto (frutos = array)
export const emojiDe = (frutos) => (Array.isArray(frutos) && frutos.length) ? emojiFruto(frutos[0]) : '🌿'
// Nombre del icono SVG (lucide) de un fruto — fallback 'Leaf'
export const iconoFruto = (id) => _frutos.find(f => f.id === id)?.icono || 'Leaf'
export const colorFruto = (id) => _frutos.find(f => f.id === id)?.color || null
// Icono del primer fruto de un producto (frutos = array)
export const iconoDe = (frutos) => (Array.isArray(frutos) && frutos.length) ? iconoFruto(frutos[0]) : 'Leaf'

// ---- Stock en modo RELATIVO (urgencia sin revelar la cantidad exacta) ----
export function stockLabel(stock, cfg) {
  if (cfg && cfg.mostrar_stock === false) return null
  const s = Number(stock) || 0
  if (s <= 0) return { texto: 'Agotado', tono: 'agotado' }
  const ult = cfg?.umbral_ultimas ?? 3
  const pocas = cfg?.umbral_pocas ?? 10
  if (s <= ult) return { texto: `¡Solo ${s} disponibles!`, tono: 'urgente' }
  if (s <= pocas) return { texto: `Quedan menos de ${pocas}`, tono: 'pocas' }
  return { texto: 'Disponible', tono: 'ok' }
}

// ---- Favicon (vacío por defecto; se configura en Personalizar → Marca) ----
export function setFavicon(url) {
  const href = (url || '').trim()
  let link = document.head.querySelector('link[rel="icon"][data-mumi-favicon]')
  if (!href) {
    if (link) link.remove()
    return
  }
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    link.setAttribute('data-mumi-favicon', '1')
    document.head.appendChild(link)
  }
  link.href = href
}

// ---- SEO: título, description, canonical, Open Graph, Twitter, robots, JSON-LD ----
function upsertMeta(attr, key, val) {
  if (val == null || val === '') return
  const sel = attr === 'property' ? `meta[property="${key}"]` : `meta[name="${key}"]`
  let e = document.head.querySelector(sel)
  if (!e) { e = document.createElement('meta'); e.setAttribute(attr, key); document.head.appendChild(e) }
  e.setAttribute('content', val)
}
function upsertLink(rel, href) {
  let e = document.head.querySelector(`link[rel="${rel}"]`)
  if (!href) { if (e) e.remove(); return }
  if (!e) { e = document.createElement('link'); e.setAttribute('rel', rel); document.head.appendChild(e) }
  e.setAttribute('href', href)
}
function upsertJsonLd(data) {
  const id = 'mumi-jsonld'
  let e = document.getElementById(id)
  if (!data) { if (e) e.remove(); return }
  if (!e) { e = document.createElement('script'); e.id = id; e.type = 'application/ld+json'; document.head.appendChild(e) }
  e.textContent = JSON.stringify(data)
}

/** @param {{ title?: string, desc?: string, image?: string, url?: string, type?: string, siteName?: string, noindex?: boolean, keywords?: string, verification?: string, jsonLd?: object|object[]|null }} opts */
export function setSEO({
  title, desc, image, url, type = 'website', siteName,
  noindex = false, keywords, verification, jsonLd,
} = {}) {
  const marca = (siteName || 'Mumi Amazonia').trim() || 'Mumi Amazonia'
  const fullTitle = title
    ? (String(title).includes(marca) ? String(title) : `${title} · ${marca}`)
    : `${marca} — Catálogo`
  const description = (desc || 'Productos naturales de la selva del Guaviare. Alimentos, snacks y bebidas amazónicas. Pedidos por WhatsApp en Colombia.').slice(0, 320)
  const pageUrl = url || (typeof window !== 'undefined' ? window.location.href.split('?')[0].split('#')[0] : '')
  const img = image || ''

  document.title = fullTitle
  upsertMeta('name', 'description', description)
  upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large')
  if (keywords) upsertMeta('name', 'keywords', keywords)
  if (verification) upsertMeta('name', 'google-site-verification', verification)

  upsertLink('canonical', pageUrl)

  upsertMeta('property', 'og:title', fullTitle)
  upsertMeta('property', 'og:description', description)
  upsertMeta('property', 'og:type', type || 'website')
  upsertMeta('property', 'og:site_name', marca)
  upsertMeta('property', 'og:locale', 'es_CO')
  if (pageUrl) upsertMeta('property', 'og:url', pageUrl)
  if (img) upsertMeta('property', 'og:image', img)

  upsertMeta('name', 'twitter:card', img ? 'summary_large_image' : 'summary')
  upsertMeta('name', 'twitter:title', fullTitle)
  upsertMeta('name', 'twitter:description', description)
  if (img) upsertMeta('name', 'twitter:image', img)

  upsertJsonLd(jsonLd || null)
}

/** JSON-LD Organization + WebSite para la home */
export function jsonLdSitio(cfg) {
  const base = baseUrl(cfg)
  const marca = (cfg?.nombre_tienda || 'Mumi Amazonia').trim()
  const logo = cfg?.seo_imagen || cfg?.logo_url || undefined
  const org = {
    '@type': 'Organization',
    name: marca,
    url: base || undefined,
    logo: logo || undefined,
    description: cfg?.seo_descripcion || cfg?.slogan || undefined,
    telephone: cfg?.whatsapp || undefined,
    address: cfg?.pais ? { '@type': 'PostalAddress', addressCountry: cfg.pais } : undefined,
  }
  const site = {
    '@type': 'WebSite',
    name: marca,
    url: base || undefined,
    description: cfg?.seo_descripcion || undefined,
    inLanguage: 'es-CO',
    publisher: { '@type': 'Organization', name: marca },
    potentialAction: base ? {
      '@type': 'SearchAction',
      target: `${base}/tienda?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    } : undefined,
  }
  return { '@context': 'https://schema.org', '@graph': [org, site].map(stripUndefined) }
}

/** JSON-LD Product para ficha */
export function jsonLdProducto(cfg, p) {
  if (!p) return null
  const base = baseUrl(cfg)
  const url = `${base}${rutaProducto(p)}`
  const precio = p.precio_oferta > 0 && p.precio_oferta < (p.precio_detal || 0) ? p.precio_oferta : (p.precio_detal || 0)
  const available = (p.stock ?? 1) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
  return stripUndefined({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.seo_titulo || p.nombre,
    description: sinHtml(p.seo_desc || p.descripcion).slice(0, 500) || undefined,
    image: p.imagen_url ? [p.imagen_url] : undefined,
    url,
    brand: { '@type': 'Brand', name: cfg?.nombre_tienda || 'Mumi Amazonia' },
    category: p.categoria || undefined,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'COP',
      price: precio > 0 ? String(precio) : undefined,
      availability: available,
      seller: { '@type': 'Organization', name: cfg?.nombre_tienda || 'Mumi Amazonia' },
    },
  })
}

function stripUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(stripUndefined)
  if (obj && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null || v === '') continue
      out[k] = stripUndefined(v)
    }
    return out
  }
  return obj
}

// ---- Compartir (Web Share API, fallback: copiar enlace) ----
export async function compartir({ title, text, url }) {
  try { if (navigator.share) { await navigator.share({ title, text, url }); return 'compartido' } } catch { return 'cancelado' }
  try { await navigator.clipboard.writeText(url); return 'copiado' } catch { return false }
}

// ---- Dispositivo (para métricas) ----
export function tipoDispositivo() {
  const w = window.innerWidth
  const coarse = window.matchMedia('(pointer: coarse)').matches
  if (w <= 640) return 'mobile'
  if (w <= 1024 && coarse) return 'tablet'
  return 'desktop'
}

// ---- Registro de visita (best-effort, no bloquea) ----
export function registrarVisita(producto = null) {
  try {
    supabase.from('visitas_catalogo').insert({
      producto, dispositivo: tipoDispositivo(), referrer: document.referrer || null,
    }).then(() => {}, () => {})
  } catch { /* noop */ }
}

// ---- Emoji por categoría (para los mensajes de WhatsApp) ----
// La categoría puede venir como nombre libre de Alegra, así que se busca por palabra clave.
const EMOJI_CAT = [
  ['galleta', '🍪'], ['infusion', '🍵'], ['te', '🍵'], ['aromatica', '🍵'],
  ['dulce', '🍬'], ['confite', '🍬'], ['bombon', '🍬'], ['mermelada', '🍯'], ['miel', '🍯'],
  ['bocadillo', '🍫'], ['chocolate', '🍫'], ['cacao', '🍫'], ['granel', '🌾'], ['harina', '🌾'],
  ['bebida', '🥤'], ['jugo', '🥤'], ['snack', '🥜'], ['nuez', '🥜'], ['fruto', '🥭'], ['pulpa', '🥭'],
]
export const emojiCategoria = (cat) => {
  const c = sinTildes(cat)
  const hit = EMOJI_CAT.find(([k]) => c.includes(k))
  return hit ? hit[1] : '🌿'
}

// URL pública base del catálogo (para incluir el enlace del producto en el mensaje)
export function baseUrl(cfg) {
  const u = (cfg?.url_publica || '').trim().replace(/\/+$/, '')
  if (u) return u
  try { return window.location.origin } catch { return '' }
}
export const urlProducto = (cfg, p) => `${baseUrl(cfg)}${rutaProducto(p)}`

// Nota breve de disponibilidad por ítem (según stock relativo)
function notaStock(i, cfg) {
  const st = stockLabel(i.stock, cfg)
  if (!st) return ''
  if (st.tono === 'agotado') return '  ⚠️ (agotado — sobre pedido)'
  if (st.tono === 'urgente') return `  🔥 (${st.texto.toLowerCase()})`
  if (st.tono === 'pocas') return '  ⏳ (pocas unidades)'
  return ''
}

// Precio activo de un ítem según el modo (mayorista → mayor; oferta → precio_oferta)
const precioItem = (i, mayorista) => {
  if (mayorista && i?.precio_mayor > 0) return i.precio_mayor
  if (i?.precio_oferta > 0 && i.precio_oferta < (i.precio_detal || 0)) return i.precio_oferta
  return i?.precio_detal || 0
}

// ---- Mensaje de WhatsApp + registro del pedido ----
// `intro` = encabezado configurable (según haya stock o no); el detalle se arma solo.
// Nombre del cliente guardado en el navegador (se pide una vez en el carrito)
export const getCliente = () => { try { return localStorage.getItem('mumi_cliente') || '' } catch { return '' } }
export const setCliente = (v) => { try { v ? localStorage.setItem('mumi_cliente', v) : localStorage.removeItem('mumi_cliente') } catch { /* noop */ } }

// ---- Plantillas de WhatsApp: fichas insertables por el administrador ----
export const TOKENS_WA = [
  { t: 'saludo', d: 'Saludo' }, { t: 'cliente', d: 'Nombre del cliente' }, { t: 'pedido', d: 'Detalle del pedido' },
  { t: 'total', d: 'Total' }, { t: 'envio', d: 'Envío' }, { t: 'nota', d: 'Nota del cliente' },
  { t: 'cierre', d: 'Frase de cierre' }, { t: 'tienda', d: 'Nombre de la tienda' },
]
export const tienePlantilla = (s) => /\{\s*(saludo|cliente|pedido|total|envio|nota|cierre|tienda)\s*\}/i.test(s || '')
// Texto de envío: solo si el administrador lo configuró
export function textoEnvio(cfg) {
  const msg = (cfg?.envio_mensaje || '').trim()
  const tarifa = Number(cfg?.envio_tarifa) || 0
  if (!msg && !tarifa) return ''
  if (msg && tarifa) return `🚚 ${msg} (${fCOP(tarifa)})`
  return msg ? `🚚 ${msg}` : `🚚 Envío: ${fCOP(tarifa)}`
}
// Reemplaza las fichas y limpia líneas que quedaron vacías
export function aplicarPlantilla(tpl, vars) {
  let s = String(tpl || '')
  Object.entries(vars).forEach(([k, v]) => { s = s.replace(new RegExp(`\\{\\s*${k}\\s*\\}`, 'gi'), v ?? '') })
  return s.split('\n').filter((l, i, a) => !(l.trim() === '' && a[i - 1]?.trim() === '')).join('\n')
    .replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

// Mensaje para solicitar acceso mayorista (usa su propia plantilla y el nombre del cliente)
export function mensajeSolicitudMayorista(cfg, nombre = null) {
  const cliente = (nombre == null ? getCliente() : nombre).trim()
  const vars = { saludo: '¡Hola! 🌿', cliente, pedido: '', total: '', nota: '', cierre: '¡Quedo atento(a) a su respuesta! 😊', tienda: cfg?.nombre_tienda || 'Mumi Amazonia' }
  const tpl = (cfg?.mayorista_wa_texto || '').trim()
  if (tienePlantilla(tpl)) return aplicarPlantilla(tpl, vars)
  const soy = cliente ? `Soy *${cliente}* y ` : ''
  return `${vars.saludo}\n${soy}estoy interesado(a) en ser mayorista. ¿Me comparten los precios al por mayor?${tpl ? `\n\n${tpl}` : ''}`
}

export function construirMensajeWA(items, nota, cfg, mayorista = false, intro = '', nombre = null) {
  const agotadoDe = (i) => (Number(i.stock) || 0) <= 0
  const total = items.reduce((s, i) => s + (agotadoDe(i) ? 0 : precioItem(i, mayorista) * i.cantidad), 0)
  const todosAgotados = items.length > 0 && items.every(agotadoDe)
  const cliente = (nombre == null ? getCliente() : nombre).trim()
  const lineas = items.map(i => {
    const em = emojiCategoria(i.categoria)
    const pu = precioItem(i, mayorista)
    const ago = agotadoDe(i)
    // Si está agotado no se indica cantidad (se consulta disponibilidad, no se pide una cantidad).
    // No se incluye el enlace del producto: el mensaje queda más limpio y directo.
    return ago
      ? `${em} *${i.nombre}*\n   ${fCOP(pu)} c/u  (agotado — sobre pedido)`
      : `${em} *${i.cantidad}x ${i.nombre}*\n   ${fCOP(pu)} c/u → ${fCOP(pu * i.cantidad)}${notaStock(i, cfg)}`
  }).join('\n\n')
  // En consultas de disponibilidad no se incluye el nombre del cliente
  const clienteVar = todosAgotados ? '' : cliente
  const vars = {
    saludo: '¡Hola! 🌿',
    cliente: clienteVar,
    pedido: lineas,
    total: fCOP(total),
    envio: todosAgotados ? '' : textoEnvio(cfg),
    nota: nota?.trim() ? `📝 *Nota:* ${nota.trim()}` : '',
    cierre: '¡Quedo atento(a) a la confirmación! 😊',
    tienda: cfg?.nombre_tienda || 'Mumi Amazonia',
  }
  const tpl = (intro || '').trim()
  // Si el administrador escribió una plantilla con fichas, manda ella
  if (tienePlantilla(tpl)) return aplicarPlantilla(tpl, vars)

  // Orden por defecto (si hay texto sin fichas, se usa como saludo/encabezado)
  const saludo = tpl || (todosAgotados
    ? '¡Hola! 🌿 Quisiera consultar la disponibilidad de:'
    : mayorista ? '¡Hola! 🌿 Soy mayorista y quiero hacer este pedido:' : '¡Hola! 🌿 Me gustaría hacer este pedido:')
  const titulo = todosAgotados ? '📋 *CONSULTA DE DISPONIBILIDAD*' : `🛒 *MI PEDIDO${mayorista ? ' (MAYORISTA)' : ''}*`
  let msg = saludo
  if (clienteVar) msg += `\nSoy *${clienteVar}*`
  msg += `\n\n${titulo}\n\n${lineas}\n\n━━━━━━━━━━━━━━\n`
  msg += todosAgotados ? '💬 *¿Cuándo estará disponible?*' : `💰 *Total: ${vars.total}*`
  // El envío NO se incluye por defecto: solo aparece si el administrador pone la ficha {envio}
  if (vars.nota) msg += `\n\n${vars.nota}`
  msg += `\n\n${vars.cierre}`
  return msg
}

// Abre WhatsApp con un mensaje libre (para la invitación de mayorista)
export function abrirWA(cfg, texto) {
  const numero = (cfg?.whatsapp || '+573157702180').replace(/[^0-9]/g, '')
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto || '')}`, '_blank')
}

// ---- Suscripción al newsletter ----
export async function suscribir(email, nombre) {
  const e = (email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Escribe un correo válido')
  const { error } = await supabase.from('suscriptores_catalogo').insert({ email: e, nombre: (nombre || '').trim() || null })
  if (error && !/duplicate|unique/i.test(error.message)) throw error
  return true
}

export async function confirmarPedidoWA(items, nota, cfg, mayorista = false, intro = '', nombre = null) {
  const total = items.reduce((s, i) => s + precioItem(i, mayorista) * i.cantidad, 0)
  const cliente = (nombre == null ? getCliente() : nombre).trim()
  // Registra el pedido iniciado (best-effort); el cliente va en la nota para no depender de columnas nuevas
  try {
    await supabase.from('pedidos_catalogo').insert({
      productos: items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, precio: precioItem(i, mayorista), mayorista })),
      total, nota: [cliente && `Cliente: ${cliente}`, nota?.trim()].filter(Boolean).join(' — ') || null,
    })
  } catch { /* noop */ }
  const numero = (cfg?.whatsapp || '+573157702180').replace(/[^0-9]/g, '')
  const texto = encodeURIComponent(construirMensajeWA(items, nota, cfg, mayorista, intro, cliente))
  window.open(`https://wa.me/${numero}?text=${texto}`, '_blank')
}

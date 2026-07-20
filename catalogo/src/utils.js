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

// ---- Imágenes de un producto (galería): usa 'imagenes' (array) o cae a imagen_url ----
export const imgsDe = (p) => {
  try { const a = Array.isArray(p.imagenes) ? p.imagenes : JSON.parse(p.imagenes || '[]'); return a.length ? a : (p.imagen_url ? [p.imagen_url] : []) }
  catch { return p.imagen_url ? [p.imagen_url] : [] }
}
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

// ---- SEO: título + meta description + Open Graph (cliente; para social real conviene prerender) ----
export function setSEO({ title, desc, image } = {}) {
  document.title = title ? `${title} · Mumi Amazonia` : 'Mumi Amazonia — Catálogo'
  const meta = (sel, attr, key, val) => { let e = document.head.querySelector(sel); if (!e) { e = document.createElement('meta'); e.setAttribute(attr, key); document.head.appendChild(e) } if (val != null) e.setAttribute('content', val) }
  meta('meta[name="description"]', 'name', 'description', desc || 'Infusiones, galletas y dulces amazónicos.')
  meta('meta[property="og:title"]', 'property', 'og:title', title || 'Mumi Amazonia')
  meta('meta[property="og:description"]', 'property', 'og:description', desc || 'Sabores de la selva del Guaviare.')
  meta('meta[property="og:type"]', 'property', 'og:type', 'website')
  if (image) meta('meta[property="og:image"]', 'property', 'og:image', image)
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
export const urlProducto = (cfg, p) => `${baseUrl(cfg)}/producto/${p.id}`

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
  const cab = (intro && intro.trim())
    || (todosAgotados ? '¡Hola! 🌿 Quisiera consultar la disponibilidad de:'
      : mayorista ? '¡Hola! 🌿 Soy mayorista y quiero hacer este pedido:' : '¡Hola! 🌿 Me gustaría hacer este pedido:')
  const titulo = todosAgotados ? '📋 *CONSULTA DE DISPONIBILIDAD*' : `🛒 *MI PEDIDO${mayorista ? ' (MAYORISTA)' : ''}*`
  let msg = cab
  if (cliente) msg += `\n👤 *Soy ${cliente}*`
  msg += `\n\n${titulo}\n\n${lineas}\n\n━━━━━━━━━━━━━━\n`
  msg += todosAgotados ? '💬 *¿Cuándo estará disponible?*' : `💰 *Total: ${fCOP(total)}*`
  if (nota?.trim()) msg += `\n\n📝 *Nota:* ${nota.trim()}`
  msg += `\n\n¡Quedo atento(a) a la confirmación! 😊`
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

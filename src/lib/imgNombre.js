/**
 * Nombre SEO de imágenes de producto: el archivo en Storage lleva el nombre del
 * producto (slug) desde el momento de la carga — da igual si se sube al inicio o al final.
 */

export function slugImg(nombre) {
  const s = (nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
  return s || 'producto'
}

/**
 * Ruta en bucket product-images.
 * Ej: productos/infusion-cocona-x12-k3m2-web.jpg
 */
export function pathImgProducto(nombre, { carpeta = 'productos', sufijo = '', ext = 'jpg' } = {}) {
  const slug = slugImg(nombre)
  const uniq = `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`
  const mid = sufijo ? `-${sufijo}` : ''
  return `${carpeta}/${slug}${mid}-${uniq}.${ext}`
}

/** URL pública desde string legado u objeto { url }. */
export function urlDeImg(x) {
  if (!x) return ''
  if (typeof x === 'string') return x
  return x.url || x.src || ''
}

/** Adjunta alt = nombre del producto a cada imagen al guardar. */
export function conAltProducto(imagenes, nombre) {
  const alt = (nombre || '').trim()
  return (imagenes || []).map((x) => {
    if (!x) return null
    if (typeof x === 'string') return { url: x, url_mobile: x, alt }
    const url = x.url || ''
    if (!url) return null
    return { ...x, url, url_mobile: x.url_mobile || url, alt: alt || x.alt || '' }
  }).filter(Boolean)
}

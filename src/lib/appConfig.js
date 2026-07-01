import { supabase } from './supabase'

export const DEFAULT_CFG = {
  empresa: 'Mumi Amazonia',
  eslogan: 'Sistema de Gestión Empresarial',
  nit: '', direccion: '', ciudad: '', telefono: '', email: '', web: '',
  logo_url: '',
  color_primario: '#2d5a3d',   // --selva
  color_dorado: '#C8A94A',     // --dorado
  color_acento: '#7CB342',     // --lima
  fuente: 'Source Sans 3',        // fuente principal (cuerpo/texto)
  fuente_titulos: 'Playfair Display', // fuente secundaria (títulos, marca, KPIs)
}

// Plantillas de paleta predefinidas (solo tocan los 3 colores + fuente que ya
// gestiona `aplicarTema`, por lo que NO alteran nada más del sitio).
// `primario` = verde/color de marca · `dorado` = acento cálido · `acento` = color vivo.
export const PALETAS = [
  { id: 'selva',     nombre: 'Selva (marca)',     desc: 'Verde selva clásico Mumi',       primario: '#2d5a3d', dorado: '#C8A94A', acento: '#7CB342', fuente: 'Source Sans 3', titulos: 'Playfair Display' },
  { id: 'profunda',  nombre: 'Amazonía Profunda', desc: 'Verde intenso + oro elegante',   primario: '#0f3d1e', dorado: '#D4AF37', acento: '#5FA845', fuente: 'Source Sans 3', titulos: 'Playfair Display' },
  { id: 'tierra',    nombre: 'Tierra & Cacao',    desc: 'Marrones cálidos y terrosos',    primario: '#6B4226', dorado: '#C8894A', acento: '#A8703C', fuente: 'Source Sans 3', titulos: 'Georgia' },
  { id: 'lima',      nombre: 'Lima Fresca',       desc: 'Verde vivo y luminoso',          primario: '#3B8C3B', dorado: '#E0C070', acento: '#9CCC65', fuente: 'Source Sans 3', titulos: 'Trebuchet MS' },
  { id: 'atardecer', nombre: 'Atardecer',         desc: 'Naranjas y ámbar cálidos',       primario: '#B85C1E', dorado: '#E8A33D', acento: '#D97B2B', fuente: 'Source Sans 3', titulos: 'Georgia' },
  { id: 'oceano',    nombre: 'Océano',            desc: 'Azul verdoso, moderno y limpio', primario: '#0E6E75', dorado: '#E0B34A', acento: '#2FA9A0', fuente: 'Source Sans 3', titulos: 'Trebuchet MS' },
  { id: 'pizarra',   nombre: 'Pizarra Moderna',   desc: 'Gris neutro, sobrio y minimal',  primario: '#334155', dorado: '#B0883C', acento: '#64748B', fuente: 'Verdana', titulos: 'Verdana' },
  { id: 'vino',      nombre: 'Vino & Oro',        desc: 'Burdeos profundo y dorado',      primario: '#6B1F3A', dorado: '#D4AF37', acento: '#9C3B5E', fuente: 'Source Sans 3', titulos: 'Playfair Display' },
]

let _cfg = { ...DEFAULT_CFG }

// Accesor síncrono (para impresiones y componentes)
export function getConfig() { return _cfg }

// Devuelve un color de texto legible (claro u oscuro) según la luminancia del fondo.
function textoLegible(hex) {
  if (!hex) return '#ffffff'
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(x => x + x).join('')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  // Luminancia relativa (fórmula estándar). > 0.55 => fondo claro => texto oscuro.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.55 ? '#1a1a1a' : '#ffffff'
}

// Aplica colores y fuente como variables CSS globales
export function aplicarTema(c) {
  const r = document.documentElement.style
  if (c.color_primario) {
    r.setProperty('--selva', c.color_primario); r.setProperty('--selva-claro', c.color_primario)
    // Texto legible del header/sidebar según el color de fondo elegido
    const fg = textoLegible(c.color_primario)
    const oscuro = fg === '#ffffff'
    r.setProperty('--header-fg', oscuro ? (c.color_dorado || '#C8A94A') : '#1a1a1a')
    r.setProperty('--header-fg-strong', fg)
    r.setProperty('--header-fg-soft', oscuro ? 'rgba(245,240,232,0.6)' : 'rgba(20,20,20,0.62)')
    // Texto del menú lateral (ítems) adaptado al color del sidebar
    r.setProperty('--nav-fg', oscuro ? 'rgba(245,240,232,0.72)' : 'rgba(20,20,20,0.72)')
    r.setProperty('--nav-fg-faint', oscuro ? 'rgba(245,240,232,0.4)' : 'rgba(20,20,20,0.5)')
  }
  if (c.color_dorado) r.setProperty('--dorado', c.color_dorado)
  if (c.color_acento) { r.setProperty('--lima', c.color_acento) }
  if (c.fuente) { r.setProperty('--fuente-cuerpo', `'${c.fuente}'`); document.body.style.fontFamily = `'${c.fuente}', sans-serif` }
  if (c.fuente_titulos) r.setProperty('--fuente-titulos', `'${c.fuente_titulos}'`)
}

// Aplica la marca: favicon, ícono PWA (manifest dinámico) y título de la pestaña
export function aplicarMarca(c) {
  if (typeof document === 'undefined') return
  const url = c.logo_url
  // Título de la pestaña
  if (c.empresa) document.title = c.empresa
  if (url) {
    const tipo = url.toLowerCase().includes('.svg') ? 'image/svg+xml'
      : url.toLowerCase().match(/\.jpe?g/) ? 'image/jpeg' : 'image/png'
    // Favicon
    let fav = document.querySelector("link[rel~='icon']")
    if (!fav) { fav = document.createElement('link'); fav.rel = 'icon'; document.head.appendChild(fav) }
    fav.type = tipo; fav.href = url
    // Apple touch icon (icono al "Agregar a inicio" en iOS)
    let apple = document.querySelector("link[rel='apple-touch-icon']")
    if (!apple) { apple = document.createElement('link'); apple.rel = 'apple-touch-icon'; document.head.appendChild(apple) }
    apple.href = url
    // Manifest dinámico (icono de la app instalada)
    try {
      const manifest = {
        name: c.empresa || 'Mumi Amazonia',
        short_name: (c.empresa || 'Mumi').slice(0, 12),
        start_url: '/', scope: '/', display: 'standalone',
        background_color: '#ffffff', theme_color: c.color_primario || '#2d5a3d',
        icons: [
          { src: url, sizes: '192x192', type: tipo, purpose: 'any' },
          { src: url, sizes: '512x512', type: tipo, purpose: 'any maskable' },
        ],
      }
      const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })
      const burl = URL.createObjectURL(blob)
      let m = document.querySelector("link[rel='manifest']")
      if (!m) { m = document.createElement('link'); m.rel = 'manifest'; document.head.appendChild(m) }
      m.href = burl
    } catch { /* noop */ }
  }
}

// Carga la configuración desde la BD y la aplica
export async function loadConfig() {
  try {
    const { data } = await supabase.from('app_settings').select('data').eq('id', 1).maybeSingle()
    _cfg = { ...DEFAULT_CFG, ...(data?.data || {}) }
  } catch {
    _cfg = { ...DEFAULT_CFG }
  }
  aplicarTema(_cfg)
  aplicarMarca(_cfg)
  return _cfg
}

export async function saveConfig(cfg) {
  const { error } = await supabase.from('app_settings').upsert({ id: 1, data: cfg, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) throw error
  _cfg = { ...DEFAULT_CFG, ...cfg }
  aplicarTema(_cfg)
  aplicarMarca(_cfg)
  return _cfg
}

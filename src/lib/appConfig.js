import { supabase } from './supabase'

export const DEFAULT_CFG = {
  empresa: 'Mumi Amazonia',
  eslogan: 'Sistema de Gestión Empresarial',
  nit: '', direccion: '', ciudad: '', telefono: '', email: '', web: '',
  logo_url: '',
  color_primario: '#2d5a3d',   // --selva
  color_dorado: '#C8A94A',     // --dorado
  color_acento: '#7CB342',     // --lima
  fuente: 'Source Sans 3',
}

let _cfg = { ...DEFAULT_CFG }

// Accesor síncrono (para impresiones y componentes)
export function getConfig() { return _cfg }

// Aplica colores y fuente como variables CSS globales
export function aplicarTema(c) {
  const r = document.documentElement.style
  if (c.color_primario) { r.setProperty('--selva', c.color_primario); r.setProperty('--selva-claro', c.color_primario) }
  if (c.color_dorado) r.setProperty('--dorado', c.color_dorado)
  if (c.color_acento) { r.setProperty('--lima', c.color_acento) }
  if (c.fuente) document.body.style.fontFamily = `'${c.fuente}', sans-serif`
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

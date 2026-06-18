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

// Carga la configuración desde la BD y la aplica
export async function loadConfig() {
  try {
    const { data } = await supabase.from('app_settings').select('data').eq('id', 1).maybeSingle()
    _cfg = { ...DEFAULT_CFG, ...(data?.data || {}) }
  } catch {
    _cfg = { ...DEFAULT_CFG }
  }
  aplicarTema(_cfg)
  return _cfg
}

export async function saveConfig(cfg) {
  const { error } = await supabase.from('app_settings').upsert({ id: 1, data: cfg, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) throw error
  _cfg = { ...DEFAULT_CFG, ...cfg }
  aplicarTema(_cfg)
  return _cfg
}

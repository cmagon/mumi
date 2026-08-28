import { supabase } from './supabase'

const CLAVE = 'mumi_sheets_sync_ts'
const COOLDOWN_MIN = 3

/** Empuja el catálogo visible a la hoja de Google (feed Meta). */
export async function sincronizarCatalogoSheets({ silencioso = true, forzar = false } = {}) {
  if (silencioso && !forzar) {
    const ultimo = Number(localStorage.getItem(CLAVE) || 0)
    if (ultimo && Date.now() - ultimo < COOLDOWN_MIN * 60 * 1000) return { saltado: true }
  }
  try {
    const { data, error } = await supabase.functions.invoke('sheets-sync-catalog', { body: { all: true } })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    localStorage.setItem(CLAVE, String(Date.now()))
    return data
  } catch (e) {
    if (!silencioso) throw e
    return { error: String(e?.message || e) }
  }
}

export function reiniciarEnfriamientoSyncSheets() {
  try { localStorage.removeItem(CLAVE) } catch { /* noop */ }
}

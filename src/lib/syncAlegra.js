import { supabase } from './supabase'

// Sincroniza el stock de producto terminado trayendo ventas de Alegra (remisiones reservan,
// facturas descuentan). Es el "respaldo del webhook": Alegra no envía eventos de remisión y
// tampoco garantiza los de factura, así que el stock debe traerse por consulta.
//
// Se dispara automáticamente al abrir la app (admin) con un ENFRIAMIENTO para no llamar en cada
// recarga, y también manualmente desde el botón de Producto Terminado. Es silencioso: si falla
// (sin credenciales, sin sync_desde, offline) no molesta al usuario — el botón manual queda como
// respaldo y muestra el error real.
const COOLDOWN_MIN = 10
const CLAVE = 'mumi_alegra_sync_ts'

export async function sincronizarStockAlegra({ silencioso = true } = {}) {
  // Enfriamiento: no repetir si se sincronizó hace menos de COOLDOWN_MIN minutos
  if (silencioso) {
    const ultimo = Number(localStorage.getItem(CLAVE) || 0)
    if (ultimo && Date.now() - ultimo < COOLDOWN_MIN * 60 * 1000) return { saltado: true }
  }
  try {
    const { data, error } = await supabase.functions.invoke('alegra-sync-stock', { body: {} })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    localStorage.setItem(CLAVE, String(Date.now()))
    return data
  } catch (e) {
    if (!silencioso) throw e
    return { error: String(e?.message || e) }
  }
}

// Fuerza la próxima sincronización aunque no haya pasado el enfriamiento (p. ej. tras registrar
// producción, para reflejar de inmediato lo vendido en Alegra).
export function reiniciarEnfriamientoSyncAlegra() {
  try { localStorage.removeItem(CLAVE) } catch { /* noop */ }
}

import { del } from 'idb-keyval'

/**
 * Recarga en frío: borra caché de React Query, colas offline, desregistra el
 * service worker y vacía Cache Storage. Usado al detectar un deploy nuevo y
 * desde el menú "Recargar aplicación".
 */
export async function purgarCacheYRecargar() {
  // Caché persistida de React Query (IndexedDB)
  try { await del('mumi-query-cache') } catch { /* noop */ }
  // Colas offline que pueden reaplicar movimientos de inventario viejos
  try { await del('mumi-write-queue') } catch { /* noop */ }
  try { await del('mumi-efectos-inventario') } catch { /* noop */ }
  try {
    if ('serviceWorker' in navigator) {
      const rs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(rs.map(r => r.unregister()))
    }
  } catch { /* noop */ }
  try {
    if ('caches' in window) {
      const ks = await caches.keys()
      await Promise.all(ks.map(k => caches.delete(k)))
    }
  } catch { /* noop */ }
  // reload() sí fuerza recarga; replace(misma URL) a menudo no hace nada → pantalla en blanco.
  window.location.reload()
}

/**
 * Si el build del servidor no coincide con el guardado en el cliente, purga
 * cachés y recarga una sola vez (evita bucles con sessionStorage).
 * No bloquea el montaje de React: si la recarga falla, la app sigue usable.
 */
export function asegurarBuildActual(buildId) {
  if (!buildId || typeof window === 'undefined') return
  if (buildId.length > 80 || !/^[a-zA-Z0-9._-]+$/.test(buildId)) return
  const KEY = 'mumi-app-build'
  const prev = localStorage.getItem(KEY)
  if (prev === buildId) return

  localStorage.setItem(KEY, buildId)
  // Primera visita: solo guarda el id, no purga.
  if (!prev) return

  // Evita bucle si la purga/recarga falla a medias.
  const flag = 'mumi-purga-build'
  if (sessionStorage.getItem(flag) === buildId) return
  sessionStorage.setItem(flag, buildId)

  void purgarCacheYRecargar()
}

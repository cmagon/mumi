import { del } from 'idb-keyval'

/**
 * Recarga en frío: borra caché de React Query, desregistra el service worker
 * y vacía Cache Storage. Usado al detectar un deploy nuevo y desde el menú
 * "Recargar app".
 */
export async function purgarCacheYRecargar() {
  try { await del('mumi-query-cache') } catch { /* noop */ }
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
  // Navegación limpia tras quitar el SW: pide HTML al servidor (no al precaché viejo).
  const url = new URL(window.location.href)
  url.searchParams.delete('_v')
  window.location.replace(`${url.pathname}${url.search}${url.hash}`)
}

/**
 * Si el build del servidor no coincide con el guardado en el cliente, purga
 * cachés y recarga una sola vez (evita bucles con sessionStorage).
 */
export function asegurarBuildActual(buildId) {
  if (!buildId || typeof window === 'undefined') return false
  const KEY = 'mumi-app-build'
  const prev = localStorage.getItem(KEY)
  if (prev === buildId) return false

  localStorage.setItem(KEY, buildId)
  // Primera visita: solo guarda el id, no purga.
  if (!prev) return false

  // Evita bucle si la purga falla a medias.
  const flag = 'mumi-purga-build'
  if (sessionStorage.getItem(flag) === buildId) return false
  sessionStorage.setItem(flag, buildId)

  void purgarCacheYRecargar()
  return true
}

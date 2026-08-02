import { get, set } from 'idb-keyval'

// Cola de EFECTOS DE INVENTARIO pendientes de aplicar.
//
// La cola genérica (offlineQueue) sabe hacer insert/update/delete de UNA fila, y con eso basta
// para el estado de la orden y el registro de producción. Pero cerrar una orden mueve además la
// MP por lotes (PEPS), el empaque, los saldos de mezcla y el stock terminado: son varias
// escrituras encadenadas que dependen del estado real de la base en ese momento.
//
// Antes esos pasos simplemente se saltaban cuando no había conexión (`if (!r.queued)`), así que
// la orden podía quedar cerrada —incluso aprobada— sin haber descontado nada, y nadie se
// enteraba. Aquí se guarda la INTENCIÓN del cierre y se aplica al reconectar con la misma
// rutina que usa el cierre normal.

const KEY = 'mumi-efectos-inventario'
const listeners = new Set()

async function leer() { return (await get(KEY)) || [] }
async function guardar(q) { await set(KEY, q); listeners.forEach(f => { try { f() } catch { /* noop */ } }) }

export function onEfectosChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }

export async function efectosPendientes() { return leer() }
export async function contarEfectos() { return (await leer()).length }

/** Ids de orden con efectos sin aplicar (para marcarlas en la interfaz). */
export async function ordenesConEfectosPendientes() {
  return new Set((await leer()).map(e => String(e.ordenId)))
}

export async function encolarEfectos({ ordenId, tipo = 'cierre_orden', datos }) {
  const q = await leer()
  // Un solo efecto por orden: si se cierra dos veces sin conexión, vale el último estado.
  const i = q.findIndex(e => String(e.ordenId) === String(ordenId) && e.tipo === tipo)
  const item = { _id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), ordenId, tipo, datos, _ts: Date.now(), intentos: 0 }
  if (i >= 0) q[i] = item; else q.push(item)
  await guardar(q)
}

export async function quitarEfecto(id) {
  await guardar((await leer()).filter(e => e._id !== id))
}

/**
 * Aplica los efectos pendientes en orden. `aplicar(efecto)` debe lanzar si no pudo completarse:
 * en ese caso el efecto se conserva para reintentarlo. Devuelve { aplicados, fallidos }.
 */
export async function aplicarEfectos(aplicar) {
  if (!navigator.onLine) return { aplicados: 0, fallidos: 0 }
  const q = await leer()
  if (!q.length) return { aplicados: 0, fallidos: 0 }
  let aplicados = 0, fallidos = 0
  const restantes = []
  for (const e of q) {
    try {
      await aplicar(e)
      aplicados++
    } catch (err) {
      console.warn('No se pudieron aplicar los efectos de inventario de la orden', e.ordenId, err)
      restantes.push({ ...e, intentos: (e.intentos || 0) + 1, ultimo_error: String(err?.message || err) })
      fallidos++
    }
  }
  await guardar(restantes)
  return { aplicados, fallidos }
}

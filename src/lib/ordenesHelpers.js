// Ayudantes PUROS de Órdenes de Producción (sin estado de React). Extraídos de OrdenesProduccion.jsx
// para adelgazar ese archivo. Son funciones/constantes de fechas, conversión de unidades y
// parámetros de calidad. No cambian comportamiento: misma lógica que estaba inline.

export const ESTADO_LABEL = {
  pendiente:  { txt: 'Pendiente',  badge: 'badge-gris' },
  en_proceso: { txt: 'En proceso', badge: 'badge-azul' },
  ejecutada:  { txt: 'Enviada a aprobación', badge: 'badge-dorado' },
  aprobada:   { txt: 'Aprobada',   badge: 'badge-verde' },
  rechazada:  { txt: 'Rechazada',  badge: 'badge-rojo' },
  cancelada:  { txt: 'Cerrada sin ejecutar', badge: 'badge-gris' },
}

// Días desde la creación de la orden a partir de los cuales se puede CERRAR sin ejecutarla
// (para órdenes atascadas: pendientes o en proceso que quedaron abiertas mucho tiempo).
export const DIAS_CIERRE_SIN_EJECUTAR = 20
export const diasAbierta = (o) => o?.created_at ? Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000) : 0

export const EMPTY_ORDEN = {
  producto: '', origen: 'producto', origen_id: '', es_subproducto: false, es_mp: false, mp_id: '',
  cantidad_plan: '', unidad: 'unidades', operario: '', notas_orden: '', unidadesPorBache: 0, lote: '', vence: '', baches_plan: '', inicio: '', es_prueba: false, forzar_sin_lote: false,
  orden_blanca: false,
  lotes_elegidos: {},   // { [mpId]: loteId }  — lote de MP elegido por el usuario (vacío = PEPS automático)
}

// Mezcla de referencia para planear recetas por ingrediente (se cancela en el cálculo)
export const BASE_RECETA = 10000

// Fecha LOCAL en 'YYYY-MM-DD' (evita el desfase de un día por zona horaria que da toISOString en UTC)
export const fechaLocalISO = (d = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
// Suma meses a la fecha de hoy y devuelve 'YYYY-MM-DD'
export const desdeHoyMeses = (meses) => { const d = new Date(); d.setMonth(d.getMonth() + meses); return fechaLocalISO(d) }
// Vencimiento = fecha base (fabricación) + N meses. Si no hay base, usa hoy.
export const desdeFechaMeses = (base, meses) => { const d = base ? new Date(base + 'T00:00:00') : new Date(); d.setMonth(d.getMonth() + meses); return fechaLocalISO(d) }
// Vencimiento a partir de la "vida útil" configurada en la ficha del producto (días o meses)
export const desdeFechaVidaUtil = (base, valor, unidad) => {
  const d = base ? new Date(base + 'T00:00:00') : new Date()
  if (unidad === 'dias') d.setDate(d.getDate() + valor)
  else d.setMonth(d.getMonth() + valor)
  return fechaLocalISO(d)
}
export const horaAhora = () => new Date().toTimeString().slice(0, 5)

// ¿La unidad de inventario se mide por peso/volumen (se produce por gramaje/kilos), no por conteo?
export const esUnidadPeso = (u) => /kg|kilo|gramo|^g$|^gr$|litro|^l$|^ml$|mili|onza|lb|libra/i.test(String(u || '').trim())
// MP en Kg/Litro guarda stock en esas unidades; los movimientos PEPS trabajan en gramos/ml.
export const mpUsaKilos = (u) => /kg|kilo|litro|^l$|lb|libra/i.test(String(u || '').trim())
export const entradaPesoAGramos = (valor, unidadEntrada) => {
  const v = parseFloat(valor) || 0
  return unidadEntrada === 'kg' ? v * 1000 : v
}
export const gramosAUnidadEntrada = (gramos, unidadEntrada) => {
  const g = parseFloat(gramos) || 0
  return unidadEntrada === 'kg' ? g / 1000 : g
}
export const cantidadMPAEntrada = (cantidadMP, unidadMP, unidadEntrada) =>
  gramosAUnidadEntrada(mpUsaKilos(unidadMP) ? (parseFloat(cantidadMP) || 0) * 1000 : (parseFloat(cantidadMP) || 0), unidadEntrada)
export const obtenidoEnUnidadMP = (valorEntrada, unidadEntrada, unidadMP) => {
  const gramos = entradaPesoAGramos(valorEntrada, unidadEntrada)
  return mpUsaKilos(unidadMP) ? gramos / 1000 : gramos
}
export const defaultUnidadEntradaObtenido = (unidadMP) => (mpUsaKilos(unidadMP) ? 'kg' : 'g')
export const labelUnidadEntrada = (u) => (u === 'kg' ? 'Kg' : 'Gramos')

export const parseJsonArr = (v, fb = []) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]') } catch { return fb } }
export const paramsCalidadDesdeFicha = (fuente) => {
  if (!fuente) return []
  const list = parseJsonArr(fuente.parametros_calidad, []).filter(pc => (pc.nombre || '').trim())
  const params = list.map(pc => ({
    nombre: String(pc.nombre).trim(),
    esperado: String(pc.valor ?? ''),
    unidad: pc.unidad || '',
    obtenido: '',
    cumple: null,
  }))
  if (fuente.brix_aplica) {
    const hasBrix = params.some(p => /brix/i.test(p.nombre))
    if (!hasBrix) params.unshift({ nombre: 'Brix', esperado: String(fuente.brix ?? ''), unidad: '°Bx', obtenido: '', cumple: null })
  }
  return params
}
export const mergeParamsCalidadGuardados = (desdeFicha, guardados) => {
  const saved = Array.isArray(guardados) ? guardados : parseJsonArr(guardados, [])
  if (!saved.length) return desdeFicha
  const byName = Object.fromEntries(saved.map(s => [String(s.nombre || '').trim().toLowerCase(), s]))
  return desdeFicha.map(p => {
    const g = byName[p.nombre.trim().toLowerCase()]
    if (!g) return p
    return {
      ...p,
      obtenido: g.obtenido ?? g.valor_obtenido ?? '',
      cumple: g.cumple === true || g.cumple === false ? g.cumple : null,
    }
  })
}
export const serializarParamsCalidad = (arr) =>
  (arr || []).filter(p => (p.nombre || '').trim()).map(p => ({
    nombre: p.nombre,
    esperado: p.esperado ?? '',
    unidad: p.unidad || '',
    obtenido: p.obtenido || '',
    cumple: p.cumple === true || p.cumple === false ? p.cumple : null,
  }))
export const fmtCumpleCalidad = (v) => (v === true ? 'Cumple' : v === false ? 'No cumple' : '—')
export const hoyISO = () => fechaLocalISO()
export const labelMeses = (m) => m % 12 === 0 ? `${m / 12} año${m / 12 > 1 ? 's' : ''}` : `${m} mes${m > 1 ? 'es' : ''}`
export const VENCE_OPTS_DEFAULT = [1, 2, 3, 6, 12, 24]
export const getVenceOpts = () => { try { const v = JSON.parse(localStorage.getItem('mumi_vence_opts')); return Array.isArray(v) && v.length ? v : VENCE_OPTS_DEFAULT } catch { return VENCE_OPTS_DEFAULT } }

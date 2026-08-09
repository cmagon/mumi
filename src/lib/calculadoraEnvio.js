/**
 * Calculadora de costos de envío (lógica del Excel "Calculadora Costos y Envíos").
 *
 * Peso volumétrico (kg) = (Largo × Ancho × Alto) / 6000   — medidas en cm
 * Peso a cobrar (kg)    = MAX(Peso real, Peso volumétrico)
 * Costo aprox.          = Precio 1er kg + Precio kg adicional × MAX(0, Peso a cobrar − 1)
 *
 * Nota: el Excel tiene `=B5+(C5*F2-1)` (precedencia: C5*F2 − 1). La etiqueta
 * "precio kilo adicional" corresponde a la tarifa courier estándar de arriba.
 */

export const DIVISOR_VOLUMETRICO = 6000

export function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** @returns {{ pesoVolumetrico: number|null, pesoCobrar: number|null, costoAprox: number|null }} */
export function calcularEnvio({ largoCm, anchoCm, altoCm, pesoRealKg, precioKilo, precioAdicional }) {
  const L = numOrNull(largoCm)
  const A = numOrNull(anchoCm)
  const H = numOrNull(altoCm)
  const P = numOrNull(pesoRealKg)
  const pk = numOrNull(precioKilo)
  const pa = numOrNull(precioAdicional)

  const dimsOk = L != null && A != null && H != null && L > 0 && A > 0 && H > 0
  const pesoVolumetrico = dimsOk ? (L * A * H) / DIVISOR_VOLUMETRICO : null

  let pesoCobrar = null
  if (pesoVolumetrico != null || (P != null && P > 0)) {
    const real = P != null && P > 0 ? P : 0
    const vol = pesoVolumetrico != null ? pesoVolumetrico : 0
    pesoCobrar = Math.max(real, vol)
    if (!(pesoCobrar > 0)) pesoCobrar = null
  }

  let costoAprox = null
  if (pesoCobrar != null && pk != null && pa != null && pk >= 0 && pa >= 0) {
    const kgAdicionales = Math.max(0, pesoCobrar - 1)
    costoAprox = pk + pa * kgAdicionales
  }

  return { pesoVolumetrico, pesoCobrar, costoAprox }
}

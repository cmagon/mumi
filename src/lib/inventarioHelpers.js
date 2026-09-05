// Ayudantes PUROS de Inventario (sin estado de React). Extraídos de Inventario.jsx para adelgazar
// ese archivo. Formatos de unidad/cantidad, constantes de formulario y catálogos. Sin cambio de
// comportamiento: misma lógica que estaba inline.
import { fNum } from './businessLogic'

/** Fecha + hora local (para ingresos PEPS / auditoría). Acepta date o timestamptz. */
export const fFechaHora = (s) => {
  if (!s) return '—'
  try {
    const d = String(s).includes('T') || String(s).includes(' ')
      ? new Date(s)
      : new Date(s + 'T12:00:00')
    if (Number.isNaN(d.getTime())) return String(s)
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return String(s) }
}

export const EMPTY_MP = { nombre: '', categoria: '', tipo: 'comprado', unidad: 'Kg', precio: '', stock_min: 0, stock: 0, lote: '', vencimiento: '', obs: '', extra: {}, vendible: false, precio_venta: '' }
export const EMPTY_MOV = { mp_id: '', tipo: 'entrada', cantidad: '', responsable: '', obs: '', lote: '', vencimiento: '', extra: {}, costo: '', motivo: 'consumo', lote_id: '', proveedor: '' }
// Motivos solo de salida (el "ajuste de conteo" es un tipo aparte: corrige cantidad absoluta de un PEPS)
export const MOTIVOS_SALIDA = [
  { value: 'consumo', label: 'Consumo / uso' },
  { value: 'perdida', label: 'Pérdida / daño' },
  { value: 'vencimiento', label: 'Vencimiento' },
  { value: 'no_contabilizada', label: 'Salida no contabilizada' },
]
export const motivoLabel = (m) => (MOTIVOS_SALIDA.find(x => x.value === m)?.label || m)
export const tituloTipoMov = (t) => (t === 'entrada' ? 'Compra / recepción' : t === 'salida' ? 'Salida' : t === 'ajuste' ? 'Ajuste de conteo' : 'Movimiento')
export const UNIDADES = ['Kg', 'Gramo', 'Litro', 'Mililitro', 'Unidad']
// Sufijo corto para mostrar el precio según la unidad
export const sufijoUnidad = (u) => u === 'Kg' ? '/Kg' : u === 'Gramo' ? '/g' : u === 'Litro' ? '/L' : u === 'Mililitro' ? '/ml' : u === 'Unidad' ? '/u' : `/${u || 'u'}`
// Etiqueta "por X" para el precio según la unidad
export const porUnidad = (u) => u === 'Litro' ? 'por Litro' : u === 'Gramo' ? 'por Gramo' : u === 'Mililitro' ? 'por Mililitro' : u === 'Unidad' ? 'por Unidad' : 'por Kg'
// Cantidad de un movimiento expresada en gramos/ml (Kg→g, Litro→ml); g/ml y unidades quedan igual
export const fCantMov = (cant, unidad) => {
  const v = Number(cant) || 0
  if (unidad === 'Kg') return `${fNum(v * 1000)} g`
  if (unidad === 'Litro') return `${fNum(v * 1000)} ml`
  if (unidad === 'Gramo') return `${fNum(v)} g`
  if (unidad === 'Mililitro') return `${fNum(v)} ml`
  return `${fNum(v)} ${unidad || ''}`.trim()
}
// Factor para pasar de la unidad de PRECIO (Kg/Litro) a la unidad BASE de stock (g/ml). g/ml/Unidad = 1.
export const factorU = (u) => (u === 'Kg' || u === 'Litro') ? 1000 : 1
export const baseLbl = (u) => (u === 'Kg' || u === 'Gramo') ? 'g' : (u === 'Litro' || u === 'Mililitro') ? 'ml' : (u || 'u')
// Convierte una cantidad interna (en unidad de precio) a texto en unidad base (g/ml/u)
export const fBase = (cantInterna, unidad) => `${fNum((Number(cantInterna) || 0) * factorU(unidad))} ${baseLbl(unidad)}`
// Los empaques no requieren lote, vencimiento ni campos adicionales
export const esEmpaque = (categoria) => /empaque|envase/i.test(categoria || '')

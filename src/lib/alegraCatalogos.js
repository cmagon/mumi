// Unidades de medida aceptadas por Alegra (valor API → etiqueta en español)
export const UNIDADES_ALEGRA = [
  { v: 'unit', l: 'Unidad' },
  { v: 'kilogram', l: 'Kilogramo (Kg)' },
  { v: 'gram', l: 'Gramo (g)' },
  { v: 'pound', l: 'Libra' },
  { v: 'liter', l: 'Litro' },
  { v: 'mililiter', l: 'Mililitro (ml)' },
  { v: 'gallon', l: 'Galón' },
  { v: 'piece', l: 'Pieza' },
  { v: 'meter', l: 'Metro' },
  { v: 'service', l: 'Servicio' },
  { v: 'notApplicable', l: 'No aplica' },
]

// Catálogo curado de códigos UNSPSC (Colombia Compra Eficiente) relevantes para alimentos.
// El usuario puede elegir uno o escribir el suyo. Códigos a nivel "commodity" (8 dígitos).
export const UNSPSC_ALIMENTOS = [
  { codigo: '50181900', desc: 'Pan, galletas y pastelitos dulces (galletas, bocadillos, dulces de panadería)' },
  { codigo: '50181700', desc: 'Productos de panadería' },
  { codigo: '50182000', desc: 'Productos de pastelería' },
  { codigo: '50161800', desc: 'Productos de chocolate' },
  { codigo: '50161900', desc: 'Productos de confitería y dulces (caramelos, gomas)' },
  { codigo: '50192300', desc: 'Snacks / pasabocas' },
  { codigo: '50201700', desc: 'Café y té (infusiones, aromáticas)' },
  { codigo: '50202300', desc: 'Bebidas no alcohólicas (té e infusiones listas para beber)' },
  { codigo: '50221300', desc: 'Frutas deshidratadas o en conserva' },
  { codigo: '50171553', desc: 'Mermeladas y jaleas' },
]

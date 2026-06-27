// Unidades de medida aceptadas por Alegra (valor API → etiqueta en español)
export const UNIDADES_ALEGRA = [
  { v: 'unit', l: 'Unidad' },
  { v: 'unit', l: 'Caja (se factura como unidad)' },
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

// Catálogo de códigos UNSPSC REALES a nivel PRODUCTO (commodity, 8 dígitos que NO terminan en "00").
// IMPORTANTE: la DIAN/Alegra rechaza los códigos terminados en "00" porque son encabezados de
// clase/familia, no productos. Aquí solo van códigos específicos válidos para facturar.
export const UNSPSC_ALIMENTOS = [
  // Galletas y panadería dulce
  { codigo: '50181905', desc: 'Galletas dulces' },
  { codigo: '50181902', desc: 'Galletas (tipo cracker / saladas)' },
  // Bocadillo / mermeladas / dulces de fruta
  { codigo: '50171904', desc: 'Conservas de frutas (bocadillo, mermeladas, dulces de fruta)' },
  // Confitería / dulces / gomas
  { codigo: '50161814', desc: 'Confite de azúcar (gomitas, dulces)' },
  { codigo: '50161813', desc: 'Confite de chocolate' },
  { codigo: '50161511', desc: 'Chocolate o sustituto de chocolate' },
  // Té / infusiones / aromáticas
  { codigo: '50201715', desc: 'Té de frutas (infusiones de fruta)' },
  { codigo: '50201710', desc: 'Té de hoja' },
  { codigo: '50201713', desc: 'Bolsas de té (sobres / filtros)' },
  { codigo: '50201712', desc: 'Bebidas de té (listas para beber)' },
  { codigo: '50171554', desc: 'Hierbas y semillas para infusiones (aromáticas)' },
  // Jugos / bebidas
  { codigo: '50202305', desc: 'Jugo fresco (zumo de frutas)' },
  { codigo: '50202306', desc: 'Refrescos / bebidas no alcohólicas' },
  // Cereales / barras
  { codigo: '50221202', desc: 'Barras de desayuno o de salud (cereal/nueces)' },
  { codigo: '50221201', desc: 'Cereal listo para comer' },
]

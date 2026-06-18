// Catálogo de parámetros de calidad (métodos estandarizados a nivel global).
// El usuario puede elegir uno o escribir uno propio.
export const CATALOGO_PARAMS = [
  { grupo: 'Fisicoquímicos y de Composición', items: [
    { nombre: 'Grados Brix', unidad: '°Bx' },
    { nombre: '% Humedad', unidad: '%' },
    { nombre: 'Actividad de agua (aw)', unidad: 'aw' },
    { nombre: 'pH', unidad: '' },
    { nombre: 'Acidez titulable', unidad: '% ácido' },
    { nombre: 'Sólidos solubles totales', unidad: '%' },
  ] },
  { grupo: 'Reológicos y Ópticos', items: [
    { nombre: 'Textura / Firmeza', unidad: 'N' },
    { nombre: 'Viscosidad', unidad: 'cP' },
    { nombre: 'Color L*', unidad: 'L*' },
    { nombre: 'Color a*', unidad: 'a*' },
    { nombre: 'Color b*', unidad: 'b*' },
  ] },
  { grupo: 'Nutricionales y de Pureza', items: [
    { nombre: 'Perfil de ácidos grasos', unidad: '' },
    { nombre: 'Contenido de proteínas', unidad: '%' },
    { nombre: 'Grasa total', unidad: '%' },
    { nombre: 'Cenizas', unidad: '%' },
    { nombre: 'Fibra', unidad: '%' },
    { nombre: 'Carbohidratos', unidad: '%' },
    { nombre: 'Densidad', unidad: 'g/mL' },
  ] },
]
export const PARAM_UNIDAD = Object.fromEntries(CATALOGO_PARAMS.flatMap(g => g.items.map(i => [i.nombre, i.unidad])))

// Presentaciones comunes del producto (el usuario puede agregar otras)
export const PRESENTACIONES = ['Unidad', 'Caja', 'Kilo', 'Litro', 'Paquete', 'Bolsa', 'Frasco', 'Botella', 'Bandeja', 'Display']

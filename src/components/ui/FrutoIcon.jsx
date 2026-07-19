// ============================================================================
//  Iconos SVG propios de Mumi Amazonia — dibujados a mano, estilo "fruto de
//  la selva". El cuerpo usa currentColor (lo define el color del fruto) y las
//  hojas/tallos usan un verde fijo para que siempre se lean como frutos.
//  Cada icono se ve bien de 14px a 96px.
// ============================================================================

const LEAF = '#5f9e3f'
const LEAF2 = '#4a7c33'
const HI = 'rgba(255,255,255,.32)'   // brillo
const SH = 'rgba(0,0,0,.14)'         // sombra suave

// ---- Piezas reutilizables --------------------------------------------------
const Hoja = ({ x = 16, y = 4, r = 0 }) => (
  <path transform={`translate(${x} ${y}) rotate(${r})`}
    d="M0 5C-.5 2 1.5-1 5-2 4.5 1.5 2.5 4 0 5Z" fill={LEAF} />
)
const Tallo = ({ d }) => <path d={d} stroke={LEAF2} strokeWidth="1.6" strokeLinecap="round" fill="none" />

// ---- Definición de cada icono (viewBox 0 0 32 32) --------------------------
const ICONS = {
  // Açaí / asaí — racimo de bayas oscuras
  acai: (
    <g>
      <Tallo d="M16 3v6" />
      <path d="M14 4c-3-1-5 1-4 3 2 .5 4-1 4-3Z" fill={LEAF} />
      <circle cx="11" cy="15" r="4.2" />
      <circle cx="21" cy="14.5" r="4.2" />
      <circle cx="16" cy="12.5" r="4" />
      <circle cx="13" cy="22" r="4.4" />
      <circle cx="20" cy="22" r="4.4" />
      <circle cx="16.5" cy="26.5" r="4" />
      <circle cx="9.6" cy="13.2" r="1.1" fill={HI} />
      <circle cx="14.6" cy="10.8" r="1.1" fill={HI} />
      <circle cx="11.5" cy="20" r="1.1" fill={HI} />
    </g>
  ),
  // Uva / racimo triangular
  racimo: (
    <g>
      <Tallo d="M16 3v5" />
      <Hoja x={17} y={3} r={20} />
      <circle cx="12" cy="12" r="3.4" /><circle cx="20" cy="12" r="3.4" /><circle cx="16" cy="12" r="3.4" />
      <circle cx="14" cy="18" r="3.4" /><circle cx="18" cy="18" r="3.4" />
      <circle cx="16" cy="24" r="3.4" />
      <circle cx="10.7" cy="10.8" r=".9" fill={HI} />
    </g>
  ),
  // Moriche / canangucho — fruto de palma con escamas
  moriche: (
    <g>
      <Tallo d="M16 3v4" />
      <ellipse cx="16" cy="18" rx="8" ry="10.5" />
      <path d="M9 14q7 3 14 0M8.6 18q7.4 3 14.8 0M9 22q7 3 14 0" stroke={SH} strokeWidth="1.1" fill="none" />
      <path d="M12 9q4-2 8 0M11 12.5q5-2 10 0" stroke={SH} strokeWidth="1.1" fill="none" />
      <ellipse cx="12.5" cy="11.5" rx="1.6" ry="1" fill={HI} />
    </g>
  ),
  // Seje / milpesos — palma alta
  palma: (
    <g>
      <path d="M15 14h2v15h-2z" fill={LEAF2} />
      <path d="M16 13C10 13 5 10 4 6c5 0 9 2 12 5-1-4 0-8 2-11 1 4 1 8 0 11 3-3 7-5 12-5-1 4-6 7-12 7Z" fill={LEAF} />
      <circle cx="16" cy="13" r="2.2" />
    </g>
  ),
  // Cacao — mazorca con costillas
  cacao: (
    <g transform="rotate(18 16 16)">
      <Hoja x={17} y={2} r={30} />
      <ellipse cx="16" cy="17" rx="6.5" ry="11" />
      <path d="M16 6.5v21M12 8q-2 9 0 18M20 8q2 9 0 18" stroke={SH} strokeWidth="1.1" fill="none" />
      <ellipse cx="13.5" cy="12" rx="1.3" ry="2.4" fill={HI} />
    </g>
  ),
  // Copoazú — pod grande ovalado
  copoazu: (
    <g>
      <Tallo d="M16 4v4" />
      <Hoja x={18} y={4} r={40} />
      <ellipse cx="16" cy="18" rx="9" ry="11" />
      <ellipse cx="12.5" cy="13" rx="2" ry="3" fill={HI} />
      <path d="M20 10q3 8 0 16" stroke={SH} strokeWidth="1.2" fill="none" />
    </g>
  ),
  // Cocona / arazá / borojó — fruto redondo con hoja
  redondo: (
    <g>
      <Tallo d="M16 3v5" />
      <Hoja x={17} y={3} r={25} />
      <circle cx="16" cy="19" r="10" />
      <circle cx="12" cy="15" r="2.4" fill={HI} />
    </g>
  ),
  // Lulo — redondo con textura (pelusa/puntos)
  lulo: (
    <g>
      <Tallo d="M16 3v5" />
      <Hoja x={17} y={3} r={25} />
      <circle cx="16" cy="19" r="10" />
      <g fill={SH}>
        <circle cx="12" cy="16" r=".8" /><circle cx="16" cy="14" r=".8" /><circle cx="20" cy="16" r=".8" />
        <circle cx="11" cy="20" r=".8" /><circle cx="15" cy="19" r=".8" /><circle cx="19" cy="20" r=".8" />
        <circle cx="13" cy="23" r=".8" /><circle cx="18" cy="23" r=".8" /><circle cx="16" cy="25" r=".8" />
      </g>
      <circle cx="12.5" cy="15.5" r="2" fill={HI} />
    </g>
  ),
  // Camu camu — cereza pequeña con tallo largo
  camu: (
    <g>
      <Tallo d="M16 3c0 5-1 6-2 7" />
      <Hoja x={17} y={3} r={35} />
      <circle cx="14" cy="20" r="7.5" />
      <circle cx="11" cy="17" r="1.8" fill={HI} />
    </g>
  ),
  // Chontaduro — fruto de palma ovalado
  chontaduro: (
    <g>
      <Tallo d="M16 4v4" />
      <Hoja x={18} y={4} r={40} />
      <ellipse cx="16" cy="18" rx="7.5" ry="10" />
      <ellipse cx="12.5" cy="13.5" rx="1.8" ry="2.6" fill={HI} />
    </g>
  ),
  // Cítrico — media rodaja
  citrico: (
    <g>
      <circle cx="16" cy="16" r="12" />
      <circle cx="16" cy="16" r="9" fill={HI} />
      <g stroke="currentColor" strokeWidth="1.4">
        <path d="M16 7v18M7 16h18M9.5 9.5l13 13M22.5 9.5l-13 13" />
      </g>
      <circle cx="16" cy="16" r="1.6" />
    </g>
  ),
  // Hoja
  hoja: (
    <g>
      <path d="M16 28C8 24 6 14 10 6c2-2 10-2 14 2 2 8-2 16-8 20Z" />
      <path d="M16 27C15 20 16 12 20 7" stroke={LEAF2} strokeWidth="1.4" fill="none" />
    </g>
  ),
  // Brote / sprout
  brote: (
    <g>
      <path d="M16 30v-9" stroke={LEAF2} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 22C10 22 6 18 6 12c6 0 10 4 10 10Z" fill={LEAF} />
      <path d="M16 20C16 14 20 10 26 10c0 6-4 10-10 10Z" />
    </g>
  ),
  // Flor (jamaica / hibisco)
  flor: (
    <g>
      <g>
        <ellipse cx="16" cy="7" rx="3.4" ry="5" />
        <ellipse cx="16" cy="25" rx="3.4" ry="5" />
        <ellipse cx="7" cy="16" rx="5" ry="3.4" />
        <ellipse cx="25" cy="16" rx="5" ry="3.4" />
        <ellipse cx="9.5" cy="9.5" rx="4.4" ry="3.2" transform="rotate(45 9.5 9.5)" />
        <ellipse cx="22.5" cy="9.5" rx="4.4" ry="3.2" transform="rotate(-45 22.5 9.5)" />
        <ellipse cx="9.5" cy="22.5" rx="4.4" ry="3.2" transform="rotate(-45 9.5 22.5)" />
        <ellipse cx="22.5" cy="22.5" rx="4.4" ry="3.2" transform="rotate(45 22.5 22.5)" />
      </g>
      <circle cx="16" cy="16" r="3.6" fill="#f6c945" />
    </g>
  ),
  // Semilla / grano
  semilla: (
    <g>
      <path d="M16 4c6 4 8 12 4 20-1 3-7 3-8 0-4-8-2-16 4-20Z" />
      <path d="M16 8v16" stroke={SH} strokeWidth="1.3" />
      <ellipse cx="13.5" cy="12" rx="1.4" ry="2.4" fill={HI} />
    </g>
  ),
  // Miel / gota
  miel: (
    <g>
      <path d="M16 3c5 7 8 11 8 15a8 8 0 0 1-16 0c0-4 3-8 8-15Z" />
      <path d="M12 18a4 4 0 0 0 3 4" stroke={HI} strokeWidth="2" strokeLinecap="round" fill="none" />
    </g>
  ),
  // Café — grano
  cafe: (
    <g>
      <ellipse cx="16" cy="16" rx="8" ry="11" transform="rotate(35 16 16)" />
      <path d="M12 9C15 13 15 19 20 23" stroke={SH} strokeWidth="1.6" fill="none" />
    </g>
  ),
  // Fruto genérico (baya con hoja)
  fruto: (
    <g>
      <Tallo d="M16 4v5" />
      <Hoja x={17} y={4} r={25} />
      <circle cx="16" cy="19" r="9.5" />
      <circle cx="12.5" cy="15.5" r="2.2" fill={HI} />
    </g>
  ),
  // Limonaria / hierba limón — hojas altas y delgadas en abanico
  limonaria: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M16 30C16 22 16 12 16 3" />
      <path d="M16 30C14 22 11 13 7 6" />
      <path d="M16 30C18 22 21 13 25 6" />
      <path d="M16 30C13 23 9 16 4 11" stroke={LEAF2} />
      <path d="M16 30C19 23 23 16 28 11" stroke={LEAF2} />
    </g>
  ),
  // Piña / tropical
  pina: (
    <g>
      <path d="M16 2c-2 3-4 4-4 4s3 0 4 2c1-2 4-2 4-2s-2-1-4-4Z" fill={LEAF} />
      <path d="M13 5c-1 2-3 3-3 3s2 .5 3 2M19 5c1 2 3 3 3 3s-2 .5-3 2" fill={LEAF2} />
      <ellipse cx="16" cy="20" rx="7.5" ry="9" />
      <path d="M11 15l10 8M21 15l-10 8" stroke={SH} strokeWidth="1" fill="none" />
    </g>
  ),
}

// Etiquetas y palabras clave EN ESPAÑOL para el buscador de iconos.
export const ICONOS_FRUTO = [
  { n: 'acai', l: 'Açaí / Baya', k: 'acai asai baya morada racimo arandano mora' },
  { n: 'racimo', l: 'Racimo / Uva', k: 'racimo uva uvas moriche seje frutos colgantes' },
  { n: 'moriche', l: 'Moriche', k: 'moriche canangucho aguaje escamas palma naranja' },
  { n: 'palma', l: 'Palma / Seje', k: 'palma palmera seje milpesos arbol tropical coco' },
  { n: 'cacao', l: 'Cacao', k: 'cacao copoazu mazorca grano chocolate pod' },
  { n: 'copoazu', l: 'Copoazú', k: 'copoazu cupuazu pod grande marron pulpa' },
  { n: 'redondo', l: 'Fruto redondo', k: 'cocona araza borojo fruta redonda naranja hoja' },
  { n: 'lulo', l: 'Lulo', k: 'lulo naranjilla pelusa textura acido verde' },
  { n: 'camu', l: 'Camu camu', k: 'camu cereza baya vitamina roja pequena' },
  { n: 'chontaduro', l: 'Chontaduro', k: 'chontaduro pijuayo pejibaye palma ovalado' },
  { n: 'citrico', l: 'Cítrico', k: 'citrico limon naranja lima mandarina rodaja' },
  { n: 'hoja', l: 'Hoja', k: 'hoja planta natural verde hierba te' },
  { n: 'brote', l: 'Brote', k: 'brote germinar semilla planta retono crecer' },
  { n: 'flor', l: 'Flor / Jamaica', k: 'flor jamaica hibisco petalo rosa te' },
  { n: 'semilla', l: 'Semilla / Grano', k: 'semilla grano nuez castana mani almendra cacay' },
  { n: 'miel', l: 'Miel / Gota', k: 'miel gota jugo nectar dulce liquido abeja' },
  { n: 'cafe', l: 'Café', k: 'cafe grano bebida tostado' },
  { n: 'limonaria', l: 'Limonaria', k: 'limonaria limoncillo hierba limon citronela pasto zacate te aromatica' },
  { n: 'pina', l: 'Piña / Tropical', k: 'pina anana tropical fruta' },
  { n: 'fruto', l: 'Fruto genérico', k: 'fruto fruta baya generico otro' },
]

// Compatibilidad con nombres antiguos (lucide) guardados en la BD.
const ALIAS = {
  Cherry: 'acai', Grape: 'racimo', Apple: 'redondo', Banana: 'chontaduro',
  Citrus: 'citrico', Nut: 'semilla', Bean: 'cacao', Carrot: 'fruto', Wheat: 'semilla',
  Leaf: 'hoja', LeafyGreen: 'hoja', Sprout: 'brote', Flower: 'flor', Flower2: 'flor',
  TreePalm: 'palma', TreeDeciduous: 'palma', TreePine: 'palma', Vegan: 'hoja',
  Salad: 'hoja', Coffee: 'cafe', Cookie: 'semilla', Candy: 'miel', IceCreamCone: 'miel',
  Droplet: 'miel', Sun: 'flor', Sparkles: 'flor', Heart: 'fruto', Star: 'flor',
  Soup: 'cafe', CupSoda: 'miel',
}

export function resolverIcono(name) {
  if (ICONS[name]) return name
  if (ALIAS[name]) return ALIAS[name]
  return 'fruto'
}

// Renderiza el icono de un fruto por su nombre. Hereda el color vía currentColor.
export default function FrutoIcon({ name, size = 24, ...rest }) {
  const key = resolverIcono(name)
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor"
      xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, display: 'inline-block' }} {...rest}>
      {ICONS[key]}
    </svg>
  )
}

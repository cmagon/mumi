import {
  Truck, Leaf, ShieldCheck, MessageCircle, Package, CreditCard, Heart, Star, Clock,
  Gift, Award, Sprout, BadgeCheck, Sparkles, MapPin, Phone, Percent, ThumbsUp, Recycle, HandCoins,
} from 'lucide-react'

// Iconos disponibles para la barra de beneficios (con etiqueta en español para el selector)
export const BENEFIT_ICONS = [
  { n: 'Truck', l: 'Camión / envío' }, { n: 'Package', l: 'Paquete' }, { n: 'ShieldCheck', l: 'Escudo / seguro' },
  { n: 'BadgeCheck', l: 'Verificado' }, { n: 'Leaf', l: 'Hoja / natural' }, { n: 'Sprout', l: 'Brote' },
  { n: 'Recycle', l: 'Reciclable' }, { n: 'MessageCircle', l: 'WhatsApp / mensaje' }, { n: 'Phone', l: 'Teléfono' },
  { n: 'CreditCard', l: 'Pago / tarjeta' }, { n: 'HandCoins', l: 'Precio / dinero' }, { n: 'Percent', l: 'Descuento' },
  { n: 'Heart', l: 'Corazón' }, { n: 'Star', l: 'Estrella' }, { n: 'Award', l: 'Premio' },
  { n: 'ThumbsUp', l: 'Me gusta' }, { n: 'Gift', l: 'Regalo' }, { n: 'Sparkles', l: 'Destello' },
  { n: 'Clock', l: 'Reloj / rapidez' }, { n: 'MapPin', l: 'Ubicación' },
]

const MAP = {
  Truck, Leaf, ShieldCheck, MessageCircle, Package, CreditCard, Heart, Star, Clock,
  Gift, Award, Sprout, BadgeCheck, Sparkles, MapPin, Phone, Percent, ThumbsUp, Recycle, HandCoins,
}

// Renderiza el icono de un beneficio; si no hay icono válido, un punto (•)
export default function BenefitIcon({ name, size = 14 }) {
  const C = name && MAP[name]
  if (!C) return <span className="benefit-dot" aria-hidden="true">•</span>
  return <C size={size} />
}

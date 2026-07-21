import {
  CreditCard, Banknote, Wallet, Smartphone, QrCode, Landmark, HandCoins, Coins,
  Receipt, ShieldCheck, Truck, Gift, PiggyBank, BadgeDollarSign,
} from 'lucide-react'

// Iconos disponibles para los métodos de pago (con etiqueta en español)
export const PAGO_ICONOS = [
  { n: 'CreditCard', l: 'Tarjeta' }, { n: 'Banknote', l: 'Efectivo' }, { n: 'Wallet', l: 'Billetera' },
  { n: 'Smartphone', l: 'Pago móvil' }, { n: 'QrCode', l: 'Código QR' }, { n: 'Landmark', l: 'Banco' },
  { n: 'HandCoins', l: 'Contra entrega' }, { n: 'Coins', l: 'Monedas' }, { n: 'Receipt', l: 'Recibo' },
  { n: 'ShieldCheck', l: 'Pago seguro' }, { n: 'Truck', l: 'Al recibir' }, { n: 'Gift', l: 'Bono' },
  { n: 'PiggyBank', l: 'Ahorro' }, { n: 'BadgeDollarSign', l: 'Transferencia' },
]

const MAP = { CreditCard, Banknote, Wallet, Smartphone, QrCode, Landmark, HandCoins, Coins, Receipt, ShieldCheck, Truck, Gift, PiggyBank, BadgeDollarSign }

export default function PagoIcon({ name, size = 18, ...rest }) {
  const C = MAP[name] || CreditCard
  return <C size={size} {...rest} />
}

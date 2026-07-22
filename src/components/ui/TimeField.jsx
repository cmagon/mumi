// Selector de hora (12 h con AM/PM). Trabaja con valores "HH:MM" en 24 h.
// - Escritorio (ratón): desplegables compactos.
// - Móvil / tablet (táctil): botón tipo reloj que abre un selector de ruedas estilo "alarma".
import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import TimeWheel from './TimeWheel'
import Select from './Select'

const HORAS12 = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

export function to12(value) {
  if (!value) return { h: '', m: '', ap: 'AM' }
  const [H, M] = value.split(':').map(Number)
  const ap = H >= 12 ? 'PM' : 'AM'
  let h = H % 12; if (h === 0) h = 12
  return { h: String(h), m: String(M).padStart(2, '0'), ap }
}
export function to24(h, m, ap) {
  if (!h || m === '' || m == null || !ap) return ''
  let H = Number(h) % 12
  if (ap === 'PM') H += 12
  return String(H).padStart(2, '0') + ':' + m
}

// ¿Dispositivo táctil / pantalla de tablet o móvil? → usar ruedas
function useEsTactil() {
  const consulta = '(pointer: coarse), (max-width: 1024px)'
  const [tactil, setTactil] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches)
  useEffect(() => {
    const mq = window.matchMedia(consulta)
    const on = () => setTactil(mq.matches)
    // Safari < 14 no soporta addEventListener en MediaQueryList (usa addListener)
    if (mq.addEventListener) { mq.addEventListener('change', on); return () => mq.removeEventListener('change', on) }
    mq.addListener(on); return () => mq.removeListener(on)
  }, [])
  return tactil
}

export default function TimeField({ value, onChange, disabled }) {
  const tactil = useEsTactil()
  const [abierto, setAbierto] = useState(false)
  const { h, m, ap } = to12(value)
  const set = (nh, nm, nap) => onChange(to24(nh, nm, nap))

  // ---- Versión táctil: botón grande tipo reloj + ruedas ----
  if (tactil) {
    const etiqueta = value ? `${h}:${m} ${ap}` : 'Seleccionar hora'
    return (
      <>
        <button
          type="button"
          className="form-control"
          disabled={disabled}
          onClick={() => setAbierto(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            width: '100%', textAlign: 'left', minHeight: 46,
            fontSize: '1.15rem', fontWeight: value ? 700 : 400,
            color: value ? 'var(--selva)' : 'var(--texto-suave)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <Clock size={20} aria-hidden="true" style={{ color: 'var(--dorado)', flexShrink: 0 }} />
          {etiqueta}
        </button>
        {abierto && (
          <TimeWheel value={value} onClose={() => setAbierto(false)} onConfirm={onChange} />
        )}
      </>
    )
  }

  // ---- Versión escritorio: desplegables ----
  const sel = { width: 'auto', padding: '6px 8px' }
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <Select className="form-control" style={sel} value={h} disabled={disabled} onChange={e => set(e.target.value, m || '00', ap)}>
        <option value="">--</option>
        {HORAS12.map(x => <option key={x} value={x}>{x}</option>)}
      </Select>
      <strong>:</strong>
      <Select className="form-control" style={sel} value={m} disabled={disabled} onChange={e => set(h || '12', e.target.value, ap)}>
        <option value="">--</option>
        {MINUTOS.map(x => <option key={x} value={x}>{x}</option>)}
      </Select>
      <Select className="form-control" style={sel} value={ap} disabled={disabled} onChange={e => set(h || '12', m || '00', e.target.value)}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </Select>
    </div>
  )
}

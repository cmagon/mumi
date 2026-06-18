// Selector de hora intuitivo (12 h con AM/PM). Trabaja con valores "HH:MM" en 24 h.
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

export default function TimeField({ value, onChange, disabled }) {
  const { h, m, ap } = to12(value)
  const set = (nh, nm, nap) => onChange(to24(nh, nm, nap))
  const sel = { width: 'auto', padding: '6px 8px' }
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <select className="form-control" style={sel} value={h} disabled={disabled} onChange={e => set(e.target.value, m || '00', ap)}>
        <option value="">--</option>
        {HORAS12.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <strong>:</strong>
      <select className="form-control" style={sel} value={m} disabled={disabled} onChange={e => set(h || '12', e.target.value, ap)}>
        <option value="">--</option>
        {MINUTOS.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <select className="form-control" style={sel} value={ap} disabled={disabled} onChange={e => set(h || '12', m || '00', e.target.value)}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Calendario de rango estilo "Meta Business": se hace clic en el día inicial y luego
// en el final; el rango intermedio queda resaltado. value/onChange usan strings YYYY-MM-DD.
const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const iso = (d) => d.toISOString().split('T')[0]

export default function RangeCalendar({ value = {}, onChange, max }) {
  const { desde = '', hasta = '' } = value
  const base = desde ? new Date(desde + 'T12:00:00') : new Date()
  const [ver, setVer] = useState(new Date(base.getFullYear(), base.getMonth(), 1))

  const y = ver.getFullYear(), m = ver.getMonth()
  const primerDia = new Date(y, m, 1)
  // getDay(): 0=Dom..6=Sáb → queremos que la semana empiece en Lunes
  const offset = (primerDia.getDay() + 6) % 7
  const diasEnMes = new Date(y, m + 1, 0).getDate()
  const celdas = []
  for (let i = 0; i < offset; i++) celdas.push(null)
  for (let d = 1; d <= diasEnMes; d++) celdas.push(new Date(y, m, d))

  const clickDia = (d) => {
    const s = iso(d)
    if (max && s > max) return
    // Sin inicio, o ya hay rango completo → empezar de nuevo
    if (!desde || (desde && hasta)) { onChange({ desde: s, hasta: '' }); return }
    // Hay inicio, falta fin
    if (s < desde) onChange({ desde: s, hasta: '' })
    else onChange({ desde, hasta: s })
  }

  const enRango = (d) => {
    const s = iso(d)
    if (desde && hasta) return s >= desde && s <= hasta
    return s === desde
  }
  const esExtremo = (d) => { const s = iso(d); return s === desde || s === hasta }

  return (
    <div style={{ maxWidth: 300, margin: '0 auto', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" className="btn btn-xs btn-secondary" onClick={() => setVer(new Date(y, m - 1, 1))} aria-label="Mes anterior"><ChevronLeft size={15} aria-hidden="true" /></button>
        <strong style={{ fontSize: '0.9rem', color: 'var(--selva)' }}>{MESES[m]} {y}</strong>
        <button type="button" className="btn btn-xs btn-secondary" onClick={() => setVer(new Date(y, m + 1, 1))} aria-label="Mes siguiente"><ChevronRight size={15} aria-hidden="true" /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
        {DIAS.map(d => <div key={d} style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--texto-suave)', padding: '4px 0' }}>{d}</div>)}
        {celdas.map((d, i) => {
          if (!d) return <div key={i} />
          const s = iso(d)
          const deshab = max && s > max
          const activo = enRango(d)
          const extremo = esExtremo(d)
          return (
            <button key={i} type="button" disabled={deshab} onClick={() => clickDia(d)}
              style={{
                border: 'none', cursor: deshab ? 'not-allowed' : 'pointer', padding: '7px 0', fontSize: '0.82rem',
                borderRadius: extremo ? 8 : (activo ? 0 : 8),
                background: extremo ? 'var(--selva)' : activo ? 'rgba(45,90,61,0.15)' : 'transparent',
                color: deshab ? 'var(--crema-oscuro)' : extremo ? 'var(--crema)' : 'var(--texto)',
                fontWeight: extremo ? 700 : 400, opacity: deshab ? 0.5 : 1,
              }}>
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

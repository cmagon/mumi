import { useEffect, useRef, useState } from 'react'
import { to12, to24 } from './TimeField'

// Selector de hora estilo "alarma" (Google/Samsung): ruedas deslizables para móvil/tablet.
// Trabaja con valores "HH:MM" en 24h; internamente usa 12h + AM/PM.
const ITEM_H = 46          // alto de cada opción (px)
const VISIBLES = 5         // opciones visibles (impar → hay una centrada)
const ALTO = ITEM_H * VISIBLES
const PAD = (ALTO - ITEM_H) / 2   // relleno arriba/abajo para poder centrar la 1ª y última

const HORAS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const AMPM = ['AM', 'PM']

function Rueda({ items, value, onChange, ancho = 72 }) {
  const ref = useRef(null)
  const tRef = useRef(null)

  // Coloca la rueda en el valor actual al montar / cuando cambia externamente
  useEffect(() => {
    const idx = Math.max(0, items.indexOf(value))
    if (ref.current) ref.current.scrollTop = idx * ITEM_H
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const alHacerScroll = () => {
    clearTimeout(tRef.current)
    tRef.current = setTimeout(() => {
      if (!ref.current) return
      const idx = Math.round(ref.current.scrollTop / ITEM_H)
      const val = items[Math.min(items.length - 1, Math.max(0, idx))]
      // Ajusta (snap) exactamente a la opción y notifica si cambió
      ref.current.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' })
      if (val !== value) onChange(val)
    }, 90)
  }

  const irA = (i) => { ref.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' }) }

  return (
    <div
      ref={ref}
      onScroll={alHacerScroll}
      style={{
        height: ALTO, width: ancho, overflowY: 'auto', scrollSnapType: 'y mandatory',
        WebkitOverflowScrolling: 'touch',   // scroll con inercia en iOS Safari
        scrollbarWidth: 'none', msOverflowStyle: 'none', position: 'relative',
      }}
      className="tw-rueda"
    >
      <div style={{ height: PAD }} />
      {items.map((it, i) => {
        const activo = it === value
        return (
          <div
            key={it}
            onClick={() => irA(i)}
            style={{
              height: ITEM_H, scrollSnapAlign: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: activo ? '1.5rem' : '1.15rem',
              fontWeight: activo ? 700 : 500,
              color: activo ? 'var(--selva)' : 'var(--texto-suave)',
              opacity: activo ? 1 : 0.5,
              fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
              transition: 'font-size .12s ease, opacity .12s ease',
            }}
          >
            {it}
          </div>
        )
      })}
      <div style={{ height: PAD }} />
    </div>
  )
}

export default function TimeWheel({ value, onClose, onConfirm }) {
  const inicial = value || new Date().toTimeString().slice(0, 5)
  const p = to12(inicial)
  const [h, setH] = useState(p.h || '12')
  const [m, setM] = useState(p.m || '00')
  const [ap, setAp] = useState(p.ap || 'AM')

  // Cierra con Escape
  useEffect(() => {
    const on = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', on, true)
    return () => document.removeEventListener('keydown', on, true)
  }, [onClose])

  const confirmar = () => { onConfirm(to24(h, m, ap)); onClose() }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      role="dialog" aria-modal="true" aria-label="Seleccionar hora"
    >
      <style>{`.tw-rueda::-webkit-scrollbar{display:none}`}</style>
      <div style={{
        background: 'var(--blanco, #fff)', width: 'min(420px, 100%)',
        borderRadius: '20px 20px 0 0', padding: '18px 18px 20px',
        boxShadow: '0 -8px 30px rgba(0,0,0,0.25)', animation: 'modalIn .22s ease',
      }}>
        <div style={{ textAlign: 'center', fontWeight: 700, color: 'var(--selva)', fontSize: '1.05rem', marginBottom: 4 }}>
          Selecciona la hora
        </div>
        <div style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontSize: '1.05rem', color: 'var(--texto-suave)', marginBottom: 10 }}>
          {h}:{m} {ap}
        </div>

        {/* Ruedas con banda central de selección */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          {/* Banda que marca la opción central */}
          <div style={{
            position: 'absolute', left: 8, right: 8, top: PAD, height: ITEM_H,
            background: 'rgba(124,179,66,0.14)', border: '1px solid rgba(45,90,61,0.18)',
            borderRadius: 12, pointerEvents: 'none',
          }} />
          <Rueda items={HORAS} value={h} onChange={setH} />
          <strong style={{ fontSize: '1.5rem', color: 'var(--selva)' }}>:</strong>
          <Rueda items={MINUTOS} value={m} onChange={setM} />
          <Rueda items={AMPM} value={ap} onChange={setAp} ancho={66} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={confirmar}>Aceptar</button>
        </div>
      </div>
    </div>
  )
}

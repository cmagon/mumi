import { useState, useRef, useEffect, useMemo } from 'react'

// Combobox con BÚSQUEDA EN VIVO: el usuario escribe y la lista se filtra en tiempo real,
// mostrando primero los más parecidos. Reemplaza los <select> largos (MPs, ítems de Alegra...).
//  - opciones: [{ value, label, sub? }]  (sub = texto secundario opcional, ej. precio/unidad)
//  - value: value seleccionado ('' si nada)
//  - onSelect(value, opcion): al elegir
//  - placeholder
// La coincidencia ignora tildes y ordena por: empieza-con > todas las palabras > alguna palabra.
export default function BuscadorSelect({ opciones = [], value = '', onSelect, placeholder = 'Escribe para buscar...', style, disabled = false }) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [idx, setIdx] = useState(0)
  const cajaRef = useRef(null)

  const sel = opciones.find(o => String(o.value) === String(value))
  // Cuando hay selección y no se está escribiendo, el input muestra la etiqueta elegida
  const mostrado = abierto ? texto : (sel?.label || '')

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const filtradas = useMemo(() => {
    const q = norm(texto)
    if (!q) return opciones.slice(0, 30)
    const palabras = q.split(/\s+/).filter(Boolean)
    return opciones
      .map(o => {
        const l = norm(o.label)
        let score = 0
        if (l.startsWith(q)) score = 3
        else if (palabras.every(w => l.includes(w))) score = 2
        else if (palabras.some(w => l.includes(w))) score = 1
        return { o, score }
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || a.o.label.localeCompare(b.o.label))
      .slice(0, 30)
      .map(x => x.o)
  }, [opciones, texto])

  useEffect(() => { setIdx(0) }, [texto, abierto])
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (cajaRef.current && !cajaRef.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const elegir = (o) => { onSelect?.(o.value, o); setAbierto(false); setTexto('') }
  const teclas = (e) => {
    if (!abierto) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, filtradas.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtradas[idx]) elegir(filtradas[idx]) }
    else if (e.key === 'Escape') setAbierto(false)
  }

  return (
    <div ref={cajaRef} style={{ position: 'relative', ...style }}>
      <input className="form-control" disabled={disabled} value={mostrado} placeholder={sel ? sel.label : placeholder}
        onFocus={(e) => { setAbierto(true); setTexto(''); e.target.select() }}
        onChange={e => { setTexto(e.target.value); setAbierto(true) }}
        onKeyDown={teclas} />
      {abierto && (
        <div style={{ position: 'absolute', zIndex: 40, left: 0, right: 0, top: '100%', marginTop: 3, background: 'var(--blanco)', border: '1px solid var(--crema-oscuro)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 240, overflowY: 'auto' }}>
          {filtradas.length === 0
            ? <div style={{ padding: '9px 12px', fontSize: '0.82rem', color: 'var(--texto-suave)' }}>Sin coincidencias con "{texto}"</div>
            : filtradas.map((o, i) => (
              <div key={o.value} onMouseDown={(e) => { e.preventDefault(); elegir(o) }} onMouseEnter={() => setIdx(i)}
                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '0.84rem', background: i === idx ? 'var(--crema)' : 'transparent', borderBottom: i < filtradas.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                <div style={{ fontWeight: String(o.value) === String(value) ? 700 : 400 }}>{o.label}</div>
                {o.sub && <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>{o.sub}</div>}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

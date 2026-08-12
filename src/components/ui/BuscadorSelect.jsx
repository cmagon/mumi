import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'

// Combobox con BÚSQUEDA EN VIVO: el usuario escribe y la lista se filtra en tiempo real,
// mostrando primero los más parecidos. Reemplaza los <select> largos (MPs, ítems de Alegra...).
//  - opciones: [{ value, label, sub?, grupo?, color?, icono? }]
//      sub    = texto secundario opcional (ej. precio/unidad)
//      grupo  = encabezado para agrupar visualmente (ej. "Productos", "Recetas rápidas")
//      color  = color de la barra lateral y del icono, para distinguir tipos de un vistazo
//      icono  = emoji corto que precede la etiqueta
//  - value: value seleccionado ('' si nada)
//  - onSelect(value, opcion): al elegir
//  - placeholder
// La coincidencia ignora tildes y ordena por: empieza-con > todas las palabras > alguna palabra.
// El menú usa position:fixed + portal para no quedar debajo de acordeones/overflow.
export default function BuscadorSelect({ opciones = [], value = '', onSelect, placeholder = 'Escribe para buscar...', style, disabled = false }) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [idx, setIdx] = useState(0)
  const [pos, setPos] = useState(null)
  const cajaRef = useRef(null)
  const menuRef = useRef(null)

  const sel = opciones.find(o => String(o.value) === String(value))
  const mostrado = abierto ? texto : (sel?.label || '')

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const agrupar = (lista) => {
    if (!lista.some(o => o.grupo)) return lista
    const orden = [], porGrupo = new Map()
    for (const o of lista) {
      const g = o.grupo || ''
      if (!porGrupo.has(g)) { porGrupo.set(g, []); orden.push(g) }
      porGrupo.get(g).push(o)
    }
    return orden.flatMap(g => porGrupo.get(g))
  }
  const filtradas = useMemo(() => {
    const q = norm(texto)
    if (!q) return agrupar(opciones.slice(0, 40))
    const palabras = q.split(/\s+/).filter(Boolean)
    const conScore = opciones
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
      .slice(0, 40)
      .map(x => x.o)
    return agrupar(conScore)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opciones, texto])

  const ubicar = useCallback(() => {
    const el = cajaRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const espacioAbajo = window.innerHeight - r.bottom - 12
    const espacioArriba = r.top - 12
    const abrirArriba = espacioAbajo < 220 && espacioArriba > espacioAbajo
    const maxHeight = Math.min(300, Math.max(140, abrirArriba ? espacioArriba : espacioAbajo))
    setPos({
      left: r.left,
      width: Math.max(r.width, 180),
      top: abrirArriba ? undefined : r.bottom + 4,
      bottom: abrirArriba ? window.innerHeight - r.top + 4 : undefined,
      maxHeight,
    })
  }, [])

  useEffect(() => { setIdx(0) }, [texto, abierto])

  useEffect(() => {
    if (!abierto) { setPos(null); return }
    ubicar()
    const fuera = (e) => {
      if (cajaRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setAbierto(false)
    }
    const onScroll = () => ubicar()
    document.addEventListener('mousedown', fuera)
    document.addEventListener('touchstart', fuera)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('touchstart', fuera)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [abierto, ubicar])

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
        style={sel?.color ? { borderLeft: `4px solid ${sel.color}` } : undefined}
        onFocus={(e) => { setAbierto(true); setTexto(''); e.target.select() }}
        onChange={e => { setTexto(e.target.value); setAbierto(true) }}
        onKeyDown={teclas} />
      {abierto && pos && createPortal(
        <div ref={menuRef} style={{
          position: 'fixed', zIndex: 4000, left: pos.left, width: pos.width,
          top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, overflowY: 'auto',
          background: 'var(--blanco, #fff)', border: '1px solid var(--crema-oscuro)',
          borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        }}>
          {filtradas.length === 0
            ? <div style={{ padding: '9px 12px', fontSize: '0.82rem', color: 'var(--texto-suave)' }}>Sin coincidencias con "{texto}"</div>
            : filtradas.map((o, i) => {
              const grupoNuevo = o.grupo && o.grupo !== filtradas[i - 1]?.grupo
              const elegido = String(o.value) === String(value)
              return (
                <div key={o.value}>
                  {grupoNuevo && (
                    <div style={{ padding: '6px 12px 3px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: o.color || 'var(--texto-suave)', background: 'var(--crema)', borderTop: i > 0 ? '1px solid var(--crema-oscuro)' : 'none' }}>
                      {o.grupo}
                    </div>
                  )}
                  <div onMouseDown={(e) => { e.preventDefault(); elegir(o) }} onMouseEnter={() => setIdx(i)}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.84rem',
                      background: i === idx ? 'var(--crema)' : 'transparent',
                      borderLeft: o.color ? `4px solid ${o.color}` : '4px solid transparent',
                      borderBottom: i < filtradas.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                    <div style={{ fontWeight: elegido ? 700 : 400, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {o.icono && <span aria-hidden="true">{o.icono}</span>}
                      <span>{o.label}</span>
                      {elegido && <span style={{ color: 'var(--selva)' }}>✓</span>}
                    </div>
                    {o.sub && <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)', marginLeft: o.icono ? 22 : 0 }}>{o.sub}</div>}
                  </div>
                </div>
              )
            })}
        </div>,
        document.body,
      )}
    </div>
  )
}

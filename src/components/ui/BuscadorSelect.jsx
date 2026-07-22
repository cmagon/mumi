import { useState, useRef, useEffect, useMemo } from 'react'

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
export default function BuscadorSelect({ opciones = [], value = '', onSelect, placeholder = 'Escribe para buscar...', style, disabled = false }) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [idx, setIdx] = useState(0)
  const cajaRef = useRef(null)

  const sel = opciones.find(o => String(o.value) === String(value))
  // Cuando hay selección y no se está escribiendo, el input muestra la etiqueta elegida
  const mostrado = abierto ? texto : (sel?.label || '')

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  // Mantiene juntas las opciones del mismo grupo, respetando el orden en que aparece cada grupo.
  // Sin esto, al ordenar por relevancia los encabezados se repetirían intercalados.
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
        // La barra lateral del campo repite el color del tipo elegido: se ve qué clase de
        // producto está seleccionado sin abrir la lista.
        style={sel?.color ? { borderLeft: `4px solid ${sel.color}` } : undefined}
        onFocus={(e) => { setAbierto(true); setTexto(''); e.target.select() }}
        onChange={e => { setTexto(e.target.value); setAbierto(true) }}
        onKeyDown={teclas} />
      {abierto && (
        <div style={{ position: 'absolute', zIndex: 40, left: 0, right: 0, top: '100%', marginTop: 3, background: 'var(--blanco, #fff)', border: '1px solid var(--crema-oscuro)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 300, overflowY: 'auto' }}>
          {filtradas.length === 0
            ? <div style={{ padding: '9px 12px', fontSize: '0.82rem', color: 'var(--texto-suave)' }}>Sin coincidencias con "{texto}"</div>
            : filtradas.map((o, i) => {
              // Encabezado de grupo cuando cambia respecto de la opción anterior
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
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useEffect, useCallback, Children, isValidElement } from 'react'

// Desplegable PROPIO de la app, con la MISMA API que un <select> nativo.
//
// Se usa igual que antes — <Select value={x} onChange={e => setX(e.target.value)}> con <option>
// e <optgroup> adentro — para que reemplazarlo sea mecánico y sin reescribir los manejadores.
// El motivo de no usar el nativo: cada navegador y cada sistema lo pinta a su manera (en Android
// abre una hoja gris a pantalla completa), así que la app se veía distinta en cada dispositivo.
//
// Extras sobre el nativo:
//  - Se puede buscar escribiendo cuando hay muchas opciones (umbral: BUSCAR_DESDE)
//  - El menú se posiciona con position:fixed, así no lo recorta el modal ni la tabla que lo contiene
//  - Objetivos táctiles grandes, pensados para tablet

const BUSCAR_DESDE = 8   // a partir de cuántas opciones aparece el campo de búsqueda

// Aplana los <option>/<optgroup> hijos a una lista plana con su grupo
function leerOpciones(children) {
  const out = []
  const rec = (nodes, grupo) => {
    Children.forEach(nodes, (ch) => {
      if (!isValidElement(ch)) return
      if (ch.type === 'optgroup') { rec(ch.props.children, ch.props.label); return }
      if (ch.type === 'option') {
        const label = Children.toArray(ch.props.children).filter(c => typeof c === 'string' || typeof c === 'number').join('')
        out.push({ value: String(ch.props.value ?? label), label: label || String(ch.props.value ?? ''), grupo, disabled: !!ch.props.disabled })
      }
    })
  }
  rec(children, undefined)
  return out
}

export default function Select({
  value, onChange, children, className = 'form-control', style, disabled = false,
  title, placeholder = 'Seleccionar…', id, name, 'aria-label': ariaLabel,
}) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState('')
  const [idx, setIdx] = useState(0)
  const [pos, setPos] = useState(null)
  const trigRef = useRef(null)
  const menuRef = useRef(null)
  const buscaRef = useRef(null)

  const opciones = leerOpciones(children)
  const sel = opciones.find(o => String(o.value) === String(value ?? ''))
  const conBusqueda = opciones.length >= BUSCAR_DESDE

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const filtradas = !busca ? opciones : opciones.filter(o => norm(o.label).includes(norm(busca)))

  // El menú se ancla al disparador en coordenadas de ventana (fixed): así no lo recorta
  // ningún contenedor con overflow, que es lo que pasaba dentro de modales y tablas.
  const ubicar = useCallback(() => {
    const el = trigRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const alto = Math.min(300, Math.max(160, window.innerHeight - r.bottom - 16))
    const arriba = window.innerHeight - r.bottom < 200 && r.top > window.innerHeight - r.bottom
    setPos({ left: r.left, width: r.width, top: arriba ? undefined : r.bottom + 4, bottom: arriba ? window.innerHeight - r.top + 4 : undefined, maxHeight: arriba ? Math.min(300, r.top - 16) : alto })
  }, [])

  useEffect(() => {
    if (!abierto) return
    ubicar()
    const cerrar = (e) => {
      if (trigRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setAbierto(false)
    }
    const onScroll = () => ubicar()
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('touchstart', cerrar)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('touchstart', cerrar)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [abierto, ubicar])

  useEffect(() => {
    if (!abierto) { setBusca(''); return }
    const i = filtradas.findIndex(o => String(o.value) === String(value ?? ''))
    setIdx(i >= 0 ? i : 0)
    if (conBusqueda) setTimeout(() => buscaRef.current?.focus(), 10)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  const elegir = (o) => {
    if (o.disabled) return
    // Se imita el evento del <select> nativo para no tener que tocar los onChange existentes
    onChange?.({ target: { value: o.value, name } })
    setAbierto(false)
  }

  const teclas = (e) => {
    if (!abierto) {
      if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setAbierto(true) }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, filtradas.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtradas[idx]) elegir(filtradas[idx]) }
    else if (e.key === 'Escape') { e.preventDefault(); setAbierto(false); trigRef.current?.focus() }
    else if (e.key === 'Tab') setAbierto(false)
  }

  return (
    <>
      <div ref={trigRef} id={id} role="combobox" aria-expanded={abierto} aria-haspopup="listbox"
        aria-label={ariaLabel} title={title} tabIndex={disabled ? -1 : 0}
        className={className}
        onKeyDown={teclas}
        onClick={() => !disabled && setAbierto(a => !a)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1, userSelect: 'none', minHeight: 38, ...style,
        }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: sel ? 'inherit' : 'var(--texto-suave)' }}>
          {sel ? sel.label : placeholder}
        </span>
        <span aria-hidden="true" style={{ fontSize: '0.7rem', color: 'var(--texto-suave)', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
      </div>

      {abierto && pos && (
        <div ref={menuRef} role="listbox"
          style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom,
            maxHeight: pos.maxHeight, overflowY: 'auto', zIndex: 3000,
            background: '#fff', border: '1px solid var(--crema-oscuro)', borderRadius: 8,
            boxShadow: '0 10px 30px rgba(0,0,0,0.18)' }}>
          {conBusqueda && (
            <div style={{ position: 'sticky', top: 0, background: '#fff', padding: 6, borderBottom: '1px solid var(--crema-oscuro)' }}>
              <input ref={buscaRef} className="form-control" value={busca} placeholder="Buscar…"
                onChange={e => { setBusca(e.target.value); setIdx(0) }} onKeyDown={teclas}
                style={{ fontSize: '0.84rem', padding: '5px 8px' }} />
            </div>
          )}
          {filtradas.length === 0
            ? <div style={{ padding: '10px 12px', fontSize: '0.82rem', color: 'var(--texto-suave)' }}>Sin coincidencias</div>
            : filtradas.map((o, i) => {
              const grupoNuevo = o.grupo && o.grupo !== filtradas[i - 1]?.grupo
              const elegido = String(o.value) === String(value ?? '')
              return (
                <div key={`${o.value}-${i}`}>
                  {grupoNuevo && (
                    <div style={{ padding: '6px 12px 3px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: .4, color: 'var(--texto-suave)', background: 'var(--crema)' }}>{o.grupo}</div>
                  )}
                  <div role="option" aria-selected={elegido}
                    onMouseDown={(e) => { e.preventDefault(); elegir(o) }}
                    onMouseEnter={() => setIdx(i)}
                    style={{ padding: '9px 12px', cursor: o.disabled ? 'not-allowed' : 'pointer', fontSize: '0.86rem',
                      opacity: o.disabled ? 0.5 : 1,
                      background: i === idx ? 'var(--crema)' : 'transparent',
                      fontWeight: elegido ? 700 : 400,
                      color: elegido ? 'var(--selva)' : 'inherit',
                      display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1 }}>{o.label}</span>
                    {elegido && <span aria-hidden="true">✓</span>}
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </>
  )
}

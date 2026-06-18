// Acordeón para versiones móviles. Usa <details> nativo (sin estado JS).
// Renderiza dentro de un contenedor .solo-movil para que solo aparezca en teléfono.

export function AccordionItem({ titulo, sub, children, defaultOpen = false }) {
  return (
    <details className="acordeon-item" open={defaultOpen}>
      <summary>
        <span style={{ minWidth: 0 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo}</div>
          {sub && <div className="acordeon-sub">{sub}</div>}
        </span>
      </summary>
      <div className="acordeon-body">{children}</div>
    </details>
  )
}

// Fila etiqueta → valor dentro del cuerpo del acordeón
export function Fila({ et, children }) {
  return (
    <div className="acordeon-fila">
      <span className="et">{et}</span>
      <span style={{ textAlign: 'right' }}>{children}</span>
    </div>
  )
}

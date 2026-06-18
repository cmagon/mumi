import { useState } from 'react'

// Hook reutilizable para reordenar filas de una lista (estado array) con arrastrar y soltar.
// Efectos visuales: la fila arrastrada se atenúa, aparece una línea donde se soltará y la
// imagen de arrastre es la fila completa.
//
// Uso:
//   const ord = useReorder(setLista)
//   <div className={ord.rowClassName(i)} {...ord.rowProps(i)}>
//     <span {...ord.handleProps(i)}>⠿</span> ...
//   </div>
export function useReorder(setList) {
  const [from, setFrom] = useState(null)   // índice que se arrastra
  const [over, setOver] = useState(null)   // índice sobre el que se está

  const mover = (desde, hasta) => {
    if (desde == null || hasta == null || desde === hasta) return
    setList(prev => {
      if (hasta < 0 || hasta >= prev.length) return prev
      const next = [...prev]
      const [m] = next.splice(desde, 1)
      next.splice(hasta, 0, m)
      return next
    })
  }

  const rowClassName = (i) =>
    `ed-row${from === i ? ' ed-arrastrando' : ''}${over === i && from !== i ? ` ed-soltar-${from != null && i < from ? 'antes' : 'despues'}` : ''}`

  const rowProps = (i) => ({
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== i) setOver(i) },
    onDrop: (e) => { e.preventDefault(); mover(from, i); setFrom(null); setOver(null) },
  })

  const handleProps = (i) => ({
    draggable: true,
    onDragStart: (e) => {
      setFrom(i)
      e.dataTransfer.effectAllowed = 'move'
      // Usa la FILA COMPLETA como imagen de arrastre (no solo el asa)
      const fila = e.currentTarget.closest('.ed-row')
      if (fila) { try { e.dataTransfer.setDragImage(fila, 24, 24) } catch { /* navegadores sin soporte */ } }
    },
    onDragEnd: () => { setFrom(null); setOver(null) },
    title: 'Arrastra para reordenar',
    style: { cursor: 'grab', color: 'var(--texto-suave)', fontSize: '1rem', userSelect: 'none', padding: '0 2px' },
  })

  // Botones ↑/↓ (alternativa táctil)
  const moverArriba = (i) => mover(i, i - 1)
  const moverAbajo  = (i) => mover(i, i + 1)

  return { rowClassName, rowProps, handleProps, moverArriba, moverAbajo }
}

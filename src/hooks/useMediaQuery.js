import { useState, useEffect } from 'react'

// Devuelve true/false según una media query de CSS, y se actualiza al rotar o redimensionar.
// Se usa para cambiar COMPORTAMIENTO (no solo estilo) en pantallas pequeñas: por ejemplo, que
// los acordeones de la ficha se abran de a uno en el celular pero varios a la vez en escritorio.
export function useMediaQuery(query) {
  const [coincide, setCoincide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false
  )
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(query)
    const on = (e) => setCoincide(e.matches)
    setCoincide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return coincide
}

// Atajo para el corte que ya usa la app entre tarjeta (móvil/tablet) y tabla (escritorio)
export const usePantallaChica = () => useMediaQuery('(max-width: 1024px)')

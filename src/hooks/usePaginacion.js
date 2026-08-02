import { useState, useMemo, useEffect } from 'react'

const TAMANOS = [10, 20, 30]

/**
 * Pagina un arreglo ya filtrado en memoria.
 * resetDeps: cuando cambian (filtros, búsqueda…), vuelve a la página 1.
 */
export function usePaginacion(items, { defaultSize = 10, resetDeps = [] } = {}) {
  const [pagina, setPagina] = useState(1)
  const [tam, setTam] = useState(defaultSize)

  const total = items.length
  const totalPaginas = Math.max(1, Math.ceil(total / tam) || 1)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPagina(1) }, [total, tam, ...resetDeps])

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas)
  }, [pagina, totalPaginas])

  const slice = useMemo(() => {
    const desde = (pagina - 1) * tam
    return items.slice(desde, desde + tam)
  }, [items, pagina, tam])

  const desde = total === 0 ? 0 : (pagina - 1) * tam + 1
  const hasta = Math.min(pagina * tam, total)

  const setTamPagina = (n) => {
    const v = Number(n)
    if (TAMANOS.includes(v)) setTam(v)
  }

  return {
    pagina, setPagina, tam, setTam: setTamPagina, total, totalPaginas,
    slice, desde, hasta, tamanos: TAMANOS,
  }
}

/** Ventana de números de página con elipsis cuando hay muchas. */
export function ventanaPaginas(actual, total) {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, total])
  for (let p = actual - 2; p <= actual + 2; p++) {
    if (p >= 1 && p <= total) pages.add(p)
  }
  const sorted = [...pages].sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…')
    out.push(sorted[i])
  }
  return out
}

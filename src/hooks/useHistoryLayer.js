import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Trata un modal o vista interna como subpágina del historial.
 * Atrás del navegador cierra el modal; el botón Cerrar hace lo mismo.
 *
 * Importante: solo cierra cuando la capa YA estuvo confirmada en el historial
 * y luego desaparece (pop). Así no se cierra al abrir por una carrera entre
 * el push y el primer render.
 */
export function useHistoryLayer(open, onClose, layerId) {
  const location = useLocation()
  const navigate = useNavigate()
  const pushedRef = useRef(false)
  const confirmedRef = useRef(false)
  const skipNextPopClose = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Al abrir: apilar capa en el historial
  useEffect(() => {
    if (!open || !layerId) {
      if (!open) {
        pushedRef.current = false
        confirmedRef.current = false
      }
      return
    }
    if (location.state?._layer === layerId) {
      pushedRef.current = true
      confirmedRef.current = true
      return
    }
    if (pushedRef.current) return
    pushedRef.current = true
    navigate(`${location.pathname}${location.search || ''}`, {
      state: { ...(location.state || {}), _layer: layerId },
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, layerId])

  // Confirmar capa / cerrar solo tras un pop real
  useEffect(() => {
    if (!open || !layerId) return
    if (location.state?._layer === layerId) {
      confirmedRef.current = true
      pushedRef.current = true
      return
    }
    // Aún no confirmamos la capa → no cerrar (el push puede estar en vuelo)
    if (!confirmedRef.current) return
    // La capa estuvo y ya no está → Atrás
    confirmedRef.current = false
    pushedRef.current = false
    if (skipNextPopClose.current) {
      skipNextPopClose.current = false
      return
    }
    onCloseRef.current?.()
  }, [location.key, location.state, open, layerId])

  const requestClose = useCallback(() => {
    if (pushedRef.current && (confirmedRef.current || location.state?._layer === layerId)) {
      skipNextPopClose.current = true
      pushedRef.current = false
      confirmedRef.current = false
      onCloseRef.current?.()
      navigate(-1)
      return
    }
    onCloseRef.current?.()
  }, [layerId, location.state, navigate])

  return requestClose
}

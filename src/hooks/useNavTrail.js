import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Navegación entre módulos con acciones one-shot (verOrden, filtrarProducto…).
 * Sin migas de pan: el historial del navegador + Atrás bastan.
 */
export function useNavTrail() {
  const location = useLocation()
  const navigate = useNavigate()

  /** Limpia acciones one-shot del state; conserva `_layer` si hay modal abierto */
  const consumeArrival = useCallback(() => {
    const layer = location.state?._layer
    navigate(location.pathname, {
      replace: true,
      state: layer ? { _layer: layer } : {},
    })
  }, [location.pathname, location.state, navigate])

  /** Ir a otra ruta con state de acción (queda en el historial → Atrás vuelve) */
  const pushTo = useCallback((to, actionState = {}) => {
    navigate(to, { state: actionState || {} })
  }, [navigate])

  return { pushTo, consumeArrival, navigate }
}

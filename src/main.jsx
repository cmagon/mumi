import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { asegurarBuildActual } from './lib/purgarCache'
import App from './App'
// index.css carga Tailwind (sin preflight) + el CSS propio en la capa `app` (ver index.css)
import './index.css'

/* global __MUMI_BUILD__ — inyectado en vite.config.js en cada deploy */
const MUMI_BUILD = typeof __MUMI_BUILD__ !== 'undefined' ? __MUMI_BUILD__ : 'dev'

// Deploy nuevo → purga SW + caches + React Query y recarga.
// No bloquea el montaje: si reload falla, la app no queda en blanco.
asegurarBuildActual(MUMI_BUILD)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5 minutos. refetchOnMount y refetchOnWindowFocus solo recargan las consultas
      // VENCIDAS, así que con los 20s de antes TODO estaba siempre vencido: cada cambio
      // de módulo y cada vuelta a la pestaña disparaba de nuevo las consultas del
      // módulo entero. Eso es lo que hacía sentir que la app "vuelve a jalar toda la
      // base de datos" todo el tiempo.
      //
      // Subirlo no deja datos viejos a la vista: después de cada guardado la app llama a
      // invalidateQueries (hay ~170 llamadas repartidas por los módulos), que recarga al
      // instante lo que acaba de cambiar. El reloj solo cubre los cambios hechos por
      // OTRO usuario, y para eso 5 minutos —o volver a la pestaña— es suficiente.
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,               // caché en memoria 30 min (ya no se persiste a disco)
      retry: 3,                             // reintenta si el servidor está lento/falla
      retryDelay: (a) => Math.min(1000 * 2 ** a, 8000),
      refetchOnMount: true,                 // recarga al entrar a cada módulo si los datos están viejos
      refetchOnWindowFocus: true,           // recarga al volver a la pestaña del navegador
      refetchOnReconnect: true,             // recarga al recuperar la conexión
      networkMode: 'online',
    },
  },
})

// La app trabaja SIEMPRE en línea: se retiró la persistencia del caché en IndexedDB (que
// serializaba todo el caché a disco cada pocos segundos, un costo notable al editar órdenes).
// Sin conexión, App muestra la página "Sin conexión" en vez de datos viejos.

// Tras un despliegue nuevo, una pestaña abierta sigue pidiendo los chunks de la versión
// anterior; si el archivo ya no está, el import dinámico falla y el módulo no abre
// (pantalla en blanco). Vite avisa con este evento y se recarga para tomar la versión
// nueva.
//
// Se guarda CUÁNDO fue la última recarga por esta causa y no se repite en el minuto
// siguiente: si el chunk falla por algo que recargar no arregla (sin conexión, archivo
// que de verdad no existe) la app muestra el error normal en lugar de quedarse recargando
// en bucle. Pasado el minuto vuelve a estar disponible, así un despliegue posterior
// también se recupera solo.
window.addEventListener('vite:preloadError', (e) => {
  const ultima = Number(sessionStorage.getItem('recargaPorVersion') || 0)
  if (Date.now() - ultima < 60_000) return
  e.preventDefault()
  sessionStorage.setItem('recargaPorVersion', String(Date.now()))
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)

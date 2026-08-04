import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { get, set, del } from 'idb-keyval'
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
      gcTime: 1000 * 60 * 60 * 24 * 7,      // conserva el caché 7 días (necesario para persistir offline)
      retry: 3,                             // reintenta si el servidor está lento/falla
      retryDelay: (a) => Math.min(1000 * 2 ** a, 8000),
      refetchOnMount: true,                 // recarga al entrar a cada módulo si los datos están viejos
      refetchOnWindowFocus: true,           // recarga al volver a la pestaña del navegador
      refetchOnReconnect: true,             // recarga al recuperar la conexión
      // 'online': sin conexión las consultas se PAUSAN y se muestra lo último cacheado
      // (con 'always' se ejecutaban offline y devolvían [] pisando el caché).
      networkMode: 'online',
    },
  },
})

// Consultas que NO se guardan en IndexedDB. Todo lo persistido hay que leerlo y
// deserializarlo en CADA arranque antes de pintar la app, así que solo vale la pena
// guardar lo que de verdad sirve sin conexión. Estas quedan fuera porque cambian cada
// pocos segundos (notificaciones), porque son analíticas de escritorio, o porque sin red
// no significan nada (enlaces compartidos, llamadas a Alegra, fotos de la galería).
const SIN_PERSISTIR = new Set([
  'notifications', 'dev_user_switch', 'password_requests',
  'alegra_ventas_hist', 'gallery',
  'share', 'share_live_docs', 'share_orden_paths', 'share_solicitudes',
  'catalogo_visitas', 'catalogo_pedidos', 'catalogo_subs',
])

// Persistencia de la caché en IndexedDB → lectura offline (último estado disponible sin conexión)
const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get(key),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'mumi-query-cache',
  // Cada escritura serializa el caché COMPLETO a JSON. Con 1s, editar una orden de
  // producción rehacía ese trabajo una vez por segundo en el hilo principal.
  throttleTime: 3000,
})

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
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          // Al cambiar el build, React Query descarta el IndexedDB persistido.
          buster: MUMI_BUILD,
          maxAge: 1000 * 60 * 60 * 24 * 7,   // 7 días
          dehydrateOptions: {
            shouldDehydrateQuery: (q) =>
              q.state.status === 'success' && !SIN_PERSISTIR.has(String(q.queryKey?.[0])),
          },
        }}
      >
        <AuthProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)

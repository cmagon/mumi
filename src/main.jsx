import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { get, set, del } from 'idb-keyval'
import { AuthProvider } from './context/AuthContext'
import { ConfirmProvider } from './context/ConfirmContext'
import App from './App'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 20,                 // 20s en caché → al cambiar de módulo recarga si pasó ese tiempo
      gcTime: 1000 * 60 * 60 * 24,          // conserva el caché 24h (necesario para persistir offline)
      retry: 3,                             // reintenta si el servidor está lento/falla
      retryDelay: (a) => Math.min(1000 * 2 ** a, 8000),
      refetchOnMount: true,                 // recarga al entrar a cada módulo si los datos están viejos
      refetchOnWindowFocus: true,           // recarga al volver a la pestaña del navegador
      refetchOnReconnect: true,             // recarga al recuperar la conexión
      networkMode: 'always',
    },
  },
})

// Persistencia de la caché en IndexedDB → lectura offline (último estado disponible sin conexión)
const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get(key),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'mumi-query-cache',
  throttleTime: 1000,
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}  // 24h
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

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { ConfirmProvider } from './context/ConfirmContext'
import App from './App'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 20,                 // 20s en caché → al cambiar de módulo recarga si pasó ese tiempo
      gcTime: 1000 * 60 * 10,               // conserva el caché 10 min (no se pierde al navegar)
      retry: 3,                             // reintenta si el servidor está lento/falla
      retryDelay: (a) => Math.min(1000 * 2 ** a, 8000),
      refetchOnMount: true,                 // recarga al entrar a cada módulo si los datos están viejos
      refetchOnWindowFocus: true,           // recarga al volver a la pestaña del navegador
      refetchOnReconnect: true,             // recarga al recuperar la conexión
      networkMode: 'always',
    },
  },
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

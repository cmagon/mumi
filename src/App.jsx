import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'
import { puedeVer } from './lib/permisos'
import { loadConfig } from './lib/appConfig'
import Sidebar from './components/Layout/Sidebar'
import MobileHeader from './components/Layout/MobileHeader'
import AttendanceModal from './components/AttendanceModal'
import ConnStatus from './components/ConnStatus'
import SavingOverlay from './components/ui/SavingOverlay'
import Login from './pages/Login'
import Compartido from './pages/Compartido'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import Costos from './pages/Costos'
import Receta from './pages/Receta'
import Inventario from './pages/Inventario'
import ProductosTerminados from './pages/ProductosTerminados'
import ProductosPorEmpacar from './pages/ProductosPorEmpacar'
import Produccion from './pages/Produccion'
import OrdenesProduccion from './pages/OrdenesProduccion'
import Nomina from './pages/Nomina'
import Clientes from './pages/Clientes'
import Galeria from './pages/Galeria'
import Documentos from './pages/Documentos'
import Registros from './pages/Registros'
import Calidad from './pages/Calidad'
import Capacitacion from './pages/Capacitacion'
import Configuracion from './pages/Configuracion'
import Usuarios from './pages/Usuarios'

// Etiqueta automáticamente cada celda de tabla con el texto de su encabezado (data-label),
// para que en móvil las tablas se vean como tarjetas legibles. No requiere tocar cada tabla.
function useResponsiveTableLabels() {
  useEffect(() => {
    const aplicar = () => {
      document.querySelectorAll('.table-wrap table').forEach(table => {
        const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim())
        if (!headers.length) return
        table.querySelectorAll('tbody tr').forEach(tr => {
          const tds = tr.querySelectorAll('td')
          if (tds.length <= 1) return  // filas vacías / con colspan
          // si alguna celda tiene colspan, no etiquetamos (los índices no calzan)
          if ([...tds].some(td => td.colSpan > 1)) return
          tds.forEach((td, i) => { if (headers[i]) td.setAttribute('data-label', headers[i]) })
        })
      })
    }
    aplicar()
    // Reaplica cuando cambian los datos (filas agregadas/quitadas)
    const obs = new MutationObserver(aplicar)
    obs.observe(document.body, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])
}

function ProtectedLayout() {
  const { user, profile, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [asistModo, setAsistModo] = useState(null)   // null | 'login' | 'logout'
  const loginPreguntado = useRef(false)
  useEffect(() => { loadConfig() }, [])
  useResponsiveTableLabels()

  // Empleado vinculado al usuario (por nombre). Los admin no fichan asistencia.
  const esEmpleadoFichable = !!profile && profile.rol !== 'admin'
  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*'); return data || [] },
    enabled: esEmpleadoFichable,
  })
  const empVinculado = esEmpleadoFichable ? empleados.find(e => e.nombre === profile?.nombre) : null

  // Al entrar: mostrar el modal de asistencia una sola vez
  useEffect(() => {
    if (empVinculado && !loginPreguntado.current) { loginPreguntado.current = true; setAsistModo('login') }
  }, [empVinculado])

  const cerrarSesion = async () => { setAsistModo(null); await signOut(); navigate('/login') }
  const pedirCierre = () => { if (empVinculado) setAsistModo('logout'); else cerrarSesion() }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--crema)' }}>
        <div style={{ fontFamily: "'Playfair Display', serif", color: 'var(--selva)', fontSize: '1.4rem' }}>
          🌿 Cargando...
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <div id="app">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={pedirCierre}
        puedeFichar={!!empVinculado}
        onRegistrarAsistencia={() => { setSidebarOpen(false); setAsistModo('login') }}
      />
      <MobileHeader onMenuClick={() => setSidebarOpen(true)} />
      <main className="main-content">
        <Outlet />
      </main>
      <div id="toast-container" role="status" aria-live="polite" aria-atomic="false" />
      <ConnStatus />
      <SavingOverlay />
      {asistModo && empVinculado && (
        <AttendanceModal
          emp={empVinculado}
          modo={asistModo}
          onClose={() => setAsistModo(null)}
          onLogout={cerrarSesion}
        />
      )}
    </div>
  )
}

function AdminRoute({ children }) {
  const { profile } = useAuth()
  if (profile && profile.rol !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

// Bloquea el acceso a un módulo si el rol no tiene permiso
function ModRoute({ modulo, children }) {
  const { profile } = useAuth()
  if (profile && !puedeVer(profile.rol, modulo)) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/compartido/:token" element={<ErrorBoundary><Compartido /></ErrorBoundary>} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"   element={<Dashboard />} />
        <Route path="/costos"      element={<ModRoute modulo="costos"><Costos /></ModRoute>} />
        <Route path="/receta"      element={<ModRoute modulo="costos"><Receta /></ModRoute>} />
        <Route path="/inventario"  element={<ModRoute modulo="inventario"><Inventario /></ModRoute>} />
        <Route path="/terminados"  element={<ModRoute modulo="terminados"><ProductosTerminados /></ModRoute>} />
        <Route path="/porempacar"  element={<ModRoute modulo="porempacar"><ProductosPorEmpacar /></ModRoute>} />
        <Route path="/produccion"  element={<ModRoute modulo="produccion"><Produccion /></ModRoute>} />
        <Route path="/ordenes"     element={<ModRoute modulo="ordenes"><OrdenesProduccion /></ModRoute>} />
        <Route path="/nomina"      element={<ModRoute modulo="nomina"><Nomina /></ModRoute>} />
        <Route path="/clientes"    element={<ModRoute modulo="clientes"><Clientes /></ModRoute>} />
        <Route path="/galeria"     element={<ModRoute modulo="galeria"><Galeria /></ModRoute>} />
        <Route path="/documentos"  element={<ModRoute modulo="documentos"><Documentos /></ModRoute>} />
        <Route path="/registros"   element={<ModRoute modulo="registros"><Registros /></ModRoute>} />
        <Route path="/calidad"     element={<ModRoute modulo="calidad"><Calidad /></ModRoute>} />
        <Route path="/capacitacion" element={<ModRoute modulo="capacitacion"><Capacitacion /></ModRoute>} />
        <Route path="/configuracion" element={<AdminRoute><Configuracion /></AdminRoute>} />
        <Route path="/usuarios"    element={<AdminRoute><Usuarios /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

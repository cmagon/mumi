import { lazy, Suspense, useState, useEffect } from 'react'
import { Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
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
import DownloadProgress from './components/ui/DownloadProgress'
import DevModeBanner from './components/DevModeBanner'
import ErrorBoundary from './components/ErrorBoundary'
import { sincronizarStockAlegra } from './lib/syncAlegra'

// Cada módulo se descarga al abrirlo: las herramientas pesadas (PDF, Excel y gráficas) no
// bloquean el primer render del tablero ni la pantalla de inicio de sesión.
const Login = lazy(() => import('./pages/Login'))
const Compartido = lazy(() => import('./pages/Compartido'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Costos = lazy(() => import('./pages/Costos'))
const Receta = lazy(() => import('./pages/Receta'))
const Inventario = lazy(() => import('./pages/Inventario'))
const ProductosTerminados = lazy(() => import('./pages/ProductosTerminados'))
const ProductosPorEmpacar = lazy(() => import('./pages/ProductosPorEmpacar'))
const Produccion = lazy(() => import('./pages/Produccion'))
const OrdenesProduccion = lazy(() => import('./pages/OrdenesProduccion'))
const Nomina = lazy(() => import('./pages/Nomina'))
const Clientes = lazy(() => import('./pages/Clientes'))
const Catalogo = lazy(() => import('./pages/Catalogo'))
const Galeria = lazy(() => import('./pages/Galeria'))
const Documentos = lazy(() => import('./pages/Documentos'))
const Registros = lazy(() => import('./pages/Registros'))
const Calidad = lazy(() => import('./pages/Calidad'))
const Capacitacion = lazy(() => import('./pages/Capacitacion'))
const Configuracion = lazy(() => import('./pages/Configuracion'))
const Usuarios = lazy(() => import('./pages/Usuarios'))

function PageFallback() {
  return <div className="page-loading" role="status">Cargando módulo…</div>
}

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
  const { user, profile, loading, signOut, rolEfectivo, esDevPreview } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [asistModo, setAsistModo] = useState(null)   // null | 'login' | 'logout'
  useEffect(() => { loadConfig() }, [])
  useResponsiveTableLabels()

  // Al abrir la app (admin), trae de Alegra las ventas/remisiones para que el stock de producto
  // terminado baje solo cuando se factura, sin depender de que alguien pulse el botón manual.
  // Es silencioso y con enfriamiento; el cron del servidor (si está configurado) lo complementa.
  useEffect(() => {
    if (profile?.rol === 'admin') sincronizarStockAlegra()
  }, [profile?.rol])

  // Empleado vinculado al usuario (por nombre). Los admin no fichan asistencia.
  // En "vista de rol" se usa el rol EFECTIVO para reflejar lo que ese rol vería.
  const esEmpleadoFichable = !!profile && rolEfectivo !== 'admin'
  // Consulta idéntica a la de Nómina para compartir su caché (misma clave, mismo select y
  // mismo orden). Si difiere aunque sea en el .order(), ambas se sobrescriben en vez de
  // reutilizarse.
  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').order('nombre'); return data || [] },
    enabled: esEmpleadoFichable,
  })
  const empVinculado = esEmpleadoFichable ? empleados.find(e => e.nombre === profile?.nombre) : null

  // Al INICIAR SESIÓN: mostrar el modal de asistencia una sola vez.
  // Se usa sessionStorage (persiste entre RECARGAS de la misma sesión, pero se limpia al
  // cerrar sesión), así el modal NO reaparece cada vez que el operario recarga la página.
  useEffect(() => {
    if (!empVinculado || !profile?.id) return
    if (sessionStorage.getItem('asistPreguntada') === String(profile.id)) return
    sessionStorage.setItem('asistPreguntada', String(profile.id))
    setAsistModo('login')
  }, [empVinculado, profile?.id])

  const cerrarSesion = async () => { setAsistModo(null); sessionStorage.removeItem('asistPreguntada'); await signOut(); navigate('/login') }
  const pedirCierre = () => { if (empVinculado) setAsistModo('logout'); else cerrarSesion() }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, height: '100vh', background: 'var(--crema)' }}>
        <div style={{
          width: 84, height: 84, borderRadius: '50%',
          border: '7px solid rgba(45,90,61,0.15)', borderTopColor: 'var(--selva)',
          animation: 'spin 0.9s linear infinite',
        }} />
        <div style={{ fontFamily: "var(--fuente-titulos, 'Playfair Display'), serif", color: 'var(--selva)', fontSize: '2rem', fontWeight: 700, letterSpacing: 1 }}>
          Cargando…
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
        puedeFichar={esDevPreview ? (rolEfectivo !== 'admin') : !!empVinculado}
        onRegistrarAsistencia={() => { setSidebarOpen(false); if (esDevPreview && !empVinculado) return; setAsistModo('login') }}
      />
      <MobileHeader onMenuClick={() => setSidebarOpen(true)} onLogout={pedirCierre} />
      <main className="main-content">
        <DevModeBanner />
        {/* resetKey = ruta: si un módulo falla, al elegir otro en el menú el error se limpia solo */}
        <ErrorBoundary resetKey={location.pathname}><Outlet /></ErrorBoundary>
      </main>
      <div id="toast-container" role="status" aria-live="polite" aria-atomic="false" />
      <ConnStatus />
      <SavingOverlay />
      <DownloadProgress />
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
  const { rolEfectivo, profile } = useAuth()
  if (profile && rolEfectivo !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

// Bloquea el acceso a un módulo si el rol no tiene permiso
function ModRoute({ modulo, children }) {
  const { rolEfectivo, profile } = useAuth()
  if (profile && !puedeVer(rolEfectivo, modulo)) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
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
        <Route path="/catalogo"    element={<ModRoute modulo="catalogo"><Catalogo /></ModRoute>} />
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
    </Suspense>
  )
}

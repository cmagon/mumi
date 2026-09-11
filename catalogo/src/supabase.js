import { createClient } from '@supabase/supabase-js'

// Cliente Supabase del catálogo público: solo lectura de la VISTA catalogo_productos y
// config_catalogo; inserción de visitas y pedidos. Nunca toca tablas del sistema principal.
// Fallback a los valores públicos (mismos de wrangler.catalogo.jsonc): la anon key es
// publishable y ya es pública, así que el catálogo no debe crashear si el build no
// inyectó las variables VITE_ (evita "supabaseUrl is required" y pantalla en blanco).
const url = import.meta.env.VITE_SUPABASE_URL || 'https://awjvggpeuxayvnreldvw.supabase.co'
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_dSxnLZKF7Ji7vRPFRXQQdg__8kwhoeR'

// Sesión del CLIENTE (login sin contraseña por OTP). Se persiste con una clave propia
// para no colisionar con la del panel admin (otro origen, pero por si acaso). Los
// clientes autenticados NO acceden a datos del negocio: las tablas sensibles exigen
// is_catalog_admin() (ver migración v168).
export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'mumi-catalogo-auth',
  },
})

// Cliente SIEMPRE anónimo, sin sesión, para las lecturas PÚBLICAS del catálogo
// (productos, config, banners, frutos). Aísla esas lecturas de la sesión del cliente:
// si un visitante tiene un token de sesión viejo/expirado en su navegador, ese token NO
// se adjunta aquí, así que el catálogo carga igual (evita "se ve el diseño pero sin datos").
export const supabasePublic = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

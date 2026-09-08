import { createClient } from '@supabase/supabase-js'

// Cliente Supabase del catálogo público: solo lectura de la VISTA catalogo_productos y
// config_catalogo; inserción de visitas y pedidos. Nunca toca tablas del sistema principal.
// Fallback a los valores públicos (mismos de wrangler.catalogo.jsonc): la anon key es
// publishable y ya es pública, así que el catálogo no debe crashear si el build no
// inyectó las variables VITE_ (evita "supabaseUrl is required" y pantalla en blanco).
const url = import.meta.env.VITE_SUPABASE_URL || 'https://awjvggpeuxayvnreldvw.supabase.co'
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_dSxnLZKF7Ji7vRPFRXQQdg__8kwhoeR'

export const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
})

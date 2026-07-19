import { createClient } from '@supabase/supabase-js'

// Cliente Supabase del catálogo público: solo lectura de la VISTA catalogo_productos y
// config_catalogo; inserción de visitas y pedidos. Nunca toca tablas del sistema principal.
const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
})

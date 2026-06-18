import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente SOLO para crear usuarios (signUp): no persiste sesión, así no reemplaza
// la sesión del admin que está creando el usuario.
export const supabaseSignup = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Helper: subir archivo a Storage y retornar URL pública
export async function uploadFile(bucket, path, file) {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) throw error
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
  return urlData.publicUrl
}

// Helper: subir base64 a Storage
export async function uploadBase64(bucket, path, base64String, contentType = 'image/jpeg') {
  const res = await fetch(base64String)
  const blob = await res.blob()
  return uploadFile(bucket, path, blob)
}

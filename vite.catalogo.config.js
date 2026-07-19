import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'

// Segundo build: catálogo público (Worker "catalogo"). Comparte node_modules y las
// variables de entorno (.env) del proyecto principal, pero es una SPA independiente.
export default defineConfig({
  root: 'catalogo',
  envDir: '..',            // reutiliza VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY de la raíz
  resolve: {
    alias: { '@cat': fileURLToPath(new URL('./catalogo/src', import.meta.url)) },
  },
  plugins: [react()],
  server: { port: 5174, host: true },     // dev del catálogo en http://localhost:5174 (no choca con el 5173 del sistema)
  preview: { port: 4174, host: true },
  build: {
    outDir: '../dist-catalogo',
    emptyOutDir: true,
  },
})

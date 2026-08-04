import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Id de build: con cada deploy (commit SHA en Vercel) el cliente detecta el cambio,
// purga SW + Cache Storage + React Query y recarga. Sin SHA (build local) usa timestamp.
const MUMI_BUILD =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  `local-${Date.now()}`

export default defineConfig({
  define: {
    __MUMI_BUILD__: JSON.stringify(MUMI_BUILD),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    {
      // Archivo plano que el index.html pide con cache:'no-store' para detectar deploy
      // aunque el service worker aún sirva un shell viejo.
      name: 'mumi-build-id',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'build-id.txt', source: `${MUMI_BUILD}\n` })
      },
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg'],
      manifest: {
        name: 'Mumi Amazonia — Gestión',
        short_name: 'Mumi',
        description: 'Sistema de gestión empresarial Mumi Amazonia',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1a3a2a',
        theme_color: '#2d5a3d',
        icons: [
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Fuerza activación inmediata del SW nuevo en todas las pestañas abiertas.
        skipWaiting: true,
        clientsClaim: true,
        // Se precachea SOLO el shell: index.html, el bundle de arranque, su CSS,
        // fuentes e iconos. Las consultas a Supabase siguen yendo a la red.
        //
        // Antes el patrón era '**/*.{js,css,html,svg,woff2}', o sea los ~55 chunks de
        // todos los módulos (Excel, PDF, gráficas): 4,4 MB que había que descargar
        // COMPLETOS en cada actualización antes de que el service worker activara.
        // Si esa descarga fallaba a medias —conexión de planta, datos móviles— la
        // instalación se abortaba y quedaba un SW activo sin precaché: la siguiente
        // recarga dependía de que la red respondiera en ese instante y terminaba en
        // la pantalla de "sitio no disponible" del navegador. Con el shell solo son
        // ~600 KB y la instalación es prácticamente atómica.
        //
        // 'assets/index-*' es el punto de entrada que Vite referencia desde
        // index.html. Si algún día se renombra hay que actualizarlo aquí, o la app
        // dejará de arrancar sin conexión.
        globPatterns: [
          'index.html',
          'registerSW.js',
          'manifest.webmanifest',
          'assets/index-*.{js,css}',
          '**/*.{woff2,svg}',
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Chunks de los módulos: el nombre lleva el hash del contenido, así que
            // nunca cambian → CacheFirst, se descargan una sola vez.
            //
            // Guardarlos APARTE del precaché es lo que evita romper una sesión
            // abierta cuando se despliega una versión nueva: cleanupOutdatedCaches()
            // borra el precaché viejo, y si los chunks vivieran ahí, al abrir un
            // módulo la app pediría un archivo con el hash antiguo que ya no está
            // ni en caché ni en el servidor ("Failed to fetch dynamically imported
            // module", pantalla en blanco). En esta caché los chunks viejos
            // sobreviven hasta que la pestaña se recarga.
            // Se compara el origen a mano en vez de usar el `sameOrigin` que pasa
            // Workbox: si esa propiedad cambiara de nombre entre versiones, la ruta
            // dejaría de coincidir en silencio y los módulos no se cachearían nunca.
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'mumi-modulos',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 },  // 60 días
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})

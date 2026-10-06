// Detecta deploy nuevo sin depender del bundle cacheado: pide build-id.txt siempre a red.
// Si cambió, desregistra el SW, vacía caches y recarga.
// Usa reload() (no replace a la misma URL): replace a menudo no navega y dejaba la app en blanco.
// Vive en un archivo propio (no inline) para poder prohibir scripts inline en la CSP.
(function () {
  var KEY = 'mumi-app-build'
  var FLAG = 'mumi-purga-build'
  fetch('/build-id.txt', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.text() : '' })
    .then(function (t) {
      var id = String(t || '').trim()
      // Evita tomar un HTML de error/404 como "build id" (rompería el arranque).
      if (!id || id.length > 80 || !/^[a-zA-Z0-9._-]+$/.test(id)) return
      var prev = localStorage.getItem(KEY)
      if (prev === id) return
      localStorage.setItem(KEY, id)
      if (!prev) return
      if (sessionStorage.getItem(FLAG) === id) return
      sessionStorage.setItem(FLAG, id)
      var done = function () { location.reload() }
      var tasks = []
      try {
        if ('serviceWorker' in navigator) {
          tasks.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
            return Promise.all(rs.map(function (r) { return r.unregister() }))
          }))
        }
      } catch (e) {}
      try {
        if ('caches' in window) {
          tasks.push(caches.keys().then(function (ks) {
            return Promise.all(ks.map(function (k) { return caches.delete(k) }))
          }))
        }
      } catch (e) {}
      Promise.all(tasks).then(done).catch(done)
    })
    .catch(function () {})
})()

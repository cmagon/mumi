/**
 * MUMI AMAZONIA — Script de setup inicial
 * Ejecutar UNA SOLA VEZ después de correr schema.sql en Supabase
 * Uso: node setup.js
 */

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

// Sin credenciales en el código. Se leen del entorno:
//   SUPABASE_URL=https://XXXX.supabase.co SUPABASE_ANON_KEY=sb_publishable_... \
//   SETUP_ADMIN_PASSWORD='una-clave-larga' node setup.js
// Si no defines SETUP_ADMIN_PASSWORD se genera una aleatoria y se muestra UNA vez al final.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Falta SUPABASE_URL y/o SUPABASE_ANON_KEY (o VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) en el entorno.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const claveAleatoria = () => randomBytes(12).toString('base64url')
const CLAVE_ADMIN = process.env.SETUP_ADMIN_PASSWORD || claveAleatoria()
if (CLAVE_ADMIN.length < 12) {
  console.error('SETUP_ADMIN_PASSWORD debe tener al menos 12 caracteres.')
  process.exit(1)
}
const clavesGeneradas = []

const USUARIOS_INICIALES = [
  { login: 'admin',     password: CLAVE_ADMIN,        nombre: 'Administrador', rol: 'admin' },
  { login: 'operario1', password: claveAleatoria(),   nombre: 'Operario 1',    rol: 'operario' },
  { login: 'operario2', password: claveAleatoria(),   nombre: 'Operario 2',    rol: 'operario' },
]

async function crearUsuarios() {
  console.log('\n👥 Creando usuarios de autenticación...')
  for (const u of USUARIOS_INICIALES) {
    const email = `${u.login}@mumi.internal`
    // Intentar sign up
    const { data, error } = await supabase.auth.signUp({ email, password: u.password })
    if (error) {
      if (error.message.includes('already registered')) {
        console.log(`  ⏭  ${u.login} ya existe — omitido`)
      } else {
        console.log(`  ❌ Error creando ${u.login}: ${error.message}`)
      }
      continue
    }
    if (data.user) {
      clavesGeneradas.push(`${u.login} / ${u.password}`)
      // Insertar perfil
      const { error: profError } = await supabase.from('user_profiles').upsert({
        id: data.user.id, nombre: u.nombre, login: u.login, rol: u.rol, estado: 'activo'
      }, { onConflict: 'login' })
      if (profError) {
        console.log(`  ⚠️  Usuario ${u.login} creado pero perfil falló: ${profError.message}`)
      } else {
        console.log(`  ✅ ${u.login} (${u.rol}) — creado correctamente`)
      }
    }
  }
}

async function verificarTablas() {
  console.log('\n🔍 Verificando tablas de Supabase...')
  const tablas = ['employees','raw_materials','cif_items','production_records','recipes','clients']
  let ok = true
  for (const t of tablas) {
    const { error } = await supabase.from(t).select('id').limit(1)
    if (error) {
      console.log(`  ❌ Tabla "${t}" no encontrada — ¿Ejecutaste schema.sql?`)
      ok = false
    } else {
      console.log(`  ✅ ${t}`)
    }
  }
  return ok
}

async function verificarDatos() {
  console.log('\n📊 Verificando datos seed...')
  const { count: mpsCount } = await supabase.from('raw_materials').select('*', { count: 'exact', head: true })
  const { count: cifCount }  = await supabase.from('cif_items').select('*', { count: 'exact', head: true })
  const { count: recCount }  = await supabase.from('recipes').select('*', { count: 'exact', head: true })
  const { count: prodCount } = await supabase.from('production_records').select('*', { count: 'exact', head: true })
  console.log(`  Materias primas:   ${mpsCount || 0} (esperado: 25)`)
  console.log(`  Ítems CIF:         ${cifCount  || 0} (esperado: 15)`)
  console.log(`  Recetas base:      ${recCount  || 0} (esperado: 4)`)
  console.log(`  Registros prod:    ${prodCount || 0} (esperado: 8)`)
  if (!mpsCount && !cifCount) {
    console.log('\n  ⚠️  Sin datos — ejecuta seed.sql en el SQL Editor de Supabase')
    return false
  }
  return true
}

async function main() {
  console.log('🌿 MUMI AMAZONIA — Setup inicial')
  console.log('================================')
  console.log(`URL: ${SUPABASE_URL}`)

  const tablasOk = await verificarTablas()
  if (!tablasOk) {
    console.log('\n❌ Faltan tablas. Ejecuta primero supabase/schema.sql en el SQL Editor de Supabase.')
    console.log('   Luego ejecuta supabase/seed.sql')
    console.log('   Luego vuelve a ejecutar: node setup.js')
    process.exit(1)
  }

  await verificarDatos()
  await crearUsuarios()

  console.log('\n✅ Setup completado.')
  console.log('\n🚀 Próximos pasos:')
  console.log('   1. Ve a Supabase → Authentication → Settings')
  console.log('      → Desactiva "Enable email confirmations"')
  console.log('   2. npm run dev')
  console.log('   3. Ingresa en http://localhost:5173')
  if (clavesGeneradas.length) {
    console.log('\n🔑 Credenciales creadas (guárdalas ahora, no se vuelven a mostrar; cámbialas al primer ingreso):')
    clavesGeneradas.forEach(c => console.log('      ' + c))
  }
}

main().catch(err => {
  console.error('\n❌ Error inesperado:', err.message)
  process.exit(1)
})

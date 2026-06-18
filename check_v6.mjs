import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'https://awjvggpeuxayvnreldvw.supabase.co',
  'sb_publishable_dSxnLZKF7Ji7vRPFRXQQdg__8kwhoeR'
)
const { error: authErr } = await supabase.auth.signInWithPassword({ email: 'admin@mumi.internal', password: 'mumi2024' })
if (authErr) { console.log('No pude iniciar sesión para verificar:', authErr.message); process.exit(0) }

// Si la columna no existe, Supabase devuelve error 42703
const r1 = await supabase.from('recipes').select('id, creado_por').limit(1)
console.log('recipes.creado_por     :', r1.error ? '❌ FALTA (' + r1.error.message + ')' : '✓ existe')

const r2 = await supabase.from('production_records').select('id, aprobado, creado_por').limit(1)
console.log('production_records.aprobado/creado_por:', r2.error ? '❌ FALTA (' + r2.error.message + ')' : '✓ existen')

const todasOk = !r1.error && !r2.error
console.log(todasOk ? '\n✅ migration_v6 SÍ se ejecutó.' : '\n⚠ migration_v6 NO se ha ejecutado (o parcialmente). Córrela en el SQL Editor.')
process.exit(0)

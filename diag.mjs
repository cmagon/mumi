import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'https://awjvggpeuxayvnreldvw.supabase.co',
  'sb_publishable_dSxnLZKF7Ji7vRPFRXQQdg__8kwhoeR'
)

const { error: authErr } = await supabase.auth.signInWithPassword({ email: 'admin@mumi.internal', password: 'mumi2024' })
if (authErr) { console.log('AUTH ERROR:', authErr.message); process.exit(1) }
console.log('✓ login admin OK')

// 1. Leer un producto existente
const { data: prods, error: selErr } = await supabase.from('products_costing').select('*').limit(1)
if (selErr) { console.log('SELECT ERROR:', selErr.message); process.exit(1) }
if (!prods.length) { console.log('No hay productos para probar update'); process.exit(0) }
const p = prods[0]
console.log('✓ producto leído id=', p.id, 'nombre=', p.nombre)
console.log('  columnas presentes:', Object.keys(p).join(', '))

// 2. Intentar update con TODAS las columnas nuevas
const datos = {
  nombre: p.nombre, tipo: p.tipo,
  rendimiento: 62, desperdicio: 2, peso_unidad: 1000,
  brix: 75, brix_aplica: false,
  imagen_url: '', ficha_nombre: '', ficha_url: '',
}
const { error: updErr } = await supabase.from('products_costing').update(datos).eq('id', p.id)
if (updErr) { console.log('❌ UPDATE ERROR:', updErr.message); console.log('   detalles:', JSON.stringify(updErr)) }
else console.log('✓ UPDATE OK — las columnas nuevas existen y RLS permite update')

process.exit(0)

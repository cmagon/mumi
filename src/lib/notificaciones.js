import { supabase } from './supabase'

// Crea una notificación. destinatario = 'admin' (todos los admin) o el nombre del usuario.
export async function notificar({ destinatario, tipo = 'info', mensaje, link = '', ref_id = null }) {
  if (!destinatario || !mensaje) return
  try {
    await supabase.from('notifications').insert({ destinatario, tipo, mensaje, link, ref_id })
  } catch { /* silencioso: no debe romper el flujo principal */ }
}

const addDias = (f, d) => { const x = new Date(f + 'T00:00:00'); x.setDate(x.getDate() + (d || 0)); return x.toISOString().split('T')[0] }

// Revisa los registros periódicos del SGC y notifica (a admin) los vencidos / próximos a vencer.
// Deduplica: máximo una notificación por registro por día. Pensado para llamarse al cargar la app.
export async function notificarVencimientosRegistros() {
  try {
    const { data: plantillas } = await supabase.from('registro_plantillas')
      .select('id,nombre,dias_aviso').eq('periodica', true).eq('genera_alerta', true)
    if (!plantillas?.length) return
    const { data: entradas } = await supabase.from('registro_entradas')
      .select('plantilla_id, fecha, proxima_fecha').not('proxima_fecha', 'is', null)
    const ultima = {}
    ;(entradas || []).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).forEach(e => { if (!ultima[e.plantilla_id]) ultima[e.plantilla_id] = e })
    const hoy = new Date().toISOString().split('T')[0]
    for (const p of plantillas) {
      const u = ultima[p.id]; if (!u) continue
      const limite = addDias(hoy, p.dias_aviso || 7)
      let estado = null
      if (u.proxima_fecha < hoy) estado = 'vencido'
      else if (u.proxima_fecha <= limite) estado = 'proximo'
      if (!estado) continue
      // ¿ya se notificó hoy esta plantilla?
      const { data: existe } = await supabase.from('notifications').select('id')
        .eq('tipo', 'registro_vencimiento').eq('ref_id', p.id).gte('created_at', hoy).limit(1)
      if (existe && existe.length) continue
      await supabase.from('notifications').insert({
        destinatario: 'admin', tipo: 'registro_vencimiento', ref_id: p.id, link: '/registros',
        mensaje: estado === 'vencido'
          ? `⚠ Registro VENCIDO: ${p.nombre} (venció ${u.proxima_fecha})`
          : `🔔 Próximo a vencer: ${p.nombre} (vence ${u.proxima_fecha})`,
      })
    }
  } catch { /* silencioso */ }
}

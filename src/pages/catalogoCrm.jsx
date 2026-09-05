import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Users, BarChart3, Star, ShoppingCart, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fNum } from '../lib/businessLogic'

const fCOP = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')

const Ico = ({ as: Icon, size = 14 }) => Icon ? <Icon size={size} style={{ flexShrink: 0 }} /> : null

const ETIQUETAS = [
  { id: 'suscrito', label: 'Suscrito', hint: 'Newsletter o popup' },
  { id: 'compró', label: 'Compró', hint: 'Hizo al menos un pedido' },
  { id: 'mayorista', label: 'Mayorista', hint: 'Pedido o acceso mayorista' },
  { id: 'favoritos', label: 'Favoritos', hint: 'Guardó productos' },
  { id: 'carrito', label: 'Carrito', hint: 'Dejó productos en el carrito' },
  { id: 'contacto', label: 'Contacto', hint: 'Escribió por el formulario' },
  { id: 'baja', label: 'Baja correo', hint: 'Se desuscribió' },
]

const EXPORT_COLS = [
  { id: 'email', label: 'Correo' },
  { id: 'nombre', label: 'Nombre' },
  { id: 'telefono', label: 'Teléfono' },
  { id: 'etiquetas', label: 'Etiquetas' },
  { id: 'origen', label: 'Origen alta' },
  { id: 'activo', label: 'Estado correo' },
  { id: 'created_at', label: 'Fecha registro' },
  { id: 'pedido_at', label: 'Último pedido (fecha)' },
  { id: 'pedidos_codigos', label: 'Pedidos #' },
  { id: 'n_pedidos', label: 'Nº pedidos' },
  { id: 'total_gastado', label: 'Total gastado' },
]

function dayKey(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

function etiquetasDe(sub, pedidosEmail) {
  const tags = new Set()
  const o = (sub.origen || '').toLowerCase()
  if (o === 'newsletter' || o === 'popup') tags.add('suscrito')
  if (o === 'favorito') tags.add('favoritos')
  if (o === 'contacto') tags.add('contacto')
  if (o === 'carrito') tags.add('carrito')
  if (o === 'pedido') tags.add('compró')
  if (sub.activo === false) tags.add('baja')
  if (pedidosEmail.length) tags.add('compró')
  if (pedidosEmail.some(p => p.mayorista)) tags.add('mayorista')
  return [...tags]
}

function badgeTag(t) {
  const map = {
    suscrito: 'badge-verde',
    'compró': 'badge-dorado',
    mayorista: 'badge-azul',
    favoritos: 'badge-lima',
    carrito: 'badge-dorado',
    contacto: 'badge-verde',
    baja: 'badge-rojo',
  }
  return map[t] || 'badge-dorado'
}

function escCsv(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function descargarCsv(nombre, header, rows) {
  const bom = '\uFEFF'
  const body = [header.map(escCsv).join(','), ...rows.map(r => r.map(escCsv).join(','))].join('\n')
  const blob = new Blob([bom + body], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  URL.revokeObjectURL(a.href)
}

function useCatalogoCrmData() {
  const qPed = useQuery({
    queryKey: ['catalogo_pedidos_crm'],
    queryFn: async () => {
      const full = await supabase.from('pedidos_catalogo')
        .select('codigo, email, nombre, telefono, total, estado, productos, mayorista, created_at')
        .order('id', { ascending: false }).limit(3000)
      if (!full.error) return full.data || []
      const { data, error } = await supabase.from('pedidos_catalogo')
        .select('codigo, email, nombre, total, estado, productos, created_at')
        .order('id', { ascending: false }).limit(3000)
      if (error) throw error
      return data || []
    },
  })
  const qSub = useQuery({
    queryKey: ['catalogo_subs_crm'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suscriptores_catalogo')
        .select('email, nombre, telefono, origen, activo, created_at, pedido_at, unsubscribed_at')
        .order('id', { ascending: false }).limit(5000)
      if (error) {
        const { data: d2, error: e2 } = await supabase.from('suscriptores_catalogo')
          .select('email, nombre, created_at').order('id', { ascending: false }).limit(5000)
        if (e2) throw e2
        return d2 || []
      }
      return data || []
    },
  })
  return { qPed, qSub, pedidos: qPed.data || [], subs: qSub.data || [] }
}

function enriquecerClientes(subs, pedidos) {
  const porEmail = new Map()
  for (const p of pedidos) {
    const e = (p.email || '').trim().toLowerCase()
    if (!e) continue
    if (!porEmail.has(e)) porEmail.set(e, [])
    porEmail.get(e).push(p)
  }
  const byEmail = new Map()
  for (const s of subs || []) {
    const email = (s.email || '').trim().toLowerCase()
    if (!email) continue
    const ped = (porEmail.get(email) || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    const enviados = ped.filter(p => p.estado === 'enviado' || !p.estado)
    const codigos = ped.map(p => p.codigo ? `Pedido #${p.codigo}` : `(sin código · ${dayKey(p.created_at)})`).join('\n')
    const totalGastado = enviados.reduce((sum, p) => sum + (Number(p.total) || 0), 0)
    byEmail.set(email, {
      ...s,
      email,
      etiquetas: etiquetasDe(s, ped),
      pedidos_codigos: codigos,
      n_pedidos: ped.length,
      n_enviados: enviados.length,
      total_gastado: totalGastado,
      _pedidos: ped,
    })
  }
  // Correos que solo aparecen en pedidos (no en suscriptores)
  for (const [email, pedRaw] of porEmail) {
    if (byEmail.has(email)) continue
    const ped = pedRaw.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    const enviados = ped.filter(p => p.estado === 'enviado' || !p.estado)
    const fake = {
      email,
      nombre: ped.find(p => p.nombre)?.nombre || '',
      telefono: ped.find(p => p.telefono)?.telefono || '',
      origen: 'pedido',
      activo: true,
      created_at: ped[ped.length - 1]?.created_at || null,
      pedido_at: ped[0]?.created_at || null,
    }
    byEmail.set(email, {
      ...fake,
      etiquetas: etiquetasDe(fake, ped),
      pedidos_codigos: ped.map(p => p.codigo ? `Pedido #${p.codigo}` : `(sin código · ${dayKey(p.created_at)})`).join('\n'),
      n_pedidos: ped.length,
      n_enviados: enviados.length,
      total_gastado: enviados.reduce((sum, p) => sum + (Number(p.total) || 0), 0),
      _pedidos: ped,
    })
  }
  return [...byEmail.values()].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

/** Módulo CRM: lista de correos, etiquetas, filtros y export CSV. */
export function TabClientes() {
  const { qPed, qSub, pedidos, subs } = useCatalogoCrmData()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [tagsOn, setTagsOn] = useState([])
  const [q, setQ] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [cols, setCols] = useState(() => EXPORT_COLS.map(c => c.id))

  const clientes = useMemo(() => enriquecerClientes(subs, pedidos), [subs, pedidos])

  const filtrados = useMemo(() => {
    return clientes.filter(c => {
      const alta = dayKey(c.created_at)
      if (desde && alta && alta < desde) return false
      if (hasta && alta && alta > hasta) return false
      if (tagsOn.length && !tagsOn.every(t => c.etiquetas.includes(t))) return false
      if (q.trim()) {
        const s = q.trim().toLowerCase()
        const blob = `${c.email} ${c.nombre || ''} ${c.telefono || ''} ${c.etiquetas.join(' ')}`.toLowerCase()
        if (!blob.includes(s)) return false
      }
      return true
    })
  }, [clientes, desde, hasta, tagsOn, q])

  const toggleTag = (id) => setTagsOn(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const toggleCol = (id) => setCols(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const exportar = () => {
    const chosen = EXPORT_COLS.filter(c => cols.includes(c.id))
    if (!chosen.length) return
    const header = chosen.map(c => c.label)
    const rows = filtrados.map(c => chosen.map(col => {
      if (col.id === 'etiquetas') return (c.etiquetas || []).join(' | ')
      if (col.id === 'activo') return c.activo === false ? 'Baja' : 'Activo'
      if (col.id === 'created_at') return c.created_at ? new Date(c.created_at).toLocaleString('es-CO') : ''
      if (col.id === 'pedido_at') return c.pedido_at ? new Date(c.pedido_at).toLocaleString('es-CO') : ''
      if (col.id === 'total_gastado') return c.total_gastado || 0
      return c[col.id] ?? ''
    }))
    const rango = [desde || 'inicio', hasta || 'hoy'].join('_')
    descargarCsv(`mumi-correos_${rango}.csv`, header, rows)
    setExportOpen(false)
  }

  if (qPed.isLoading || qSub.isLoading) return <div className="card"><p className="empty-table">Cargando correos…</p></div>
  const err = qPed.error || qSub.error
  if (err) return <div className="card"><p className="empty-table" style={{ color: 'var(--rojo)' }}>{err.message}</p></div>

  return (
    <>
      <div className="card">
        <div className="card-title" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ico as={Users} size={15} />Correos registrados ({fNum(filtrados.length)} / {fNum(clientes.length)})</span>
          <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setExportOpen(v => !v)}>
            <Ico as={Download} size={14} /> Exportar CSV
          </button>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', marginTop: 0 }}>
          Etiquetas automáticas según cómo se registraron y si compraron. Un cliente puede tener varias.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label className="form-label">Registro desde</label>
            <input type="date" className="form-control" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
            <label className="form-label">Hasta</label>
            <input type="date" className="form-control" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
            <label className="form-label">Buscar</label>
            <input className="form-control" value={q} onChange={e => setQ(e.target.value)} placeholder="correo, nombre, teléfono…" />
          </div>
          {(desde || hasta || tagsOn.length || q) && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setDesde(''); setHasta(''); setTagsOn([]); setQ('') }}>Limpiar filtros</button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--texto-suave)', alignSelf: 'center' }}>Etiquetas:</span>
          {ETIQUETAS.map(t => (
            <button
              key={t.id}
              type="button"
              title={t.hint}
              onClick={() => toggleTag(t.id)}
              className={`badge ${tagsOn.includes(t.id) ? badgeTag(t.id) : ''}`}
              style={{
                cursor: 'pointer', border: tagsOn.includes(t.id) ? 'none' : '1px solid var(--crema-oscuro)',
                background: tagsOn.includes(t.id) ? undefined : 'var(--crema)', color: tagsOn.includes(t.id) ? undefined : 'var(--selva)',
                fontWeight: 700, padding: '4px 10px',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {exportOpen && (
          <div style={{ border: '1px solid var(--crema-oscuro)', borderRadius: 10, padding: 12, marginBottom: 14, background: 'color-mix(in srgb, var(--selva) 4%, #fff)' }}>
            <div style={{ fontWeight: 700, color: 'var(--selva)', marginBottom: 8 }}>Columnas del CSV ({filtrados.length} filas filtradas)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {EXPORT_COLS.map(c => (
                <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={cols.includes(c.id)} onChange={() => toggleCol(c.id)} /> {c.label}
                </label>
              ))}
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={exportar} disabled={!cols.length}>
              <Ico as={Download} size={14} /> Descargar .csv
            </button>
          </div>
        )}

        {filtrados.length === 0 ? <p className="empty-table">No hay correos con estos filtros.</p>
          : <div className="table-wrap"><table>
              <thead>
                <tr>
                  <th>Correo</th><th>Nombre</th><th>Teléfono</th><th>Etiquetas</th>
                  <th>Registro</th><th>Pedidos #</th><th className="td-number">Nº</th><th className="td-number">Gastado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c, i) => (
                  <tr key={c.email || i}>
                    <td>{c.email}</td>
                    <td>{c.nombre || '—'}</td>
                    <td>{c.telefono || '—'}</td>
                    <td style={{ whiteSpace: 'normal' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {c.etiquetas.length
                          ? c.etiquetas.map(t => <span key={t} className={`badge ${badgeTag(t)}`} style={{ fontSize: '0.65rem' }}>{t}</span>)
                          : '—'}
                      </div>
                    </td>
                    <td>{c.created_at ? new Date(c.created_at).toLocaleDateString('es-CO') : '—'}</td>
                    <td style={{ whiteSpace: 'pre-line', fontSize: '0.78rem', maxWidth: 220 }}>{c.pedidos_codigos || '—'}</td>
                    <td className="td-number">{c.n_pedidos}</td>
                    <td className="td-number">{c.total_gastado ? fCOP(c.total_gastado) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>}
      </div>
    </>
  )
}

/** Métricas de segmentación: repetición, productos top, embudo. */
// ---- Carritos abandonados: clientes con productos sin comprar ----
function waRecuperacion(c) {
  const tel = (c.telefono || '').replace(/[^0-9]/g, '')
  if (!tel) return null
  const nombre = (c.nombre || '').trim()
  const items = Array.isArray(c.items) ? c.items : []
  const detalle = items.map(i => `• ${i.cantidad}x ${i.nombre}`).join('\n')
  const saludo = nombre ? `¡Hola ${nombre}! 🌿` : '¡Hola! 🌿'
  const msg = `${saludo}\nVimos que dejaste algunos productos en tu carrito de Mumi Amazonia:\n\n${detalle}\n\n¿Te ayudamos a completar tu pedido? 😊`
  return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`
}
function CarritosAbandonados({ carritos }) {
  const fechaCorta = (iso) => { try { return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) } catch { return '—' } }
  const totalPotencial = carritos.reduce((s, c) => s + (Number(c.total) || 0), 0)
  return (
    <div className="card">
      <div className="card-title"><Ico as={ShoppingCart} size={15} />Carritos abandonados
        {carritos.length > 0 && <span className="badge badge-dorado" style={{ marginLeft: 8 }}>{carritos.length} · {fCOP(totalPotencial)} potencial</span>}
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--texto-suave)', margin: '0 0 10px' }}>
        Clientes identificados por correo que dejaron productos sin comprar. Escríbeles por WhatsApp para recuperar la venta.
      </p>
      {carritos.length === 0
        ? <p className="empty-table">No hay carritos abandonados por ahora. 🎉</p>
        : <div className="table-wrap"><table>
            <thead><tr><th>Cliente</th><th>Correo</th><th className="movil-hide">Productos</th><th className="td-number">Total</th><th className="movil-hide">Actualizado</th><th></th></tr></thead>
            <tbody>{carritos.map(c => {
              const wa = waRecuperacion(c)
              const items = Array.isArray(c.items) ? c.items : []
              return (
                <tr key={c.email}>
                  <td>{c.nombre || '—'}{c.telefono ? <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>{c.telefono}</div> : null}</td>
                  <td>{c.email}</td>
                  <td className="movil-hide" style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>{items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ') || `${c.n_items} ítem(s)`}</td>
                  <td className="td-number">{fCOP(c.total)}</td>
                  <td className="movil-hide" style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>{fechaCorta(c.actualizado_at)}</td>
                  <td>{wa
                    ? <a className="btn btn-xs btn-success" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={13} /> Recuperar</a>
                    : <span style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>sin teléfono</span>}</td>
                </tr>
              )
            })}</tbody>
          </table></div>}
    </div>
  )
}

export function TabMetricasCrm() {
  const { qPed, qSub, pedidos, subs } = useCatalogoCrmData()
  const qVis = useQuery({
    queryKey: ['catalogo_visitas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('visitas_catalogo').select('producto, dispositivo, fecha').order('id', { ascending: false }).limit(3000)
      if (error) throw error
      return data || []
    },
  })
  const qCarritos = useQuery({
    queryKey: ['catalogo_carritos_abandonados'],
    queryFn: async () => {
      const { data, error } = await supabase.from('carritos_catalogo')
        .select('email, nombre, telefono, items, total, n_items, estado, actualizado_at')
        .eq('estado', 'carrito').gt('n_items', 0)
        .order('actualizado_at', { ascending: false }).limit(200)
      if (error) return []   // tabla nueva (migration_v162); no romper métricas si aún no existe
      return data || []
    },
  })

  if (qPed.isLoading || qSub.isLoading || qVis.isLoading) return <div className="card"><p className="empty-table">Cargando métricas…</p></div>
  const err = qPed.error || qSub.error || qVis.error
  if (err) return <div className="card"><p className="empty-table" style={{ color: 'var(--rojo)' }}>{err.message}</p></div>

  const visitas = qVis.data || []
  const clientes = enriquecerClientes(subs, pedidos)
  const enviados = pedidos.filter(p => p.estado === 'enviado')
  const intentos = pedidos.filter(p => p.estado === 'intento' || p.estado === 'fallido')

  const porEmail = new Map()
  for (const p of enviados) {
    const e = (p.email || '').trim().toLowerCase() || '(sin correo)'
    if (!porEmail.has(e)) porEmail.set(e, { email: e, nombre: p.nombre, n: 0, total: 0 })
    const row = porEmail.get(e)
    row.n += 1
    row.total += Number(p.total) || 0
    if (p.nombre) row.nombre = p.nombre
  }
  const repetidores = [...porEmail.values()].filter(x => x.n >= 2).sort((a, b) => b.n - a.n || b.total - a.total).slice(0, 15)
  const topCompradores = [...porEmail.values()].sort((a, b) => b.total - a.total).slice(0, 10)

  const prodCount = new Map()
  const prodMonto = new Map()
  for (const p of enviados) {
    let items = p.productos
    if (typeof items === 'string') {
      try { items = JSON.parse(items) } catch { items = [] }
    }
    if (!Array.isArray(items)) continue
    for (const it of items) {
      const name = it.nombre || it.name || `id:${it.id}`
      const cant = Number(it.cantidad) || 1
      const precio = Number(it.precio) || 0
      prodCount.set(name, (prodCount.get(name) || 0) + cant)
      prodMonto.set(name, (prodMonto.get(name) || 0) + cant * precio)
    }
  }
  const topUnidades = [...prodCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const topIngresos = [...prodMonto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

  const nSuscritos = clientes.filter(c => c.etiquetas.includes('suscrito')).length
  const nCompraron = clientes.filter(c => c.etiquetas.includes('compró')).length
  const nMayorista = clientes.filter(c => c.etiquetas.includes('mayorista')).length
  const nUnaVez = [...porEmail.values()].filter(x => x.n === 1).length
  const tasaRepeticion = porEmail.size ? (repetidores.length / porEmail.size) * 100 : 0

  const monto = enviados.reduce((s, p) => s + (Number(p.total) || 0), 0)
  const ticket = enviados.length ? monto / enviados.length : 0
  const conversion = visitas.length ? (enviados.length / visitas.length) * 100 : 0

  const hoy = new Date()
  const hace7 = new Date(hoy.getTime() - 7 * 864e5).toISOString().slice(0, 10)
  const visitas7 = visitas.filter(v => (v.fecha || '') >= hace7).length
  const dias = Array.from({ length: 7 }, (_, i) => new Date(hoy.getTime() - (6 - i) * 864e5).toISOString().slice(0, 10))
  const porDia = dias.map(d => ({ d, n: visitas.filter(v => (v.fecha || '').slice(0, 10) === d).length }))
  const maxDia = Math.max(1, ...porDia.map(x => x.n))
  const topVistos = Object.entries(visitas.filter(v => v.producto).reduce((m, v) => { m[v.producto] = (m[v.producto] || 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const porDisp = visitas.reduce((m, v) => { const d = v.dispositivo || 'desconocido'; m[d] = (m[d] || 0) + 1; return m }, {})
  const DISP = [['mobile', '📱 Móvil'], ['tablet', '📲 Tablet'], ['desktop', '💻 Escritorio'], ['desconocido', '❔ Otro']]

  const sinDatos = visitas.length === 0 && pedidos.length === 0 && subs.length === 0
  if (sinDatos) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: '2.4rem' }}>📊</div>
        <div className="card-title" style={{ justifyContent: 'center' }}>Aún no hay datos</div>
        <p style={{ color: 'var(--texto-suave)', fontSize: '0.88rem' }}>Cuando haya visitas, suscripciones o pedidos, verás el embudo y la segmentación aquí.</p>
      </div>
    )
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card verde"><div className="kpi-label">Visitas</div><div className="kpi-value">{fNum(visitas.length)}</div><div className="kpi-sub">{visitas7} en 7 días</div></div>
        <div className="kpi-card dorado"><div className="kpi-label">Pedidos enviados</div><div className="kpi-value">{fNum(enviados.length)}</div><div className="kpi-sub">{fNum(intentos.length)} intentos · {fCOP(monto)}</div></div>
        <div className="kpi-card tierra"><div className="kpi-label">Ticket promedio</div><div className="kpi-value" style={{ fontSize: '1.4rem' }}>{fCOP(ticket)}</div><div className="kpi-sub">conversión {conversion.toFixed(1)}% · repetición {tasaRepeticion.toFixed(0)}%</div></div>
        <div className="kpi-card lima"><div className="kpi-label">Clientes con correo</div><div className="kpi-value">{fNum(clientes.length)}</div><div className="kpi-sub">{nCompraron} compraron · {nSuscritos} suscritos</div></div>
      </div>

      <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', margin: '0 0 12px' }}>
        Lista completa, etiquetas y export CSV → pestaña <strong>Correos</strong>.
      </p>

      <CarritosAbandonados carritos={qCarritos.data || []} />


      <div className="card">
        <div className="card-title"><Ico as={BarChart3} size={15} />Visitas · últimos 7 días</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '8px 0' }}>
          {porDia.map(({ d, n }) => (
            <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--texto-suave)' }}>{n}</span>
              <div title={`${n} visitas`} style={{ width: '70%', minHeight: 3, height: `${(n / maxDia) * 100}%`, background: 'linear-gradient(var(--selva), var(--lima))', borderRadius: '5px 5px 0 0' }} />
              <span style={{ fontSize: '0.64rem', color: 'var(--texto-suave)' }}>{new Date(d + 'T00:00').toLocaleDateString('es-CO', { weekday: 'short' })}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">📟 Visitas por dispositivo</div>
        {visitas.length === 0 ? <p className="empty-table">Sin visitas todavía.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DISP.filter(([k]) => porDisp[k]).map(([k, label]) => {
                const pct = Math.round((porDisp[k] / visitas.length) * 100)
                return (
                  <div key={k}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 3 }}><span>{label}</span><span style={{ color: 'var(--texto-suave)' }}>{fNum(porDisp[k])} · {pct}%</span></div>
                    <div style={{ height: 8, background: 'var(--crema)', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--selva)' }} /></div>
                  </div>
                )
              })}
            </div>}
      </div>

      <div className="card">
        <div className="card-title"><Ico as={BarChart3} size={15} />Embudo / segmentos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {[
            ['Suscritos (mail)', nSuscritos],
            ['Compraron', nCompraron],
            ['Mayoristas', nMayorista],
            ['1 pedido', nUnaVez],
            ['2+ pedidos', repetidores.length],
            ['Carritos abiertos', (qCarritos.data || []).length],
          ].map(([l, v]) => (
            <div key={l} style={{ background: 'var(--crema)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)', fontWeight: 700 }}>{l}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--selva)' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">🔁 Clientes que repiten pedidos</div>
        {repetidores.length === 0 ? <p className="empty-table">Aún no hay compradores con 2 o más pedidos enviados.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Cliente</th><th>Correo</th><th className="td-number">Pedidos</th><th className="td-number">Total</th></tr></thead>
              <tbody>{repetidores.map(r => (
                <tr key={r.email}><td>{r.nombre || '—'}</td><td>{r.email}</td><td className="td-number">{r.n}</td><td className="td-number">{fCOP(r.total)}</td></tr>
              ))}</tbody>
            </table></div>}
      </div>

      <div className="card">
        <div className="card-title">💰 Top compradores (monto)</div>
        {topCompradores.length === 0 ? <p className="empty-table">Sin pedidos con correo todavía.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Cliente</th><th>Correo</th><th className="td-number">Pedidos</th><th className="td-number">Gastado</th></tr></thead>
              <tbody>{topCompradores.map(r => (
                <tr key={r.email}><td>{r.nombre || '—'}</td><td>{r.email}</td><td className="td-number">{r.n}</td><td className="td-number">{fCOP(r.total)}</td></tr>
              ))}</tbody>
            </table></div>}
      </div>

      <div className="card">
        <div className="card-title"><Ico as={Star} size={15} />Productos más comprados (unidades)</div>
        {topUnidades.length === 0 ? <p className="empty-table">Sin detalle de productos en pedidos.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Producto</th><th className="td-number">Unidades</th></tr></thead>
              <tbody>{topUnidades.map(([n, c]) => <tr key={n}><td>{n}</td><td className="td-number">{c}</td></tr>)}</tbody>
            </table></div>}
      </div>

      <div className="card">
        <div className="card-title">🏆 Productos con más ingresos</div>
        {topIngresos.length === 0 ? <p className="empty-table">Sin montos por producto.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Producto</th><th className="td-number">Ingresos</th></tr></thead>
              <tbody>{topIngresos.map(([n, c]) => <tr key={n}><td>{n}</td><td className="td-number">{fCOP(c)}</td></tr>)}</tbody>
            </table></div>}
      </div>

      <div className="card">
        <div className="card-title"><Ico as={Star} size={15} />Productos más vistos</div>
        {topVistos.length === 0 ? <p className="empty-table">Aún no hay visitas a productos.</p>
          : <div className="table-wrap"><table>
              <thead><tr><th>Producto</th><th className="td-number">Visitas</th></tr></thead>
              <tbody>{topVistos.map(([n, c]) => <tr key={n}><td>{n}</td><td className="td-number">{c}</td></tr>)}</tbody>
            </table></div>}
      </div>
    </>
  )
}

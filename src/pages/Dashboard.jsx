import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend,
} from 'chart.js'
import { Factory, Users, Package, Handshake, Lightbulb, TrendingUp, PieChart as PieIcon, ClipboardList, BookOpen, Bell, AlertTriangle, Clock, CheckCircle2, GraduationCap, Pin, Download, Settings, GripVertical, Plus, EyeOff, RotateCcw, DollarSign } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fNum, fCOP, fFecha, getRolLabel, PARAMS_NOMINA_DEFAULT, getGastosOperacionales, getEstadoResultados, getSemaforoFinanciero } from '../lib/businessLogic'
import { fraseDelDia } from '../lib/frases'
import { notificarVencimientosRegistros } from '../lib/notificaciones'
import { useAuth } from '../context/AuthContext'
import { useReorder } from '../hooks/useReorder'
import { getDevRole, subscribeDevRole, setDevRole } from '../lib/devMode'

const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const COLORS = ['#2d5a3d','#7CB342','#C8A94A','#8B5E3C','#3d7a52','#a87450']

// Orden por defecto de los módulos del tablero (pendientes y alertas primero)
const ORDEN_DEFAULT = ['frase', 'pendientes', 'kpis', 'financiero', 'inventario', 'produccion_mensual', 'distribucion', 'ultimas', 'sgc_cumplimiento', 'vencimientos', 'calidad_kpis', 'nc_severidad', 'resumen_calidad']
const TITULOS = {
  frase: 'Frase del día', pendientes: 'Pendientes y alertas', kpis: 'Indicadores generales',
  financiero: 'Análisis financiero del mes',
  inventario: 'Inventario de materias primas', produccion_mensual: 'Producción mensual por categoría',
  distribucion: 'Distribución por producto', ultimas: 'Últimas producciones',
  sgc_cumplimiento: 'Cumplimiento de registros SGC', vencimientos: 'Vencimientos de programas',
  calidad_kpis: 'Indicadores de calidad', nc_severidad: 'No conformidades por severidad', resumen_calidad: 'Resumen de calidad',
}

export default function Dashboard() {
  const [año, setAño] = useState(new Date().getFullYear())
  const { profile } = useAuth()
  const navigate = useNavigate()
  const frase = fraseDelDia()
  const [devRole, setDevRoleState] = useState(getDevRole())
  useEffect(() => subscribeDevRole(setDevRoleState), [])
  // El módulo financiero es sensible — solo se ofrece a admins (ni siquiera como oculto/personalizable).
  // Si un admin está previsualizando la vista de OTRO rol (devRole), se evalúa como ese rol —
  // así el módulo financiero no se filtra sin querer al layout guardado de un rol no-admin.
  const rolEfectivoDash = devRole || profile?.rol
  const esAdminDash = rolEfectivoDash === 'admin'
  const ORDEN_DEFAULT_ROL = esAdminDash ? ORDEN_DEFAULT : ORDEN_DEFAULT.filter(k => k !== 'financiero')

  // ----- Personalización del tablero (orden + módulos ocultos), guardada en la NUBE -----
  // Efectivo = personalización del usuario → vista por defecto del rol → orden por código.
  // El desarrollador puede "editar la vista de un rol": entonces se guarda como default del rol.
  const [orden, setOrden] = useState(ORDEN_DEFAULT_ROL)
  const [ocultos, setOcultos] = useState([])
  const [editando, setEditando] = useState(false)
  const cargadoRef = useRef(false)
  const ord = useReorder(setOrden)

  const restablecer = () => { setOrden(ORDEN_DEFAULT_ROL); setOcultos([]) }
  const ocultar = (key) => setOcultos(o => o.includes(key) ? o : [...o, key])
  const mostrar = (key) => setOcultos(o => o.filter(k => k !== key))

  // Al cargar el tablero (admin), genera alertas de vencimientos de registros periódicos.
  // En modo "vista de rol" no se ejecuta (es solo lectura).
  useEffect(() => {
    if (profile?.rol === 'admin' && !getDevRole()) notificarVencimientosRegistros()
  }, [profile?.rol, devRole])

  const { data: produccion = [] } = useQuery({
    queryKey: ['produccion'],
    queryFn: async () => { const { data } = await supabase.from('production_records').select('*').order('fecha', { ascending: false }); return data || [] },
  })
  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*'); return data || [] },
  })
  const { data: mps = [] } = useQuery({
    queryKey: ['raw_materials'],
    queryFn: async () => { const { data } = await supabase.from('raw_materials').select('*'); return data || [] },
  })
  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => { const { data } = await supabase.from('clients').select('*'); return data || [] },
  })
  const { data: regPlantillas = [] } = useQuery({
    queryKey: ['registro_plantillas'],
    queryFn: async () => { const { data } = await supabase.from('registro_plantillas').select('*'); return data || [] },
  })
  const { data: regEntradas = [] } = useQuery({
    queryKey: ['registro_entradas_all'],
    queryFn: async () => { const { data } = await supabase.from('registro_entradas').select('plantilla_id, fecha, proxima_fecha'); return data || [] },
  })
  const { data: ncs = [] } = useQuery({
    queryKey: ['no_conformidades'],
    queryFn: async () => { const { data } = await supabase.from('no_conformidades').select('id, fecha, severidad, estado, fecha_compromiso'); return data || [] },
  })
  const { data: capacitaciones = [] } = useQuery({
    queryKey: ['capacitaciones'],
    queryFn: async () => { const { data } = await supabase.from('capacitaciones').select('id, fecha, duracion_horas, asistentes'); return data || [] },
  })

  // ----- Análisis financiero del mes (solo admin) -----
  const mesActual = new Date().toISOString().slice(0, 7)   // YYYY-MM
  const { data: cifItemsFin = [] } = useQuery({
    queryKey: ['cif_items'],
    queryFn: async () => { const { data } = await supabase.from('cif_items').select('*'); return data || [] },
    enabled: esAdminDash,
  })
  const { data: nominaParamsFin } = useQuery({
    queryKey: ['payroll_settings'],
    queryFn: async () => { const { data } = await supabase.from('payroll_settings').select('params').eq('id', 1).maybeSingle(); return data?.params || null },
    enabled: esAdminDash,
  })
  const { data: finishedProdsFin = [] } = useQuery({
    queryKey: ['finished_products_fin'],
    queryFn: async () => { const { data } = await supabase.from('finished_products').select('id, alegra_item_id, product_id, activo'); return data || [] },
    enabled: esAdminDash,
  })
  const { data: costoFinalPorProducto = {} } = useQuery({
    queryKey: ['products_costing_costo_final'],
    queryFn: async () => {
      const { data } = await supabase.from('products_costing').select('id, costo_final')
      return Object.fromEntries((data || []).map(p => [p.id, p.costo_final || 0]))
    },
    enabled: esAdminDash,
  })
  // Histórico de ventas reales de Alegra (mismo query que Producto Terminado — se comparte la caché)
  const { data: alegraVentasFin, isFetching: cargandoFin } = useQuery({
    queryKey: ['alegra_ventas_hist'],
    queryFn: async () => { const { data } = await supabase.functions.invoke('alegra-ventas', { body: {} }); return data || { ventas: {}, ventasValor: {} } },
    enabled: esAdminDash, retry: false, staleTime: 30 * 60 * 1000,
  })
  const paramsNomFin = nominaParamsFin && Object.keys(nominaParamsFin).length
    ? { ...PARAMS_NOMINA_DEFAULT, ...nominaParamsFin,
        prestaciones: { ...PARAMS_NOMINA_DEFAULT.prestaciones, ...(nominaParamsFin.prestaciones || {}) },
        empleador: { ...PARAMS_NOMINA_DEFAULT.empleador, ...(nominaParamsFin.empleador || {}) } }
    : PARAMS_NOMINA_DEFAULT
  // Costo de producción real de un mes: unidades vendidas × costo unitario vigente de su ficha
  // (products_costing.costo_final, ya calculado con el CIF corregido — mismo valor que usa
  // Producto Terminado/Órdenes de Producción, no se recalcula aquí para no duplicar lógica).
  const costoProduccionDe = (mes) => finishedProdsFin.reduce((s, fp) => {
    if (fp.activo === false || !fp.alegra_item_id || !fp.product_id) return s
    const qty = alegraVentasFin?.ventas?.[String(fp.alegra_item_id)]?.[mes] || 0
    if (!qty) return s
    return s + qty * (costoFinalPorProducto[fp.product_id] || 0)
  }, 0)
  const gastosOpFin = getGastosOperacionales(cifItemsFin, empleados, paramsNomFin)
  // Estado de resultados de un mes: ventas reales de Alegra − costo de lo vendido − gastos
  // mensuales estimados vigentes (los gastos no son históricos por mes).
  const estadoDe = (mes) => getEstadoResultados({
    ventasNetas: alegraVentasFin?.ventasValor?.[mes] || 0, costoProduccion: costoProduccionDe(mes),
    gastosAdmin: gastosOpFin.administracion.total, gastosVentas: gastosOpFin.ventas.total,
    gastosFinancieros: gastosOpFin.financiero.total, impuestos: gastosOpFin.impuestos.total,
  })
  const mesAnterior = (() => { const [y, m] = mesActual.split('-').map(Number); const d = new Date(y, m - 2, 15); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
  const estadoResultados = estadoDe(mesActual)
  const estadoMesAnterior = estadoDe(mesAnterior)
  const semaforoFin = getSemaforoFinanciero(estadoResultados.margenBrutoPct, estadoResultados.margenNetoPct)
  // Vistas por defecto del tablero por rol (nube)
  const { data: roleRows = [], refetch: refetchRoleLayouts } = useQuery({
    queryKey: ['role_layouts'],
    queryFn: async () => { const { data } = await supabase.from('role_permissions').select('rol, dashboard_layout'); return data || [] },
  })
  const roleLayouts = Object.fromEntries(roleRows.map(r => [r.rol, r.dashboard_layout]))

  // Normaliza una vista guardada {orden, ocultos} completando módulos nuevos
  const normalizarLayout = (raw) => {
    if (!raw || !Array.isArray(raw.orden)) return { orden: ORDEN_DEFAULT_ROL, ocultos: [] }
    const merged = [...raw.orden.filter(k => ORDEN_DEFAULT_ROL.includes(k)), ...ORDEN_DEFAULT_ROL.filter(k => !raw.orden.includes(k))]
    return { orden: merged, ocultos: Array.isArray(raw.ocultos) ? raw.ocultos.filter(k => ORDEN_DEFAULT_ROL.includes(k)) : [] }
  }

  // Carga la vista efectiva: si el dev edita un rol → la del rol; si no → usuario → rol → código.
  useEffect(() => {
    const fuente = devRole ? roleLayouts[devRole] : (profile?.dashboard_layout || roleLayouts[profile?.rol])
    const norm = normalizarLayout(fuente)
    const igual = JSON.stringify({ o: orden, c: ocultos }) === JSON.stringify({ o: norm.orden, c: norm.ocultos })
    if (igual) { cargadoRef.current = true; return }
    cargadoRef.current = false
    setOrden(norm.orden); setOcultos(norm.ocultos)
    const t = setTimeout(() => { cargadoRef.current = true }, 0)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devRole, profile?.id, JSON.stringify(profile?.dashboard_layout), JSON.stringify(roleLayouts[devRole || profile?.rol])])

  // Guarda en la nube (debounce): default del rol si el dev lo edita; si no, la del usuario.
  useEffect(() => {
    if (!cargadoRef.current) return
    const payload = { orden, ocultos }
    const t = setTimeout(async () => {
      try {
        if (devRole) {
          await supabase.from('role_permissions').upsert({ rol: devRole, dashboard_layout: payload }, { onConflict: 'rol' })
          refetchRoleLayouts()
        } else if (profile?.id) {
          await supabase.from('user_profiles').update({ dashboard_layout: payload }).eq('id', profile.id)
        }
      } catch { /* noop */ }
    }, 700)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden, ocultos, devRole])

  const produccionAprob = produccion.filter(p => p.aprobado !== false)
  const pendientesAprob = produccion.filter(p => p.aprobado === false).length
  const añosDisp = [...new Set([
    new Date().getFullYear(),
    ...produccion.map(p => { const y = parseInt(String(p.fecha || '').slice(0, 4), 10); return Number.isFinite(y) ? y : null }).filter(Boolean),
  ])].sort((a, b) => b - a)
  const prodAño = produccionAprob.filter(p => { try { return new Date(p.fecha).getFullYear() === año } catch { return false } })

  const totalProd = prodAño.reduce((s, p) => s + (p.cantidad || 0), 0)
  const empleadosActivos = empleados.filter(e => e.estado === 'activo').length
  // Últimas producciones: TODO el registro diario (incluidos los importados PTZ-RG-03), vista compacta
  const esImportado = (p) => /\[Importado PTZ-RG-03\]/.test(p.obs || '')
  const ultimas = [...produccion].slice(0, 5)

  // Producción mensual por TODOS los productos (ordenados por cantidad) — usado en el doughnut
  const totalPorProducto = {}
  prodAño.forEach(p => { totalPorProducto[p.producto] = (totalPorProducto[p.producto] || 0) + (p.cantidad || 0) })
  const productos = Object.keys(totalPorProducto).sort((a, b) => totalPorProducto[b] - totalPorProducto[a])

  // ---- Gráfica mensual agrupada por CATEGORÍA (1ª palabra del producto: GALLETA, DULCE, INFUSIÓN…) ----
  // Menos series = mucho más legible que una barra por cada producto.
  const categoriaDe = (prod) => {
    const w = String(prod || '').trim().split(/\s+/)[0] || 'OTROS'
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }
  const totalPorCategoria = {}
  prodAño.forEach(p => { const c = categoriaDe(p.producto); totalPorCategoria[c] = (totalPorCategoria[c] || 0) + (p.cantidad || 0) })
  const categorias = Object.keys(totalPorCategoria).sort((a, b) => totalPorCategoria[b] - totalPorCategoria[a])
  const barData = {
    labels: MESES,
    datasets: categorias.map((cat, i) => ({
      label: cat,
      data: Array.from({ length: 12 }, (_, m) => prodAño.filter(p => categoriaDe(p.producto) === cat && new Date(p.fecha).getMonth() === m).reduce((s, p) => s + (p.cantidad || 0), 0)),
      backgroundColor: COLORS[i % COLORS.length],
      borderRadius: 5,
      maxBarThickness: 46,
    })),
  }
  const pieData = {
    labels: Object.keys(totalPorProducto),
    datasets: [{ data: Object.values(totalPorProducto), backgroundColor: COLORS.concat(['#9CCC65', '#e0c070', '#4a7a5a', '#c8a050']) }],
  }

  // Inventario de materias primas
  // El stock se guarda en unidad de precio (Kg/Litro) pero se muestra en base (g/ml/u)
  const factorU = (u) => (u === 'Kg' || u === 'Litro') ? 1000 : 1
  const baseLbl = (u) => (u === 'Kg' || u === 'Gramo') ? 'g' : (u === 'Litro' || u === 'Mililitro') ? 'ml' : (u || 'u')
  const fBaseStock = (m) => `${fNum((m.stock || 0) * factorU(m.unidad))} ${baseLbl(m.unidad)}`
  const bajoStock = mps.filter(m => (m.stock || 0) > 0 && (m.stock_min || 0) > 0 && m.stock <= m.stock_min)
  const sinStock = mps.filter(m => (m.stock || 0) <= 0)
  const alertaMP = [...sinStock.map(m => ({ ...m, _estado: 'sin' })), ...bajoStock.map(m => ({ ...m, _estado: 'bajo' }))]

  // Registros SGC (BPM)
  const plantById = Object.fromEntries(regPlantillas.map(p => [p.id, p]))
  const regAño = regEntradas.filter(e => { try { return new Date(e.fecha).getFullYear() === año } catch { return false } })
  const porPrograma = {}
  regAño.forEach(e => { const prog = plantById[e.plantilla_id]?.programa || 'Otros'; porPrograma[prog] = (porPrograma[prog] || 0) + 1 })
  const regBarData = { labels: Object.keys(porPrograma), datasets: [{ label: 'Registros diligenciados', data: Object.values(porPrograma), backgroundColor: '#7CB342' }] }
  const hoyStr = new Date().toISOString().split('T')[0]
  const addDias = (f, d) => { const x = new Date(f + 'T00:00:00'); x.setDate(x.getDate() + (d || 0)); return x.toISOString().split('T')[0] }
  const ultimaProx = {}
  ;[...regEntradas].filter(e => e.proxima_fecha).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).forEach(e => { if (!ultimaProx[e.plantilla_id]) ultimaProx[e.plantilla_id] = e })
  const vencimientos = regPlantillas.filter(p => p.periodica && p.genera_alerta).map(p => {
    const u = ultimaProx[p.id]
    if (!u || !u.proxima_fecha) return { p, estado: 'sin_registro', proxima: null }
    const limite = addDias(hoyStr, p.dias_aviso)
    if (u.proxima_fecha < hoyStr) return { p, estado: 'vencido', proxima: u.proxima_fecha }
    if (u.proxima_fecha <= limite) return { p, estado: 'proximo', proxima: u.proxima_fecha }
    return { p, estado: 'ok', proxima: u.proxima_fecha }
  }).filter(a => a.estado !== 'ok').sort((a, b) => (a.proxima || '9') < (b.proxima || '9') ? -1 : 1)
  const totalRegAño = regAño.length
  const sgcVencidos = vencimientos.filter(v => v.estado === 'vencido').length
  const sgcProximos = vencimientos.filter(v => v.estado === 'proximo').length

  // Indicadores de calidad
  const ncAbiertas = ncs.filter(n => n.estado !== 'cerrada').length
  const ncCerradas = ncs.filter(n => n.estado === 'cerrada').length
  const acpmVencidas = ncs.filter(n => n.estado !== 'cerrada' && n.fecha_compromiso && n.fecha_compromiso < hoyStr).length
  const ncPorSev = { critica: 0, alta: 0, media: 0, baja: 0 }
  ncs.filter(n => n.estado !== 'cerrada').forEach(n => { ncPorSev[n.severidad] = (ncPorSev[n.severidad] || 0) + 1 })
  const ncSevData = { labels: ['Crítica', 'Alta', 'Media', 'Baja'], datasets: [{ data: [ncPorSev.critica, ncPorSev.alta, ncPorSev.media, ncPorSev.baja], backgroundColor: ['#c0392b', '#e07a3c', '#C8A94A', '#7CB342'] }] }
  const capAño = capacitaciones.filter(c => { try { return new Date(c.fecha).getFullYear() === año } catch { return false } })
  const horasCap = capAño.reduce((s, c) => s + (parseFloat(c.duracion_horas) || 0), 0)
  const asistenciasCap = capAño.reduce((s, c) => s + (Array.isArray(c.asistentes) ? c.asistentes.length : 0), 0)

  // ===== Lista de pendientes/alertas (accionables) =====
  const pendientes = [
    sgcVencidos > 0 && { txt: `${sgcVencidos} registro(s) SGC vencido(s)`, tono: 'rojo', to: '/registros' },
    sgcProximos > 0 && { txt: `${sgcProximos} registro(s) SGC próximos a vencer`, tono: 'dorado', to: '/registros' },
    ncAbiertas > 0 && { txt: `${ncAbiertas} no conformidad(es) abierta(s)`, tono: 'rojo', to: '/calidad' },
    acpmVencidas > 0 && { txt: `${acpmVencidas} ACPM con compromiso vencido`, tono: 'rojo', to: '/calidad' },
    sinStock.length > 0 && { txt: `${sinStock.length} materia(s) prima(s) sin stock`, tono: 'rojo', to: '/inventario' },
    bajoStock.length > 0 && { txt: `${bajoStock.length} materia(s) prima(s) con stock bajo`, tono: 'dorado', to: '/inventario' },
    pendientesAprob > 0 && { txt: `${pendientesAprob} registro(s) de producción por aprobar`, tono: 'dorado', to: '/produccion' },
  ].filter(Boolean)

  const tono = (t) => t === 'rojo' ? 'var(--rojo, #c0392b)' : t === 'dorado' ? 'var(--dorado, #C8A94A)' : 'var(--selva)'

  // ===== Definición de módulos (widgets) =====
  const W = {}
  W.frase = (
    <div className="card" style={{ background: 'linear-gradient(135deg, #2d5a3d 0%, #3d7a52 100%)', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Lightbulb size={26} style={{ flexShrink: 0, color: '#C8A94A' }} aria-hidden="true" />
        <div>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8, marginBottom: 4 }}>Frase del día</div>
          <div style={{ fontSize: '1.05rem', fontStyle: 'italic', lineHeight: 1.4 }}>“{frase.texto}”</div>
          <div style={{ fontSize: '0.82rem', opacity: 0.85, marginTop: 6 }}>— {frase.autor}</div>
        </div>
      </div>
    </div>
  )
  W.pendientes = (
    <div className="card">
      <div className="card-title"><Bell size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Pendientes y alertas {pendientes.length > 0 && <span className="badge badge-rojo" style={{ marginLeft: 8 }}>{pendientes.length}</span>}</div>
      {pendientes.length === 0
        ? <p className="empty-table" style={{ margin: 0 }}><Ico as={CheckCircle2} size={14} />Todo al día. No hay pendientes.</p>
        : <div style={{ display: 'grid', gap: 8 }}>
            {pendientes.map((a, i) => (
              <button key={i} onClick={() => !editando && navigate(a.to)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%', cursor: editando ? 'default' : 'pointer',
                  background: 'var(--crema, #f5f0e8)', border: `1px solid ${tono(a.tono)}`, borderLeft: `4px solid ${tono(a.tono)}`, borderRadius: 8, padding: '10px 12px' }}>
                <AlertTriangle size={16} style={{ color: tono(a.tono), flexShrink: 0 }} aria-hidden="true" />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--texto, #333)' }}>{a.txt}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--texto-suave)' }}>Ver →</span>
              </button>
            ))}
          </div>}
    </div>
  )
  W.kpis = (
    <div className="kpi-grid">
      <div className="kpi-card verde"><div className="kpi-icon"><Factory aria-hidden="true" /></div><div className="kpi-label">Producción total ({año})</div><div className="kpi-value">{fNum(totalProd)}</div><div className="kpi-sub">unidades</div></div>
      <div className="kpi-card dorado"><div className="kpi-icon"><Users aria-hidden="true" /></div><div className="kpi-label">Empleados activos</div><div className="kpi-value">{empleadosActivos}</div><div className="kpi-sub">personas</div></div>
      <div className="kpi-card tierra"><div className="kpi-icon"><Package aria-hidden="true" /></div><div className="kpi-label">Materias primas</div><div className="kpi-value">{mps.length}</div><div className="kpi-sub">ítems registrados</div></div>
      <div className="kpi-card lima"><div className="kpi-icon"><Handshake aria-hidden="true" /></div><div className="kpi-label">Clientes registrados</div><div className="kpi-value">{clientes.length}</div><div className="kpi-sub">activos</div></div>
    </div>
  )
  const fMesLabel = (ym) => { const [y, m] = String(ym || '').split('-').map(Number); return (MESES[m - 1] || '') + ' ' + (y || '') }
  const semaforoBadge = semaforoFin === 'verde' ? 'badge-verde' : semaforoFin === 'amarillo' ? 'badge-dorado' : 'badge-rojo'
  const semaforoTxt = semaforoFin === 'verde' ? '● Saludable' : semaforoFin === 'amarillo' ? '● Atención' : '● Crítico'
  W.financiero = (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', alignItems: 'center' }}>
        <Ico as={DollarSign} size={18} />Análisis financiero — {fMesLabel(mesActual)}
        {!cargandoFin && !alegraVentasFin?.error && <span className={`badge ${semaforoBadge}`} style={{ marginLeft: 'auto' }}>{semaforoTxt}</span>}
      </div>
      {cargandoFin
        ? <p className="empty-table">Calculando…</p>
        : alegraVentasFin?.error
          ? <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>ℹ {alegraVentasFin.error}</div>
          : (
            <>
              <div className="table-wrap">
                <table>
                  <tbody>
                    <tr><td>Ventas netas (Alegra)</td><td className="td-number">{fCOP(estadoResultados.ventasNetas)}</td><td className="td-number">100%</td></tr>
                    <tr><td>(−) Costo de producción</td><td className="td-number">{fCOP(estadoResultados.costoProduccion)}</td><td className="td-number">{estadoResultados.ventasNetas > 0 ? (estadoResultados.costoProduccion / estadoResultados.ventasNetas * 100).toFixed(1) + '%' : '—'}</td></tr>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--crema-oscuro)' }}><td>= Utilidad bruta</td><td className="td-number">{fCOP(estadoResultados.utilidadBruta)}</td><td className="td-number">{estadoResultados.margenBrutoPct.toFixed(1)}%</td></tr>
                    <tr><td>(−) Gastos de administración</td><td className="td-number">{fCOP(estadoResultados.gastosAdmin)}</td><td></td></tr>
                    <tr><td>(−) Gastos de ventas</td><td className="td-number">{fCOP(estadoResultados.gastosVentas)}</td><td></td></tr>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--crema-oscuro)' }}><td>= Utilidad operacional</td><td className="td-number">{fCOP(estadoResultados.utilidadOperacional)}</td><td className="td-number">{estadoResultados.margenOperacionalPct.toFixed(1)}%</td></tr>
                    <tr><td>(−) Gastos financieros</td><td className="td-number">{fCOP(estadoResultados.gastosFinancieros)}</td><td></td></tr>
                    <tr style={{ fontWeight: 700 }}><td>= Utilidad antes de impuestos</td><td className="td-number">{fCOP(estadoResultados.utilidadAntesImpuestos)}</td><td></td></tr>
                    <tr><td>(−) Impuestos sobre ingresos (ICA)</td><td className="td-number">{fCOP(estadoResultados.impuestos)}</td><td></td></tr>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--selva)', color: 'var(--selva)' }}><td>= Utilidad neta</td><td className="td-number">{fCOP(estadoResultados.utilidadNeta)}</td><td className="td-number">{estadoResultados.margenNetoPct.toFixed(1)}%</td></tr>
                  </tbody>
                </table>
              </div>
              {estadoMesAnterior.ventasNetas > 0 && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--crema)', borderRadius: 8, fontSize: '0.82rem', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span><strong>{fMesLabel(mesAnterior)}</strong> (comparativo):</span>
                  <span>Ventas {fCOP(estadoMesAnterior.ventasNetas)}
                    {' '}<strong style={{ color: estadoResultados.ventasNetas >= estadoMesAnterior.ventasNetas ? 'var(--selva)' : 'var(--rojo)' }}>
                      ({estadoMesAnterior.ventasNetas > 0 ? ((estadoResultados.ventasNetas / estadoMesAnterior.ventasNetas - 1) * 100).toFixed(1) : '—'}% este mes)
                    </strong></span>
                  <span>Utilidad neta {fCOP(estadoMesAnterior.utilidadNeta)} ({estadoMesAnterior.margenNetoPct.toFixed(1)}%)</span>
                </div>
              )}
              <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)', marginTop: 8 }}>
                Ventas reales del mes (facturas + remisiones de Alegra) vs. gastos operacionales <strong>mensuales estimados actuales</strong> (Costos → Costos y Gastos, y Nómina), no un histórico de gasto de ese mes específico.
              </div>
            </>
          )}
    </div>
  )
  W.inventario = (
    <div className="card">
      <div className="card-title"><Package size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Inventario de materias primas</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: alertaMP.length ? 12 : 0 }}>
        <div style={{ flex: 1, minWidth: 110, textAlign: 'center', background: 'var(--crema)', borderRadius: 8, padding: '10px' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--selva)' }}>{mps.length}</div><div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>ítems</div></div>
        <div style={{ flex: 1, minWidth: 110, textAlign: 'center', background: 'rgba(200,169,74,0.12)', borderRadius: 8, padding: '10px' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--dorado)' }}>{bajoStock.length}</div><div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>stock bajo</div></div>
        <div style={{ flex: 1, minWidth: 110, textAlign: 'center', background: 'rgba(192,57,43,0.10)', borderRadius: 8, padding: '10px' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--rojo)' }}>{sinStock.length}</div><div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>sin stock</div></div>
      </div>
      {alertaMP.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Materia prima</th><th>Estado</th><th className="td-number">Stock</th><th className="td-number">Mínimo</th></tr></thead>
            <tbody>
              {alertaMP.slice(0, 8).map(m => (
                <tr key={m.id}>
                  <td>{m.nombre}</td>
                  <td><span className={`badge ${m._estado === 'sin' ? 'badge-rojo' : 'badge-dorado'}`}>{m._estado === 'sin' ? 'SIN STOCK' : 'BAJO'}</span></td>
                  <td className="td-number">{fBaseStock(m)}</td>
                  <td className="td-number">{fNum((m.stock_min || 0) * factorU(m.unidad))} {baseLbl(m.unidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
  W.produccion_mensual = (
    <div className="card">
      <div className="card-title"><TrendingUp size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Producción mensual por categoría ({año})</div>
      {categorias.length === 0
        ? <p className="empty-table">Sin producción registrada en {año}</p>
        : <div style={{ position: 'relative', height: 300 }}><Bar data={barData} options={{
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${fNum(ctx.parsed.y)}`,
                  footer: (items) => 'Total mes: ' + fNum(items.reduce((s, it) => s + (it.parsed.y || 0), 0)),
                },
              },
            },
            scales: {
              x: { stacked: true, grid: { display: false } },
              y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,0.06)' } },
            },
          }} /></div>}
    </div>
  )
  W.distribucion = (
    <div className="card">
      <div className="card-title"><PieIcon size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Distribución por producto ({año})</div>
      {Object.keys(totalPorProducto).length > 0
        ? <div style={{ maxWidth: 360, margin: '0 auto' }}><Doughnut data={pieData} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} /></div>
        : <p className="empty-table">Sin datos para {año}</p>}
    </div>
  )
  W.ultimas = (
    <div className="card">
      <div className="card-title"><ClipboardList size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Últimas producciones</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Producto</th><th>Fecha</th><th>Cantidad</th><th>Estado</th></tr></thead>
          <tbody>
            {ultimas.length === 0 ? <tr><td colSpan={4} className="empty-table">Sin datos</td></tr>
              : ultimas.map(p => (
                <tr key={p.id}>
                  <td>
                    {p.producto}
                    {esImportado(p) && <span className="badge badge-azul" style={{ marginLeft: 6, fontSize: '0.62rem' }}>Importado</span>}
                  </td>
                  <td>{fFecha(p.fecha)}</td>
                  <td className="td-number">{p.cantidad}</td>
                  <td>
                    {p.aprobado === false
                      ? <span className="badge badge-dorado">pendiente</span>
                      : <span className={`badge ${p.estado === 'conforme' || !p.estado ? 'badge-verde' : 'badge-rojo'}`}>{p.estado || 'conforme'}</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {/* Vista compacta: enlace al módulo completo de Registro de Producción Diaria */}
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => !editando && navigate('/produccion')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Ver más <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
  W.sgc_cumplimiento = (
    <div className="card">
      <div className="card-title"><BookOpen size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Cumplimiento de registros SGC ({año}) <span className="badge badge-verde" style={{ marginLeft: 8 }}>{fNum(totalRegAño)} registros</span></div>
      {Object.keys(porPrograma).length > 0
        ? <div style={{ position: 'relative', height: 260 }}><Bar data={regBarData} options={{ responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }} /></div>
        : <p className="empty-table">Aún no hay registros diligenciados en {año}</p>}
    </div>
  )
  W.vencimientos = (
    <div className="card">
      <div className="card-title"><Bell size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Vencimientos de programas periódicos</div>
      {vencimientos.length === 0
        ? <p className="empty-table"><Ico as={CheckCircle2} size={14} />Todo al día. No hay registros vencidos ni próximos a vencer.</p>
        : <div className="table-wrap"><table>
            <thead><tr><th>Estado</th><th>Registro</th><th>Programa</th><th>Próxima fecha</th></tr></thead>
            <tbody>{vencimientos.map(a => (
              <tr key={a.p.id}>
                <td><span className={`badge ${a.estado === 'vencido' ? 'badge-rojo' : a.estado === 'proximo' ? 'badge-dorado' : 'badge-azul'}`}>{a.estado === 'vencido' ? 'VENCIDO' : a.estado === 'proximo' ? 'PRÓXIMO' : 'SIN REGISTRO'}</span></td>
                <td>{a.p.nombre}</td><td style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>{a.p.programa}</td><td>{a.proxima ? fFecha(a.proxima) : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>}
    </div>
  )
  W.calidad_kpis = (
    <div className="kpi-grid">
      <div className="kpi-card rojo"><div className="kpi-icon"><AlertTriangle aria-hidden="true" /></div><div className="kpi-label">NC abiertas</div><div className="kpi-value">{ncAbiertas}</div></div>
      <div className="kpi-card dorado"><div className="kpi-icon"><Clock aria-hidden="true" /></div><div className="kpi-label">ACPM vencidas</div><div className="kpi-value">{acpmVencidas}</div><div className="kpi-sub">compromiso vencido</div></div>
      <div className="kpi-card verde"><div className="kpi-icon"><CheckCircle2 aria-hidden="true" /></div><div className="kpi-label">NC cerradas</div><div className="kpi-value">{ncCerradas}</div></div>
      <div className="kpi-card lima"><div className="kpi-icon"><GraduationCap aria-hidden="true" /></div><div className="kpi-label">Horas capacitación ({año})</div><div className="kpi-value">{horasCap}</div><div className="kpi-sub">{asistenciasCap} asistencias</div></div>
    </div>
  )
  W.nc_severidad = (
    <div className="card">
      <div className="card-title"><AlertTriangle size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />No conformidades abiertas por severidad</div>
      {ncAbiertas > 0
        ? <div style={{ maxWidth: 320, margin: '0 auto' }}><Doughnut data={ncSevData} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} /></div>
        : <p className="empty-table"><Ico as={CheckCircle2} size={14} />No hay no conformidades abiertas</p>}
    </div>
  )
  W.resumen_calidad = (
    <div className="card">
      <div className="card-title"><Pin size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Resumen de calidad</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.9rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>No conformidades totales</span><strong>{ncs.length}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>% cierre</span><strong>{ncs.length ? Math.round(ncCerradas / ncs.length * 100) : 0}%</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: acpmVencidas > 0 ? 'var(--rojo)' : 'inherit' }}><span>ACPM con compromiso vencido</span><strong>{acpmVencidas}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Capacitaciones {año}</span><strong>{capAño.length}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Horas de formación {año}</span><strong>{horasCap} h</strong></div>
      </div>
    </div>
  )

  const visibles = orden.filter(k => !ocultos.includes(k))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Tablero Principal</h1>
        <div className="page-actions">
          <select className="form-control" value={año} onChange={e => setAño(Number(e.target.value))} style={{ width: 'auto' }}>
            {añosDisp.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className={`btn btn-sm ${editando ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setEditando(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Settings size={15} aria-hidden="true" />{editando ? 'Listo' : 'Personalizar'}
          </button>
          {!editando && <button className="btn btn-secondary btn-sm" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={15} aria-hidden="true" />PDF</button>}
        </div>
      </div>

      {/* Saludo */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(45,90,61,0.1)', color: 'var(--selva)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={20} aria-hidden="true" /></div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--selva, #2d5a3d)' }}>Hola, {profile?.nombre || 'Bienvenido'} 👋</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--texto-suave, #777)' }}>{getRolLabel(profile?.rol)}</div>
          </div>
        </div>
      </div>

      {/* Aviso: el desarrollador está editando la vista de un ROL */}
      {devRole && (
        <div className="card" style={{ marginBottom: 16, background: 'rgba(200,169,74,0.12)', border: '1px solid var(--dorado)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Settings size={18} aria-hidden="true" style={{ color: 'var(--dorado)' }} />
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--selva)' }}>
              Estás editando la <strong>vista por defecto del rol {getRolLabel(devRole)}</strong>. Los cambios se guardan en la nube y aplican a todos los usuarios de ese rol.
            </span>
            <button className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setDevRole(null)}>Salir de edición de rol</button>
          </div>
        </div>
      )}

      {/* Barra de personalización */}
      {editando && (
        <div className="card" style={{ marginBottom: 16, background: 'rgba(45,90,61,0.05)', border: '1px dashed var(--selva)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <GripVertical size={18} aria-hidden="true" style={{ color: 'var(--selva)' }} />
            <span style={{ fontSize: '0.88rem', color: 'var(--selva)', fontWeight: 600 }}>Arrastra los módulos por el asa para reordenarlos. Usa <EyeOff size={13} style={{ verticalAlign: '-2px' }} /> para ocultarlos.</span>
            <button className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={restablecer}><Ico as={RotateCcw} size={13} />Restablecer</button>
          </div>
          {ocultos.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--crema-oscuro)', paddingTop: 10 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--texto-suave)', marginBottom: 6 }}>Módulos ocultos (toca para agregar):</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ocultos.map(k => (
                  <button key={k} className="btn btn-xs btn-dorado" onClick={() => mostrar(k)}><Ico as={Plus} size={13} />{TITULOS[k] || k}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Módulos */}
      {editando
        ? orden.map((key, i) => (
            <div key={key} className={ord.rowClassName(i)} {...ord.rowProps(i)}
              style={{ position: 'relative', marginBottom: 16, opacity: ocultos.includes(key) ? 0.45 : 1, border: '1px dashed var(--crema-oscuro)', borderRadius: 12, padding: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span {...ord.handleProps(i)} title="Arrastrar" style={{ cursor: 'grab', color: 'var(--selva)', display: 'inline-flex' }}><GripVertical size={18} aria-hidden="true" /></span>
                <strong style={{ fontSize: '0.82rem', color: 'var(--selva)' }}>{TITULOS[key] || key}</strong>
                <button className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }}
                  onClick={() => ocultos.includes(key) ? mostrar(key) : ocultar(key)}>
                  {ocultos.includes(key) ? <><Ico as={Plus} size={13} />Mostrar</> : <><Ico as={EyeOff} size={13} />Ocultar</>}
                </button>
              </div>
              <div style={{ pointerEvents: 'none' }}>{W[key]}</div>
            </div>
          ))
        : visibles.map(key => <div key={key} style={{ marginBottom: 16 }}>{W[key]}</div>)
      }
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend,
} from 'chart.js'
import { Factory, Users, Package, Handshake, Lightbulb, TrendingUp, PieChart as PieIcon, ClipboardList, BookOpen, Bell, AlertTriangle, Clock, CheckCircle2, GraduationCap, Pin, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fNum, fFecha, getRolLabel } from '../lib/businessLogic'
import { fraseDelDia } from '../lib/frases'
import { notificarVencimientosRegistros } from '../lib/notificaciones'
import { useAuth } from '../context/AuthContext'

const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const COLORS = ['#2d5a3d','#7CB342','#C8A94A','#8B5E3C','#3d7a52','#a87450']

export default function Dashboard() {
  const [año, setAño] = useState(new Date().getFullYear())
  const { profile } = useAuth()
  const frase = fraseDelDia()

  // Al cargar el tablero (admin), genera alertas de vencimientos de registros periódicos
  useEffect(() => {
    if (profile?.rol === 'admin') notificarVencimientosRegistros()
  }, [profile?.rol])

  const { data: produccion = [] } = useQuery({
    queryKey: ['produccion'],
    queryFn: async () => {
      const { data } = await supabase.from('production_records').select('*').order('fecha', { ascending: false })
      return data || []
    },
  })

  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*')
      return data || []
    },
  })

  const { data: mps = [] } = useQuery({
    queryKey: ['raw_materials'],
    queryFn: async () => {
      const { data } = await supabase.from('raw_materials').select('*')
      return data || []
    },
  })

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('*')
      return data || []
    },
  })

  // Registros del SGC (BPM)
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

  // Solo registros aprobados (los pendientes de aprobación no cuentan en el tablero)
  const produccionAprob = produccion.filter(p => p.aprobado !== false)
  const prodAño = produccionAprob.filter(p => {
    try { return new Date(p.fecha).getFullYear() === año } catch { return false }
  })

  const totalProd = prodAño.reduce((s, p) => s + (p.cantidad || 0), 0)
  const empleadosActivos = empleados.filter(e => e.estado === 'activo').length
  const ultimas = [...produccionAprob].slice(0, 6)

  // Gráfico barras: producción mensual por producto
  const productos = [...new Set(prodAño.map(p => p.producto))].slice(0, 6)
  const barData = {
    labels: MESES,
    datasets: productos.map((pr, i) => ({
      label: pr.replace('GALLETA ','G.').replace('DULCE ','D.').replace('INFUSION ','I.'),
      data: Array.from({ length: 12 }, (_, m) =>
        prodAño.filter(p => p.producto === pr && new Date(p.fecha).getMonth() === m)
          .reduce((s, p) => s + (p.cantidad || 0), 0)
      ),
      backgroundColor: COLORS[i % COLORS.length],
    })),
  }

  // Gráfico torta: distribución por producto
  const byProd = {}
  prodAño.forEach(p => { byProd[p.producto] = (byProd[p.producto] || 0) + (p.cantidad || 0) })
  const pieData = {
    labels: Object.keys(byProd),
    datasets: [{ data: Object.values(byProd), backgroundColor: COLORS.concat(['#9CCC65','#e0c070','#4a7a5a','#c8a050']) }],
  }

  // ----- Registros SGC (BPM): por programa + vencimientos -----
  const plantById = Object.fromEntries(regPlantillas.map(p => [p.id, p]))
  const regAño = regEntradas.filter(e => { try { return new Date(e.fecha).getFullYear() === año } catch { return false } })
  const porPrograma = {}
  regAño.forEach(e => { const prog = plantById[e.plantilla_id]?.programa || 'Otros'; porPrograma[prog] = (porPrograma[prog] || 0) + 1 })
  const regBarData = {
    labels: Object.keys(porPrograma),
    datasets: [{ label: 'Registros diligenciados', data: Object.values(porPrograma), backgroundColor: '#7CB342' }],
  }
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

  // ----- Indicadores de calidad -----
  const ncAbiertas = ncs.filter(n => n.estado !== 'cerrada').length
  const ncCerradas = ncs.filter(n => n.estado === 'cerrada').length
  const acpmVencidas = ncs.filter(n => n.estado !== 'cerrada' && n.fecha_compromiso && n.fecha_compromiso < hoyStr).length
  const ncPorSev = { critica: 0, alta: 0, media: 0, baja: 0 }
  ncs.filter(n => n.estado !== 'cerrada').forEach(n => { ncPorSev[n.severidad] = (ncPorSev[n.severidad] || 0) + 1 })
  const ncSevData = {
    labels: ['Crítica', 'Alta', 'Media', 'Baja'],
    datasets: [{ data: [ncPorSev.critica, ncPorSev.alta, ncPorSev.media, ncPorSev.baja], backgroundColor: ['#c0392b', '#e07a3c', '#C8A94A', '#7CB342'] }],
  }
  const capAño = capacitaciones.filter(c => { try { return new Date(c.fecha).getFullYear() === año } catch { return false } })
  const horasCap = capAño.reduce((s, c) => s + (parseFloat(c.duracion_horas) || 0), 0)
  const asistenciasCap = capAño.reduce((s, c) => s + (Array.isArray(c.asistentes) ? c.asistentes.length : 0), 0)
  const hayCalidad = ncs.length > 0 || capacitaciones.length > 0

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Tablero Principal</h1>
        <div className="page-actions">
          <select className="form-control" value={año} onChange={e => setAño(Number(e.target.value))} style={{ width: 'auto' }}>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={15} aria-hidden="true" />PDF</button>
        </div>
      </div>

      {/* Saludo personalizado */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(45,90,61,0.1)', color: 'var(--selva)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={20} aria-hidden="true" /></div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--selva, #2d5a3d)' }}>
              Hola, {profile?.nombre || 'Bienvenido'} 👋
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--texto-suave, #777)' }}>{getRolLabel(profile?.rol)}</div>
          </div>
        </div>
      </div>

      {/* Frase del día */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #2d5a3d 0%, #3d7a52 100%)', color: '#fff', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Lightbulb size={26} style={{ flexShrink: 0, color: '#C8A94A' }} aria-hidden="true" />
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8, marginBottom: 4 }}>Frase del día</div>
            <div style={{ fontSize: '1.05rem', fontStyle: 'italic', lineHeight: 1.4 }}>“{frase.texto}”</div>
            <div style={{ fontSize: '0.82rem', opacity: 0.85, marginTop: 6 }}>— {frase.autor}</div>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card verde">
          <div className="kpi-icon"><Factory aria-hidden="true" /></div>
          <div className="kpi-label">Producción Total ({año})</div>
          <div className="kpi-value">{fNum(totalProd)}</div>
          <div className="kpi-sub">unidades</div>
        </div>
        <div className="kpi-card dorado">
          <div className="kpi-icon"><Users aria-hidden="true" /></div>
          <div className="kpi-label">Empleados Activos</div>
          <div className="kpi-value">{empleadosActivos}</div>
          <div className="kpi-sub">personas</div>
        </div>
        <div className="kpi-card tierra">
          <div className="kpi-icon"><Package aria-hidden="true" /></div>
          <div className="kpi-label">Materias Primas</div>
          <div className="kpi-value">{mps.length}</div>
          <div className="kpi-sub">ítems registrados</div>
        </div>
        <div className="kpi-card lima">
          <div className="kpi-icon"><Handshake aria-hidden="true" /></div>
          <div className="kpi-label">Clientes Registrados</div>
          <div className="kpi-value">{clientes.length}</div>
          <div className="kpi-sub">activos</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><TrendingUp size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Producción Mensual por Categoría</div>
        <div style={{ position: 'relative', height: 280 }}>
          <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }} />
        </div>
      </div>

      <div className="grid-resp" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-title"><PieIcon size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Distribución por Producto</div>
          {Object.keys(byProd).length > 0
            ? <div style={{ maxWidth: 360, margin: '0 auto' }}><Doughnut data={pieData} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} /></div>
            : <p className="empty-table">Sin datos para {año}</p>
          }
        </div>
        <div className="card">
          <div className="card-title"><ClipboardList size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Últimas Producciones</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th>Fecha</th><th>Cantidad</th><th>Estado</th></tr></thead>
              <tbody>
                {ultimas.length === 0
                  ? <tr><td colSpan={4} className="empty-table">Sin datos</td></tr>
                  : ultimas.map(p => (
                    <tr key={p.id}>
                      <td>{p.producto}</td>
                      <td>{fFecha(p.fecha)}</td>
                      <td className="td-number">{p.cantidad}</td>
                      <td>
                        <span className={`badge ${p.estado === 'conforme' ? 'badge-verde' : 'badge-rojo'}`}>
                          {p.estado || 'conforme'}
                        </span>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== Registros del Sistema de Gestión (BPM) ===== */}
      {regPlantillas.length > 0 && (
        <>
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-title"><BookOpen size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Cumplimiento de Registros SGC ({año}) <span className="badge badge-verde" style={{ marginLeft: 8 }}>{fNum(totalRegAño)} registros</span></div>
            {Object.keys(porPrograma).length > 0
              ? <div style={{ position: 'relative', height: 260 }}>
                  <Bar data={regBarData} options={{ responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }} />
                </div>
              : <p className="empty-table">Aún no hay registros diligenciados en {año}</p>}
          </div>

          <div className="card">
            <div className="card-title"><Bell size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Vencimientos de programas periódicos</div>
            {vencimientos.length === 0
              ? <p className="empty-table"><Ico as={CheckCircle2} size={14} />Todo al día. No hay registros vencidos ni próximos a vencer.</p>
              : <div className="table-wrap">
                  <table>
                    <thead><tr><th>Estado</th><th>Registro</th><th>Programa</th><th>Próxima fecha</th></tr></thead>
                    <tbody>
                      {vencimientos.map(a => (
                        <tr key={a.p.id}>
                          <td><span className={`badge ${a.estado === 'vencido' ? 'badge-rojo' : a.estado === 'proximo' ? 'badge-dorado' : 'badge-azul'}`}>{a.estado === 'vencido' ? 'VENCIDO' : a.estado === 'proximo' ? 'PRÓXIMO' : 'SIN REGISTRO'}</span></td>
                          <td>{a.p.nombre}</td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>{a.p.programa}</td>
                          <td>{a.proxima ? fFecha(a.proxima) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
          </div>
        </>
      )}

      {/* ===== Indicadores de Calidad ===== */}
      {hayCalidad && (
        <>
          <div className="kpi-grid" style={{ marginTop: 20 }}>
            <div className="kpi-card rojo"><div className="kpi-icon"><AlertTriangle aria-hidden="true" /></div><div className="kpi-label">NC abiertas</div><div className="kpi-value">{ncAbiertas}</div></div>
            <div className="kpi-card dorado"><div className="kpi-icon"><Clock aria-hidden="true" /></div><div className="kpi-label">ACPM vencidas</div><div className="kpi-value">{acpmVencidas}</div><div className="kpi-sub">compromiso vencido</div></div>
            <div className="kpi-card verde"><div className="kpi-icon"><CheckCircle2 aria-hidden="true" /></div><div className="kpi-label">NC cerradas</div><div className="kpi-value">{ncCerradas}</div></div>
            <div className="kpi-card lima"><div className="kpi-icon"><GraduationCap aria-hidden="true" /></div><div className="kpi-label">Horas capacitación ({año})</div><div className="kpi-value">{horasCap}</div><div className="kpi-sub">{asistenciasCap} asistencias</div></div>
          </div>

          <div className="grid-resp" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-title"><AlertTriangle size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />No conformidades abiertas por severidad</div>
              {ncAbiertas > 0
                ? <div style={{ maxWidth: 320, margin: '0 auto' }}><Doughnut data={ncSevData} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} /></div>
                : <p className="empty-table"><Ico as={CheckCircle2} size={14} />No hay no conformidades abiertas</p>}
            </div>
            <div className="card">
              <div className="card-title"><Pin size={18} style={{ verticalAlign: '-4px', marginRight: 6, color: 'var(--selva)' }} aria-hidden="true" />Resumen de calidad</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.9rem' }}>
                <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span>No conformidades totales</span><strong>{ncs.length}</strong></div>
                <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span>% cierre</span><strong>{ncs.length ? Math.round(ncCerradas / ncs.length * 100) : 0}%</strong></div>
                <div className="row" style={{ display: 'flex', justifyContent: 'space-between', color: acpmVencidas > 0 ? 'var(--rojo)' : 'inherit' }}><span>ACPM con compromiso vencido</span><strong>{acpmVencidas}</strong></div>
                <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Capacitaciones {año}</span><strong>{capAño.length}</strong></div>
                <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Horas de formación {año}</span><strong>{horasCap} h</strong></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

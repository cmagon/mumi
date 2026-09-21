import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fFecha, fCOP } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import Modal from '../components/ui/Modal'
import * as XLSX from 'xlsx'
import { Download, Pencil, X, RefreshCw, ShoppingBag, Users, CalendarClock, ArrowUp, ArrowDown } from 'lucide-react'
import Select from '../components/ui/Select'
import { useAuth } from '../context/AuthContext'
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

// Cabecera de tabla ordenable: al hacer clic ordena por esa columna y muestra la flecha.
const ThOrd = ({ campo, orden, dir, onSort, className, children }) => (
  <th className={className} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => onSort(campo)} title="Ordenar">
    {children}
    {orden === campo
      ? (dir === 'asc' ? <ArrowUp size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginLeft: 3 }} /> : <ArrowDown size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginLeft: 3 }} />)
      : <ArrowUp size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginLeft: 3, opacity: 0.25 }} />}
  </th>
)

const CANALES = { mayor: 'Por mayor', detal: 'Detal', feria: 'Feria/Evento', ecommerce: 'E-commerce', whatsapp: 'WhatsApp/Redes' }

const EMPTY = { nombre: '', contacto: '', telefono: '', email: '', canal: 'mayor', ciudad: '', direccion: '', obs: '', alegra_id: '', nit: '', tipo_identificacion: '' }

export default function Clientes() {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const esAdmin = (profile?.rol || 'admin') === 'admin'
  const [buscar, setBuscar] = useState('')
  const [filtroCanal, setFiltroCanal] = useState('')
  const [filtroCiudad, setFiltroCiudad] = useState('')
  const [orden, setOrden] = useState('nombre')      // nombre | valor | ciudad | ultima
  const [ordenDir, setOrdenDir] = useState('asc')   // asc | desc
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [detalle, setDetalle] = useState(null)      // cliente para ver desglose de compras

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('*').order('nombre')
      return data || []
    },
  })

  const save = useMutation({
    mutationFn: async (datos) => {
      // Campos que guardamos localmente. En clientes de Alegra, la identidad (nombre/razón
      // social, NIT) es de solo lectura: no se sobreescribe aquí.
      const esAlegra = !!datos.alegra_id
      const local = {
        contacto: datos.contacto, telefono: datos.telefono, email: datos.email,
        canal: datos.canal, ciudad: datos.ciudad, direccion: datos.direccion, obs: datos.obs,
      }
      if (!esAlegra) local.nombre = datos.nombre   // solo los manuales editan el nombre
      if (editId) {
        const { error } = await supabase.from('clients').update(local).eq('id', editId)
        if (error) throw error
        // Empuja a Alegra los campos editables (correo, teléfono, dirección, ciudad).
        if (esAlegra) {
          const { data: r, error: e2 } = await supabase.functions.invoke('alegra-update-contact', {
            body: { alegra_id: datos.alegra_id, email: datos.email, telefono: datos.telefono, direccion: datos.direccion, ciudad: datos.ciudad },
          })
          if (e2) throw new Error('Se guardó local, pero Alegra no aceptó el cambio: ' + e2.message)
          if (r?.error) throw new Error('Se guardó local, pero Alegra no aceptó el cambio: ' + r.error)
        }
      } else {
        const { error } = await supabase.from('clients').insert({ nombre: datos.nombre, ...local, fecha_reg: new Date().toISOString().split('T')[0] })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      setModal(false); setForm(EMPTY); setEditId(null)
      toast('Cliente guardado ✓')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); toast('Eliminado') },
  })

  // Sincroniza con Alegra: importa contactos y recalcula/guarda las métricas por cliente.
  // Corre automáticamente al abrir (si los datos están viejos) y también con el botón.
  const sincronizar = useMutation({
    mutationFn: async ({ silencioso } = {}) => {
      const r1 = await supabase.functions.invoke('alegra-contacts', { body: {} })
      if (r1.error || r1.data?.error) throw new Error(r1.data?.error || r1.error.message)
      const r2 = await supabase.functions.invoke('alegra-ventas-cliente', { body: {} })
      if (r2.error || r2.data?.error) throw new Error(r2.data?.error || r2.error.message)
      return { imp: r1.data, met: r2.data, silencioso }
    },
    onSuccess: ({ imp, silencioso }) => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      if (!silencioso) toast(`Alegra: ${imp.importados} nuevos · ${imp.actualizados} actualizados · métricas al día`)
    },
    onError: (e) => toast(e.message || 'No se pudo sincronizar con Alegra', 'error'),
  })

  // Métricas persistidas en la propia fila del cliente (las guarda alegra-ventas-cliente).
  const metricaDe = (c) => c?.metricas_sync_at
    ? { total: Number(c.compras_total) || 0, count: Number(c.compras_num) || 0, primera: c.compra_primera, ultima: c.compra_ultima, porMes: c.compras_por_mes || {} }
    : null
  const hayMetricas = clientes.some(c => c.metricas_sync_at)
  const ultimaSync = clientes.reduce((max, c) => (c.metricas_sync_at && c.metricas_sync_at > max ? c.metricas_sync_at : max), '')

  // Total facturado del ÚLTIMO AÑO (últimos 12 meses), sumado desde el desglose mensual.
  const mesCutoff = (() => { const d = new Date(); d.setMonth(d.getMonth() - 11); return d.toISOString().slice(0, 7) })()
  const totalAno = (m) => m ? Object.entries(m.porMes || {}).reduce((s, [k, v]) => (k >= mesCutoff ? s + (Number(v) || 0) : s), 0) : 0
  const ciudades = [...new Set(clientes.map(c => (c.ciudad || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  // Al pulsar una cabecera: si es la misma columna alterna dirección; si es otra, arranca en la
  // dirección natural (nombre/ciudad ascendente, valor/última compra descendente).
  const ordenarPor = (campo) => {
    if (orden === campo) { setOrdenDir(d => (d === 'asc' ? 'desc' : 'asc')); return }
    setOrden(campo); setOrdenDir(campo === 'valor' || campo === 'ultima' ? 'desc' : 'asc')
  }

  // Auto-sincroniza al abrir el módulo si nunca se hizo o si pasaron más de 6 horas.
  const autoRef = useRef(false)
  useEffect(() => {
    if (!esAdmin || autoRef.current || clientes.length === 0) return
    const viejo = !ultimaSync || (Date.now() - new Date(ultimaSync).getTime()) > 6 * 3600 * 1000
    if (viejo) { autoRef.current = true; sincronizar.mutate({ silencioso: true }) }
  }, [esAdmin, clientes.length, ultimaSync])

  const filtrados = clientes.filter(c => {
    const ok = (c.nombre || '').toLowerCase().includes(buscar.toLowerCase()) ||
               (c.contacto || '').toLowerCase().includes(buscar.toLowerCase())
    return ok && (!filtroCanal || c.canal === filtroCanal) && (!filtroCiudad || (c.ciudad || '') === filtroCiudad)
  }).sort((a, b) => {
    const clave = (c) => orden === 'valor' ? totalAno(metricaDe(c))
      : orden === 'ultima' ? (c.compra_ultima || '')
      : orden === 'ciudad' ? (c.ciudad || '').toLowerCase()
      : orden === 'canal' ? (CANALES[c.canal] || c.canal || '').toLowerCase()
      : (c.nombre || '').toLowerCase()
    const x = clave(a), y = clave(b)
    if (x < y) return ordenDir === 'asc' ? -1 : 1
    if (x > y) return ordenDir === 'asc' ? 1 : -1
    return 0
  })

  const openNew = () => { setForm(EMPTY); setEditId(null); setModal(true) }
  const openEdit = (c) => { setForm({ nombre: c.nombre, contacto: c.contacto || '', telefono: c.telefono || '', email: c.email || '', canal: c.canal, ciudad: c.ciudad || '', direccion: c.direccion || '', obs: c.obs || '', alegra_id: c.alegra_id || '', nit: c.nit || '', tipo_identificacion: c.tipo_identificacion || '' }); setEditId(c.id); setModal(true) }

  const handleSave = (e) => {
    e?.preventDefault?.()
    if (!form.nombre.trim()) { toast('Nombre requerido', 'warning'); return }
    save.mutate(form)
  }

  const exportarExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nombre','Contacto','Teléfono','Email','Canal','Ciudad'],
      ...filtrados.map(c => [c.nombre, c.contacto, c.telefono, c.email, c.canal, c.ciudad])
    ])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    XLSX.writeFile(wb, 'Clientes_MumiAmazonia.xlsx'); toast('Excel exportado ✓')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Clientes</h1>
        <div className="page-actions">
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={() => sincronizar.mutate({})} disabled={sincronizar.isPending} title="Importa contactos y recalcula las métricas desde Alegra (también ocurre automáticamente)">
            <Ico as={RefreshCw} size={14} />{sincronizar.isPending ? 'Sincronizando...' : 'Actualizar de Alegra'}
          </button>}
          <button className="btn btn-secondary btn-sm" onClick={exportarExcel}><Ico as={Download} size={14} />Excel</button>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo Cliente</button>
        </div>
      </div>

      {hayMetricas && (() => {
        const conCompra = clientes.filter(c => { const m = metricaDe(c); return m && m.count > 0 })
        const factAno = conCompra.reduce((s, c) => s + totalAno(metricaDe(c)), 0)
        const tile = (icon, label, val, color) => (
          <div className="card" style={{ flex: '1 1 150px', margin: 0, padding: 12 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)', display: 'flex', alignItems: 'center', gap: 5 }}><Ico as={icon} size={13} />{label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: color || 'var(--selva)' }}>{val}</div>
          </div>
        )
        return (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'stretch' }}>
            {tile(Users, 'Clientes con compras', conCompra.length)}
            {tile(ShoppingBag, 'Facturado (último año)', fCOP(factAno), 'var(--dorado)')}
          </div>
        )
      })()}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="text" className="form-control" placeholder="Buscar cliente..." value={buscar} onChange={e => setBuscar(e.target.value)} style={{ maxWidth: 300 }} />
        <Select className="form-control" value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Todos los canales</option>
          {Object.entries(CANALES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        {ciudades.length > 0 && (
          <Select className="form-control" value={filtroCiudad} onChange={e => setFiltroCiudad(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todas las ciudades</option>
            {ciudades.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr>
              <ThOrd campo="nombre" orden={orden} dir={ordenDir} onSort={ordenarPor}>Nombre / Empresa</ThOrd>
              <th>Contacto</th>
              <ThOrd campo="canal" orden={orden} dir={ordenDir} onSort={ordenarPor} className="col-opcional">Canal</ThOrd>
              <ThOrd campo="ciudad" orden={orden} dir={ordenDir} onSort={ordenarPor} className="col-opcional">Ciudad</ThOrd>
              {hayMetricas && <ThOrd campo="valor" orden={orden} dir={ordenDir} onSort={ordenarPor} className="td-number">Facturado (último año)</ThOrd>}
              {hayMetricas && <ThOrd campo="ultima" orden={orden} dir={ordenDir} onSort={ordenarPor} className="col-opcional">Última compra</ThOrd>}
              <th className="col-opcional-2">Fecha Reg.</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              {filtrados.length === 0
                ? <tr><td colSpan={hayMetricas ? 8 : 6} className="empty-table">Sin clientes registrados</td></tr>
                : filtrados.map(c => {
                  const m = metricaDe(c)
                  return (
                  <tr key={c.id}>
                    <td>
                      <button className="btn-link-emp" onClick={() => setDetalle(c)} title="Ver detalle del cliente"><strong>{c.nombre}</strong></button>
                      {c.alegra_id ? <span className="badge badge-verde" style={{ marginLeft: 6, fontSize: '0.62rem' }}>Alegra</span> : null}
                      {c.nit ? <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>{c.tipo_identificacion || 'ID'}: {c.nit}</div> : null}
                    </td>
                    <td>{c.contacto || '—'}<br /><small style={{ color: 'var(--texto-suave)' }}>{c.telefono}</small></td>
                    <td className="col-opcional"><span className="badge badge-azul">{CANALES[c.canal] || c.canal}</span></td>
                    <td className="col-opcional">{c.ciudad || '—'}</td>
                    {hayMetricas && <td className="td-number">
                      {m && m.count > 0
                        ? <button className="btn-link-emp" onClick={() => setDetalle(c)} title="Ver desglose de compras"><strong>{fCOP(totalAno(m))}</strong><div style={{ fontSize: '0.68rem', color: 'var(--texto-suave)', fontWeight: 400 }}>{m.count} compra(s)</div></button>
                        : <span style={{ color: 'var(--texto-suave)' }}>—</span>}
                    </td>}
                    {hayMetricas && <td className="col-opcional">{m?.ultima ? fFecha(m.ultima) : '—'}</td>}
                    <td className="col-opcional-2">{fFecha(c.fecha_reg)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-xs btn-secondary" onClick={() => openEdit(c)}><Pencil size={13} aria-hidden="true" /></button>
                        <button className="btn btn-xs btn-danger" onClick={() => confirmar('¿Eliminar cliente?').then(ok => ok && remove.mutate(c.id))}><X size={13} aria-hidden="true" /></button>
                      </div>
                    </td>
                  </tr>
                )})
              }
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modal} onClose={() => { setModal(false); setForm(EMPTY); setEditId(null) }}
        onSave={() => handleSave()}
        title={`${editId ? 'Editar' : 'Nuevo'} Cliente`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSave}>
          {form.alegra_id && (
            <div className="alert alert-info" style={{ fontSize: '0.8rem' }}>
              Cliente de <strong>Alegra</strong>. La razón social y el NIT son de solo lectura (se administran en Alegra). Lo demás se guarda aquí y se actualiza también en Alegra.
            </div>
          )}
          {form.alegra_id && (
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Razón social <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(Alegra)</small></label><input className="form-control" value={form.nombre} disabled readOnly /></div>
              <div className="form-group"><label className="form-label">{form.tipo_identificacion || 'NIT / ID'} <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(Alegra)</small></label><input className="form-control" value={form.nit} disabled readOnly /></div>
            </div>
          )}
          <div className="form-grid-2">
            {!form.alegra_id && <div className="form-group"><label className="form-label">Nombre / Empresa</label><input className="form-control" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>}
            <div className="form-group"><label className="form-label">Contacto</label><input className="form-control" value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} placeholder="Persona de contacto" /></div>
          </div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Teléfono / WhatsApp</label><input className="form-control" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Canal de venta</label>
              <Select className="form-control" value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}>
                {Object.entries(CANALES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </div>
            <div className="form-group"><label className="form-label">Ciudad</label><input className="form-control" value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Dirección</label><input className="form-control" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Observaciones</label><textarea className="form-control" rows={2} value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} /></div>
        </form>
      </Modal>

      {/* Modal detalle de compras del cliente (métricas de Alegra) */}
      <Modal open={!!detalle} onClose={() => setDetalle(null)} guard={false}
        title={`Compras — ${detalle?.nombre || ''}`}
        footer={<button className="btn btn-secondary" onClick={() => setDetalle(null)}>Cerrar</button>}>
        {detalle && (() => {
          const m = metricaDe(detalle)
          if (!m || !m.count) return <p className="empty-table">Este cliente no tiene compras registradas en Alegra.</p>
          const meses = Object.entries(m.porMes || {}).sort((a, b) => b[0].localeCompare(a[0]))
          return (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div className="card" style={{ flex: '1 1 130px', margin: 0, padding: 10 }}><div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>Facturado (último año)</div><div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--dorado)' }}>{fCOP(totalAno(m))}</div></div>
                <div className="card" style={{ flex: '1 1 130px', margin: 0, padding: 10 }}><div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>Total histórico</div><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{fCOP(m.total)}</div></div>
                <div className="card" style={{ flex: '1 1 100px', margin: 0, padding: 10 }}><div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>Nº compras</div><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{m.count}</div></div>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Ico as={CalendarClock} size={13} />Primera: <strong>{m.primera ? fFecha(m.primera) : '—'}</strong> · Última: <strong>{m.ultima ? fFecha(m.ultima) : '—'}</strong>
              </div>
              {meses.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Mes</th><th className="td-number">Comprado</th></tr></thead>
                    <tbody>{meses.map(([mes, val]) => <tr key={mes}><td>{mes}</td><td className="td-number">{fCOP(val)}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </>
          )
        })()}
      </Modal>
    </div>
  )
}

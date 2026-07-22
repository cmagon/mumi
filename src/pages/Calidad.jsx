import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile } from '../lib/supabase'
import { fFecha } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'
import { AlertTriangle, BarChart3, CheckCircle2, Download, Pencil, X } from 'lucide-react'
import Select from '../components/ui/Select'
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

const BUCKET = 'documentos'
const SEVERIDAD = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' }
const ESTADOS = { abierta: 'Abierta', en_proceso: 'En proceso', cerrada: 'Cerrada' }
const ORIGENES = ['producto', 'proceso', 'cliente', 'proveedor', 'auditoria', 'otro']
const TIPO_ACCION = { correctiva: 'Correctiva', preventiva: 'Preventiva', mejora: 'Mejora' }

const EMPTY = {
  fecha: new Date().toISOString().split('T')[0], tipo: 'interna', origen: 'producto', descripcion: '',
  producto: '', lote: '', detectado_por: '', severidad: 'media',
  accion_inmediata: '', causa_raiz: '', accion_correctiva: '', tipo_accion: 'correctiva',
  responsable: '', fecha_compromiso: '', fecha_cierre: '', eficaz: null, estado: 'abierta', origen_ref: '',
}

const badgeEstado = (e) => e === 'cerrada' ? 'badge-verde' : e === 'en_proceso' ? 'badge-dorado' : 'badge-rojo'
const badgeSev = (s) => s === 'critica' || s === 'alta' ? 'badge-rojo' : s === 'media' ? 'badge-dorado' : 'badge-azul'

export default function Calidad() {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const esAdmin = profile?.rol === 'admin'

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [fEstado, setFEstado] = useState('')
  const [fSev, setFSev] = useState('')
  const [buscar, setBuscar] = useState('')

  const { data: ncs = [] } = useQuery({
    queryKey: ['no_conformidades'],
    queryFn: async () => { const { data } = await supabase.from('no_conformidades').select('*').order('fecha', { ascending: false }); return data || [] },
  })

  // ---- Fuentes para sugerir No Conformidades automáticamente ----
  const { data: prodNoConf = [] } = useQuery({
    queryKey: ['prod_no_conformes'],
    queryFn: async () => { const { data } = await supabase.from('production_records').select('id, producto, lote, fecha, obs, estado, responsable').eq('estado', 'no conforme').order('fecha', { ascending: false }); return data || [] },
  })
  const { data: regPlantillas = [] } = useQuery({
    queryKey: ['registro_plantillas'],
    queryFn: async () => { const { data } = await supabase.from('registro_plantillas').select('id, nombre, programa'); return data || [] },
  })
  const { data: regEntradas = [] } = useQuery({
    queryKey: ['registro_entradas_noconf'],
    queryFn: async () => { const { data } = await supabase.from('registro_entradas').select('id, plantilla_id, fecha, datos, responsable, observaciones').order('fecha', { ascending: false }).limit(500); return data || [] },
  })

  const refsExistentes = new Set(ncs.map(n => n.origen_ref).filter(Boolean))
  const sugeridas = useMemo(() => {
    const out = []
    prodNoConf.forEach(r => {
      const ref = `prod-${r.id}`
      if (!refsExistentes.has(ref)) out.push({
        ref, fecha: (r.fecha || '').split('T')[0], origen: 'producto', severidad: 'alta',
        producto: r.producto || '', lote: r.lote || '', detectado_por: r.responsable || '',
        descripcion: `Producción NO CONFORME — ${r.producto || ''}${r.obs ? ': ' + r.obs : ''}`,
        fuente: 'Registro de producción',
      })
    })
    const plantById = Object.fromEntries(regPlantillas.map(p => [p.id, p]))
    regEntradas.forEach(e => {
      const d = e.datos || {}
      // Marcado no conforme: campo 'conforme' en false, o algún campo "conforme/ok" desmarcado
      const noConforme = d.conforme === false || d.conforme === 'false'
      if (!noConforme) return
      const ref = `reg-${e.id}`
      if (refsExistentes.has(ref)) return
      const pl = plantById[e.plantilla_id]
      out.push({
        ref, fecha: (e.fecha || '').split('T')[0], origen: 'proceso', severidad: 'media',
        producto: d.producto || d.area || '', lote: d.lote || '', detectado_por: e.responsable || '',
        descripcion: `Registro NO CONFORME — ${pl?.nombre || 'Libro'}${e.observaciones ? ': ' + e.observaciones : ''}`,
        fuente: pl?.nombre || 'Libro de registro',
      })
    })
    return out
  }, [prodNoConf, regEntradas, regPlantillas, ncs])

  const stats = useMemo(() => ({
    abiertas: ncs.filter(n => n.estado !== 'cerrada').length,
    cerradas: ncs.filter(n => n.estado === 'cerrada').length,
    criticas: ncs.filter(n => (n.severidad === 'critica' || n.severidad === 'alta') && n.estado !== 'cerrada').length,
    total: ncs.length,
  }), [ncs])

  const filtradas = ncs.filter(n =>
    (!fEstado || n.estado === fEstado) && (!fSev || n.severidad === fSev) &&
    (!buscar || `${n.codigo} ${n.descripcion} ${n.producto} ${n.lote}`.toLowerCase().includes(buscar.toLowerCase()))
  )

  const nuevoCodigo = () => {
    const año = new Date().getFullYear()
    const n = ncs.filter(x => (x.codigo || '').includes(`NC-${año}`)).length + 1
    return `NC-${año}-${String(n).padStart(3, '0')}`
  }

  const abrirNuevo = () => { setForm({ ...EMPTY }); setEditId(null); setFile(null); setModal(true) }
  const abrirEditar = (n) => {
    setForm({ ...EMPTY, ...n, eficaz: n.eficaz, fecha_compromiso: n.fecha_compromiso || '', fecha_cierre: n.fecha_cierre || '' })
    setEditId(n.id); setFile(null); setModal(true)
  }
  // Crear una NC a partir de una detección automática (prefill + enlace por origen_ref)
  const crearDesde = (sug) => {
    setForm({ ...EMPTY, fecha: sug.fecha || new Date().toISOString().split('T')[0], origen: sug.origen, severidad: sug.severidad,
      producto: sug.producto, lote: sug.lote, detectado_por: sug.detectado_por, descripcion: sug.descripcion, origen_ref: sug.ref })
    setEditId(null); setFile(null); setModal(true)
  }

  const guardar = async () => {
    if (!form.descripcion.trim()) { toast('Describe la no conformidad', 'warning'); return }
    setSaving(true)
    try {
      let storage_path = null, storage_url = null, archivo_nombre = null
      if (file) {
        const ext = file.name.split('.').pop()
        storage_path = `nc/${Date.now()}.${ext}`
        storage_url = await uploadFile(BUCKET, storage_path, file)
        archivo_nombre = file.name
      }
      const datos = {
        fecha: form.fecha, tipo: form.tipo, origen: form.origen, descripcion: form.descripcion,
        producto: form.producto, lote: form.lote, detectado_por: form.detectado_por, severidad: form.severidad,
        accion_inmediata: form.accion_inmediata, causa_raiz: form.causa_raiz, accion_correctiva: form.accion_correctiva,
        tipo_accion: form.tipo_accion, responsable: form.responsable,
        fecha_compromiso: form.fecha_compromiso || null, fecha_cierre: form.fecha_cierre || null,
        eficaz: form.eficaz, estado: form.estado, origen_ref: form.origen_ref || null, updated_at: new Date().toISOString(),
      }
      if (file) { datos.storage_path = storage_path; datos.storage_url = storage_url; datos.archivo_nombre = archivo_nombre }
      if (editId) {
        const { error } = await supabase.from('no_conformidades').update(datos).eq('id', editId); if (error) throw error
        toast('No conformidad actualizada ✓')
      } else {
        datos.codigo = nuevoCodigo(); datos.creado_por = profile?.nombre || ''
        const { error } = await supabase.from('no_conformidades').insert(datos); if (error) throw error
        toast('No conformidad registrada ✓')
      }
      qc.invalidateQueries({ queryKey: ['no_conformidades'] })
      setModal(false)
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  const eliminar = useMutation({
    mutationFn: async (n) => {
      if (n.storage_path) await supabase.storage.from(BUCKET).remove([n.storage_path]).catch(() => {})
      const { error } = await supabase.from('no_conformidades').delete().eq('id', n.id); if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['no_conformidades'] }); toast('Eliminada') },
  })

  const descargar = async (n) => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(n.storage_path); if (error) throw error
      const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = n.archivo_nombre || 'evidencia'
      document.body.appendChild(a); a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 300)
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><Ico as={AlertTriangle} size={14} />No Conformidades & ACPM</h1>
        <div className="page-actions"><button className="btn btn-primary btn-sm" onClick={abrirNuevo}>+ Nueva no conformidad</button></div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card rojo"><div className="kpi-icon">📂</div><div className="kpi-label">Abiertas</div><div className="kpi-value">{stats.abiertas}</div></div>
        <div className="kpi-card dorado"><div className="kpi-icon">🔥</div><div className="kpi-label">Críticas/Altas sin cerrar</div><div className="kpi-value">{stats.criticas}</div></div>
        <div className="kpi-card verde"><div className="kpi-icon"><CheckCircle2 size={13} aria-hidden="true" /></div><div className="kpi-label">Cerradas</div><div className="kpi-value">{stats.cerradas}</div></div>
        <div className="kpi-card tierra"><div className="kpi-icon"><BarChart3 size={13} aria-hidden="true" /></div><div className="kpi-label">Total</div><div className="kpi-value">{stats.total}</div></div>
      </div>

      {/* Detecciones automáticas (producción y registros no conformes) */}
      {sugeridas.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--dorado)', marginBottom: 12 }}>
          <div className="card-title" style={{ fontSize: '0.95rem' }}>🔎 Detectadas automáticamente <span className="badge badge-dorado" style={{ marginLeft: 8 }}>{sugeridas.length}</span></div>
          <div style={{ fontSize: '0.8rem', color: 'var(--texto-suave)', marginBottom: 8 }}>No conformidades detectadas en producción y libros de registro. Crea la NC para gestionar su ACPM.</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Fuente</th><th>Descripción</th><th>Producto/Lote</th><th></th></tr></thead>
              <tbody>
                {sugeridas.map(s => (
                  <tr key={s.ref}>
                    <td>{fFecha(s.fecha)}</td>
                    <td><span className="badge badge-azul">{s.fuente}</span></td>
                    <td style={{ maxWidth: 280, fontSize: '0.82rem' }}>{s.descripcion}</td>
                    <td>{s.producto || '—'}{s.lote ? ` / ${s.lote}` : ''}</td>
                    <td><button className="btn btn-xs btn-primary" onClick={() => crearDesde(s)}>+ Crear NC</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        <Select className="form-control" value={fEstado} onChange={e => setFEstado(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Todos los estados</option>{Object.entries(ESTADOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select className="form-control" value={fSev} onChange={e => setFSev(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Toda severidad</option>{Object.entries(SEVERIDAD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <input className="form-control" placeholder="Buscar..." value={buscar} onChange={e => setBuscar(e.target.value)} style={{ maxWidth: 240 }} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Fecha</th><th>Descripción</th><th>Producto/Lote</th><th>Severidad</th><th>Responsable</th><th>Compromiso</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {filtradas.length === 0
                ? <tr><td colSpan={9} className="empty-table">Sin no conformidades registradas.</td></tr>
                : filtradas.map(n => (
                  <tr key={n.id}>
                    <td><strong>{n.codigo || '—'}</strong></td>
                    <td>{fFecha(n.fecha)}</td>
                    <td style={{ maxWidth: 260 }}>{n.descripcion}</td>
                    <td>{n.producto || '—'}{n.lote ? ` / ${n.lote}` : ''}</td>
                    <td><span className={`badge ${badgeSev(n.severidad)}`}>{SEVERIDAD[n.severidad] || n.severidad}</span></td>
                    <td>{n.responsable || '—'}</td>
                    <td>{n.fecha_compromiso ? fFecha(n.fecha_compromiso) : '—'}</td>
                    <td><span className={`badge ${badgeEstado(n.estado)}`}>{ESTADOS[n.estado] || n.estado}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {n.storage_path && <button className="btn btn-xs btn-secondary" title="Evidencia" onClick={() => descargar(n)}><Download size={13} aria-hidden="true" /></button>}{' '}
                      <button className="btn btn-xs btn-secondary" onClick={() => abrirEditar(n)}><Pencil size={13} aria-hidden="true" /></button>{' '}
                      {esAdmin && <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Eliminar ${n.codigo}?`).then(ok => ok && eliminar.mutate(n))}><X size={13} aria-hidden="true" /></button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? `✏ ${form.codigo || 'No conformidad'}` : '+ Nueva no conformidad'} size="modal-lg"
        footer={<><button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button></>}>
        <div className="card-title" style={{ fontSize: '0.9rem' }}>1. Detección</div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Fecha</label><input type="date" className="form-control" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Tipo</label><Select className="form-control" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}><option value="interna">Interna</option><option value="externa">Externa (cliente)</option></Select></div>
          <div className="form-group"><label className="form-label">Origen</label><Select className="form-control" value={form.origen} onChange={e => setForm(f => ({ ...f, origen: e.target.value }))}>{ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}</Select></div>
          <div className="form-group"><label className="form-label">Severidad</label><Select className="form-control" value={form.severidad} onChange={e => setForm(f => ({ ...f, severidad: e.target.value }))}>{Object.entries(SEVERIDAD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
          <div className="form-group"><label className="form-label">Producto</label><input className="form-control" value={form.producto} onChange={e => setForm(f => ({ ...f, producto: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Lote</label><input className="form-control" value={form.lote} onChange={e => setForm(f => ({ ...f, lote: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Detectado por</label><input className="form-control" value={form.detectado_por} onChange={e => setForm(f => ({ ...f, detectado_por: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label className="form-label">Descripción de la no conformidad *</label><textarea className="form-control" rows={2} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Acción inmediata / corrección</label><textarea className="form-control" rows={2} value={form.accion_inmediata} onChange={e => setForm(f => ({ ...f, accion_inmediata: e.target.value }))} /></div>

        <div className="card-title" style={{ fontSize: '0.9rem' }}>2. ACPM (Acción correctiva)</div>
        <div className="form-group"><label className="form-label">Análisis de causa raíz</label><textarea className="form-control" rows={2} value={form.causa_raiz} onChange={e => setForm(f => ({ ...f, causa_raiz: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Acción correctiva/preventiva</label><textarea className="form-control" rows={2} value={form.accion_correctiva} onChange={e => setForm(f => ({ ...f, accion_correctiva: e.target.value }))} /></div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Tipo de acción</label><Select className="form-control" value={form.tipo_accion} onChange={e => setForm(f => ({ ...f, tipo_accion: e.target.value }))}>{Object.entries(TIPO_ACCION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
          <div className="form-group"><label className="form-label">Responsable</label><input className="form-control" value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Fecha compromiso</label><input type="date" className="form-control" value={form.fecha_compromiso} onChange={e => setForm(f => ({ ...f, fecha_compromiso: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Fecha de cierre</label><input type="date" className="form-control" value={form.fecha_cierre} onChange={e => setForm(f => ({ ...f, fecha_cierre: e.target.value }))} /></div>
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Estado</label><Select className="form-control" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>{Object.entries(ESTADOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
          <div className="form-group"><label className="form-label">Eficacia verificada</label>
            <Select className="form-control" value={form.eficaz === null || form.eficaz === undefined ? '' : String(form.eficaz)} onChange={e => setForm(f => ({ ...f, eficaz: e.target.value === '' ? null : e.target.value === 'true' }))}>
              <option value="">Pendiente</option><option value="true">Eficaz ✓</option><option value="false">No eficaz</option>
            </Select>
          </div>
        </div>
        <div className="form-group"><label className="form-label">Evidencia (foto/archivo, opcional)</label><input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files[0] || null)} />{file && <div style={{ fontSize: '0.8rem', color: 'var(--selva)' }}>📎 {file.name}</div>}</div>
      </Modal>
    </div>
  )
}

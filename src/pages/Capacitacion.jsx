import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile } from '../lib/supabase'
import { fFecha } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'

const BUCKET = 'documentos'
const TIPOS = ['BPM', 'HACCP', 'Seguridad', 'Calidad', 'Inducción', 'Otro']
const EMPTY = { tema: '', fecha: new Date().toISOString().split('T')[0], instructor: '', lugar: '', duracion_horas: 1, tipo: 'BPM', descripcion: '', asistentes: [], proxima_fecha: '' }

export default function Capacitacion() {
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
  const [buscar, setBuscar] = useState('')
  const [verAsist, setVerAsist] = useState(null)

  const { data: caps = [] } = useQuery({
    queryKey: ['capacitaciones'],
    queryFn: async () => { const { data } = await supabase.from('capacitaciones').select('*').order('fecha', { ascending: false }); return data || [] },
  })
  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('id, nombre, cargo').order('nombre'); return data || [] },
  })

  const stats = useMemo(() => {
    const año = new Date().getFullYear()
    const delAño = caps.filter(c => { try { return new Date(c.fecha).getFullYear() === año } catch { return false } })
    const horas = delAño.reduce((s, c) => s + (parseFloat(c.duracion_horas) || 0), 0)
    const asistencias = delAño.reduce((s, c) => s + (Array.isArray(c.asistentes) ? c.asistentes.length : 0), 0)
    return { total: caps.length, año: delAño.length, horas, asistencias }
  }, [caps])

  const filtradas = caps.filter(c => !buscar || `${c.tema} ${c.instructor} ${c.tipo}`.toLowerCase().includes(buscar.toLowerCase()))

  const abrirNuevo = () => { setForm({ ...EMPTY, asistentes: [] }); setEditId(null); setFile(null); setModal(true) }
  const abrirEditar = (c) => {
    setForm({ ...EMPTY, ...c, proxima_fecha: c.proxima_fecha || '', asistentes: Array.isArray(c.asistentes) ? c.asistentes : [] })
    setEditId(c.id); setFile(null); setModal(true)
  }

  const toggleAsistente = (emp) => {
    setForm(f => {
      const existe = f.asistentes.find(a => a.nombre === emp.nombre)
      if (existe) return { ...f, asistentes: f.asistentes.filter(a => a.nombre !== emp.nombre) }
      return { ...f, asistentes: [...f.asistentes, { nombre: emp.nombre, cargo: emp.cargo || '', nota: '', aprobado: true }] }
    })
  }
  const setAsist = (nombre, k, v) => setForm(f => ({ ...f, asistentes: f.asistentes.map(a => a.nombre === nombre ? { ...a, [k]: v } : a) }))

  const guardar = async () => {
    if (!form.tema.trim()) { toast('Indica el tema de la capacitación', 'warning'); return }
    setSaving(true)
    try {
      let storage_path = null, storage_url = null, archivo_nombre = null
      if (file) {
        const ext = file.name.split('.').pop()
        storage_path = `capacitacion/${Date.now()}.${ext}`
        storage_url = await uploadFile(BUCKET, storage_path, file)
        archivo_nombre = file.name
      }
      const datos = {
        tema: form.tema, fecha: form.fecha, instructor: form.instructor, lugar: form.lugar,
        duracion_horas: parseFloat(form.duracion_horas) || 0, tipo: form.tipo, descripcion: form.descripcion,
        asistentes: form.asistentes, proxima_fecha: form.proxima_fecha || null,
      }
      if (file) { datos.storage_path = storage_path; datos.storage_url = storage_url; datos.archivo_nombre = archivo_nombre }
      if (editId) {
        const { error } = await supabase.from('capacitaciones').update(datos).eq('id', editId); if (error) throw error
        toast('Capacitación actualizada ✓')
      } else {
        datos.creado_por = profile?.nombre || ''
        const { error } = await supabase.from('capacitaciones').insert(datos); if (error) throw error
        toast('Capacitación registrada ✓')
      }
      qc.invalidateQueries({ queryKey: ['capacitaciones'] }); setModal(false)
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  const eliminar = useMutation({
    mutationFn: async (c) => {
      if (c.storage_path) await supabase.storage.from(BUCKET).remove([c.storage_path]).catch(() => {})
      const { error } = await supabase.from('capacitaciones').delete().eq('id', c.id); if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['capacitaciones'] }); toast('Eliminada') },
  })

  const descargar = async (c) => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(c.storage_path); if (error) throw error
      const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = c.archivo_nombre || 'soporte'
      document.body.appendChild(a); a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 300)
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🎓 Capacitación</h1>
        <div className="page-actions"><button className="btn btn-primary btn-sm" onClick={abrirNuevo}>+ Nueva capacitación</button></div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card verde"><div className="kpi-icon">🎓</div><div className="kpi-label">Capacitaciones ({new Date().getFullYear()})</div><div className="kpi-value">{stats.año}</div></div>
        <div className="kpi-card dorado"><div className="kpi-icon">⏱</div><div className="kpi-label">Horas formación</div><div className="kpi-value">{stats.horas}</div></div>
        <div className="kpi-card tierra"><div className="kpi-icon">👥</div><div className="kpi-label">Asistencias</div><div className="kpi-value">{stats.asistencias}</div></div>
        <div className="kpi-card lima"><div className="kpi-icon">📚</div><div className="kpi-label">Histórico total</div><div className="kpi-value">{stats.total}</div></div>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <input className="form-control" placeholder="Buscar por tema, instructor, tipo..." value={buscar} onChange={e => setBuscar(e.target.value)} style={{ maxWidth: 300 }} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Tema</th><th>Tipo</th><th>Instructor</th><th className="td-number">Horas</th><th className="td-number">Asistentes</th><th>Próximo refuerzo</th><th>Acciones</th></tr></thead>
            <tbody>
              {filtradas.length === 0
                ? <tr><td colSpan={8} className="empty-table">Sin capacitaciones registradas.</td></tr>
                : filtradas.map(c => (
                  <tr key={c.id}>
                    <td>{fFecha(c.fecha)}</td>
                    <td><strong>{c.tema}</strong></td>
                    <td><span className="badge badge-azul">{c.tipo}</span></td>
                    <td>{c.instructor || '—'}</td>
                    <td className="td-number">{c.duracion_horas}</td>
                    <td className="td-number"><button className="btn btn-xs btn-secondary" onClick={() => setVerAsist(c)}>{Array.isArray(c.asistentes) ? c.asistentes.length : 0} 👥</button></td>
                    <td>{c.proxima_fecha ? fFecha(c.proxima_fecha) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {c.storage_path && <button className="btn btn-xs btn-secondary" title="Soporte" onClick={() => descargar(c)}>⬇</button>}{' '}
                      <button className="btn btn-xs btn-secondary" onClick={() => abrirEditar(c)}>✏</button>{' '}
                      {esAdmin && <button className="btn btn-xs btn-danger" onClick={() => confirmar(`¿Eliminar "${c.tema}"?`).then(ok => ok && eliminar.mutate(c))}>✕</button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal nueva/editar */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? '✏ Editar capacitación' : '+ Nueva capacitación'} size="modal-lg"
        footer={<><button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button></>}>
        <div className="form-group"><label className="form-label">Tema *</label><input className="form-control" value={form.tema} onChange={e => setForm(f => ({ ...f, tema: e.target.value }))} placeholder="Ej: Higiene y manipulación de alimentos" /></div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Fecha</label><input type="date" className="form-control" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Tipo</label><select className="form-control" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Instructor</label><input className="form-control" value={form.instructor} onChange={e => setForm(f => ({ ...f, instructor: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Lugar</label><input className="form-control" value={form.lugar} onChange={e => setForm(f => ({ ...f, lugar: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Duración (horas)</label><input type="number" className="form-control" value={form.duracion_horas} onChange={e => setForm(f => ({ ...f, duracion_horas: e.target.value }))} step="0.5" /></div>
          <div className="form-group"><label className="form-label">Próximo refuerzo (opcional)</label><input type="date" className="form-control" value={form.proxima_fecha} onChange={e => setForm(f => ({ ...f, proxima_fecha: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label className="form-label">Descripción / objetivos</label><textarea className="form-control" rows={2} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} /></div>

        <div className="card-title" style={{ fontSize: '0.9rem' }}>Asistentes y evaluación</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {empleados.map(emp => {
            const sel = form.asistentes.some(a => a.nombre === emp.nombre)
            return (
              <button key={emp.id} type="button" onClick={() => toggleAsistente(emp)} style={{
                padding: '4px 10px', fontSize: '0.78rem', borderRadius: 14, cursor: 'pointer',
                background: sel ? 'var(--selva)' : 'transparent', color: sel ? 'var(--crema)' : 'var(--texto-suave)',
                border: `1px solid ${sel ? 'var(--selva)' : 'var(--crema-oscuro)'}`,
              }}>{sel ? '✓ ' : '+ '}{emp.nombre}</button>
            )
          })}
          {empleados.length === 0 && <span style={{ color: 'var(--texto-suave)', fontSize: '0.8rem' }}>No hay empleados registrados</span>}
        </div>
        {form.asistentes.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 10 }}>
            <table>
              <thead><tr><th>Asistente</th><th>Cargo</th><th className="td-number">Nota</th><th>Aprobó</th></tr></thead>
              <tbody>
                {form.asistentes.map(a => (
                  <tr key={a.nombre}>
                    <td>{a.nombre}</td>
                    <td>{a.cargo || '—'}</td>
                    <td className="td-number"><input type="number" className="form-control" style={{ width: 70, textAlign: 'right' }} value={a.nota} onChange={e => setAsist(a.nombre, 'nota', e.target.value)} min={0} max={100} /></td>
                    <td><input type="checkbox" checked={a.aprobado !== false} onChange={e => setAsist(a.nombre, 'aprobado', e.target.checked)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="form-group"><label className="form-label">Soporte (lista de asistencia, presentación…)</label><input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files[0] || null)} />{file && <div style={{ fontSize: '0.8rem', color: 'var(--selva)' }}>📎 {file.name}</div>}</div>
      </Modal>

      {/* Modal ver asistentes */}
      <Modal open={!!verAsist} onClose={() => setVerAsist(null)} title={`👥 Asistentes — ${verAsist?.tema || ''}`}>
        {verAsist && (Array.isArray(verAsist.asistentes) && verAsist.asistentes.length > 0
          ? <div className="table-wrap"><table>
              <thead><tr><th>Asistente</th><th>Cargo</th><th className="td-number">Nota</th><th>Aprobó</th></tr></thead>
              <tbody>{verAsist.asistentes.map((a, i) => (
                <tr key={i}><td>{a.nombre}</td><td>{a.cargo || '—'}</td><td className="td-number">{a.nota || '—'}</td><td>{a.aprobado !== false ? '✓' : '✗'}</td></tr>
              ))}</tbody>
            </table></div>
          : <p className="empty-table">Sin asistentes registrados.</p>)}
      </Modal>
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fFecha } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import Modal from '../components/ui/Modal'
import * as XLSX from 'xlsx'

const CANALES = { mayor: 'Por mayor', detal: 'Detal', feria: 'Feria/Evento', ecommerce: 'E-commerce', whatsapp: 'WhatsApp/Redes' }

const EMPTY = { nombre: '', contacto: '', telefono: '', email: '', canal: 'mayor', ciudad: '', obs: '' }

export default function Clientes() {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const [buscar, setBuscar] = useState('')
  const [filtroCanal, setFiltroCanal] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('*').order('nombre')
      return data || []
    },
  })

  const save = useMutation({
    mutationFn: async (datos) => {
      if (editId) {
        const { error } = await supabase.from('clients').update(datos).eq('id', editId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clients').insert({ ...datos, fecha_reg: new Date().toISOString().split('T')[0] })
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

  const filtrados = clientes.filter(c => {
    const ok = (c.nombre || '').toLowerCase().includes(buscar.toLowerCase()) ||
               (c.contacto || '').toLowerCase().includes(buscar.toLowerCase())
    return ok && (!filtroCanal || c.canal === filtroCanal)
  })

  const openNew = () => { setForm(EMPTY); setEditId(null); setModal(true) }
  const openEdit = (c) => { setForm({ nombre: c.nombre, contacto: c.contacto || '', telefono: c.telefono || '', email: c.email || '', canal: c.canal, ciudad: c.ciudad || '', obs: c.obs || '' }); setEditId(c.id); setModal(true) }

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
          <button className="btn btn-secondary btn-sm" onClick={exportarExcel}>⬇ Excel</button>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo Cliente</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="text" className="form-control" placeholder="Buscar cliente..." value={buscar} onChange={e => setBuscar(e.target.value)} style={{ maxWidth: 300 }} />
        <select className="form-control" value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Todos los canales</option>
          {Object.entries(CANALES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre / Empresa</th><th>Contacto</th><th className="col-opcional">Canal</th><th className="col-opcional">Ciudad</th><th className="col-opcional-2">Fecha Reg.</th><th>Acciones</th></tr></thead>
            <tbody>
              {filtrados.length === 0
                ? <tr><td colSpan={6} className="empty-table">Sin clientes registrados</td></tr>
                : filtrados.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.nombre}</strong></td>
                    <td>{c.contacto || '—'}<br /><small style={{ color: 'var(--texto-suave)' }}>{c.telefono}</small></td>
                    <td className="col-opcional"><span className="badge badge-azul">{CANALES[c.canal] || c.canal}</span></td>
                    <td className="col-opcional">{c.ciudad || '—'}</td>
                    <td className="col-opcional-2">{fFecha(c.fecha_reg)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-xs btn-secondary" onClick={() => openEdit(c)}>✏</button>
                        <button className="btn btn-xs btn-danger" onClick={() => confirmar('¿Eliminar cliente?').then(ok => ok && remove.mutate(c.id))}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modal} onClose={() => { setModal(false); setForm(EMPTY); setEditId(null) }}
        onSave={() => handleSave()}
        title={`🤝 ${editId ? 'Editar' : 'Nuevo'} Cliente`}
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
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Nombre / Empresa</label><input className="form-control" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Contacto</label><input className="form-control" value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} placeholder="Persona de contacto" /></div>
          </div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Teléfono / WhatsApp</label><input className="form-control" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Canal de venta</label>
              <select className="form-control" value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}>
                {Object.entries(CANALES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Ciudad</label><input className="form-control" value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Observaciones</label><textarea className="form-control" rows={2} value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} /></div>
        </form>
      </Modal>
    </div>
  )
}

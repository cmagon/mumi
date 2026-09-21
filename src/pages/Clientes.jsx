import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fFecha } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import Modal from '../components/ui/Modal'
import * as XLSX from 'xlsx'
import { Download, Pencil, X, DownloadCloud } from 'lucide-react'
import Select from '../components/ui/Select'
import { useAuth } from '../context/AuthContext'
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

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

  // Importa los contactos que son clientes desde Alegra (solo admin)
  const importarAlegra = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('alegra-contacts', { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      toast(`Alegra: ${d.importados} nuevos · ${d.actualizados} actualizados · ${d.vinculados} enlazados`)
    },
    onError: (e) => toast(e.message || 'No se pudo importar de Alegra', 'error'),
  })

  const filtrados = clientes.filter(c => {
    const ok = (c.nombre || '').toLowerCase().includes(buscar.toLowerCase()) ||
               (c.contacto || '').toLowerCase().includes(buscar.toLowerCase())
    return ok && (!filtroCanal || c.canal === filtroCanal)
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
          {esAdmin && <button className="btn btn-secondary btn-sm" onClick={() => importarAlegra.mutate()} disabled={importarAlegra.isPending} title="Trae los contactos que son clientes desde Alegra">
            <Ico as={DownloadCloud} size={14} />{importarAlegra.isPending ? 'Importando...' : 'Importar de Alegra'}
          </button>}
          <button className="btn btn-secondary btn-sm" onClick={exportarExcel}><Ico as={Download} size={14} />Excel</button>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo Cliente</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="text" className="form-control" placeholder="Buscar cliente..." value={buscar} onChange={e => setBuscar(e.target.value)} style={{ maxWidth: 300 }} />
        <Select className="form-control" value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Todos los canales</option>
          {Object.entries(CANALES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
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
                    <td>
                      <strong>{c.nombre}</strong>
                      {c.alegra_id ? <span className="badge badge-verde" style={{ marginLeft: 6, fontSize: '0.62rem' }}>Alegra</span> : null}
                      {c.nit ? <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)' }}>{c.tipo_identificacion || 'ID'}: {c.nit}</div> : null}
                    </td>
                    <td>{c.contacto || '—'}<br /><small style={{ color: 'var(--texto-suave)' }}>{c.telefono}</small></td>
                    <td className="col-opcional"><span className="badge badge-azul">{CANALES[c.canal] || c.canal}</span></td>
                    <td className="col-opcional">{c.ciudad || '—'}</td>
                    <td className="col-opcional-2">{fFecha(c.fecha_reg)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-xs btn-secondary" onClick={() => openEdit(c)}><Pencil size={13} aria-hidden="true" /></button>
                        <button className="btn btn-xs btn-danger" onClick={() => confirmar('¿Eliminar cliente?').then(ok => ok && remove.mutate(c.id))}><X size={13} aria-hidden="true" /></button>
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
    </div>
  )
}

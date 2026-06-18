import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile } from '../lib/supabase'
import { fFecha } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import Modal from '../components/ui/Modal'

const CATEGORIAS = { produccion: 'Producción', producto: 'Producto terminado', inventario: 'Inventario', evento: 'Evento / Feria', empleados: 'Empleados', otro: 'Otro' }

export default function Galeria() {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const fileRef = useRef()
  const [filtro, setFiltro] = useState('')
  const [buscar, setBuscar] = useState('')
  const [modal, setModal] = useState(false)
  const [verModal, setVerModal] = useState(false)
  const [fotoActual, setFotoActual] = useState(null)
  const [form, setForm] = useState({ categoria: 'produccion', fecha: new Date().toISOString().split('T')[0], descripcion: '', etiquetas: '' })
  const [fotoFile, setFotoFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploading, setUploading] = useState(false)

  const { data: fotos = [] } = useQuery({
    queryKey: ['gallery'],
    queryFn: async () => {
      const { data } = await supabase.from('gallery_photos').select('*').order('created_at', { ascending: false })
      return data || []
    },
  })

  const remove = useMutation({
    mutationFn: async (foto) => {
      if (foto.storage_path) await supabase.storage.from('gallery').remove([foto.storage_path])
      const { error } = await supabase.from('gallery_photos').delete().eq('id', foto.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gallery'] }); setVerModal(false); toast('Foto eliminada') },
  })

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return
    setFotoFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleGuardar = async () => {
    if (!fotoFile) { toast('Selecciona una imagen', 'warning'); return }
    setUploading(true)
    try {
      const ext = fotoFile.name.split('.').pop()
      const path = `galeria/${Date.now()}.${ext}`
      const url = await uploadFile('gallery', path, fotoFile)
      const { error } = await supabase.from('gallery_photos').insert({
        ...form, storage_path: path, storage_url: url
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['gallery'] })
      setModal(false); setFotoFile(null); setPreviewUrl('')
      setForm({ categoria: 'produccion', fecha: new Date().toISOString().split('T')[0], descripcion: '', etiquetas: '' })
      toast('Foto guardada ✓')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDescargar = async (foto) => {
    if (!foto.storage_path) return
    const { data } = await supabase.storage.from('gallery').download(foto.storage_path)
    if (!data) return
    const url = URL.createObjectURL(data)
    const a = document.createElement('a'); a.href = url
    a.download = foto.descripcion || 'foto'; a.click()
    URL.revokeObjectURL(url)
  }

  const filtradas = fotos.filter(f =>
    (!filtro || f.categoria === filtro) &&
    (f.descripcion || '').toLowerCase().includes(buscar.toLowerCase())
  )

  const getFotoUrl = (foto) => {
    if (!foto.storage_path) return ''
    const { data } = supabase.storage.from('gallery').getPublicUrl(foto.storage_path)
    return data.publicUrl
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Galería Fotográfica</h1>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>📷 Agregar Foto</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" value={filtro} onChange={e => setFiltro(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Todas las categorías</option>
          {Object.entries(CATEGORIAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="text" className="form-control" placeholder="Buscar..." value={buscar} onChange={e => setBuscar(e.target.value)} style={{ maxWidth: 240 }} />
      </div>

      {filtradas.length === 0
        ? <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--texto-suave)' }}>
            📷 Agrega tus primeras fotos para guardar el registro visual de tu empresa
          </div>
        : <div className="foto-grid">
            {filtradas.map(f => {
              const url = getFotoUrl(f)
              return (
                <div key={f.id} className="foto-thumb" onClick={() => { setFotoActual(f); setVerModal(true) }}>
                  {url ? <img src={url} alt={f.descripcion} /> : <div className="foto-placeholder" style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', fontSize:'2rem', opacity:0.4 }}>📷</div>}
                  <div className="foto-thumb-info">
                    <div style={{ fontWeight: 600 }}>{f.descripcion || 'Sin descripción'}</div>
                    <div style={{ opacity: 0.8 }}>{fFecha(f.fecha)}</div>
                  </div>
                </div>
              )
            })}
          </div>
      }

      {/* Modal agregar foto */}
      <Modal open={modal} onClose={() => { setModal(false); setFotoFile(null); setPreviewUrl('') }} title="📷 Agregar Foto"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleGuardar} disabled={uploading}>
              {uploading ? 'Subiendo...' : 'Guardar Foto'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Fotografía</label>
          <div className="foto-upload" onClick={() => fileRef.current?.click()}>
            <input type="file" accept="image/*" ref={fileRef} onChange={handleFile} style={{ display: 'none' }} />
            {previewUrl
              ? <img src={previewUrl} className="foto-preview" alt="preview" />
              : <><div style={{ fontSize: '2rem', marginBottom: 8 }}>📸</div><div style={{ color: 'var(--texto-suave)', fontSize: '0.9rem' }}>Toca para agregar foto o tomar con cámara</div></>
            }
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Categoría</label>
            <select className="form-control" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
              {Object.entries(CATEGORIAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input type="date" className="form-control" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
          </div>
        </div>
        <div className="form-group"><label className="form-label">Descripción</label><input className="form-control" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Producción lote galletas asaí enero 2026" /></div>
        <div className="form-group"><label className="form-label">Etiquetas (opcional)</label><input className="form-control" value={form.etiquetas} onChange={e => setForm(f => ({ ...f, etiquetas: e.target.value }))} placeholder="Ej: asaí, galletas, enero" /></div>
      </Modal>

      {/* Modal ver foto */}
      <Modal open={verModal} onClose={() => setVerModal(false)} title={fotoActual?.descripcion || 'Foto'} size="modal-lg">
        {fotoActual && (
          <div style={{ textAlign: 'center' }}>
            <img src={getFotoUrl(fotoActual)} alt={fotoActual.descripcion} style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 4, objectFit: 'contain' }} />
            <p style={{ marginTop: 12, color: 'var(--texto-suave)' }}>
              {fFecha(fotoActual.fecha)}{fotoActual.etiquetas ? ' — ' + fotoActual.etiquetas : ''}
            </p>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => handleDescargar(fotoActual)}>⬇ Descargar</button>
              <button className="btn btn-danger btn-sm" onClick={() => confirmar('¿Eliminar foto?').then(ok => ok && remove.mutate(fotoActual))}>🗑 Eliminar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

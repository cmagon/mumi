import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fFecha } from '../lib/businessLogic'
import { estadoLote } from '../lib/lotes'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'

const fCant = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
const fmtV = (v) => v ? fFecha(v) : '—'

export default function ProductosPorEmpacar() {
  const toast = useToast()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const [tab, setTab] = useState('saldos')
  const [buscar, setBuscar] = useState('')
  const [modalBaja, setModalBaja] = useState(null)   // saldo a dar de baja
  const [bForm, setBForm] = useState({ cantidad: '', motivo: '' })

  const { data: saldos = [] } = useQuery({
    queryKey: ['mezcla_saldos'],
    queryFn: async () => { const { data } = await supabase.from('mezcla_saldos').select('*').eq('estado', 'disponible').gt('peso', 0).order('vencimiento', { ascending: true, nullsFirst: false }); return data || [] },
  })
  const { data: bajas = [] } = useQuery({
    queryKey: ['saldo_bajas'],
    queryFn: async () => { const { data } = await supabase.from('saldo_bajas').select('*').order('created_at', { ascending: false }).limit(300); return data || [] },
  })

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return saldos.filter(s => !q || (s.producto || '').toLowerCase().includes(q) || (s.lote || '').toLowerCase().includes(q))
  }, [saldos, buscar])

  const totalItems = saldos.length
  const porVencer = saldos.filter(s => estadoLote(s.vencimiento) !== 'ok').length

  const abrirBaja = (s) => { setModalBaja(s); setBForm({ cantidad: String(s.peso), motivo: '' }) }
  const darDeBaja = useMutation({
    mutationFn: async () => {
      const s = modalBaja
      const cant = parseFloat(bForm.cantidad)
      if (!(cant > 0)) throw new Error('Ingresa la cantidad a dar de baja')
      if (cant > Number(s.peso)) throw new Error('No puedes dar de baja más de lo disponible')
      if (!bForm.motivo.trim()) throw new Error('Indica el motivo de la baja')
      const restante = Math.max(0, Number(s.peso) - cant)
      await supabase.from('mezcla_saldos').update({ peso: restante, estado: restante <= 0 ? 'baja' : 'disponible' }).eq('id', s.id)
      await supabase.from('saldo_bajas').insert({ saldo_id: s.id, producto: s.producto, lote: s.lote || '', cantidad: cant, unidad: s.unidad || '', motivo: bForm.motivo, creado_por: profile?.nombre || '' })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mezcla_saldos'] }); qc.invalidateQueries({ queryKey: ['saldo_bajas'] }); setModalBaja(null); toast('Baja registrada ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Productos por Empacar</h1>
      </div>

      <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
        Semielaborados pendientes de empacar (sobrantes de mezcla y subporciones). Se empacan al diligenciar una orden del mismo producto (bloque "♻ Empacar saldo"). Aquí puedes <strong>darlos de baja</strong> si no se van a empacar.
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="card" style={{ flex: '1 1 160px' }}><div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>Productos por empacar</div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--selva)' }}>{totalItems}</div></div>
        <div className="card" style={{ flex: '1 1 160px' }}><div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>Por vencer / vencidos</div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: porVencer ? 'var(--rojo)' : 'var(--selva)' }}>{porVencer}</div></div>
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {[['saldos', '♻ Por empacar'], ['bajas', '🗑 Historial de bajas']].map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'saldos' && (
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>♻ Pendientes de empacar ({filtrados.length})
            <input className="form-control" style={{ marginLeft: 'auto', maxWidth: 240 }} placeholder="Buscar producto o lote..." value={buscar} onChange={e => setBuscar(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th>Lote</th><th className="td-number">Disponible</th><th className="col-opcional">Vence</th><th className="col-opcional-2">Origen</th><th></th></tr></thead>
              <tbody>
                {filtrados.length === 0
                  ? <tr><td colSpan={6} className="empty-table">No hay productos por empacar.</td></tr>
                  : filtrados.map(s => {
                      const est = estadoLote(s.vencimiento)
                      return (
                        <tr key={s.id}>
                          <td><strong>{s.producto}</strong></td>
                          <td>{s.lote || '(s/n)'}</td>
                          <td className="td-number">{fCant(s.peso)} {s.unidad}</td>
                          <td className="col-opcional" style={{ color: est === 'vencido' ? 'var(--rojo)' : est === 'por_vencer' ? 'var(--tierra)' : undefined }}>{fmtV(s.vencimiento)} {est === 'vencido' ? '⛔' : est === 'por_vencer' ? '⚠' : ''}</td>
                          <td className="col-opcional-2" style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>{s.created_at ? fFecha(s.created_at.slice(0, 10)) : '—'}</td>
                          <td><button className="btn btn-xs btn-danger" onClick={() => abrirBaja(s)}>🗑 Dar de baja</button></td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'bajas' && (
        <div className="card">
          <div className="card-title">🗑 Historial de bajas ({bajas.length})</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Producto</th><th>Lote</th><th className="td-number">Cantidad</th><th>Motivo</th><th>Por</th></tr></thead>
              <tbody>
                {bajas.length === 0
                  ? <tr><td colSpan={6} className="empty-table">Sin bajas registradas.</td></tr>
                  : bajas.map(b => (
                      <tr key={b.id}>
                        <td>{b.created_at ? fFecha(b.created_at.slice(0, 10)) : '—'}</td>
                        <td><strong>{b.producto}</strong></td>
                        <td>{b.lote || '—'}</td>
                        <td className="td-number">{fCant(b.cantidad)} {b.unidad}</td>
                        <td style={{ fontSize: '0.82rem' }}>{b.motivo || '—'}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--texto-suave)' }}>{b.creado_por || '—'}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal dar de baja */}
      <Modal open={!!modalBaja} onClose={() => setModalBaja(null)} title={`🗑 Dar de baja — ${modalBaja?.producto || ''}`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalBaja(null)}>Cancelar</button>
          <button className="btn btn-danger" onClick={() => darDeBaja.mutate()} disabled={darDeBaja.isPending}>{darDeBaja.isPending ? 'Guardando...' : 'Dar de baja'}</button>
        </>}>
        {modalBaja && (
          <div>
            <p style={{ fontSize: '0.85rem' }}>Lote <strong>{modalBaja.lote || '(s/n)'}</strong> · Disponible: <strong>{fCant(modalBaja.peso)} {modalBaja.unidad}</strong></p>
            <div className="form-group"><label className="form-label">Cantidad a dar de baja ({modalBaja.unidad})</label><input type="number" className="form-control" value={bForm.cantidad} onChange={e => setBForm(f => ({ ...f, cantidad: e.target.value }))} min={0} max={modalBaja.peso} step="any" /></div>
            <div className="form-group"><label className="form-label">Motivo</label><input className="form-control" value={bForm.motivo} onChange={e => setBForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ej: vencido, dañado, no se empacó..." /></div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>La baja descuenta del saldo y queda en el historial.</small>
          </div>
        )}
      </Modal>
    </div>
  )
}

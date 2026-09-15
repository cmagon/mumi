import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fFecha, fCOP } from '../lib/businessLogic'
import { estadoLote } from '../lib/lotes'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../context/AuthContext'
import { useNavTrail } from '../hooks/useNavTrail'
import Modal from '../components/ui/Modal'
import { Recycle, Trash2, Pencil, Shuffle } from 'lucide-react'
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

const fCant = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
const fmtV = (v) => v ? fFecha(v) : '—'

export default function ProductosPorEmpacar() {
  const toast = useToast()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const { pushTo } = useNavTrail()
  const [tab, setTab] = useState('saldos')
  const [buscar, setBuscar] = useState('')
  const [modalBaja, setModalBaja] = useState(null)   // saldo a dar de baja
  const [bForm, setBForm] = useState({ cantidad: '', motivo: '' })
  const [modalEditar, setModalEditar] = useState(null)   // saldo a editar cantidad
  const [eForm, setEForm] = useState({ cantidad: '', motivo: '' })
  // Empaque MEZCLADO (surtido): selección de 2+ saldos que se combinan en un solo producto terminado.
  const [mezclaSel, setMezclaSel] = useState({})   // { [saldoId]: true }
  const [modalMezcla, setModalMezcla] = useState(false)
  const [mForm, setMForm] = useState({ producto: '', cantidad: '' })

  const { data: saldos = [] } = useQuery({
    queryKey: ['mezcla_saldos'],
    // El segundo .order() replica exactamente la consulta de Órdenes de Producción, que
    // comparte esta clave: si difieren, los saldos con igual vencimiento salen en distinto
    // orden en cada pantalla según cuál haya cargado primero.
    queryFn: async () => { const { data } = await supabase.from('mezcla_saldos').select('*').eq('estado', 'disponible').gt('peso', 0).order('vencimiento', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }); return data || [] },
  })
  const { data: bajas = [] } = useQuery({
    queryKey: ['saldo_bajas'],
    queryFn: async () => { const { data } = await supabase.from('saldo_bajas').select('*').order('created_at', { ascending: false }).limit(300); return data || [] },
  })
  // Catálogo de productos terminados (para elegir el producto surtido resultante — no texto libre).
  const { data: terminados = [] } = useQuery({
    queryKey: ['finished_products', 'activos'],
    queryFn: async () => { const { data } = await supabase.from('finished_products').select('id, nombre, tipo, activo').eq('activo', true).order('nombre'); return data || [] },
  })

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return saldos.filter(s => !q || (s.producto || '').toLowerCase().includes(q) || (s.lote || '').toLowerCase().includes(q))
  }, [saldos, buscar])

  const totalItems = saldos.length
  const porVencer = saldos.filter(s => estadoLote(s.vencimiento) !== 'ok').length
  // Valor del inventario de PRODUCTO EN PROCESO: mezcla ya fabricada (absorbió materia prima,
  // mano de obra y CIF) pendiente de empacar. Los saldos anteriores a la migración v128 no
  // tienen costo guardado y no suman.
  const valorSaldo = (s) => (Number(s.peso) || 0) * (Number(s.costo_unitario) || 0)
  const valorTotal = saldos.reduce((acc, s) => acc + valorSaldo(s), 0)
  const sinValorar = saldos.filter(s => !(Number(s.costo_unitario) > 0)).length

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

  // Editar (corregir) la cantidad pendiente de un saldo. Deja registro del ajuste.
  const abrirEditar = (s) => { setModalEditar(s); setEForm({ cantidad: String(s.peso), motivo: '' }) }
  const editarSaldo = useMutation({
    mutationFn: async () => {
      const s = modalEditar
      const nueva = parseFloat(eForm.cantidad)
      if (!(nueva >= 0)) throw new Error('Ingresa la nueva cantidad (0 o más)')
      if (!eForm.motivo.trim()) throw new Error('Indica el motivo del ajuste')
      const delta = nueva - Number(s.peso)
      await supabase.from('mezcla_saldos').update({ peso: nueva, estado: nueva <= 0 ? 'baja' : 'disponible' }).eq('id', s.id)
      // Se registra el ajuste en el mismo historial (cantidad con signo: + aumenta, − reduce)
      await supabase.from('saldo_bajas').insert({ saldo_id: s.id, producto: s.producto, lote: s.lote || '', cantidad: delta, unidad: s.unidad || '', motivo: `[Ajuste de cantidad] ${eForm.motivo}`, creado_por: profile?.nombre || '' })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mezcla_saldos'] }); qc.invalidateQueries({ queryKey: ['saldo_bajas'] }); setModalEditar(null); toast('Cantidad actualizada ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  // ---- Empaque MEZCLADO (surtido) ----
  const toggleMezcla = (id) => setMezclaSel(m => { const n = { ...m }; if (n[id]) delete n[id]; else n[id] = true; return n })
  const saldosMezcla = useMemo(() => saldos.filter(s => mezclaSel[s.id]), [saldos, mezclaSel])
  // Cantidad de cajas por defecto = lo máximo que rinde el saldo más chico (relación 1 porción : 1 caja).
  const maxCajas = saldosMezcla.length ? Math.floor(Math.min(...saldosMezcla.map(s => Number(s.peso) || 0))) : 0
  const abrirMezcla = () => {
    if (saldosMezcla.length < 2) { toast('Selecciona al menos 2 productos por empacar para mezclar', 'warning'); return }
    if (saldosMezcla.some(s => !String(s.lote || '').trim())) { toast('Todos los productos a mezclar deben tener lote. Edita el que no lo tenga.', 'warning'); return }
    setMForm({ producto: '', cantidad: maxCajas > 0 ? String(maxCajas) : '' })
    setModalMezcla(true)
  }
  const confirmarMezcla = () => {
    const cajas = parseFloat(mForm.cantidad)
    if (!mForm.producto) { toast('Elige el producto surtido resultante', 'warning'); return }
    if (!(cajas > 0)) { toast('Indica cuántas cajas se empacan', 'warning'); return }
    if (maxCajas > 0 && cajas > maxCajas) { toast(`No puedes empacar más de ${fCant(maxCajas)} cajas — es lo que rinde el saldo más pequeño.`, 'warning'); return }
    const base = saldosMezcla[0]
    const combinados = saldosMezcla.slice(1)
    const loteMezcla = combinados.map(s => String(s.lote || '').trim()).filter(Boolean).join(', ')
    pushTo('/ordenes', {
      nuevaOrden: {
        producto: base.producto || '',
        origen: 'producto',
        origen_id: base.origen_id ? String(base.origen_id) : '',
        empacar_saldo: true,
        saldo_ids: [base.id],
        saldo_cantidades: { [base.id]: String(cajas) },
        vence: base.vencimiento || '',
        // Prellenado de surtido: el resto de lotes se combinan y el resultado va al producto elegido.
        surtido: true,
        lote_mezcla: loteMezcla,
        producto_surtido: mForm.producto,
        surtido_cantidad: cajas,
      },
    })
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Productos por Empacar</h1>
      </div>

      <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
        Semielaborados pendientes de empacar. Para empacarlos <strong>sin producir mezcla nueva</strong>: usa <strong>Empacar</strong> (crea una orden solo de empaque) o, en Órdenes, elige el producto → “¿Empacar solo saldo(s)?” y marca uno o varios lotes.
        Aquí también puedes <strong>darlos de baja</strong> si no se van a empacar.
        {' '}Es tu <strong>inventario de producto en proceso</strong>: ya consumió materia prima, mano de obra y CIF.
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="card" style={{ flex: '1 1 160px' }}><div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>Productos por empacar</div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--selva)' }}>{totalItems}</div></div>
        <div className="card" style={{ flex: '1 1 160px' }}><div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>Por vencer / vencidos</div><div style={{ fontSize: '1.4rem', fontWeight: 700, color: porVencer ? 'var(--rojo)' : 'var(--selva)' }}>{porVencer}</div></div>
        <div className="card" style={{ flex: '1 1 200px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }} title="Mezcla ya fabricada que aún no se empaca. Contablemente es inventario de producto en proceso.">Valor en proceso</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--dorado)' }}>{fCOP(valorTotal)}</div>
          {sinValorar > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--texto-suave)' }}>{sinValorar} saldo(s) sin costo registrado</div>}
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {[['saldos', '♻ Por empacar'], ['bajas', '🗑 Historial de bajas']].map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'saldos' && (
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Ico as={Recycle} size={14} />Pendientes de empacar ({filtrados.length})
            <button className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} title="Marca 2 o más lotes en la lista y combínalos en un solo producto (ej. Bocadillo asai + araza)"
              onClick={abrirMezcla} disabled={saldosMezcla.length < 2}>
              <Ico as={Shuffle} size={14} />Empacar mezclado{saldosMezcla.length >= 2 ? ` (${saldosMezcla.length})` : ''}
            </button>
            <input className="form-control" style={{ maxWidth: 240 }} placeholder="Buscar producto o lote..." value={buscar} onChange={e => setBuscar(e.target.value)} />
          </div>
          <div className="alert alert-info" style={{ fontSize: '0.78rem', marginBottom: 8 }}>
            💡 ¿Empacas <strong>dos sabores en una sola caja</strong>? Marca los lotes con la casilla ◻ y usa <strong>Empacar mezclado</strong>: se crea <strong>una</strong> orden que los combina y suma las cajas correctas (no los cuenta dos veces).
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th style={{ width: 28 }} title="Marcar para empacar mezclado"><Shuffle size={13} aria-hidden="true" /></th><th>Producto</th><th>Lote</th><th className="td-number">Disponible</th><th className="td-number">Valor</th><th className="col-opcional">Vence</th><th className="col-opcional-2">Origen</th><th></th></tr></thead>
              <tbody>
                {filtrados.length === 0
                  ? <tr><td colSpan={8} className="empty-table">No hay productos por empacar.</td></tr>
                  : filtrados.map(s => {
                      const est = estadoLote(s.vencimiento)
                      return (
                        <tr key={s.id} style={mezclaSel[s.id] ? { background: 'rgba(200,169,74,0.12)' } : undefined}>
                          <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!mezclaSel[s.id]} onChange={() => toggleMezcla(s.id)} title="Incluir en empaque mezclado" /></td>
                          <td><strong>{s.producto}</strong></td>
                          <td>{s.lote || '(s/n)'}</td>
                          <td className="td-number">{fCant(s.peso)} {s.unidad}</td>
                          <td className="td-number" title={Number(s.costo_unitario) > 0 ? `${fCOP(s.costo_unitario)} por ${s.unidad}` : 'Saldo creado antes de valorar el producto en proceso'}>
                            {Number(s.costo_unitario) > 0 ? fCOP(valorSaldo(s)) : '—'}
                          </td>
                          <td className="col-opcional" style={{ color: est === 'vencido' ? 'var(--rojo)' : est === 'por_vencer' ? 'var(--tierra)' : undefined }}>{fmtV(s.vencimiento)} {est === 'vencido' ? '⛔' : est === 'por_vencer' ? '⚠' : ''}</td>
                          <td className="col-opcional-2" style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>{s.created_at ? fFecha(s.created_at.slice(0, 10)) : '—'}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className="btn btn-xs btn-primary" title="Crear orden solo para empacar este saldo"
                              onClick={() => pushTo('/ordenes', {
                                nuevaOrden: {
                                  producto: s.producto || '',
                                  origen: 'producto',
                                  origen_id: s.origen_id ? String(s.origen_id) : '',
                                  empacar_saldo: true,
                                  saldo_ids: [s.id],
                                  saldo_cantidades: { [s.id]: String(s.peso) },
                                  vence: s.vencimiento || '',
                                },
                              })}>
                              <Ico as={Recycle} size={14} />Empacar
                            </button>{' '}
                            <button className="btn btn-xs btn-secondary" onClick={() => abrirEditar(s)}><Ico as={Pencil} size={14} />Editar</button>{' '}
                            <button className="btn btn-xs btn-danger" onClick={() => abrirBaja(s)}><Ico as={Trash2} size={14} />Dar de baja</button>
                          </td>
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
          <div className="card-title"><Ico as={Trash2} size={14} />Historial de bajas ({bajas.length})</div>
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

      {/* Modal editar cantidad */}
      <Modal open={!!modalEditar} onClose={() => setModalEditar(null)} title={`✏ Editar cantidad — ${modalEditar?.producto || ''}`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalEditar(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => editarSaldo.mutate()} disabled={editarSaldo.isPending}>{editarSaldo.isPending ? 'Guardando...' : 'Guardar cantidad'}</button>
        </>}>
        {modalEditar && (
          <div>
            <p style={{ fontSize: '0.85rem' }}>Lote <strong>{modalEditar.lote || '(s/n)'}</strong> · Actual: <strong>{fCant(modalEditar.peso)} {modalEditar.unidad}</strong></p>
            <div className="form-group"><label className="form-label">Nueva cantidad pendiente ({modalEditar.unidad})</label><input type="number" className="form-control" value={eForm.cantidad} onChange={e => setEForm(f => ({ ...f, cantidad: e.target.value }))} min={0} step="any" /></div>
            <div className="form-group"><label className="form-label">Motivo del ajuste</label><input className="form-control" value={eForm.motivo} onChange={e => setEForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ej: recuento, corrección, se dañaron algunas..." /></div>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Corrige la cantidad pendiente por empacar. El ajuste (diferencia) queda en el historial. Si la dejas en 0, el saldo se cierra.</small>
          </div>
        )}
      </Modal>

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
            {Number(modalBaja.costo_unitario) > 0 && (parseFloat(bForm.cantidad) || 0) > 0 && (
              <div className="alert alert-warning" style={{ fontSize: '0.82rem' }}>
                ⚠ Esta baja es una <strong>pérdida real de {fCOP((parseFloat(bForm.cantidad) || 0) * Number(modalBaja.costo_unitario))}</strong>:
                esa mezcla ya consumió materia prima, mano de obra y CIF que no vas a recuperar.
              </div>
            )}
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>La baja descuenta del saldo y queda en el historial.</small>
          </div>
        )}
      </Modal>

      {/* Modal empacar mezclado (surtido) */}
      <Modal open={modalMezcla} onClose={() => setModalMezcla(false)} title="🔀 Empacar mezclado (surtido)"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalMezcla(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmarMezcla}>Crear orden de empaque</button>
        </>}>
        <div>
          <p style={{ fontSize: '0.85rem', marginTop: 0 }}>Se combinan estos {saldosMezcla.length} lotes en <strong>una sola caja</strong>:</p>
          <ul style={{ fontSize: '0.85rem', margin: '0 0 10px', paddingLeft: 18 }}>
            {saldosMezcla.map(s => (
              <li key={s.id}><strong>{s.producto}</strong> · lote {s.lote || '(s/n)'} — disponible {fCant(s.peso)} {s.unidad}</li>
            ))}
          </ul>
          <div className="form-group">
            <label className="form-label">Producto surtido resultante</label>
            <select className="form-control" value={mForm.producto} onChange={e => setMForm(f => ({ ...f, producto: e.target.value }))}>
              <option value="">Seleccionar producto terminado...</option>
              {terminados.map(t => <option key={t.id} value={t.nombre}>{t.tipo === 'surtido' ? '🔀 ' : ''}{t.nombre}</option>)}
            </select>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Elige del catálogo de Producto Terminado. Si no existe, créalo primero para que sume al stock correcto.</small>
          </div>
          <div className="form-group">
            <label className="form-label">Cantidad de cajas a empacar {maxCajas > 0 && <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>— máximo {fCant(maxCajas)}</small>}</label>
            <input type="number" className="form-control" value={mForm.cantidad} onChange={e => setMForm(f => ({ ...f, cantidad: e.target.value }))} min={0} max={maxCajas || undefined} step="any" />
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>Cada caja consume 1 porción de cada sabor. Al cerrar la orden se descuentan los saldos y se suma este producto al stock. Podrás ajustar el consumo de cada lote en el paso de empaque.</small>
          </div>
          <div className="alert alert-info" style={{ fontSize: '0.8rem' }}>
            Se creará <strong>una orden de empaque</strong> (base: {saldosMezcla[0]?.producto || '—'}) con la mezcla ya cargada. Solo tendrás que <strong>iniciar el proceso</strong> y confirmar.
          </div>
        </div>
      </Modal>
    </div>
  )
}

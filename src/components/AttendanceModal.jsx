import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { writeOrQueue } from '../lib/offlineQueue'
import { fFecha, calcHoras } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import Modal from './ui/Modal'
import TimeField from './ui/TimeField'

const hoyStr = () => new Date().toISOString().split('T')[0]
const horaAhora = () => new Date().toTimeString().slice(0, 5)   // HH:MM

// Modal de fichaje de asistencia.
// modo: 'login' (al entrar / registro manual, con fecha seleccionable) | 'logout' (al salir, registra salida y cierra sesión)
export default function AttendanceModal({ emp, modo, onClose, onLogout, onRegistrarVarios }) {
  const toast = useToast()
  const qc = useQueryClient()
  const hoy = hoyStr()
  const esLogout = modo === 'logout'
  const [hora, setHora] = useState(horaAhora())
  const [fecha, setFecha] = useState(hoy)   // fecha que se está registrando (no aplica en logout)

  const { data: filas = [], refetch } = useQuery({
    queryKey: ['attendance_emp', emp?.id],
    queryFn: async () => {
      if (!emp?.id) return []
      const { data } = await supabase.from('attendance').select('*')
        .eq('emp_id', emp.id).order('fecha', { ascending: false }).order('id', { ascending: false })
      return data || []
    },
    enabled: !!emp?.id,
  })

  // Estado de fichaje
  const abierta = filas.find(f => f.entrada && !f.salida)        // sesión sin cerrar (la más reciente, cualquier fecha) — usada en logout
  const sesionesDia = filas.filter(f => f.fecha === fecha)       // sesiones de la fecha elegida
  const abiertaDia = sesionesDia.find(f => f.entrada && !f.salida)
  // objetivo de "registrar salida": en logout cierra la global; si no, la del día elegido
  const objetivoSalida = esLogout ? abierta : abiertaDia

  const registrarLlegada = useMutation({
    mutationFn: async () => {
      if (abiertaDia) throw new Error('Ya hay una llegada sin salida en esta fecha')
      return writeOrQueue({
        table: 'attendance', action: 'insert',
        payload: { emp_id: emp.id, fecha, entrada: hora, entrada_ts: new Date().toISOString() },
      })
    },
    onSuccess: (r) => { refetch(); qc.invalidateQueries({ queryKey: ['attendance'] }); toast(r?.queued ? 'Llegada guardada sin conexión — se sincronizará 📴' : 'Llegada registrada ✓'); setHora(horaAhora()) },
    onError: (e) => toast(e.message, 'error'),
  })

  const registrarSalida = useMutation({
    mutationFn: async () => {
      const obj = objetivoSalida
      if (!obj) throw new Error('No hay una llegada abierta para cerrar')
      if (obj.entrada && hora < obj.entrada) throw new Error(`La salida no puede ser anterior a la entrada (${obj.entrada})`)
      return writeOrQueue({
        table: 'attendance', action: 'update',
        payload: { salida: hora, salida_ts: new Date().toISOString() },
        match: { id: obj.id },
      })
    },
    onSuccess: (r) => { refetch(); qc.invalidateQueries({ queryKey: ['attendance'] }); toast(r?.queued ? 'Salida guardada sin conexión — se sincronizará 📴' : 'Salida registrada ✓'); setHora(horaAhora()) },
    onError: (e) => toast(e.message, 'error'),
  })

  // En modo logout sin sesión abierta → cerrar sin mostrar nada
  useEffect(() => {
    if (modo === 'logout' && filas && !abierta) onLogout?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, abierta, filas.length])

  if (modo === 'logout' && !abierta) return null

  const totalDia = sesionesDia.reduce((s, f) => s + calcHoras(f.entrada, f.salida), 0)
  const sesionCompletaDia = sesionesDia.some(f => f.entrada && f.salida)
  const esFechaHoy = fecha === hoy

  return (
    <Modal
      open
      guard={false}
      onClose={esLogout ? undefined : onClose}
      title="🕒 Registro de Asistencia"
      footer={
        <>
          {!esLogout && (abiertaDia
            ? <button className="btn btn-dorado" disabled={registrarSalida.isPending} onClick={() => registrarSalida.mutate()}>
                {registrarSalida.isPending ? 'Registrando...' : '⬅ Registrar salida'}
              </button>
            : <button className="btn btn-success" disabled={registrarLlegada.isPending} onClick={() => registrarLlegada.mutate()}>
                {registrarLlegada.isPending ? 'Registrando...' : '➡ Registrar llegada'}
              </button>
          )}
          {!esLogout && onRegistrarVarios && (
            <button className="btn btn-dorado" onClick={onRegistrarVarios}>🗓 Registrar varios</button>
          )}
          {!esLogout && <button className="btn btn-secondary" onClick={onClose} disabled={sesionCompletaDia}>Omitir</button>}
          {!esLogout && (
            <button className="btn btn-primary" onClick={onClose} disabled={sesionesDia.length === 0}>
              Aceptar
            </button>
          )}
          {esLogout && abierta && (
            <button className="btn btn-primary" disabled={registrarSalida.isPending}
              onClick={() => registrarSalida.mutateAsync().then(() => onLogout?.()).catch(() => {})}>
              {registrarSalida.isPending ? 'Registrando...' : 'Registrar salida y cerrar sesión'}
            </button>
          )}
        </>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <strong style={{ color: 'var(--selva)' }}>{emp?.nombre}</strong>
      </div>

      {/* Fecha (seleccionable salvo al cerrar sesión) */}
      {!esLogout
        ? (
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input type="date" className="form-control" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)} />
          </div>
        )
        : <div style={{ fontSize: '0.85rem', color: 'var(--texto-suave)', marginBottom: 8 }}>{fFecha(hoy)}</div>
      }

      <div className="form-group">
        <label className="form-label">{abiertaDia ? 'Hora de salida' : 'Hora de llegada'}</label>
        <TimeField value={hora} onChange={setHora} />
        {abiertaDia?.entrada && <small style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>No puede ser anterior a la entrada ({abiertaDia.entrada}).</small>}
      </div>

      {esLogout && abierta && (
        <div className="alert alert-info" style={{ fontSize: '0.85rem', marginTop: 8 }}>
          Tienes una llegada sin salida (entrada {abierta.entrada}). Registra tu salida para cerrar sesión.
        </div>
      )}

      {/* Sesiones de la fecha */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, color: 'var(--selva)', fontSize: '0.85rem', marginBottom: 6 }}>
          Sesiones del {esFechaHoy ? 'día' : fFecha(fecha)} {totalDia > 0 && <span style={{ fontWeight: 400, color: 'var(--texto-suave)' }}>· Total {totalDia.toFixed(2)} h</span>}
        </div>
        {sesionesDia.length === 0
          ? <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>Aún no hay sesiones en esta fecha.</p>
          : sesionesDia.map(f => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <span>Entrada {f.entrada || '—'} → Salida {f.salida || <span style={{ color: 'var(--tierra)' }}>pendiente</span>}</span>
              <strong>{f.salida ? calcHoras(f.entrada, f.salida).toFixed(2) + ' h' : ''}</strong>
            </div>
          ))}
      </div>
    </Modal>
  )
}

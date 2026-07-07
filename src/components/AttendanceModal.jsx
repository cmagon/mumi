import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { writeOrQueue } from '../lib/offlineQueue'
import { fFecha, calcHoras, fmtHoras } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../context/AuthContext'
import { puedeSeccionExplicita } from '../lib/permisos'
import Modal from './ui/Modal'
import TimeField from './ui/TimeField'
import { LogIn, LogOut, CalendarDays } from 'lucide-react'

const hoyStr = () => new Date().toISOString().split('T')[0]
const horaAhora = () => new Date().toTimeString().slice(0, 5)   // HH:MM

// Modal de fichaje de asistencia.
// modo: 'login' (al entrar / registro manual, con fecha seleccionable) | 'logout' (al salir, registra salida y cierra sesión)
export default function AttendanceModal({ emp, modo, onClose, onLogout, onRegistrarVarios }) {
  const toast = useToast()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const hoy = hoyStr()
  const esLogout = modo === 'logout'
  const [hora, setHora] = useState(horaAhora())
  const [fecha, setFecha] = useState(hoy)   // fecha que se está registrando (no aplica en logout)

  // ¿Puede registrar la asistencia de OTRA persona? (admin siempre; otros por permiso de sección)
  // Solo si el admin le otorgó EXPLÍCITAMENTE la sección "asistencia_otros" (opt-in), o es admin.
  const puedeOtros = !esLogout && !!profile && puedeSeccionExplicita(profile.rol, 'nomina', 'asistencia_otros')
  const [empSel, setEmpSel] = useState(emp)   // empleado sobre el que se registra (por defecto, uno mismo)
  const objetivo = esLogout ? emp : (empSel || emp)   // en logout siempre soy yo
  // "Yo" = el USUARIO LOGUEADO (profile), no necesariamente `emp` (que puede ser el operario
  // que el admin abrió para ficharle). Se compara por nombre.
  const mismoQueYo = (x) => !!x && !!profile && (x.nombre || '').trim().toLowerCase() === (profile.nombre || '').trim().toLowerCase()
  const empEsYo = mismoQueYo(emp)
  const esOtro = !mismoQueYo(objetivo)   // registrando por otra persona si el objetivo no soy yo

  // Nombres de usuarios con rol admin (para excluirlos del selector: los admin no fichan)
  const { data: adminNombres = [] } = useQuery({
    queryKey: ['admin_nombres_asist'],
    queryFn: async () => { const { data } = await supabase.from('user_profiles').select('nombre').eq('rol', 'admin'); return (data || []).map(u => (u.nombre || '').trim().toLowerCase()) },
    enabled: puedeOtros,
  })
  // Lista de empleados para el selector (solo si tiene el permiso). Se excluyen los que son admin.
  const { data: empleadosRaw = [] } = useQuery({
    queryKey: ['empleados_asist'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('id, nombre, estado').order('nombre'); return (data || []).filter(e => !e.estado || e.estado === 'activo') },
    enabled: puedeOtros,
  })
  const empleados = empleadosRaw.filter(e => !adminNombres.includes((e.nombre || '').trim().toLowerCase()))

  const { data: filas = [], refetch } = useQuery({
    queryKey: ['attendance_emp', objetivo?.id],
    queryFn: async () => {
      if (!objetivo?.id) return []
      const { data } = await supabase.from('attendance').select('*')
        .eq('emp_id', objetivo.id).order('fecha', { ascending: false }).order('id', { ascending: false })
      return data || []
    },
    enabled: !!objetivo?.id,
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
        payload: { emp_id: objetivo.id, fecha, entrada: hora, entrada_ts: new Date().toISOString(), ...(esOtro ? { editado_por: profile?.nombre || '' } : {}) },
      })
    },
    onSuccess: (r) => { refetch(); qc.invalidateQueries({ queryKey: ['attendance'] }); toast(r?.queued ? 'Llegada guardada sin conexión — se sincronizará 📴' : 'Llegada registrada ✓'); setHora(horaAhora()); if (!esLogout) onClose?.() },
    onError: (e) => toast(e.message, 'error'),
  })

  const registrarSalida = useMutation({
    mutationFn: async () => {
      const obj = objetivoSalida
      if (!obj) throw new Error('No hay una llegada abierta para cerrar')
      if (obj.entrada && hora < obj.entrada) throw new Error(`La salida no puede ser anterior a la entrada (${obj.entrada})`)
      return writeOrQueue({
        table: 'attendance', action: 'update',
        payload: { salida: hora, salida_ts: new Date().toISOString(), ...(esOtro ? { editado_por: profile?.nombre || '' } : {}) },
        match: { id: obj.id },
      })
    },
    onSuccess: (r) => { refetch(); qc.invalidateQueries({ queryKey: ['attendance'] }); toast(r?.queued ? 'Salida guardada sin conexión — se sincronizará 📴' : 'Salida registrada ✓'); setHora(horaAhora()); if (!esLogout) onClose?.() },
    onError: (e) => toast(e.message, 'error'),
  })

  // En modo logout sin sesión abierta → cerrar sin mostrar nada
  useEffect(() => {
    if (modo === 'logout' && filas && !abierta) onLogout?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, abierta, filas.length])

  if (modo === 'logout' && !abierta) return null

  const totalDia = sesionesDia.reduce((s, f) => s + calcHoras(f.entrada, f.salida), 0)
  const esFechaHoy = fecha === hoy
  // Acción principal: ¿toca registrar SALIDA o ENTRADA?
  const esSalida = esLogout || !!abiertaDia
  const IconoAccion = esSalida ? LogOut : LogIn
  const colorAccion = esSalida ? 'var(--dorado)' : 'var(--lima)'

  return (
    <Modal
      open
      guard={false}
      onClose={esLogout ? undefined : onClose}
      title={esOtro ? `Asistencia de ${objetivo?.nombre || ''}` : 'Registro de Asistencia'}
      footer={
        <>
          {!esLogout && (abiertaDia
            ? <button className="btn btn-dorado" disabled={registrarSalida.isPending} onClick={() => registrarSalida.mutate()}>
                <LogOut size={15} aria-hidden="true" />{registrarSalida.isPending ? 'Registrando...' : 'Registrar salida'}
              </button>
            : <button className="btn btn-success" disabled={registrarLlegada.isPending} onClick={() => registrarLlegada.mutate()}>
                <LogIn size={15} aria-hidden="true" />{registrarLlegada.isPending ? 'Registrando...' : 'Registrar llegada'}
              </button>
          )}
          {!esLogout && onRegistrarVarios && (
            <button className="btn btn-dorado" onClick={onRegistrarVarios}><CalendarDays size={15} aria-hidden="true" />Registrar varios</button>
          )}
          {!esLogout && <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>}
          {esLogout && abierta && (
            <>
              {/* Se permite cerrar sesión aunque no registre la salida: queda pendiente y se avisa */}
              <button className="btn btn-secondary" disabled={registrarSalida.isPending}
                onClick={() => { toast('Cerraste sesión con una asistencia pendiente (sin hora de salida). Regístrala luego.', 'warning'); onLogout?.() }}>
                Cerrar sin registrar
              </button>
              <button className="btn btn-primary" disabled={registrarSalida.isPending}
                onClick={() => registrarSalida.mutateAsync().then(() => onLogout?.()).catch(() => {})}>
                {registrarSalida.isPending ? 'Registrando...' : 'Registrar salida y cerrar sesión'}
              </button>
            </>
          )}
        </>
      }
    >
      {/* Estilos: en pantallas bajas/estrechas se compacta el encabezado para que quepa completo */}
      <style>{`
        .asis-hero-ic { width: 84px; height: 84px; }
        .asis-hero-ic svg { width: 42px; height: 42px; }
        .asis-hero-tt { font-size: 1.6rem; }
        @media (max-height: 740px), (max-width: 400px) {
          .asis-hero { margin-bottom: 10px !important; }
          .asis-hero-ic { width: 54px; height: 54px; margin-bottom: 6px !important; }
          .asis-hero-ic svg { width: 28px; height: 28px; }
          .asis-hero-tt { font-size: 1.2rem; }
          .asis-name { margin-bottom: 8px !important; }
        }
      `}</style>

      {/* Encabezado intuitivo: icono + acción clara */}
      <div className="asis-hero" style={{ textAlign: 'center', marginBottom: 16 }}>
        <div className="asis-hero-ic" style={{
          margin: '0 auto 10px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: esSalida ? 'rgba(200,169,74,0.15)' : 'rgba(124,179,66,0.15)',
          border: `2px solid ${colorAccion}`,
        }}>
          <IconoAccion strokeWidth={2} aria-hidden="true" style={{ color: colorAccion }} />
        </div>
        <div className="asis-hero-tt" style={{ fontFamily: "var(--fuente-titulos, 'Playfair Display'), serif", fontWeight: 700, color: 'var(--selva)', lineHeight: 1.1 }}>
          {esSalida ? 'Registre salida' : 'Registre entrada'}
        </div>
      </div>

      <div className="asis-name" style={{ marginBottom: 12, textAlign: 'center' }}>
        <strong style={{ color: 'var(--selva)' }}>{objetivo?.nombre}</strong>
        {esOtro && <span className="badge badge-dorado" style={{ marginLeft: 8, fontSize: '0.7rem' }}>registrando por otra persona</span>}
      </div>

      {/* Registrar la asistencia de otra persona (si tiene el permiso) */}
      {puedeOtros && (
        <div className="form-group">
          <label className="form-label">Registrar asistencia de</label>
          <select className="form-control" value={objetivo?.id || ''} onChange={e => { const id = e.target.value; setEmpSel(String(id) === String(emp?.id) ? emp : (empleados.find(x => String(x.id) === String(id)) || emp)); setHora(horaAhora()) }}>
            {emp && <option value={emp.id}>{emp.nombre}{empEsYo ? ' (yo)' : ''}</option>}
            {empleados.filter(x => String(x.id) !== String(emp?.id)).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </div>
      )}

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
        <div className="alert alert-warning" style={{ fontSize: '0.85rem', marginTop: 8 }}>
          Tienes una <strong>llegada sin salida</strong> (entrada {abierta.entrada}). Puedes registrar tu salida ahora, o <strong>cerrar sin registrar</strong>: quedará como asistencia pendiente para completarla después.
        </div>
      )}

      {/* Sesiones de la fecha */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600, color: 'var(--selva)', fontSize: '0.85rem', marginBottom: 6 }}>
          Sesiones del {esFechaHoy ? 'día' : fFecha(fecha)} {totalDia > 0 && <span style={{ fontWeight: 400, color: 'var(--texto-suave)' }}>· Total {fmtHoras(totalDia)} h</span>}
        </div>
        {sesionesDia.length === 0
          ? <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>Aún no hay sesiones en esta fecha.</p>
          : <div style={{ maxHeight: '22vh', overflowY: 'auto' }}>
              {sesionesDia.map(f => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <span>Entrada {f.entrada || '—'} → Salida {f.salida || <span style={{ color: 'var(--tierra)' }}>pendiente</span>}</span>
                  <strong>{f.salida ? fmtHoras(calcHoras(f.entrada, f.salida)) + ' h' : ''}</strong>
                </div>
              ))}
            </div>}
      </div>
    </Modal>
  )
}

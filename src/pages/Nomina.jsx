import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fFecha, fCOP, fNum, calcularNomina, calcHoras, fmtHoras, SMV, getRolLabel, PARAMS_NOMINA_DEFAULT, TIPOS_PAGO, getTipoPagoLabel } from '../lib/businessLogic'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'
import AttendanceModal from '../components/AttendanceModal'
import TimeField from '../components/ui/TimeField'
import MoneyInput from '../components/ui/MoneyInput'
import { useConfirm } from '../context/ConfirmContext'
import { AccordionItem, Fila } from '../components/ui/Acordeon'
import * as XLSX from 'xlsx'
import { BarChart3, ClipboardList, Clock, DollarSign, Download, FolderOpen, Pencil, Pin, Settings, Users, X } from 'lucide-react'
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

const MESES_LABELS = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const EMPTY_EMP = {
  nombre: '', cargo: 'Operario', tipo_pago: 'nomina', salario: SMV, tarifa_destajo: '', valor_hora: '',
  cedula: '', telefono: '', estado: 'activo',
  correo: '', direccion: '', fecha_nacimiento: '', fecha_ingreso: '', eps: '', contacto_emergencia: '',
}

export default function Nomina() {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const rol = profile?.rol || 'admin'
  const esAdmin = rol === 'admin'
  const esAuxiliar = rol === 'auxiliar'   // solo su propia asistencia
  const [tab, setTab] = useState('empleados')
  const [nomEmpId, setNomEmpId] = useState('')
  const [nomUnidades, setNomUnidades] = useState('')   // unidades producidas (para destajo por producción)
  const [nomPeriodo, setNomPeriodo] = useState('mensual')
  const [nomMes, setNomMes] = useState(new Date().getMonth() + 1)
  const [nomAño, setNomAño] = useState(new Date().getFullYear())
  // Rango de fechas a liquidar (por defecto, el mes actual)
  const _hoyD = new Date()
  const [nomDesde, setNomDesde] = useState(new Date(_hoyD.getFullYear(), _hoyD.getMonth(), 1).toISOString().split('T')[0])
  const [nomHasta, setNomHasta] = useState(new Date(_hoyD.getFullYear(), _hoyD.getMonth() + 1, 0).toISOString().split('T')[0])
  const [modalEmp, setModalEmp] = useState(false)
  const [formEmp, setFormEmp] = useState(EMPTY_EMP)
  const [editEmpId, setEditEmpId] = useState(null)
  const [empEsUsuario, setEmpEsUsuario] = useState(true)   // ¿el empleado tiene cuenta de usuario (login)?
  const [asistEmpModal, setAsistEmpModal] = useState(null)   // empleado para registrar asistencia
  const [detalleEmp, setDetalleEmp] = useState(null)         // empleado para ver detalle
  const [listadoEmp, setListadoEmp] = useState(null)         // empleado para ver/editar listado
  const [lisMes, setLisMes] = useState(new Date().getMonth() + 1)   // mes del listado
  const [lisAño, setLisAño] = useState(new Date().getFullYear())
  const [editReg, setEditReg] = useState(null)              // fila de asistencia en edición (modal)
  const [editForm, setEditForm] = useState({ entrada: '', salida: '' })
  const [loteModal, setLoteModal] = useState(false)         // registro en lote (varias fechas)
  const [loteEmp, setLoteEmp] = useState(null)              // empleado del lote
  const [loteFilas, setLoteFilas] = useState([{ fecha: '', entrada: '', salida: '' }])

  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').order('nombre')
      return data || []
    },
  })

  const { data: asistencia = [] } = useQuery({
    queryKey: ['attendance'],
    queryFn: async () => {
      const { data } = await supabase.from('attendance').select('*')
      return data || []
    },
  })

  // Registros de nómina guardados
  const guardarLiquidacion = useMutation({
    mutationFn: async ({ emp, periodo, desde, hasta, mes, anio, resultado }) => {
      // Verificación anti-duplicado: rangos que se cruzan para el mismo empleado
      const { data: existentes } = await supabase.from('payroll_records')
        .select('id, fecha_desde, fecha_hasta').eq('emp_id', emp.id)
      const cruza = (existentes || []).some(r => r.fecha_desde && r.fecha_hasta && r.fecha_desde <= hasta && r.fecha_hasta >= desde)
      if (cruza) throw new Error('Ya existe una liquidación guardada que se cruza con ese rango de fechas')
      const { error } = await supabase.from('payroll_records').insert({
        emp_id: emp.id, empleado: emp.nombre, periodo, mes, anio,
        fecha_desde: desde, fecha_hasta: hasta, tipo: resultado.tipo,
        resultado, creado_por: profile?.nombre || '',
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll_records'] }); toast('Liquidación guardada ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  const { data: registrosNomina = [] } = useQuery({
    queryKey: ['payroll_records'],
    queryFn: async () => {
      const { data } = await supabase.from('payroll_records').select('*').order('created_at', { ascending: false })
      return data || []
    },
  })

  // Parámetros de liquidación (configurables por el admin)
  const { data: paramsRow } = useQuery({
    queryKey: ['payroll_settings'],
    queryFn: async () => {
      const { data } = await supabase.from('payroll_settings').select('params').eq('id', 1).maybeSingle()
      return data?.params || null
    },
  })
  // Mezcla profunda con los valores por defecto
  const params = paramsRow && Object.keys(paramsRow).length
    ? { ...PARAMS_NOMINA_DEFAULT, ...paramsRow,
        empleado: { ...PARAMS_NOMINA_DEFAULT.empleado, ...(paramsRow.empleado || {}) },
        prestaciones: { ...PARAMS_NOMINA_DEFAULT.prestaciones, ...(paramsRow.prestaciones || {}) },
        empleador: { ...PARAMS_NOMINA_DEFAULT.empleador, ...(paramsRow.empleador || {}) },
        cps: { ...PARAMS_NOMINA_DEFAULT.cps, ...(paramsRow.cps || {}) },
        operacion: { ...PARAMS_NOMINA_DEFAULT.operacion, ...(paramsRow.operacion || {}) } }
    : PARAMS_NOMINA_DEFAULT

  // Usuarios registrados (el empleado debe corresponder a un usuario del sistema)
  const { data: usuarios = [] } = useQuery({
    queryKey: ['user_profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_profiles').select('id, nombre, login, rol, archivado').order('nombre')
      return data || []
    },
  })
  // El administrador es un usuario desarrollador, no un empleado → se excluye
  const usuariosActivos = usuarios.filter(u => !u.archivado && u.rol !== 'admin')
  // Cédulas ya vinculadas a un empleado (para no duplicar al crear)
  const cedulasUsadas = new Set(empleados.filter(e => !editEmpId || e.id !== editEmpId).map(e => e.cedula).filter(Boolean))
  const usuariosDisponibles = usuariosActivos.filter(u => !cedulasUsadas.has(u.login))
  // Rol (del usuario del sistema) asociado a un empleado, vía su cédula = login
  const rolDeEmpleado = (e) => {
    const u = usuarios.find(x => x.login === e.cedula)
    return u ? getRolLabel(u.rol) : (e.cargo || '—')
  }

  const saveEmp = useMutation({
    mutationFn: async (raw) => {
      // Las fechas vacías deben ir como null (Postgres no acepta "")
      const datos = { ...raw }
      ;['fecha_nacimiento', 'fecha_ingreso'].forEach(k => { if (!datos[k]) datos[k] = null })
      if (editEmpId) {
        const { error } = await supabase.from('employees').update(datos).eq('id', editEmpId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('employees').insert(datos)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] })
      setModalEmp(false); setFormEmp(EMPTY_EMP); setEditEmpId(null)
      toast('Empleado guardado ✓')
    },
    onError: (e) => toast(e.message, 'error'),
  })

  const deleteEmp = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('employees').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleados'] }); toast('Eliminado') },
  })

  const hoy = new Date().toISOString().split('T')[0]
  // Cargos: base + los que ya existen en empleados (permite crear nuevos)
  const cargosDisponibles = [...new Set(['Administrador', 'Gerente', 'Operario', 'Auxiliar', 'Vendedor', 'Contador', 'Empacador', ...empleados.map(e => e.cargo).filter(Boolean)])].sort()

  // Actualizar o crear registro de asistencia (con auditoría y restricción de días anteriores)
  const updateAsistencia = async (empId, fecha, campo, valor) => {
    const existing = asistencia.find(a => a.emp_id === empId && a.fecha === fecha)
    const valorPrevio = existing ? existing[campo] : null
    // No-admin: no puede modificar registros de días anteriores salvo que el campo esté vacío (lo olvidó)
    if (!esAdmin && fecha < hoy && valorPrevio) { toast('No puedes modificar registros de días anteriores', 'warning'); return }
    const ahora = new Date().toISOString()
    if (existing) {
      const datos = { [campo]: valor }
      if (campo === 'entrada' && !existing.entrada_ts) datos.entrada_ts = ahora
      if (campo === 'salida'  && !existing.salida_ts)  datos.salida_ts  = ahora
      if (valorPrevio) { datos.editado_ts = ahora; datos.editado_por = profile?.nombre || '' }  // fue una edición
      await supabase.from('attendance').update(datos).eq('id', existing.id)
    } else {
      const datos = { emp_id: empId, fecha, [campo]: valor }
      if (campo === 'entrada') datos.entrada_ts = ahora
      if (campo === 'salida')  datos.salida_ts  = ahora
      await supabase.from('attendance').insert(datos)
    }
    qc.invalidateQueries({ queryKey: ['attendance'] })
  }

  // Abre el listado de asistencia en el mes actual
  const abrirListado = (emp) => {
    const d = new Date()
    setLisMes(d.getMonth() + 1); setLisAño(d.getFullYear())
    setListadoEmp(emp)
  }

  // Marca el estado del día de una fila existente — solo admin
  const setEstadoDia = async (reg, val) => {
    await supabase.from('attendance').update({ estado_dia: val }).eq('id', reg.id)
    qc.invalidateQueries({ queryKey: ['attendance'] })
  }
  // Marca una AUSENCIA en un día laboral sin registro (crea la fila) — solo admin
  const marcarAusencia = async (fecha, estado) => {
    const existing = asistencia.find(a => a.emp_id === listadoEmp.id && a.fecha === fecha)
    if (existing) await supabase.from('attendance').update({ estado_dia: estado }).eq('id', existing.id)
    else await supabase.from('attendance').insert({ emp_id: listadoEmp.id, fecha, estado_dia: estado })
    qc.invalidateQueries({ queryKey: ['attendance'] })
  }
  const quitarFilaAsist = async (reg) => {
    await supabase.from('attendance').delete().eq('id', reg.id)
    qc.invalidateQueries({ queryKey: ['attendance'] })
  }
  // Lista de fechas hábiles (YYYY-MM-DD) en un rango
  const listarDiasHabiles = (desde, hasta, diasLab = 6) => {
    const out = []
    if (!desde || !hasta || desde > hasta) return out
    const ini = new Date(desde + 'T12:00:00'), fin = new Date(hasta + 'T12:00:00')
    for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay()
      const habil = diasLab >= 7 ? true : diasLab >= 6 ? dow !== 0 : (dow >= 1 && dow <= 5)
      if (habil) out.push(d.toISOString().split('T')[0])
    }
    return out
  }

  // Editar una fila de asistencia desde un modal (solo admin)
  const abrirEditReg = (reg) => { setEditReg(reg); setEditForm({ entrada: reg.entrada || '', salida: reg.salida || '' }) }
  const guardarEditReg = async () => {
    if (editForm.entrada && editForm.salida && editForm.salida < editForm.entrada) {
      toast('La salida no puede ser anterior a la entrada', 'warning'); return
    }
    const ahora = new Date().toISOString()
    await supabase.from('attendance').update({
      entrada: editForm.entrada || null,
      salida: editForm.salida || null,
      editado_ts: ahora, editado_por: profile?.nombre || '',
    }).eq('id', editReg.id)
    qc.invalidateQueries({ queryKey: ['attendance'] })
    setEditReg(null); toast('Asistencia actualizada ✓')
  }

  // Gestión de filas del registro en lote
  const abrirLote = (emp) => { setLoteEmp(emp); setLoteFilas([{ fecha: '', entrada: '', salida: '' }]); setLoteModal(true) }
  const agregarFilaLote = () => setLoteFilas(fs => [...fs, { fecha: '', entrada: '', salida: '' }])
  const eliminarFilaLote = (i) => setLoteFilas(fs => fs.filter((_, idx) => idx !== i))
  const updateFilaLote = (i, campo, val) => setLoteFilas(fs => fs.map((f, idx) => idx === i ? { ...f, [campo]: val } : f))

  // Registro en lote: una fila = una fecha con su hora (todas obligatorias)
  const registrarLote = async () => {
    if (loteFilas.length === 0) { toast('Agrega al menos una fecha', 'warning'); return }
    for (const f of loteFilas) {
      if (!f.fecha || !f.entrada || !f.salida) { toast('Completa fecha, entrada y salida en todas las filas', 'warning'); return }
      if (f.salida < f.entrada) { toast(`La salida no puede ser anterior a la entrada (${f.fecha})`, 'warning'); return }
    }
    // Evita fechas duplicadas dentro del lote
    const fechasSet = new Set(loteFilas.map(f => f.fecha))
    if (fechasSet.size !== loteFilas.length) { toast('Hay fechas repetidas en el lote', 'warning'); return }

    const ahora = new Date().toISOString()
    for (const f of loteFilas) {
      const existing = asistencia.find(a => a.emp_id === loteEmp.id && a.fecha === f.fecha)
      const datos = { entrada: f.entrada, salida: f.salida }
      if (existing) {
        await supabase.from('attendance').update({ ...datos, editado_ts: ahora, editado_por: profile?.nombre || '' }).eq('id', existing.id)
      } else {
        await supabase.from('attendance').insert({ emp_id: loteEmp.id, fecha: f.fecha, ...datos, entrada_ts: ahora, salida_ts: ahora })
      }
    }
    qc.invalidateQueries({ queryKey: ['attendance'] })
    setLoteModal(false)
    toast(`Asistencia registrada en ${loteFilas.length} fecha(s) ✓`)
  }

  const guardarEmpleado = () => {
    if (!formEmp.nombre.trim()) { toast('El nombre del empleado es obligatorio', 'warning'); return }
    if (empEsUsuario && !formEmp.cedula) { toast('Selecciona un usuario registrado (o desmarca "Tiene cuenta de usuario")', 'warning'); return }
    saveEmp.mutate({
      ...formEmp,
      salario: parseFloat(formEmp.salario) || SMV,
      tarifa_destajo: formEmp.tarifa_destajo !== '' && formEmp.tarifa_destajo != null ? (parseFloat(formEmp.tarifa_destajo) || 0) : null,
      valor_hora: formEmp.valor_hora !== '' && formEmp.valor_hora != null ? (parseFloat(formEmp.valor_hora) || 0) : null,
    })
  }

  // Abre el formulario de edición de un empleado (solo admin)
  const abrirEditarEmp = (e) => {
    setFormEmp({ ...EMPTY_EMP, nombre: e.nombre, cargo: e.cargo, tipo_pago: e.tipo_pago, salario: e.salario, tarifa_destajo: e.tarifa_destajo ?? '', valor_hora: e.valor_hora ?? '', cedula: e.cedula || '', telefono: e.telefono || '', estado: e.estado, correo: e.correo || '', direccion: e.direccion || '', fecha_nacimiento: e.fecha_nacimiento || '', fecha_ingreso: e.fecha_ingreso || '', eps: e.eps || '', contacto_emergencia: e.contacto_emergencia || '' })
    setEmpEsUsuario(usuarios.some(u => u.login === e.cedula))
    setEditEmpId(e.id); setModalEmp(true)
  }

  // Visibilidad de empleados según rol:
  //  admin → todos · operario → todos menos el administrador · auxiliar → solo él mismo
  const empleadosVisibles = empleados.filter(e => {
    if (esAdmin) return true
    if (esAuxiliar) return e.nombre === profile?.nombre
    return !/administrador/i.test(e.nombre)   // operario
  })
  const empsActivos = empleadosVisibles.filter(e => e.estado === 'activo')

  const nomEmpleado = empleados.find(e => e.id === parseInt(nomEmpId))
  const asistEmp = nomEmpleado ? asistencia.filter(a => a.emp_id === nomEmpleado.id) : []
  const rangoValido = nomDesde && nomHasta && nomDesde <= nomHasta
  const nomResultado = (nomEmpleado && rangoValido)
    ? calcularNomina(nomEmpleado, asistEmp, nomPeriodo, parseInt(nomMes), nomAño, params, { desde: nomDesde, hasta: nomHasta }, parseFloat(nomUnidades) || 0)
    : null
  // ¿Existe un registro guardado cuyo rango se solape con el seleccionado para este empleado?
  const liquidacionExistente = nomEmpleado && rangoValido
    ? registrosNomina.find(r => r.emp_id === nomEmpleado.id && r.fecha_desde && r.fecha_hasta && r.fecha_desde <= nomHasta && r.fecha_hasta >= nomDesde)
    : null

  const exportarExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Empleado','Cargo','Tipo Pago','Salario Base','Neto Aprox'],
      ...empleados.map(e => {
        const sal = parseFloat(e.salario) || 0
        const incluyeAux = sal <= params.topeAuxSMLMV * params.smlmv
        const aux = incluyeAux && e.tipo_pago !== 'cps' ? params.auxTransporte : 0
        const ded = e.tipo_pago === 'cps' ? 0 : sal * (params.empleado.salud + params.empleado.pension)
        return [e.nombre, e.cargo, getTipoPagoLabel(e.tipo_pago), sal, Math.round(sal + aux - ded)]
      })
    ])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Nomina')
    XLSX.writeFile(wb, 'Nomina_MumiAmazonia.xlsx'); toast('Excel exportado ✓')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Asistencia & Nómina</h1>
        <div className="page-actions">
          {esAdmin && <button className="btn btn-primary btn-sm" onClick={() => { setFormEmp(EMPTY_EMP); setEditEmpId(null); setEmpEsUsuario(true); setModalEmp(true) }}>+ Nuevo Empleado</button>}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'empleados' ? 'active' : ''}`} onClick={() => setTab('empleados')}>Empleados</button>
        {esAdmin && <button className={`tab-btn ${tab === 'nomina' ? 'active' : ''}`} onClick={() => setTab('nomina')}>Liquidación Nómina</button>}
        {esAdmin && <button className={`tab-btn ${tab === 'parametros' ? 'active' : ''}`} onClick={() => setTab('parametros')}><Ico as={Settings} size={14} />Parámetros</button>}
      </div>

      {tab === 'parametros' && esAdmin && (
        <ParametrosNomina params={params} empleadosActivos={empleados.filter(e => (e.estado || 'activo') === 'activo' && !e.archivado).length} onSaved={() => qc.invalidateQueries({ queryKey: ['payroll_settings'] })} />
      )}

      {/* LIQUIDACIÓN NÓMINA */}
      {tab === 'nomina' && (
        <div className="card">
          <div className="card-title"><Ico as={DollarSign} size={14} />Liquidación de Nómina</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Empleado</label>
              <select className="form-control" value={nomEmpId} onChange={e => setNomEmpId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {empsActivos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Período</label>
              <select className="form-control" value={nomPeriodo} onChange={e => setNomPeriodo(e.target.value)}>
                <option value="quincenal">Quincenal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Desde</label>
              <input type="date" className="form-control" value={nomDesde} onChange={e => setNomDesde(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Hasta</label>
              <input type="date" className="form-control" value={nomHasta} max={hoy} onChange={e => setNomHasta(e.target.value)} />
            </div>
            {nomEmpleado?.tipo_pago === 'destajo' && (
              <div className="form-group">
                <label className="form-label">Unidades producidas (destajo)</label>
                <input type="number" className="form-control" min={0} value={nomUnidades} onChange={e => setNomUnidades(e.target.value)} placeholder="Ej: 500" />
                <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>× tarifa {fCOP(parseFloat(nomEmpleado.tarifa_destajo) || 0)}/unidad</small>
              </div>
            )}
          </div>

          {!rangoValido && nomEmpId && (
            <div className="alert alert-warning" style={{ fontSize: '0.85rem' }}>Selecciona un rango de fechas válido (Desde ≤ Hasta).</div>
          )}
          {liquidacionExistente && (
            <div className="alert alert-danger" style={{ fontSize: '0.85rem' }}>
              ⛔ Este empleado ya tiene una liquidación guardada que se cruza con el rango <strong>{fFecha(nomDesde)} → {fFecha(nomHasta)}</strong>
              (registrada del {fFecha(liquidacionExistente.fecha_desde)} al {fFecha(liquidacionExistente.fecha_hasta)}). No se puede volver a liquidar ese período.
            </div>
          )}

          {nomResultado && !liquidacionExistente && nomResultado.tipo === 'destajo' && !nomResultado.cumpleMinimo && (
            <div className="alert alert-danger" style={{ fontSize: '0.85rem', marginTop: 12 }}>
              ⚖️ <strong>Por debajo del salario mínimo legal.</strong> Lo devengado por destajo ({fCOP(nomResultado.salBase)}) es menor al mínimo proporcional al tiempo trabajado
              ({fCOP(nomResultado.minimoProporcional)} = SMLMV {fCOP(params.smlmv)} × {nomResultado.diasTrab > 0 ? `${nomResultado.diasTrab}/30 días` : (nomPeriodo === 'quincenal' ? '15/30' : '30/30')}).
              Debes <strong>completar {fCOP(nomResultado.faltanteMinimo)}</strong> para cumplir la ley.
            </div>
          )}
          {nomResultado && !liquidacionExistente && nomResultado.tipo === 'destajo' && nomResultado.cumpleMinimo && nomResultado.minimoProporcional > 0 && (
            <div className="alert" style={{ fontSize: '0.82rem', marginTop: 12, background: 'rgba(124,179,66,0.12)', border: '1px solid var(--lima)', borderRadius: 'var(--radio)', padding: 8 }}>
              ✅ Cumple el mínimo legal: {fCOP(nomResultado.salBase)} ≥ mínimo proporcional {fCOP(nomResultado.minimoProporcional)}.
            </div>
          )}
          {nomResultado && !liquidacionExistente && (
            <div className="grid-resp" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              <div className="card" style={{ margin: 0 }}>
                <div className="card-title"><Ico as={ClipboardList} size={14} />{nomEmpleado?.nombre} — {getTipoPagoLabel(nomResultado.tipo)}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginBottom: 8 }}>{fFecha(nomDesde)} → {fFecha(nomHasta)} · {nomPeriodo}</div>
                <table><tbody>
                  <tr><td>{nomResultado.esCPS ? 'Honorarios' : nomResultado.esDestajoHora ? 'Pago por horas (destajo)' : nomResultado.tipo === 'destajo' ? 'Pago por producción (destajo)' : 'Salario base'} ({nomPeriodo})</td><td className="td-number">{fCOP(nomResultado.salBase)}</td></tr>
                  {nomResultado.tipo === 'destajo' && <tr><td style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>↳ {fNum(nomResultado.unidadesDestajo)} unidades × {fCOP(nomResultado.tarifaDestajo)}</td><td></td></tr>}
                  {nomResultado.esDestajoHora && <tr><td style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>↳ {fmtHoras(nomResultado.horas)} h × {fCOP(nomResultado.valorHora)}</td><td></td></tr>}
                  {nomResultado.incluyeAux && <tr><td>Auxilio de transporte</td><td className="td-number">{fCOP(nomResultado.auxTransp)}</td></tr>}
                  <tr><td>Horas trabajadas <small style={{ color: 'var(--texto-suave)' }}>(según asistencia)</small></td><td className="td-number">{fmtHoras(nomResultado.horas)} h</td></tr>
                  <tr><td>Días trabajados <small style={{ color: 'var(--texto-suave)' }}>(según asistencia)</small></td><td className="td-number">{nomResultado.diasTrab}</td></tr>
                  {nomResultado.esCPS && <tr><td>IBC (40%)</td><td className="td-number">{fCOP(nomResultado.ibc)}</td></tr>}
                  <tr style={{ color: 'var(--rojo)' }}><td>(-) Salud {nomResultado.esCPS ? `(${(params.cps.salud * 100).toFixed(1)}% sobre IBC)` : `(${(params.empleado.salud * 100).toFixed(1)}%)`}</td><td className="td-number">{fCOP(nomResultado.salud)}</td></tr>
                  <tr style={{ color: 'var(--rojo)' }}><td>(-) Pensión {nomResultado.esCPS ? `(${(params.cps.pension * 100).toFixed(1)}% sobre IBC)` : `(${(params.empleado.pension * 100).toFixed(1)}%)`}</td><td className="td-number">{fCOP(nomResultado.pension)}</td></tr>
                  {nomResultado.esCPS && nomResultado.retencion > 0 && <tr style={{ color: 'var(--rojo)' }}><td>(-) Retención en la fuente</td><td className="td-number">{fCOP(nomResultado.retencion)}</td></tr>}
                  {nomResultado.descuentoDias > 0 && <tr style={{ color: 'var(--rojo)' }}><td>(-) Días no laborados ({nomResultado.diasNoLaborados} × {fCOP(nomResultado.salario/30)})</td><td className="td-number">{fCOP(nomResultado.descuentoDias)}</td></tr>}
                  {nomResultado.descuentoHoras > 0 && <tr style={{ color: 'var(--rojo)' }}><td>(-) Horas faltantes ({nomResultado.horasFaltantes.toFixed(1)} h)</td><td className="td-number">{fCOP(nomResultado.descuentoHoras)}</td></tr>}
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--crema-oscuro)', background: 'rgba(124,179,66,0.12)' }}>
                    <td><Ico as={DollarSign} size={14} />{nomResultado.esCPS ? 'NETO A PAGAR (honorarios)' : 'TOTAL A PAGAR'}<div style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--texto-suave)' }}>Lo que recibe el empleado</div></td>
                    <td className="td-number" style={{ color: 'var(--selva)', fontSize: '1.05rem' }}>{fCOP(nomResultado.neto)}</td>
                  </tr>
                </tbody></table>
              </div>

              {nomResultado.esDestajoHora
                ? (
                  <div className="card" style={{ margin: 0 }}>
                    <div className="card-title"><Ico as={Clock} size={14} />Destajo por hora</div>
                    <div className="alert alert-warning" style={{ fontSize: '0.82rem' }}>
                      Modalidad <strong>sin prestaciones ni aportes</strong> (no contemplada en el CST para contrato laboral). El costo para la empresa es el mismo que se le paga.
                    </div>
                    <table><tbody>
                      <tr><td>Horas trabajadas</td><td className="td-number">{fmtHoras(nomResultado.horas)} h</td></tr>
                      <tr><td>Valor hora</td><td className="td-number">{fCOP(nomResultado.valorHora)}</td></tr>
                      <tr style={{ fontWeight: 700 }}><td>Costo para la empresa</td><td className="td-number">{fCOP(nomResultado.costoEmpleador)}</td></tr>
                    </tbody></table>
                  </div>
                )
                : nomResultado.esCPS
                ? (
                  <div className="card" style={{ margin: 0 }}>
                    <div className="card-title">ℹ Contrato Prestación de Servicios</div>
                    <div className="alert alert-info" style={{ fontSize: '0.83rem' }}>
                      En un CPS <strong>no hay prestaciones sociales ni aportes parafiscales del empleador</strong>.
                      El contratista cotiza su propia seguridad social sobre un IBC del {(params.cps.ibc * 100).toFixed(0)}% de los honorarios.
                    </div>
                    <table><tbody>
                      <tr><td>Costo para la empresa</td><td className="td-number"><strong>{fCOP(nomResultado.costoEmpleador)}</strong></td></tr>
                    </tbody></table>
                  </div>
                )
                : (
                  <div className="card" style={{ margin: 0 }}>
                    <div className="card-title"><Ico as={BarChart3} size={14} />Provisiones y Aportes del Empleador</div>
                  <div className="alert" style={{ fontSize: '0.78rem', background: 'rgba(139,94,60,0.08)', border: '1px solid rgba(139,94,60,0.25)', borderRadius: 'var(--radio)', padding: 8, marginBottom: 8 }}>
                    Esto <strong>NO se le paga al empleado</strong>: es el costo adicional que asume la empresa (prestaciones + aportes), aparte del salario.
                  </div>
                    <table><tbody>
                      <tr style={{ fontWeight: 600 }}><td colSpan={2}>Prestaciones sociales</td></tr>
                      <tr><td>Cesantías ({(params.prestaciones.cesantias * 100).toFixed(2)}%)</td><td className="td-number">{fCOP(nomResultado.cesantias)}</td></tr>
                      <tr><td>Intereses cesantías</td><td className="td-number">{fCOP(nomResultado.intCes)}</td></tr>
                      <tr><td>Prima ({(params.prestaciones.prima * 100).toFixed(2)}%)</td><td className="td-number">{fCOP(nomResultado.prima)}</td></tr>
                      <tr><td>Vacaciones ({(params.prestaciones.vacaciones * 100).toFixed(2)}%)</td><td className="td-number">{fCOP(nomResultado.vacaciones)}</td></tr>
                      <tr style={{ fontWeight: 600, borderTop: '1px solid var(--crema-oscuro)' }}><td>Subtotal prestaciones</td><td className="td-number">{fCOP(nomResultado.totalPrestaciones)}</td></tr>
                      <tr style={{ fontWeight: 600 }}><td colSpan={2}>Aportes (parafiscales y seguridad social){nomResultado.parafiscales.exime && <small style={{ color: 'var(--texto-suave)', fontWeight: 400 }}> · exonerado Ley 1607</small>}</td></tr>
                      <tr><td>Salud empleador</td><td className="td-number">{fCOP(nomResultado.parafiscales.salud)}</td></tr>
                      <tr><td>Pensión empleador</td><td className="td-number">{fCOP(nomResultado.parafiscales.pension)}</td></tr>
                      <tr><td>ARL</td><td className="td-number">{fCOP(nomResultado.parafiscales.arl)}</td></tr>
                      <tr><td>Caja de compensación</td><td className="td-number">{fCOP(nomResultado.parafiscales.caja)}</td></tr>
                      <tr><td>ICBF</td><td className="td-number">{fCOP(nomResultado.parafiscales.icbf)}</td></tr>
                      <tr><td>SENA</td><td className="td-number">{fCOP(nomResultado.parafiscales.sena)}</td></tr>
                      <tr style={{ fontWeight: 700, borderTop: '2px solid var(--crema-oscuro)', background: 'rgba(139,94,60,0.10)' }}><td>🏢 COSTO TOTAL PARA LA EMPRESA<div style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--texto-suave)' }}>Salario + prestaciones + aportes</div></td><td className="td-number" style={{ color: 'var(--tierra)', fontSize: '1.05rem' }}>{fCOP(nomResultado.costoEmpleador)}</td></tr>
                    </tbody></table>
                  </div>
                )}
            </div>
          )}

          {nomResultado && !liquidacionExistente && (
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={guardarLiquidacion.isPending}
                onClick={() => guardarLiquidacion.mutate({ emp: nomEmpleado, periodo: nomPeriodo, desde: nomDesde, hasta: nomHasta, mes: parseInt(nomMes), anio: nomAño, resultado: nomResultado })}>
                {guardarLiquidacion.isPending ? 'Guardando...' : '💾 Guardar registro'}
              </button>
              <button className="btn btn-secondary" onClick={() => abrirListado(nomEmpleado)}><Ico as={ClipboardList} size={14} />Ver asistencia del empleado</button>
            </div>
          )}

          {/* Registros de nómina guardados */}
          {registrosNomina.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="card-title" style={{ fontSize: '0.95rem' }}><Ico as={FolderOpen} size={14} />Registros guardados</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Empleado</th><th>Período</th><th>Tipo</th><th>Neto</th><th>Guardado</th></tr></thead>
                  <tbody>
                    {registrosNomina.slice(0, 30).map(r => (
                      <tr key={r.id}>
                        <td>{r.empleado}</td>
                        <td>{r.fecha_desde && r.fecha_hasta ? `${fFecha(r.fecha_desde)} → ${fFecha(r.fecha_hasta)}` : `${MESES_LABELS[r.mes]} ${r.anio}`} · {r.periodo}</td>
                        <td>{getTipoPagoLabel(r.tipo)}</td>
                        <td className="td-number">{fCOP(r.resultado?.neto)}</td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>{r.created_at ? new Date(r.created_at).toLocaleDateString('es-CO') : ''} {r.creado_por}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EMPLEADOS */}
      {tab === 'empleados' && (
        <div className="card">
          <div className="card-title"><Ico as={Users} size={14} />Lista de Empleados</div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Rol</th>{esAdmin && <th>Salario Base</th>}<th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {empleadosVisibles.length === 0
                  ? <tr><td colSpan={esAdmin ? 5 : 4} className="empty-table">Sin empleados</td></tr>
                  : empleadosVisibles.map(e => (
                    <tr key={e.id}>
                      <td><button className="btn-link-emp" onClick={() => setDetalleEmp(e)}><strong>{e.nombre}</strong></button></td>
                      <td>{rolDeEmpleado(e)}</td>
                      {esAdmin && <td className="td-number">{fCOP(e.salario)}</td>}
                      <td><span className={`badge ${e.estado === 'activo' ? 'badge-verde' : 'badge-rojo'}`}>{e.estado}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn btn-xs btn-primary" onClick={() => setAsistEmpModal(e)}><Ico as={Clock} size={14} />Registrar asistencia</button>
                          <button className="btn btn-xs btn-secondary" onClick={() => abrirListado(e)}><Ico as={ClipboardList} size={14} />Ver listado</button>
                          {esAdmin && (
                            <>
                              <button className="btn btn-xs btn-secondary" title="Editar empleado" onClick={() => {
                                setFormEmp({ ...EMPTY_EMP, nombre: e.nombre, cargo: e.cargo, tipo_pago: e.tipo_pago, salario: e.salario, tarifa_destajo: e.tarifa_destajo ?? '', valor_hora: e.valor_hora ?? '', cedula: e.cedula || '', telefono: e.telefono || '', estado: e.estado, correo: e.correo || '', direccion: e.direccion || '', fecha_nacimiento: e.fecha_nacimiento || '', fecha_ingreso: e.fecha_ingreso || '', eps: e.eps || '', contacto_emergencia: e.contacto_emergencia || '' })
                                setEmpEsUsuario(usuarios.some(u => u.login === e.cedula))
                                setEditEmpId(e.id); setModalEmp(true)
                              }}><Pencil size={13} aria-hidden="true" /></button>
                              <button className="btn btn-xs btn-danger" title="Eliminar" onClick={() => confirmar('¿Eliminar empleado?').then(ok => ok && deleteEmp.mutate(e.id))}><X size={13} aria-hidden="true" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de registro de asistencia (por empleado) */}
      {asistEmpModal && (
        <AttendanceModal emp={asistEmpModal} modo="login" onClose={() => setAsistEmpModal(null)}
          onRegistrarVarios={esAdmin ? () => { const e = asistEmpModal; setAsistEmpModal(null); abrirLote(e) } : undefined} />
      )}

      {/* Modal de detalle del empleado (nombre, rol, estado + acciones) */}
      <Modal open={!!detalleEmp} onClose={() => setDetalleEmp(null)} title="Detalle del Empleado"
        footer={<button className="btn btn-secondary" onClick={() => setDetalleEmp(null)}>Cerrar</button>}
      >
        {detalleEmp && (
          <>
            <Fila et="Nombre">{detalleEmp.nombre}</Fila>
            <Fila et="Rol">{rolDeEmpleado(detalleEmp)}</Fila>
            <Fila et="Estado"><span className={`badge ${detalleEmp.estado === 'activo' ? 'badge-verde' : 'badge-rojo'}`}>{detalleEmp.estado}</span></Fila>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => { setAsistEmpModal(detalleEmp); setDetalleEmp(null) }}><Ico as={Clock} size={14} />Registrar asistencia</button>
              <button className="btn btn-secondary" onClick={() => { abrirListado(detalleEmp); setDetalleEmp(null) }}><Ico as={ClipboardList} size={14} />Ver listado de asistencia</button>
              {esAdmin && <button className="btn btn-dorado" onClick={() => { abrirEditarEmp(detalleEmp); setDetalleEmp(null) }}><Ico as={Pencil} size={14} />Editar</button>}
            </div>
          </>
        )}
      </Modal>

      {/* Modal listado de asistencia (admin edita; demás solo lectura) */}
      <Modal open={!!listadoEmp} onClose={() => setListadoEmp(null)}
        title={`📋 Asistencia — ${listadoEmp?.nombre || ''}`}
        footer={<button className="btn btn-secondary" onClick={() => setListadoEmp(null)}>Cerrar</button>}
      >
        {listadoEmp && (() => {
          const esNomina = listadoEmp.tipo_pago === 'nomina'
          const ingreso = listadoEmp.fecha_ingreso || null
          // Rango del mes seleccionado
          const lisDesde = new Date(lisAño, lisMes - 1, 1).toISOString().split('T')[0]
          const lisHasta = new Date(lisAño, lisMes, 0).toISOString().split('T')[0]
          // Registros del mes seleccionado
          const filas = asistencia
            .filter(a => a.emp_id === listadoEmp.id && a.fecha >= lisDesde && a.fecha <= lisHasta)
            .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
          // Días laborales sin registro (solo nómina): excluye futuros y anteriores al ingreso
          const conRegistro = new Set(filas.map(f => f.fecha))
          const sinRegistro = (esAdmin && esNomina)
            ? listarDiasHabiles(lisDesde, lisHasta, params.diasLaboralesSemana || 6)
                .filter(f => !conRegistro.has(f) && f <= hoy && (!ingreso || f >= ingreso))
            : []
          return (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Mes</label>
                  <select className="form-control" value={lisMes} onChange={e => setLisMes(Number(e.target.value))}>
                    {MESES_LABELS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Año</label>
                  <input type="number" className="form-control" style={{ width: 100 }} value={lisAño} onChange={e => setLisAño(Number(e.target.value))} />
                </div>
                {esAdmin && <button className="btn btn-sm btn-dorado" style={{ marginLeft: 'auto' }} onClick={() => abrirLote(listadoEmp)}>➕ Registrar en lote</button>}
              </div>
              {ingreso && <div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginBottom: 8 }}>Vinculado desde el {fFecha(ingreso)}</div>}

              {/* Marcar ausencias: solo nómina y solo en días laborales sin registro */}
              {esAdmin && esNomina && (
                <div style={{ background: 'rgba(192,57,43,0.05)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, color: 'var(--selva)', marginBottom: 8, fontSize: '0.88rem' }}><Ico as={Pin} size={14} />Días laborales sin registro de {MESES_LABELS[lisMes]} (marcar inasistencia)</div>
                  {sinRegistro.length === 0
                    ? <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>No hay días laborales sin registro en el mes. ✓</p>
                    : sinRegistro.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <span style={{ flex: 1 }}>{fFecha(f)}</span>
                        <button className="btn btn-xs btn-dorado" onClick={() => marcarAusencia(f, 'justificada')}>Justificada</button>
                        <button className="btn btn-xs btn-danger" onClick={() => marcarAusencia(f, 'injustificada')}>Injustificada</button>
                      </div>
                    ))}
                </div>
              )}

              {filas.length === 0
                ? <p className="empty-table">Sin registros de asistencia.</p>
                : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Horas</th>{esAdmin && <th>Registrado</th>}<th>Estado</th>{esAdmin && <th>Acción</th>}</tr></thead>
                      <tbody>
                        {filas.map(reg => {
                          const ausencia = !reg.entrada   // fila sin entrada = ausencia marcada
                          const regTs = reg.entrada_ts || reg.salida_ts || reg.editado_ts
                          return (
                          <tr key={reg.id}>
                            <td>{fFecha(reg.fecha)}</td>
                            <td>{reg.entrada || '—'}</td>
                            <td>{reg.salida || '—'}</td>
                            <td className="td-number">{fmtHoras(calcHoras(reg.entrada, reg.salida))} h</td>
                            {esAdmin && <td style={{ fontSize: '0.75rem', color: 'var(--texto-suave)', whiteSpace: 'nowrap' }}>{regTs ? new Date(regTs).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—'}{reg.editado_por ? <div style={{ fontSize: '0.68rem' }}>✎ {reg.editado_por}</div> : null}</td>}
                            <td>
                              {ausencia && esAdmin
                                ? <select className="form-control" style={{ padding: '4px 6px', fontSize: '0.8rem' }} value={reg.estado_dia || 'injustificada'} onChange={e => setEstadoDia(reg, e.target.value)}>
                                    <option value="justificada">Ausencia justificada</option>
                                    <option value="injustificada">Ausencia injustificada</option>
                                  </select>
                                : <span className={`badge ${ausencia ? (reg.estado_dia === 'justificada' ? 'badge-dorado' : 'badge-rojo') : 'badge-verde'}`}>{ausencia ? (reg.estado_dia === 'justificada' ? 'Justificada' : 'Injustificada') : 'Asistió'}</span>}
                            </td>
                            {esAdmin && <td style={{ whiteSpace: 'nowrap' }}>
                              {!ausencia && <button className="btn btn-xs btn-secondary" onClick={() => abrirEditReg(reg)}><Ico as={Pencil} size={14} />Editar</button>}{' '}
                              <button className="btn btn-xs btn-danger" title="Eliminar este registro de hora" onClick={() => confirmar('¿Eliminar este registro de asistencia/hora?', { title: 'Eliminar registro', confirmText: 'Sí, eliminar' }).then(ok => ok && quitarFilaAsist(reg))}><X size={13} aria-hidden="true" /></button>
                            </td>}
                          </tr>
                        )})}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: 700, background: 'rgba(45,90,61,0.06)' }}>
                          <td colSpan={3}>Total horas</td>
                          <td className="td-number">{fmtHoras(filas.reduce((s, r) => s + calcHoras(r.entrada, r.salida), 0))} h</td>
                          <td>{esAdmin ? '' : null}</td>
                          {esAdmin && <td></td>}
                          {esAdmin && <td></td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
            </>
          )
        })()}
      </Modal>

      {/* Modal editar fila de asistencia (admin) */}
      <Modal open={!!editReg} onClose={() => setEditReg(null)} onSave={guardarEditReg} title="Editar asistencia"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setEditReg(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardarEditReg}>Guardar</button>
        </>}
      >
        {editReg && (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>{fFecha(editReg.fecha)}</p>
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label">Entrada</label><TimeField value={editForm.entrada} onChange={v => setEditForm(f => ({ ...f, entrada: v }))} /></div>
              <div className="form-group"><label className="form-label">Salida</label><TimeField value={editForm.salida} onChange={v => setEditForm(f => ({ ...f, salida: v }))} /></div>
            </div>
          </>
        )}
      </Modal>

      {/* Modal registro en lote (admin) */}
      <Modal open={loteModal} onClose={() => setLoteModal(false)} onSave={registrarLote} title="➕ Registrar asistencia en lote"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setLoteModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={registrarLote}>Guardar</button>
        </>}
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>
          Agrega una fecha con su hora para <strong>{loteEmp?.nombre}</strong>. Todas las filas son obligatorias.
        </p>
        {loteFilas.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap', borderBottom: '1px dashed var(--crema-oscuro, #e0d8c8)', paddingBottom: 8 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Fecha</label>
              <input type="date" className="form-control" value={f.fecha} max={hoy} onChange={e => updateFilaLote(i, 'fecha', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Entrada</label>
              <TimeField value={f.entrada} onChange={v => updateFilaLote(i, 'entrada', v)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Salida</label>
              <TimeField value={f.salida} onChange={v => updateFilaLote(i, 'salida', v)} />
            </div>
            <button className="btn btn-xs btn-danger" title="Eliminar fila" style={{ marginBottom: 4 }}
              onClick={() => eliminarFilaLote(i)} disabled={loteFilas.length === 1}><X size={13} aria-hidden="true" /></button>
          </div>
        ))}
        <button className="btn btn-sm btn-secondary" onClick={agregarFilaLote}>➕ Agregar fecha</button>
      </Modal>

      {/* Modal Empleado */}
      <Modal open={modalEmp} onClose={() => { setModalEmp(false); setFormEmp(EMPTY_EMP); setEditEmpId(null) }}
        onSave={guardarEmpleado}
        title={`👤 ${editEmpId ? 'Editar' : 'Nuevo'} Empleado`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalEmp(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardarEmpleado} disabled={saveEmp.isPending}>Guardar</button>
          </>
        }
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer', fontWeight: 600, color: 'var(--selva)', marginBottom: 10 }}>
          <input type="checkbox" checked={empEsUsuario} onChange={e => { const on = e.target.checked; setEmpEsUsuario(on); if (!on) setFormEmp(f => ({ ...f, cedula: '' })); else setFormEmp(f => ({ ...f, nombre: '', cedula: '' })) }} />
          Tiene cuenta de usuario (login en el sistema)
        </label>
        {empEsUsuario ? (
          <div className="form-group">
            <label className="form-label">Usuario / Persona <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(debe estar registrado como usuario)</small></label>
            <select className="form-control" value={formEmp.cedula}
              onChange={e => {
                const u = usuarios.find(x => x.login === e.target.value)
                setFormEmp(f => ({ ...f, cedula: u ? u.login : '', nombre: u ? u.nombre : '' }))
              }}>
              <option value="">— Selecciona un usuario —</option>
              {(editEmpId
                ? usuariosActivos.filter(u => u.login === formEmp.cedula || !cedulasUsadas.has(u.login))
                : usuariosDisponibles
              ).map(u => (
                <option key={u.id} value={u.login}>{u.nombre} — C.C. {u.login}</option>
              ))}
            </select>
            {usuariosDisponibles.length === 0 && !editEmpId && (
              <small style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>
                No hay usuarios disponibles sin vincular. Crea el usuario en "Usuarios & Permisos", o desmarca la casilla para registrar un empleado sin login.
              </small>
            )}
          </div>
        ) : (
          <div className="alert alert-info" style={{ fontSize: '0.8rem' }}>
            Empleado <strong>sin login</strong>: no inicia sesión. El admin u operario le registra la asistencia. Útil para personal por destajo o jornal.
          </div>
        )}
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Nombre completo</label><input className="form-control" value={formEmp.nombre} readOnly={empEsUsuario} onChange={e => !empEsUsuario && setFormEmp(f => ({ ...f, nombre: e.target.value }))} placeholder={empEsUsuario ? 'Se toma del usuario' : 'Nombre del empleado'} /></div>
          <div className="form-group">
            <label className="form-label">Cargo <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(elige o escribe uno nuevo)</small></label>
            <input className="form-control" list="dl-cargos" value={formEmp.cargo} onChange={e => setFormEmp(f => ({ ...f, cargo: e.target.value }))} placeholder="Ej: Gerente, Operario, Empacador..." />
            <datalist id="dl-cargos">{cargosDisponibles.map(c => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Tipo de pago</label>
            <select className="form-control" value={formEmp.tipo_pago} onChange={e => setFormEmp(f => ({ ...f, tipo_pago: e.target.value }))}>
              {TIPOS_PAGO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
              <strong>Por horas</strong>: contrato laboral, valor hora = salario ÷ horas-mes, <strong>con</strong> prestaciones. ·
              <strong> Por hora informal</strong>: pago ocasional valor hora libre, <strong>sin</strong> prestaciones (no laboral).
            </small>
          </div>
          <div className="form-group"><label className="form-label">Salario base {(formEmp.tipo_pago === 'destajo' || formEmp.tipo_pago === 'destajo_hora') && <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>(referencia; el pago se calcula por {formEmp.tipo_pago === 'destajo' ? 'producción' : 'hora'})</small>}</label><MoneyInput value={formEmp.salario} onChange={v => setFormEmp(f => ({ ...f, salario: v }))} /></div>
        </div>
        {formEmp.tipo_pago === 'destajo' && (
          <div className="form-group">
            <label className="form-label"><Ico as={DollarSign} size={14} />Tarifa por unidad producida</label>
            <MoneyInput value={formEmp.tarifa_destajo} onChange={v => setFormEmp(f => ({ ...f, tarifa_destajo: v }))} />
            <small style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>El pago = unidades producidas (las ingresas al liquidar) × esta tarifa. Lleva prestaciones y aportes de ley.</small>
          </div>
        )}
        {formEmp.tipo_pago === 'destajo_hora' && (
          <>
            <div className="form-group">
              <label className="form-label"><Ico as={Clock} size={14} />Valor por hora</label>
              <MoneyInput value={formEmp.valor_hora} onChange={v => setFormEmp(f => ({ ...f, valor_hora: v }))} />
              <small style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>El pago = horas trabajadas (según asistencia) × este valor.</small>
            </div>
            <div className="alert alert-warning" style={{ fontSize: '0.8rem' }}>
              ⚠ <strong>Destajo por hora sin prestaciones</strong>: esta modalidad <strong>no está contemplada en el Código Sustantivo del Trabajo</strong> para un contrato laboral (un trabajador subordinado genera prestaciones y aportes). Úsala bajo tu responsabilidad para pagos ocasionales/informales; para algo recurrente formaliza un contrato.
            </div>
          </>
        )}
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Cédula / ID</label><input className="form-control" value={formEmp.cedula} readOnly={empEsUsuario} onChange={e => !empEsUsuario && setFormEmp(f => ({ ...f, cedula: e.target.value }))} placeholder={empEsUsuario ? 'Del usuario' : 'Cédula / identificación'} /></div>
          <div className="form-group"><label className="form-label">Teléfono</label><input className="form-control" value={formEmp.telefono} onChange={e => setFormEmp(f => ({ ...f, telefono: e.target.value }))} /></div>
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Correo electrónico</label><input type="email" className="form-control" value={formEmp.correo} onChange={e => setFormEmp(f => ({ ...f, correo: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Dirección</label><input className="form-control" value={formEmp.direccion} onChange={e => setFormEmp(f => ({ ...f, direccion: e.target.value }))} /></div>
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Fecha de nacimiento</label><input type="date" className="form-control" value={formEmp.fecha_nacimiento || ''} onChange={e => setFormEmp(f => ({ ...f, fecha_nacimiento: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Fecha de vinculación (ingreso) <small style={{ fontWeight: 400, textTransform: 'none', color: 'var(--texto-suave)' }}>— se usa para la liquidación</small></label><input type="date" className="form-control" value={formEmp.fecha_ingreso || ''} onChange={e => setFormEmp(f => ({ ...f, fecha_ingreso: e.target.value }))} /></div>
        </div>
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">EPS / Salud</label><input className="form-control" value={formEmp.eps} onChange={e => setFormEmp(f => ({ ...f, eps: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Contacto de emergencia</label><input className="form-control" value={formEmp.contacto_emergencia} onChange={e => setFormEmp(f => ({ ...f, contacto_emergencia: e.target.value }))} placeholder="Nombre y teléfono" /></div>
        </div>
        <div className="form-group">
          <label className="form-label">Estado</label>
          <select className="form-control" value={formEmp.estado} onChange={e => setFormEmp(f => ({ ...f, estado: e.target.value }))}>
            <option value="activo">Activo</option><option value="inactivo">Inactivo</option>
          </select>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================
// Módulo de Parámetros de liquidación (solo admin)
// ============================================================
// Campo numérico (porcentajes se muestran como número, ej. 4 = 4%)
function NumField({ label, value, onChange, pct = false, hint }) {
  return (
    <div className="form-group">
      <label className="form-label">{label} {pct && <small style={{ color: 'var(--texto-suave)', fontWeight: 400 }}>(%)</small>}</label>
      <input type="number" step="any" className="form-control"
        value={pct ? +(value * 100).toFixed(4) : value}
        onChange={e => { const n = parseFloat(e.target.value) || 0; onChange(pct ? n / 100 : n) }} />
      {hint && <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>{hint}</small>}
    </div>
  )
}

function ParametrosNomina({ params, empleadosActivos = 0, onSaved }) {
  const toast = useToast()
  const [p, setP] = useState(params)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setP(params) }, [params])

  const setBase = (k, v) => setP(o => ({ ...o, [k]: v }))
  const setSub = (grupo, k, v) => setP(o => ({ ...o, [grupo]: { ...o[grupo], [k]: v } }))

  const guardar = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('payroll_settings').upsert({ id: 1, params: p, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      if (error) throw error
      toast('Parámetros guardados ✓')
      onSaved?.()
    } catch (e) { toast(e.message || 'Error al guardar', 'error') }
    finally { setSaving(false) }
  }

  const precargar2026 = () => {
    setP(JSON.parse(JSON.stringify(PARAMS_NOMINA_DEFAULT)))
    toast('Datos de vigencia 2026 precargados — revisa y pulsa Guardar', 'info')
  }

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        ⚙ Parámetros de Liquidación (Código Sustantivo del Trabajo)
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={precargar2026}><Ico as={Download} size={14} />Precargar datos 2026</button>
      </div>
      <div className="alert alert-info" style={{ fontSize: '0.83rem' }}>
        Estos valores se aplican a la liquidación según el <strong>tipo de pago</strong> de cada empleado.
        Usa <strong>"📥 Precargar datos 2026"</strong> para cargar SMLMV, auxilio de transporte y tasas de la vigencia 2026; luego revisa y pulsa <strong>Guardar</strong>.
      </div>

      <div className="card-title" style={{ fontSize: '0.95rem', marginTop: 8 }}>Valores base</div>
      <div className="form-grid-2">
        <NumField label="Salario mínimo (SMLMV)" value={p.smlmv} onChange={v => setBase('smlmv', v)} />
        <NumField label="Auxilio de transporte" value={p.auxTransporte} onChange={v => setBase('auxTransporte', v)} />
        <NumField label="Tope auxilio (× SMLMV)" value={p.topeAuxSMLMV} onChange={v => setBase('topeAuxSMLMV', v)} hint="Se paga si el salario ≤ este múltiplo del SMLMV" />
        <NumField label="Horas laborales al mes" value={p.horasMes} onChange={v => setBase('horasMes', v)} hint="Para el cálculo del valor hora" />
        <NumField label="Horas máximas por semana" value={p.horasSemana} onChange={v => setBase('horasSemana', v)} hint="Ley 2101/2021: 44 (2025) → 42 (jul 2026)" />
        <NumField label="Días laborales por semana" value={p.diasLaboralesSemana} onChange={v => setBase('diasLaboralesSemana', v)} hint="6 = lun-sáb · 5 = lun-vie" />
      </div>

      <div className="card-title" style={{ fontSize: '0.95rem' }}>Tiempo de operación <small style={{ fontWeight: 400, color: 'var(--texto-suave)' }}>— para el costo fijo por minuto del costeo de productos</small></div>
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">N° de operarios</label>
          <input className="form-control" value={(p.operacion?.numOperarios ?? 0) === 0 ? `Todos los activos (${empleadosActivos})` : `${p.operacion?.numOperarios}`} disabled readOnly />
          <small style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>Se configura en <strong>Costos → Costos Fijos (CIF)</strong>, junto al simulador de costo/minuto.</small>
        </div>
        <NumField label="Días hábiles al mes" value={p.operacion?.dias ?? 22} onChange={v => setSub('operacion', 'dias', v)} />
        <NumField label="Jornada (horas/día)" value={p.operacion?.jornadaHoras ?? 8} onChange={v => setSub('operacion', 'jornadaHoras', v)} />
        <NumField label="% Improductividad" pct value={p.operacion?.improductividad ?? 0.15} onChange={v => setSub('operacion', 'improductividad', v)} hint="Tiempo no productivo de la jornada" />
      </div>

      <div className="card-title" style={{ fontSize: '0.95rem' }}>Descuentos por inasistencia (contrato por nómina)</div>
      <div style={{ background: 'rgba(124,179,66,0.06)', border: '1px solid rgba(124,179,66,0.2)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer', fontWeight: 600, color: 'var(--selva)' }}>
          <input type="checkbox" checked={!!p.descuentaInasistencia} onChange={e => setBase('descuentaInasistencia', e.target.checked)} />
          Aplicar descuento por días no laborados (ausencias injustificadas)
        </label>
        {p.descuentaInasistencia && (
          <div style={{ marginTop: 10 }}>
            <div className="form-grid-2">
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Cómo se detecta la inasistencia</label>
                <select className="form-control" value={p.modoInasistencia || 'automatico'} onChange={e => setBase('modoInasistencia', e.target.value)}>
                  <option value="automatico">Automático (días hábiles del rango − días asistidos)</option>
                  <option value="manual">Manual (marcado en el listado de asistencia)</option>
                </select>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer', marginTop: 8 }}>
              <input type="checkbox" checked={!!p.descuentaHorasFaltantes} onChange={e => setBase('descuentaHorasFaltantes', e.target.checked)} />
              Descontar también horas faltantes (jornada incompleta / salidas antes)
            </label>
            <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)', marginTop: 6 }}>
              Valor día = salario ÷ 30 · Valor hora = salario ÷ horas-mes · Jornada diaria = horas-semana ÷ días-laborales.
              Aplica solo a empleados con tipo de pago "Contrato a término fijo/indefinido (nómina)".
            </div>
          </div>
        )}
      </div>
      <div style={{ background: 'rgba(124,179,66,0.06)', border: '1px solid rgba(124,179,66,0.2)', borderRadius: 8, padding: 12, margin: '4px 0 12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer', fontWeight: 600, color: 'var(--selva)' }}>
          <input type="checkbox" checked={!!p.prorrateaAuxDias} onChange={e => setBase('prorrateaAuxDias', e.target.checked)} />
          Prorratear el auxilio de transporte por días trabajados (pago por horas)
        </label>
        <div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginTop: 4 }}>
          Si está activo, en el pago por horas el auxilio se paga proporcional a los días asistidos (días ÷ 30). Si se desactiva, se paga completo.
        </div>
      </div>

      <div className="card-title" style={{ fontSize: '0.95rem' }}>Deducciones del empleado</div>
      <div className="form-grid-2">
        <NumField label="Salud empleado" pct value={p.empleado.salud} onChange={v => setSub('empleado', 'salud', v)} />
        <NumField label="Pensión empleado" pct value={p.empleado.pension} onChange={v => setSub('empleado', 'pension', v)} />
      </div>

      <div className="card-title" style={{ fontSize: '0.95rem' }}>Prestaciones sociales</div>
      <div className="form-grid-2">
        <NumField label="Cesantías" pct value={p.prestaciones.cesantias} onChange={v => setSub('prestaciones', 'cesantias', v)} />
        <NumField label="Intereses cesantías (mensual)" pct value={p.prestaciones.intCesantias} onChange={v => setSub('prestaciones', 'intCesantias', v)} />
        <NumField label="Prima de servicios" pct value={p.prestaciones.prima} onChange={v => setSub('prestaciones', 'prima', v)} />
        <NumField label="Vacaciones" pct value={p.prestaciones.vacaciones} onChange={v => setSub('prestaciones', 'vacaciones', v)} />
      </div>

      <div className="card-title" style={{ fontSize: '0.95rem' }}>Aportes del empleador (parafiscales)</div>
      <div className="form-grid-2">
        <NumField label="Salud empleador" pct value={p.empleador.salud} onChange={v => setSub('empleador', 'salud', v)} />
        <NumField label="Pensión empleador" pct value={p.empleador.pension} onChange={v => setSub('empleador', 'pension', v)} />
        <NumField label="ARL" pct value={p.empleador.arl} onChange={v => setSub('empleador', 'arl', v)} hint="Según clase de riesgo" />
        <NumField label="Caja de compensación" pct value={p.empleador.caja} onChange={v => setSub('empleador', 'caja', v)} />
        <NumField label="ICBF" pct value={p.empleador.icbf} onChange={v => setSub('empleador', 'icbf', v)} />
        <NumField label="SENA" pct value={p.empleador.sena} onChange={v => setSub('empleador', 'sena', v)} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer', margin: '4px 0 12px' }}>
        <input type="checkbox" checked={p.exoneraParafiscales} onChange={e => setBase('exoneraParafiscales', e.target.checked)} />
        Aplicar exoneración Ley 1607 (no pagar salud/ICBF/SENA si el salario &lt; 10 SMLMV)
      </label>

      <div className="card-title" style={{ fontSize: '0.95rem' }}>Contrato Prestación de Servicios (CPS)</div>
      <div className="form-grid-2">
        <NumField label="IBC (base de cotización)" pct value={p.cps.ibc} onChange={v => setSub('cps', 'ibc', v)} hint="% de los honorarios" />
        <NumField label="Salud (sobre IBC)" pct value={p.cps.salud} onChange={v => setSub('cps', 'salud', v)} />
        <NumField label="Pensión (sobre IBC)" pct value={p.cps.pension} onChange={v => setSub('cps', 'pension', v)} />
        <NumField label="Retención en la fuente" pct value={p.cps.retencion} onChange={v => setSub('cps', 'retencion', v)} hint="Sobre honorarios (opcional)" />
      </div>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : '💾 Guardar parámetros'}</button>
      </div>
    </div>
  )
}

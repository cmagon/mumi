import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fFecha, getRolLabel } from '../lib/businessLogic'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../hooks/useToast'
import { CATALOGO_MODULOS, MODULOS_POR_ROL } from '../lib/permisos'
import Modal from '../components/ui/Modal'
import { Bell, Check, FolderOpen, Pencil, Save, Tag, Trash2, Undo2, Users, X } from 'lucide-react'
import Select from '../components/ui/Select'
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

// Roles base del sistema (el admin puede crear más)
const ROLES_BASE = ['admin', 'operario', 'auxiliar']

// Convierte un nombre de rol a un identificador (slug) válido
const slugRol = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')

const EMPTY_FORM = { nombre: '', login: '', rol: 'operario', estado: 'activo' }

export default function Usuarios() {
  const toast = useToast()
  const qc = useQueryClient()
  const { profile: currentProfile, createUser, adminResetPassword, recargarPermisos, permisos } = useAuth()
  const [tab, setTab] = useState('usuarios')
  const [nuevoRol, setNuevoRol] = useState('')          // nombre del rol que se está creando
  const [creandoRol, setCreandoRol] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [editEsAdmin, setEditEsAdmin] = useState(false)
  const [saving, setSaving] = useState(false)
  // Reset de contraseña por el admin
  const [pwdUser, setPwdUser] = useState(null)
  const [pwdValue, setPwdValue] = useState('')

  // Solicitudes de recuperación de contraseña (desde el login)
  const { data: solicitudes = [] } = useQuery({
    queryKey: ['password_requests'],
    queryFn: async () => { const { data } = await supabase.from('password_requests').select('*').eq('atendido', false).order('created_at', { ascending: false }); return data || [] },
  })
  const marcarAtendida = async (id) => { await supabase.from('password_requests').update({ atendido: true }).eq('id', id); qc.invalidateQueries({ queryKey: ['password_requests'] }) }

  const { data: usuarios = [] } = useQuery({
    queryKey: ['user_profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_profiles').select('*').order('nombre')
      return data || []
    },
  })

  const activos   = usuarios.filter(u => !u.archivado)
  const antiguos  = usuarios.filter(u => u.archivado)

  // Roles disponibles = base + los creados por el admin (en role_permissions)
  const rolesDisponibles = [...new Set([...ROLES_BASE, ...Object.keys(permisos || {})])]
    .map(r => ({ value: r, label: r === 'admin' ? 'Administrador (acceso total)' : getRolLabel(r) }))

  const crearRol = async () => {
    const slug = slugRol(nuevoRol)
    if (!slug) { toast('Escribe un nombre de rol válido', 'warning'); return }
    if (ROLES_BASE.includes(slug) || (permisos && permisos[slug])) { toast('Ese rol ya existe', 'warning'); return }
    try {
      const { error } = await supabase.from('role_permissions').upsert(
        { rol: slug, label: nuevoRol.trim(), permisos: { modulos: ['dashboard'], secciones: {} } },
        { onConflict: 'rol' }
      )
      if (error) throw error
      await recargarPermisos()
      setForm(f => ({ ...f, rol: slug }))
      setNuevoRol(''); setCreandoRol(false)
      toast('Rol creado ✓ — configúralo en la pestaña Gestión de Permisos')
    } catch (e) { toast(e.message || 'Error al crear el rol', 'error') }
  }

  const updateProfile = useMutation({
    mutationFn: async ({ id, datos }) => {
      const { error } = await supabase.from('user_profiles').update(datos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['user_profiles'] }); setModal(false); toast('Usuario actualizado ✓') },
    onError: (e) => toast(e.message, 'error'),
  })

  const openNew = () => { setForm(EMPTY_FORM); setEditId(null); setEditEsAdmin(false); setModal(true) }
  const openEdit = (u) => {
    setForm({ nombre: u.nombre, login: u.login, rol: u.rol, estado: u.estado })
    setEditEsAdmin(u.rol === 'admin')
    setEditId(u.id); setModal(true)
  }

  const handleSave = async (e) => {
    e?.preventDefault?.()
    if (!form.nombre.trim() || !form.login.trim()) { toast('Nombre y cédula requeridos', 'warning'); return }
    setSaving(true)
    try {
      if (editId) {
        const datos = editEsAdmin
          ? { nombre: form.nombre, rol: 'admin', estado: 'activo' }
          : { nombre: form.nombre, rol: form.rol, estado: form.estado }
        await updateProfile.mutateAsync({ id: editId, datos })
      } else {
        // La contraseña por defecto es la misma cédula
        await createUser(form.nombre, form.login, form.login, form.rol)
        qc.invalidateQueries({ queryKey: ['user_profiles'] })
        setModal(false)
        toast('Usuario creado ✓ — contraseña inicial = cédula')
      }
      setForm(EMPTY_FORM); setEditId(null)
    } catch (err) {
      toast(err.message || 'Error al guardar usuario', 'error')
    } finally { setSaving(false) }
  }

  const toggleEstado = async (u) => {
    const nuevoEstado = u.estado === 'activo' ? 'inactivo' : 'activo'
    await supabase.from('user_profiles').update({ estado: nuevoEstado }).eq('id', u.id)
    qc.invalidateQueries({ queryKey: ['user_profiles'] })
    toast(`Usuario ${nuevoEstado}`)
  }

  const toggleArchivar = async (u, archivar) => {
    await supabase.from('user_profiles').update({ archivado: archivar }).eq('id', u.id)
    qc.invalidateQueries({ queryKey: ['user_profiles'] })
    toast(archivar ? 'Usuario archivado' : 'Usuario restaurado')
  }

  const abrirReset = (u) => { setPwdUser(u); setPwdValue(u.login) }   // sugerencia: la cédula
  const ejecutarReset = async () => {
    if (!pwdValue || pwdValue.length < 8) { toast('La contraseña debe tener al menos 8 caracteres', 'warning'); return }
    try {
      await adminResetPassword(pwdUser.id, pwdValue)
      toast('Contraseña restablecida ✓')
      setPwdUser(null)
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Usuarios & Permisos</h1>
        {tab === 'usuarios' && (
          <div className="page-actions">
            <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo Usuario</button>
          </div>
        )}
      </div>

      <div className="tabs">
        <button className={`tab-btn${tab === 'usuarios' ? ' active' : ''}`} onClick={() => setTab('usuarios')}><Ico as={Users} size={14} />Usuarios</button>
        <button className={`tab-btn${tab === 'roles' ? ' active' : ''}`} onClick={() => setTab('roles')}><Ico as={Tag} size={14} />Roles</button>
        <button className={`tab-btn${tab === 'permisos' ? ' active' : ''}`} onClick={() => setTab('permisos')}>🔐 Gestión de Permisos</button>
      </div>

      {tab === 'usuarios' && (
        <>
          <div className="card">
            <div className="card-title"><Ico as={Users} size={14} />Usuarios Activos</div>
            {solicitudes.length > 0 && (
              <div className="alert" style={{ fontSize: '0.85rem', background: 'rgba(200,169,74,0.12)', border: '1px solid var(--dorado)', borderRadius: 'var(--radio)', padding: 10, marginBottom: 10 }}>
                <strong><Ico as={Bell} size={14} />Solicitudes de recuperación de contraseña</strong>
                {solicitudes.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: '0.82rem' }}>
                    <span>Usuario <strong>{s.usuario}</strong> — {new Date(s.created_at).toLocaleString('es-CO')}</span>
                    <button className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => marcarAtendida(s.id)}><Ico as={Check} size={14} />Atendida</button>
                  </div>
                ))}
              </div>
            )}
            <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>
              El <strong>usuario es la cédula</strong> de la persona y la <strong>contraseña inicial es esa misma cédula</strong>.
              Cada usuario puede cambiarla desde "🔑 Cambiar contraseña" en el menú lateral. La cédula (usuario) no se puede modificar.
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nombre</th><th>Cédula (usuario)</th><th>Rol</th><th>Estado</th><th>Último Acceso</th><th>Acciones</th></tr></thead>
                <tbody>
                  {activos.length === 0
                    ? <tr><td colSpan={6} className="empty-table">Sin usuarios registrados</td></tr>
                    : activos.map(u => (
                      <tr key={u.id}>
                        <td><strong>{u.nombre}</strong></td>
                        <td>{u.login}</td>
                        <td><span className={`badge ${u.rol === 'admin' ? 'badge-dorado' : 'badge-azul'}`}>{getRolLabel(u.rol)}</span></td>
                        <td><span className={`badge ${u.estado === 'activo' ? 'badge-verde' : 'badge-rojo'}`}>{u.estado}</span></td>
                        <td>{u.ultimo_acceso ? fFecha(u.ultimo_acceso.split('T')[0]) : 'Nunca'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button className="btn btn-xs btn-secondary" title="Editar" onClick={() => openEdit(u)}><Pencil size={13} aria-hidden="true" /></button>
                            <button className="btn btn-xs btn-secondary" title="Restablecer contraseña" onClick={() => abrirReset(u)}>🔑</button>
                            {u.id !== currentProfile?.id && u.rol !== 'admin' && (
                              <>
                                <button className="btn btn-xs btn-dorado" onClick={() => toggleEstado(u)}>
                                  {u.estado === 'activo' ? 'Desactivar' : 'Activar'}
                                </button>
                                {u.estado === 'inactivo' && (
                                  <button className="btn btn-xs btn-secondary" onClick={() => toggleArchivar(u, true)}><Ico as={FolderOpen} size={14} />Archivar</button>
                                )}
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

          {antiguos.length > 0 && (
            <div className="card">
              <div className="card-title"><Ico as={FolderOpen} size={14} />Usuarios Antiguos (archivados)</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Nombre</th><th>Cédula</th><th>Rol</th><th>Último Acceso</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {antiguos.map(u => (
                      <tr key={u.id} style={{ opacity: 0.7 }}>
                        <td>{u.nombre}</td>
                        <td>{u.login}</td>
                        <td>{getRolLabel(u.rol)}</td>
                        <td>{u.ultimo_acceso ? fFecha(u.ultimo_acceso.split('T')[0]) : 'Nunca'}</td>
                        <td><button className="btn btn-xs btn-secondary" onClick={() => toggleArchivar(u, false)}><Ico as={Undo2} size={14} />Restaurar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'roles' && <RolesTab usuarios={usuarios} onSaved={recargarPermisos} onIrPermisos={() => setTab('permisos')} />}

      {tab === 'permisos' && <PermisosTab onSaved={recargarPermisos} />}

      {/* Modal alta/edición */}
      <Modal
        open={modal} onClose={() => { setModal(false); setForm(EMPTY_FORM); setEditId(null) }}
        onSave={() => handleSave()}
        title={`🔐 ${editId ? 'Editar' : 'Nuevo'} Usuario`}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </>}
      >
        <form onSubmit={handleSave}>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Nombre completo</label>
              <input className="form-control" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
            <div className="form-group">
              <label className="form-label">Cédula (usuario)</label>
              <input className="form-control" value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value }))} disabled={!!editId} placeholder="Número de cédula" />
              {!editId && <small style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>La contraseña inicial será esta misma cédula.</small>}
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Rol</label>
              <Select className="form-control" value={form.rol} disabled={editEsAdmin} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                {rolesDisponibles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
              {editEsAdmin
                ? <small style={{ color: 'var(--texto-suave)', fontSize: '0.75rem' }}>El rol de un administrador no se puede cambiar.</small>
                : !creandoRol
                  ? <button type="button" className="btn btn-xs btn-secondary" style={{ marginTop: 6 }} onClick={() => setCreandoRol(true)}>➕ Crear nuevo rol</button>
                  : (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <input className="form-control" placeholder="Nombre del nuevo rol" value={nuevoRol} onChange={e => setNuevoRol(e.target.value)} />
                      <button type="button" className="btn btn-sm btn-primary" onClick={crearRol}>Crear</button>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setCreandoRol(false); setNuevoRol('') }}><X size={13} aria-hidden="true" /></button>
                    </div>
                  )}
            </div>
            {editId && (
              <div className="form-group">
                <label className="form-label">Estado</label>
                <Select className="form-control" value={form.estado} disabled={editEsAdmin} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </Select>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Modal reset de contraseña (admin) */}
      <Modal open={!!pwdUser} onClose={() => setPwdUser(null)} title="🔑 Restablecer contraseña"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setPwdUser(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={ejecutarReset}>Restablecer</button>
        </>}
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)' }}>
          Nueva contraseña para <strong>{pwdUser?.nombre}</strong> (cédula {pwdUser?.login}).
        </p>
        <div className="form-group"><label className="form-label">Nueva contraseña</label>
          <input className="form-control" value={pwdValue} onChange={e => setPwdValue(e.target.value)} /></div>
      </Modal>
    </div>
  )
}

// ============================================================
// Pestaña: Roles (crear / renombrar / eliminar)
// ============================================================
function RolesTab({ usuarios = [], onSaved, onIrPermisos }) {
  const toast = useToast()
  const confirmar = useConfirm()
  const { permisos } = useAuth()
  const [nuevo, setNuevo] = useState('')
  const [editando, setEditando] = useState(null)   // rol en edición de nombre
  const [labelEdit, setLabelEdit] = useState('')
  const [busy, setBusy] = useState(false)

  // Lista de roles = base + creados por el admin (en role_permissions)
  const roles = [...new Set([...ROLES_BASE, ...Object.keys(permisos || {})])]
  const esBase = (r) => ROLES_BASE.includes(r)
  const usuariosDe = (r) => usuarios.filter(u => u.rol === r).length

  const crear = async () => {
    const slug = slugRol(nuevo)
    if (!slug) { toast('Escribe un nombre de rol válido', 'warning'); return }
    if (roles.includes(slug)) { toast('Ese rol ya existe', 'warning'); return }
    setBusy(true)
    try {
      const { error } = await supabase.from('role_permissions').upsert(
        { rol: slug, label: nuevo.trim(), permisos: { modulos: ['dashboard'], secciones: {} } },
        { onConflict: 'rol' }
      )
      if (error) throw error
      await onSaved?.()
      setNuevo('')
      toast('Rol creado ✓ — configura sus permisos en la pestaña 🔐')
    } catch (e) { toast(e.message || 'Error al crear el rol', 'error') } finally { setBusy(false) }
  }

  const guardarNombre = async (rol) => {
    if (!labelEdit.trim()) { toast('El nombre no puede quedar vacío', 'warning'); return }
    setBusy(true)
    try {
      // Conserva los permisos existentes (o defaults) y actualiza solo el label
      const permisosObj = permisos?.[rol] || { modulos: MODULOS_POR_ROL[rol] || ['dashboard'], secciones: {} }
      const { error } = await supabase.from('role_permissions').upsert(
        { rol, label: labelEdit.trim(), permisos: permisosObj }, { onConflict: 'rol' }
      )
      if (error) throw error
      await onSaved?.()
      setEditando(null)
      toast('Nombre del rol actualizado ✓')
    } catch (e) { toast(e.message || 'Error al renombrar', 'error') } finally { setBusy(false) }
  }

  const eliminar = async (rol) => {
    if (esBase(rol)) { toast('Los roles base (admin, operario, auxiliar) no se pueden eliminar', 'warning'); return }
    const n = usuariosDe(rol)
    if (n > 0) { toast(`No se puede eliminar: ${n} usuario(s) tienen este rol. Reasígnalos primero.`, 'warning'); return }
    if (!await confirmar(`¿Eliminar el rol "${getRolLabel(rol)}"? Esta acción no se puede deshacer.`, { title: 'Eliminar rol', confirmText: 'Eliminar' })) return
    setBusy(true)
    try {
      const { error } = await supabase.from('role_permissions').delete().eq('rol', rol)
      if (error) throw error
      await onSaved?.()
      toast('Rol eliminado ✓')
    } catch (e) { toast(e.message || 'Error al eliminar', 'error') } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="card-title"><Ico as={Tag} size={14} />Roles del sistema</div>
      <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>
        Aquí administras los roles que podrás <strong>asignar a los usuarios</strong>. Los roles
        <strong> base</strong> (Administrador, Operario, Auxiliar) no se pueden eliminar. Para definir
        qué ve cada rol, usa la pestaña <strong>🔐 Gestión de Permisos</strong>.
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '10px 0 16px', maxWidth: 460 }}>
        <input className="form-control" placeholder="Nombre del nuevo rol (ej. Supervisor)" value={nuevo} onChange={e => setNuevo(e.target.value)} />
        <button className="btn btn-primary" onClick={crear} disabled={busy}>➕ Crear rol</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Rol</th><th>Identificador</th><th>Usuarios</th><th>Acciones</th></tr></thead>
          <tbody>
            {roles.map(r => (
              <tr key={r}>
                <td>
                  {editando === r
                    ? <input className="form-control" value={labelEdit} onChange={e => setLabelEdit(e.target.value)} autoFocus />
                    : <span className={`badge ${r === 'admin' ? 'badge-dorado' : 'badge-azul'}`}>{getRolLabel(r)}</span>}
                </td>
                <td><code>{r}</code>{esBase(r) && <small style={{ color: 'var(--texto-suave)', marginLeft: 6 }}>(base)</small>}</td>
                <td>{usuariosDe(r)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {editando === r ? (
                      <>
                        <button className="btn btn-xs btn-primary" onClick={() => guardarNombre(r)} disabled={busy}><Ico as={Save} size={14} />Guardar</button>
                        <button className="btn btn-xs btn-secondary" onClick={() => setEditando(null)}><X size={13} aria-hidden="true" /></button>
                      </>
                    ) : (
                      <>
                        {r !== 'admin' && <button className="btn btn-xs btn-secondary" title="Configurar permisos" onClick={onIrPermisos}>🔐 Permisos</button>}
                        <button className="btn btn-xs btn-secondary" title="Renombrar" onClick={() => { setEditando(r); setLabelEdit(getRolLabel(r)) }}><Pencil size={13} aria-hidden="true" /></button>
                        {!esBase(r) && <button className="btn btn-xs btn-dorado" title="Eliminar" onClick={() => eliminar(r)} disabled={busy}><Trash2 size={13} aria-hidden="true" /></button>}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// Pestaña: Gestión de Permisos por rol
// ============================================================
function PermisosTab({ onSaved }) {
  const toast = useToast()
  const { permisos } = useAuth()
  // Roles configurables = base (excepto admin) + roles creados por el admin
  const rolesConfigurables = [...new Set(['operario', 'auxiliar', ...Object.keys(permisos || {})])].filter(r => r !== 'admin')
  const [rolSel, setRolSel] = useState('operario')
  const [config, setConfig] = useState({})   // { modulos:Set-like array, secciones:{modulo:[]} }
  const [saving, setSaving] = useState(false)

  // Carga la config del rol seleccionado (override de BD o defaults)
  useEffect(() => {
    const ov = permisos?.[rolSel]
    if (ov) {
      setConfig({ modulos: ov.modulos || [], secciones: ov.secciones || {} })
    } else {
      setConfig({ modulos: MODULOS_POR_ROL[rolSel] || [], secciones: {} })
    }
  }, [rolSel, permisos])

  const tieneModulo = (m) => (config.modulos || []).includes(m)
  const tieneSeccion = (m, s) => {
    const sec = config.secciones?.[m]
    if (!sec) return tieneModulo(m)   // sin restricción → todas visibles si ve el módulo
    return sec.includes(s)
  }

  const toggleModulo = (m) => {
    setConfig(c => {
      const tiene = (c.modulos || []).includes(m)
      const modulos = tiene ? c.modulos.filter(x => x !== m) : [...(c.modulos || []), m]
      return { ...c, modulos }
    })
  }

  const toggleSeccion = (m, s, todasSecciones) => {
    setConfig(c => {
      const actual = c.secciones?.[m] || todasSecciones.map(x => x.id)  // por defecto: todas
      const tiene = actual.includes(s)
      const nuevas = tiene ? actual.filter(x => x !== s) : [...actual, s]
      return { ...c, secciones: { ...(c.secciones || {}), [m]: nuevas } }
    })
  }

  const guardar = async () => {
    setSaving(true)
    try {
      const permisosObj = { modulos: config.modulos || [], secciones: config.secciones || {} }
      const { error } = await supabase.from('role_permissions')
        .upsert({ rol: rolSel, permisos: permisosObj }, { onConflict: 'rol' })
      if (error) throw error
      toast('Permisos guardados ✓')
      if (onSaved) await onSaved()
    } catch (e) {
      toast(e.message || 'Error al guardar permisos', 'error')
    } finally { setSaving(false) }
  }

  return (
    <div className="card">
      <div className="card-title">🔐 Gestión de Permisos por Rol</div>
      <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>
        Define qué <strong>módulos</strong> y qué <strong>secciones</strong> puede ver cada rol. Las
        secciones se aplican de verdad en Costos, Inventario, Órdenes, Producción, Nómina, Producto
        Terminado y Catálogo. El rol <strong>Administrador</strong> siempre tiene acceso total y no
        es configurable. Sin override, cada rol conserva sus secciones por defecto (p. ej. operario
        ve Recetas pero no CIF ni Liquidación).
      </div>

      <div className="form-group" style={{ maxWidth: 320 }}>
        <label className="form-label">Rol a configurar</label>
        <Select className="form-control" value={rolSel} onChange={e => setRolSel(e.target.value)}>
          {rolesConfigurables.map(r => <option key={r} value={r}>{getRolLabel(r)}</option>)}
        </Select>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {CATALOGO_MODULOS.map(mod => (
          <div key={mod.modulo} style={{ border: '1px solid var(--crema-oscuro, #e0d8c8)', borderRadius: 8, padding: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer' }}>
              <input type="checkbox" checked={tieneModulo(mod.modulo)} onChange={() => toggleModulo(mod.modulo)} />
              {mod.label}
            </label>
            {mod.secciones.length > 0 && tieneModulo(mod.modulo) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, paddingLeft: 26 }}>
                {mod.secciones.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={tieneSeccion(mod.modulo, s.id)} onChange={() => toggleSeccion(mod.modulo, s.id, mod.secciones)} />
                    {s.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : '💾 Guardar permisos'}</button>
      </div>
    </div>
  )
}

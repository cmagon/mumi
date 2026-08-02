// ============================================================
// Roles y permisos
// Roles: admin | operario | auxiliar (+ roles personalizados)
// El admin puede personalizar, por rol, qué módulos y qué secciones
// de cada módulo son visibles (se guardan en la tabla role_permissions).
// ============================================================

export const ROLES = {
  admin:    'Administrador',
  operario: 'Operario de Producción',
  auxiliar: 'Auxiliar de Producción',
}

// Catálogo de módulos y sus secciones (para la pestaña de gestión de permisos).
// Los `id` de sección son los que consulta el código con puedeVerSeccion(...).
// Si añades una sección aquí y nadie la consulta, la UI miente: cableala en la pantalla.
export const CATALOGO_MODULOS = [
  { modulo: 'dashboard',  label: 'Tablero Principal',       secciones: [] },
  { modulo: 'costos',     label: 'Calculadora de Costos',   secciones: [
      { id: 'resultados', label: 'Fichas de producto (lista y edición)' },
      { id: 'receta',     label: 'Recetas rápidas / prueba' },
      { id: 'cif',        label: 'Costos indirectos (CIF) y gastos' },
      { id: 'mps',        label: 'Materias primas (desde costos)' },
  ] },
  { modulo: 'inventario', label: 'Inventario MP',           secciones: [
      { id: 'stock',      label: 'Ver stock / listado' },
      { id: 'movimientos',label: 'Registrar movimientos y editar MP' },
  ] },
  { modulo: 'ordenes',    label: 'Órdenes de Producción',   secciones: [
      { id: 'crear',      label: 'Crear / editar órdenes' },
      { id: 'resultados', label: 'Ejecutar y enviar resultados' },
  ] },
  { modulo: 'produccion', label: 'Registro de Producción',  secciones: [
      { id: 'registrar',  label: 'Registrar producción' },
      { id: 'analisis',   label: 'Análisis / Histórico' },
  ] },
  { modulo: 'nomina',     label: 'Asistencia & Nómina',     secciones: [
      { id: 'asistencia', label: 'Asistencia (propia)' },
      { id: 'asistencia_otros', label: 'Registrar asistencia de otras personas' },
      { id: 'empleados',  label: 'Empleados' },
      { id: 'liquidacion',label: 'Liquidación de nómina' },
  ] },
  { modulo: 'terminados', label: 'Producto Terminado',       secciones: [
      { id: 'stock',      label: 'Stock / Catálogo' },
      { id: 'ajustes',    label: 'Ajustes de stock' },
      { id: 'analisis',   label: 'Análisis mensual' },
  ] },
  { modulo: 'porempacar', label: 'Productos por Empacar',    secciones: [] },
  { modulo: 'clientes',   label: 'Clientes',                secciones: [] },
  { modulo: 'catalogo',   label: 'Catálogo público',        secciones: [
      { id: 'productos',  label: 'Publicar productos' },
      { id: 'config',     label: 'Personalizar / configuración / mensajes' },
      { id: 'metricas',   label: 'Métricas / pedidos' },
  ] },
  { modulo: 'galeria',    label: 'Galería Fotográfica',     secciones: [] },
  { modulo: 'documentos', label: 'Gestión Documental',      secciones: [] },
  { modulo: 'registros',  label: 'Libros de Registro (BPM)', secciones: [] },
  { modulo: 'calidad',    label: 'No Conformidades & ACPM', secciones: [] },
  { modulo: 'capacitacion', label: 'Capacitación',         secciones: [] },
  { modulo: 'configuracion', label: 'Configuración',        secciones: [] },
  { modulo: 'usuarios',   label: 'Usuarios & Permisos',     secciones: [] },
]

// Módulos visibles por rol — valores por defecto (si no hay override en BD)
export const MODULOS_POR_ROL = {
  admin:    ['dashboard', 'costos', 'inventario', 'terminados', 'porempacar', 'ordenes', 'produccion', 'nomina', 'clientes', 'catalogo', 'galeria', 'documentos', 'registros', 'calidad', 'capacitacion', 'configuracion', 'usuarios'],
  operario: ['dashboard', 'costos', 'inventario', 'porempacar', 'ordenes', 'produccion', 'nomina', 'documentos', 'registros', 'calidad', 'capacitacion'],
  auxiliar: ['dashboard', 'costos', 'inventario', 'ordenes', 'nomina', 'documentos', 'registros', 'calidad', 'capacitacion'],
}

// Secciones visibles por rol cuando el admin NO ha configurado un override de secciones.
// Sin esto, puedeVerSeccion devolvería "todo visible" y un operario vería CIF/liquidación
// aunque la UI histórica se los ocultaba. Los defaults replican ese comportamiento previo.
export const SECCIONES_POR_ROL = {
  operario: {
    costos:     ['receta'],
    inventario: ['stock', 'movimientos'],
    ordenes:    ['crear', 'resultados'],
    produccion: ['registrar', 'analisis'],
    nomina:     ['asistencia', 'empleados'],
    terminados: ['stock'],
    catalogo:   ['productos'],
  },
  auxiliar: {
    costos:     ['receta'],
    inventario: ['stock'],
    ordenes:    ['resultados'],
    produccion: ['registrar'],
    nomina:     ['asistencia'],
    terminados: ['stock'],
    catalogo:   ['productos'],
  },
}

// Mapa ruta → módulo
export const RUTA_MODULO = {
  '/dashboard':  'dashboard',
  '/costos':     'costos',
  '/inventario': 'inventario',
  '/terminados': 'terminados',
  '/porempacar': 'porempacar',
  '/ordenes':    'ordenes',
  '/produccion': 'produccion',
  '/nomina':     'nomina',
  '/clientes':   'clientes',
  '/catalogo':   'catalogo',
  '/galeria':    'galeria',
  '/documentos': 'documentos',
  '/registros':  'registros',
  '/calidad':    'calidad',
  '/capacitacion': 'capacitacion',
  '/configuracion': 'configuracion',
  '/usuarios':   'usuarios',
}

// ---- Override configurable por el admin (cargado desde role_permissions) ----
// Forma: { [rol]: { modulos: ['costos',...], secciones: { costos: ['receta',...] } } }
let _override = null
export function setPermisosOverride(map) { _override = map || null }
export function getPermisosOverride() { return _override }

// ---- Rol de PREVISUALIZACIÓN (modo desarrollador "vista de rol") ----
// Cuando está activo, TODA verificación de permisos usa este rol en lugar del real,
// de modo que el menú, los módulos y las secciones/pestañas se ven tal cual ese rol.
let _rolPreview = null
export function setRolPreview(rol) { _rolPreview = rol || null }
export function getRolPreview() { return _rolPreview }
const rolEfectivoPerm = (rol) => _rolPreview || rol

// ¿El rol puede ver el módulo?
export function puedeVer(rolArg, modulo) {
  const rol = rolEfectivoPerm(rolArg)
  if (rol === 'admin') return true                      // el admin ve todo, siempre
  const ov = _override?.[rol]?.modulos
  // Roles sin configuración conocida arrancan con acceso mínimo (solo Tablero)
  const lista = ov || MODULOS_POR_ROL[rol] || ['dashboard']
  return lista.includes(modulo)
}

// ¿El rol puede ver una sección concreta de un módulo?
// Orden: admin → módulo denegado → override en BD → default por rol → visible.
export function puedeVerSeccion(rolArg, modulo, seccion) {
  const rol = rolEfectivoPerm(rolArg)
  if (rol === 'admin') return true
  if (!puedeVer(rol, modulo)) return false
  const sec = _override?.[rol]?.secciones?.[modulo]
  if (Array.isArray(sec)) return sec.includes(seccion)
  const def = SECCIONES_POR_ROL[rol]?.[modulo]
  if (Array.isArray(def)) return def.includes(seccion)
  return true                                 // sin restricción conocida
}

// Permiso de sección ESTRICTO (opt-in): true SOLO si el admin la otorgó explícitamente al rol.
// Para acciones sensibles que deben estar ocultas por defecto (p. ej. registrar asistencia de otros).
export function puedeSeccionExplicita(rolArg, modulo, seccion) {
  const rol = rolEfectivoPerm(rolArg)
  if (rol === 'admin') return true
  const sec = _override?.[rol]?.secciones?.[modulo]
  return Array.isArray(sec) && sec.includes(seccion)
}

export const esAdmin    = (rol) => rolEfectivoPerm(rol) === 'admin'
export const esOperario = (rol) => rolEfectivoPerm(rol) === 'operario'
export const esAuxiliar = (rol) => rolEfectivoPerm(rol) === 'auxiliar'

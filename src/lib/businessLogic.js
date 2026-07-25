// ============================================================
// MUMI AMAZONIA — Lógica de negocio (funciones puras)
// Todas las fórmulas migradas exactamente del HTML original
// ============================================================

// ==================== FORMATO ====================
export const fCOP = (n) => '$ ' + Math.round(n || 0).toLocaleString('es-CO')
export const fNum = (n) => Math.round(n || 0).toLocaleString('es-CO')
export const fFecha = (s) => {
  if (!s) return '—'
  try {
    const d = new Date(s + 'T12:00:00')
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}
// Compone el nombre de un producto SURTIDO entre dos sabores tomando como base el prefijo común.
// Ej: ("Bocadillo Mumi Seje", "Bocadillo Mumi Araza") -> "Bocadillo Mumi Surt. Seje - Araza"
export const componerSurtido = (nombreA, nombreB) => {
  const a = String(nombreA || '').trim(), b = String(nombreB || '').trim()
  if (!a || !b) return ''
  if (a.toLowerCase() === b.toLowerCase()) return a
  const wa = a.split(/\s+/), wb = b.split(/\s+/)
  let i = 0
  while (i < wa.length && i < wb.length && wa[i].toLowerCase() === wb[i].toLowerCase()) i++
  const base = wa.slice(0, i).join(' ')
  const sa = wa.slice(i).join(' ') || a
  const sb = wb.slice(i).join(' ') || b
  return `${base ? base + ' ' : ''}Surt. ${sa} - ${sb}`.replace(/\s+/g, ' ').trim()
}

// Roles base + etiquetas personalizadas (roles creados por el admin)
const ROL_LABELS_BASE = { admin: 'Administrador', operario: 'Operario de Producción', auxiliar: 'Auxiliar de Producción', ventas: 'Ventas', readonly: 'Solo lectura' }
let _rolLabels = {}
export const setRolLabels = (m) => { _rolLabels = m || {} }
export const getRolLabel = (r) => ROL_LABELS_BASE[r] || _rolLabels[r] || r

// ==================== CIF ====================

// Normaliza un ítem CIF a su valor mensual equivalente
export const getCIFMensual = (item) => {
  const v = item.valor || 0
  switch (item.frecuencia) {
    case 'anual':      return v / 12
    case 'trimestral': return v / 3
    case 'semestral':  return v / 6
    default:           return v  // mensual
  }
}

export const getCIFTotalMensual = (cifItems = []) =>
  cifItems.reduce((s, c) => s + getCIFMensual(c), 0)

// Clasificación contable de los ítems de CIF (ver AUDITORIA_COSTOS.md — Paso 3/4).
// Solo el grupo 'cif' se reparte entre productos; los demás son gasto operacional/
// financiero/impuesto o pasivo y no deben afectar el costo unitario.
export const GRUPOS_CIF = [
  { value: 'cif',            label: 'CIF — Costo de fabricación' },
  { value: 'administracion', label: 'Gasto administrativo' },
  { value: 'ventas',         label: 'Gasto de ventas' },
  { value: 'financiero',     label: 'Gasto financiero' },
  { value: 'impuesto',       label: 'Impuesto sobre ingresos' },
  { value: 'pasivo',         label: 'Pasivo (no es gasto)' },
]
export const getGrupoCIFLabel = (g) => (GRUPOS_CIF.find(x => x.value === g)?.label || g)

// Costo por minuto de mano de obra
// Fórmula: CIF_total / (operarios × 22días × 8h × 60min × (1 - 15% improductividad))
export const getCostoMinuto = (cifTotal, operarios = 3, dias = 22, jornadaHoras = 8, improductividad = 0.15) => {
  const minsBrutos = operarios * dias * jornadaHoras * 60
  const minsDisponibles = minsBrutos * (1 - improductividad)
  return minsDisponibles > 0 ? cifTotal / minsDisponibles : 0
}

// CIF proporcional multiproducto (método Punto de Equilibrio Multiproducto)
// % participación producto = unidades_mes_producto / total_unidades_mes_portafolio
// CIF por unidad = CIF_total × % participación / unidades_mes_producto
export const getCIFPorProducto = (cifTotal, productosGuardados = [], unidadesMesActual = 0, cifUnidadesFallback = 600) => {
  if (!productosGuardados.length) {
    return cifTotal / cifUnidadesFallback
  }
  const unidsPortafolio = productosGuardados.reduce(
    (s, p) => s + (p.bache * p.baches_mes * (1 - (p.merma || 0) / 100)), 0
  )
  const totalUnids = unidsPortafolio + unidadesMesActual
  if (totalUnids <= 0) return cifTotal / cifUnidadesFallback
  const pct = unidadesMesActual / totalUnids
  return unidadesMesActual > 0 ? (cifTotal * pct) / unidadesMesActual : 0
}

// Cálculo completo de costos de un producto
export const calcularCostosProducto = ({
  bache = 70,
  bachesMes = 1,
  merma = 0,
  comision = 3,
  precioMayor = 0,
  precioDetal = 0,
  ingredientes = [],
  procesos = [],
  empaque = [],
  cifTotal = 0,
  productosGuardados = [],
  cifUnidadesFallback = 600,
  operariosActivos = 3,
  diasHabiles = 22,
  jornadaHoras = 8,
  improductividad = 0.15,
  adicionales = [],   // costos extra personalizados: [{ descripcion, valor, base: 'unidad'|'bache'|'mes' }]
}) => {
  const costoMin = getCostoMinuto(cifTotal, operariosActivos, diasHabiles, jornadaHoras, improductividad)
  const mermaFrac = merma / 100

  // Los valores de la ficha vienen del formulario y se guardan como TEXTO dentro del JSON
  // (ingredientes, procesos, empaque). Hay que convertirlos siempre: en una multiplicación
  // JavaScript los convierte solo, pero en una SUMA concatena ("0" + "180" + "240" = "0180240"),
  // que fue justo lo que disparaba totales absurdos en la absorción del CIF.
  const num = (v) => parseFloat(v) || 0

  // Costo MP por bache: Σ (precio/presentacion × cantidad)
  const totalMPBache = ingredientes.reduce(
    (s, i) => s + (num(i.precio) / (num(i.presentacion) || 1000)) * num(i.cantidad), 0
  )

  // Costo MO por bache: Σ (minutos × costo/minuto)
  const totalMOBache = procesos.reduce(
    (s, p) => s + num(p.minutos) * costoMin, 0
  )

  // Costo empaque por bache: Σ (precio/presentacion × cantidad)
  const totalEmpBache = empaque.reduce(
    (s, e) => s + (num(e.precio) / (num(e.presentacion) || 1)) * num(e.cantidad), 0
  )

  const totalMinutos = procesos.reduce((s, p) => s + num(p.minutos), 0)
  const unidsBache = bache * (1 - mermaFrac)
  const unidsMesTot = unidsBache * bachesMes

  const mpUnit  = unidsBache > 0 ? totalMPBache / unidsBache : 0
  const moUnit  = unidsBache > 0 ? totalMOBache / unidsBache : 0   // informativo (tiempo × costo fijo/min)
  const empUnit = unidsBache > 0 ? totalEmpBache / unidsBache : 0
  const cifUnit = getCIFPorProducto(cifTotal, productosGuardados, unidsMesTot, cifUnidadesFallback)  // informativo (absorción)

  // ===== Costo del producto (método del Excel) =====
  // El overhead (costos fijos + nómina) se reparte por TIEMPO: costo/minuto = CF ÷ minutos disponibles.
  // Costo unitario = (materias primas + empaque + minutos × costo/minuto) ÷ unidades por bache.
  // Costos adicionales personalizados (depreciación, etc.), convertidos a POR UNIDAD según su base.
  // Se separan según su naturaleza: los de base 'unidad'/'bache' crecen con la producción
  // (son VARIABLES y por tanto entran al margen de contribución); los de base 'mes' son un
  // monto fijo prorrateado, así que no varían con el volumen.
  const porBase = (bases) => (Array.isArray(adicionales) ? adicionales : []).reduce((s, a) => {
    const base = a?.base || 'unidad'
    if (!bases.includes(base)) return s
    const v = parseFloat(a?.valor) || 0
    if (base === 'mes')   return s + (unidsMesTot > 0 ? v / unidsMesTot : 0)
    if (base === 'bache') return s + (unidsBache > 0 ? v / unidsBache : 0)
    return s + v   // 'unidad': valor directo por unidad
  }, 0)
  const adicUnitVar  = porBase(['unidad', 'bache'])   // variables con la producción
  const adicUnitFijo = porBase(['mes'])               // fijos prorrateados
  const adicUnit     = adicUnitVar + adicUnitFijo

  // Costo VARIABLE unitario: lo que realmente crece con cada unidad producida. Es la base del
  // margen de contribución y del punto de equilibrio, así que incluye los adicionales variables
  // (ej. depreciación por horas de máquina) pero no el overhead ni los adicionales mensuales.
  const cvu = mpUnit + empUnit + adicUnitVar
  const costoTotalUnit = mpUnit + empUnit + moUnit + adicUnit  // costo unitario CON overhead por tiempo + adicionales
  const costoFinal = costoTotalUnit
  // Ganancia por unidad = Precio − Costo unitario (igual que la hoja 05 del Excel)
  const utilMayor  = precioMayor - costoTotalUnit
  const utilDetal  = precioDetal - costoTotalUnit
  const margenMayor = utilMayor
  const margenDetal = utilDetal
  // % Comisión = porcentaje del PRECIO DE VENTA POR MAYOR (venta bruta) que se paga al
  // vendedor/distribuidor por cada unidad vendida — igual que la hoja "07. Comision Ventas"
  // del Excel de costeo (Comisión = Venta Bruta × %). Sale de tu ganancia; no cambia el precio.
  const comUnit = precioMayor * ((comision || 0) / 100)       // comisión en pesos por unidad
  const utilMayorNeto = utilMayor - comUnit                    // lo que realmente te queda después de pagar la comisión
  // Punto de equilibrio del producto (si fuera único)
  const pe = utilMayor > 0 ? cifTotal / utilMayor : 0

  const totalUnidsTodos = productosGuardados.reduce(
    (s, p) => s + (p.bache * p.baches_mes * (1 - (p.merma || 0) / 100)), 0
  ) + unidsMesTot
  const pctCIF = totalUnidsTodos > 0
    ? (unidsMesTot / totalUnidsTodos * 100).toFixed(1) : '—'

  return {
    totalMPBache, totalMOBache, totalEmpBache, totalMinutos,
    mpUnit, moUnit, empUnit, cifUnit, adicUnit, adicUnitVar, adicUnitFijo,
    cvu, costoTotalUnit, comUnit, costoFinal, utilMayorNeto,
    margenMayor, margenDetal, utilMayor, utilDetal, pe,
    unidsMesTot, pctCIF, costoMin,
  }
}

// Punto de equilibrio MULTIPRODUCTO (método del Excel):
//   PEq_producto = (CF / MCPT) × %participación,  MCPT = Σ(%participación × margen contribución unitario)
// productos: [{ nombre, precio_mayor, cvu (o costo_variable), bache, baches_mes, merma }]
export const getPEqMultiproducto = (productos = [], cifTotal = 0) => {
  const items = productos.map(p => {
    const q   = (p.bache || 0) * (p.baches_mes || 0) * (1 - (p.merma || 0) / 100)
    const pvu = p.precio_mayor || 0
    const cvu = p.cvu != null ? p.cvu : (p.costo_variable != null ? p.costo_variable : (p.costo_final || 0))
    return { nombre: p.nombre, q, pvu, cvu, mcu: pvu - cvu }
  })
  const qTotal = items.reduce((s, i) => s + i.q, 0)
  const mcpt = qTotal > 0 ? items.reduce((s, i) => s + (i.q / qTotal) * i.mcu, 0) : 0
  return items.map(i => {
    const participacion = qTotal > 0 ? i.q / qTotal : 0
    const pe = mcpt > 0 ? (cifTotal / mcpt) * participacion : 0
    return { ...i, participacion, pe }
  })
}

// Distribución del CIF entre todos los productos guardados
export const getCIFDistribucion = (cifTotal, productos = []) => {
  const items = productos.map(p => ({
    nombre: p.nombre, tipo: p.tipo,
    unidsMes: Math.round(p.bache * p.baches_mes * (1 - (p.merma || 0) / 100)),
  }))
  const totalUnids = items.reduce((s, i) => s + i.unidsMes, 0)
  return items.map(i => {
    const pct     = totalUnids > 0 ? i.unidsMes / totalUnids : 0
    const cifAsig = cifTotal * pct
    const cifUnit  = i.unidsMes > 0 ? cifAsig / i.unidsMes : 0
    return { ...i, pct, cifAsig, cifUnit, totalUnids }
  })
}

// ==================== PRECIO DE VENTA (costeo por absorción) ====================
// El COSTO del producto (NIC 2) solo lleva costos de producción: MP + MO + CIF. Pero el
// PRECIO debe recuperar además los gastos del período (administración, ventas, financieros,
// impuestos) y dejar la utilidad. Son dos números distintos y ambos correctos en su terreno.

// Tasa de absorción: cuánto gasto operacional debe recuperar cada peso de costo de producción.
export const getTasaGastosOper = (gastosOperMensuales = 0, costoProduccionMensual = 0) =>
  costoProduccionMensual > 0 ? gastosOperMensuales / costoProduccionMensual : 0

// Precio de venta a partir del COSTO DE PRODUCCIÓN (NIC 2), no de un "costo pleno":
//   Precio = Costo de producción ÷ (1 − %comisión − %ICA − %utilidad bruta)
// El costo de producción es MP + MO + CIF. Los gastos operativos (admin/ventas/financieros) NO
// entran al costo del producto: son gastos del período. El %utilidad de aquí es el MARGEN BRUTO
// objetivo (antes de gastos), que debe ser suficiente para cubrir esos gastos y dejar utilidad neta.
// Se DIVIDE porque comisión, ICA y utilidad son porcentajes del PRECIO, no del costo:
//   Precio = Costo + Precio×com + Precio×ica + Precio×util  →  Precio × (1 − com − ica − util) = Costo
// Multiplicar por (1 + margen) es el error clásico: "30% sobre el costo" deja solo 23% sobre el precio.
export const getPrecioSugerido = ({ costoProduccionUnit = 0, tasaGastosOper = 0, comisionPct = 0, icaPct = 0, utilidadPct = 0 }) => {
  const com  = (comisionPct || 0) / 100
  const ica  = (icaPct      || 0) / 100
  const util = (utilidadPct || 0) / 100   // margen BRUTO objetivo (sobre el precio)
  const divMin = 1 - com - ica, divObj = 1 - com - ica - util
  return {
    costoProduccionUnit,
    // Gasto operacional prorrateado por unidad: SOLO informativo (no se suma al costo del producto).
    gastosOperUnit: costoProduccionUnit * (tasaGastosOper || 0),
    // Precio mínimo: cubre costo de producción + comisión + ICA, sin utilidad. Por debajo, se pierde plata.
    precioMinimo:   divMin > 0 ? costoProduccionUnit / divMin : 0,
    precioObjetivo: divObj > 0 ? costoProduccionUnit / divObj : 0,
    viable: divObj > 0,   // false si comisión + ICA + utilidad ≥ 100% (no hay precio posible)
  }
}

// Absorción REAL del CIF por producto. El costeo reparte el CIF por TIEMPO (minutos de proceso
// × costo/minuto), así que un producto solo absorbe el CIF correspondiente a los minutos que
// realmente usa. Si la planta no opera al 100% de su capacidad, queda CIF SIN ABSORBER
// (costo de capacidad ociosa) que —según NIC 2— no puede cargarse al inventario: va directo
// al resultado del período.
export const getCIFAbsorcion = (productos = [], costoMinuto = 0, cifTotal = 0, minutosDisponibles = 0) => {
  const num = (v) => parseFloat(v) || 0
  const items = productos.map(p => {
    const unidsMes   = num(p.unidsMes)
    const minutosMes = num(p.minutosBache) * num(p.bachesMes)
    const absorbido  = minutosMes * num(costoMinuto)
    return { ...p, unidsMes, minutosMes, absorbido, cifUnit: unidsMes > 0 ? absorbido / unidsMes : 0 }
  })
  const minutosUsados  = items.reduce((s, i) => s + i.minutosMes, 0)
  const totalAbsorbido = items.reduce((s, i) => s + i.absorbido, 0)
  return {
    items, minutosUsados, totalAbsorbido,
    ocioso: cifTotal - totalAbsorbido,
    usoCapacidadPct: minutosDisponibles > 0 ? (minutosUsados / minutosDisponibles) * 100 : 0,
  }
}

// Punto de equilibrio de CAJA: además de cubrir los costos fijos hay que generar margen para
// abonar el capital de los préstamos, que no es gasto pero sí sale de la caja. Por eso una
// empresa puede mostrar utilidad contable y aun así quedarse sin plata.
export const getPEqCaja = (costosFijosMensuales = 0, abonoCapitalMensual = 0, margenContribUnit = 0) =>
  margenContribUnit > 0 ? (costosFijosMensuales + abonoCapitalMensual) / margenContribUnit : 0

// ==================== NÓMINA ====================
export const SMV = 1750905
export const AUX_TRANSP = 249095

// Parámetros de liquidación por defecto (Código Sustantivo del Trabajo, base 2026).
// El admin puede editarlos en el módulo de Parámetros (tabla payroll_settings).
export const PARAMS_NOMINA_DEFAULT = {
  smlmv:         SMV,        // salario mínimo legal mensual vigente
  auxTransporte: AUX_TRANSP, // auxilio de transporte
  topeAuxSMLMV:  2,          // se paga aux. de transporte hasta 2 SMLMV
  horasMes:      230,        // jornada legal mensual (para valor hora)
  horasSemana:   44,         // jornada máxima semanal — Ley 2101/2021 (42 desde jul-2026)
  diasLaboralesSemana: 6,    // días laborales por semana (para días hábiles del rango)
  // Control de descuentos por inasistencia (aplica a contrato por nómina)
  descuentaInasistencia: true,
  modoInasistencia: 'automatico',  // 'automatico' (días hábiles vs asistidos) | 'manual' (marcado en el listado)
  descuentaHorasFaltantes: true,   // descontar también horas no cumplidas de la jornada
  // Deducciones del empleado
  empleado: { salud: 0.04, pension: 0.04 },
  // Provisión de prestaciones sociales
  prestaciones: { cesantias: 0.0833, intCesantias: 0.01, prima: 0.0833, vacaciones: 0.0417 },
  // Aportes del empleador (parafiscales y seguridad social)
  empleador: { salud: 0.085, pension: 0.12, arl: 0.00522, caja: 0.04, icbf: 0.03, sena: 0.02 },
  // Exoneración Ley 1607/2012 (art. 114-1): si salario < 10 SMLMV el empleador no paga salud/ICBF/SENA
  exoneraParafiscales: true,
  // Auxilio de transporte en pago por horas: prorratear por días trabajados (días ÷ 30)
  prorrateaAuxDias: true,
  // Contrato de prestación de servicios (CPS)
  cps: { ibc: 0.40, salud: 0.125, pension: 0.16, retencion: 0 },
  // Tiempo de operación (para el costo fijo por minuto del costeo de productos)
  operacion: { dias: 22, jornadaHoras: 8, improductividad: 0.15, numOperarios: 0 },  // numOperarios 0 = usar empleados activos
}
// Compatibilidad con código anterior
export const PARAMS_NOMINA = { ...PARAMS_NOMINA_DEFAULT.prestaciones, ...PARAMS_NOMINA_DEFAULT.empleado }

// Etiquetas de los tipos de pago
export const TIPOS_PAGO = [
  { value: 'nomina',       label: 'Contrato a término fijo/indefinido (nómina)' },
  { value: 'horas',        label: 'Por horas — contrato laboral (con prestaciones)' },
  { value: 'destajo',      label: 'Por destajo / producción (con prestaciones)' },
  { value: 'destajo_hora', label: 'Por hora informal, sin prestaciones (no laboral)' },
  { value: 'cps',          label: 'Contrato prestación de servicios (CPS)' },
]
export const getTipoPagoLabel = (t) => (TIPOS_PAGO.find(x => x.value === t)?.label || t)

// Área de costeo del empleado — determina si su nómina entra al CIF (Producción) o al
// gasto operacional (Administración/Ventas). Ver AUDITORIA_COSTOS.md.
export const AREAS_COSTEO = [
  { value: 'produccion',     label: 'Producción' },
  { value: 'administracion', label: 'Administración' },
  { value: 'ventas',         label: 'Ventas' },
]
export const getAreaCosteoLabel = (a) => (AREAS_COSTEO.find(x => x.value === a)?.label || a || 'Producción')

// Costo mensual TOTAL para el empleador de UN empleado: salario + auxilio + provisión
// de prestaciones + parafiscales. CPS y destajo por hora informal entran con su valor
// base como honorarios (sin prestaciones ni parafiscales).
const costoEmpleadoMensual = (e, P) => {
  const sal = parseFloat(e.salario) || 0
  if (sal <= 0) return { salario: 0, auxilio: 0, prestaciones: 0, parafiscales: 0, honorarios: 0 }
  if (e.tipo_pago === 'cps' || e.tipo_pago === 'destajo_hora') {
    return { salario: 0, auxilio: 0, prestaciones: 0, parafiscales: 0, honorarios: sal }
  }
  const incluyeAux = sal <= P.topeAuxSMLMV * P.smlmv
  const auxilio = incluyeAux ? P.auxTransporte : 0
  // Cesantías, intereses y prima se liquidan sobre salario + auxilio de transporte;
  // vacaciones solo sobre el salario (el auxilio no es factor salarial para vacaciones).
  const baseP = sal + auxilio
  const ces = baseP * P.prestaciones.cesantias
  // Intereses sobre cesantías: 12% ANUAL sobre el saldo de cesantías ≈ 1% MENSUAL sobre la base
  // (intCesantias = 0.01 se aplica sobre salario + auxilio).
  const prestaciones = ces + baseP * P.prestaciones.intCesantias + baseP * P.prestaciones.prima + sal * P.prestaciones.vacaciones
  const exime = P.exoneraParafiscales && sal < 10 * P.smlmv
  const parafiscales = (exime ? 0 : sal * P.empleador.salud) + sal * P.empleador.pension + sal * P.empleador.arl
    + sal * P.empleador.caja + (exime ? 0 : sal * P.empleador.icbf) + (exime ? 0 : sal * P.empleador.sena)
  return { salario: sal, auxilio, prestaciones, parafiscales, honorarios: 0 }
}

// Costo mensual TOTAL de la nómina para el empleador (para incluirlo en los costos fijos / CIF).
// Suma, por cada empleado activo: salario + auxilio + provisión de prestaciones + parafiscales.
// Los CPS se cuentan como honorarios (sin prestaciones ni parafiscales). Igual que la "Planta de Personal" del Excel.
// `area`: si se pasa ('produccion'|'administracion'|'ventas'), solo suma empleados de esa área
// (ver AUDITORIA_COSTOS.md — el CIF/costo-minuto solo debe incluir personal de PRODUCCIÓN;
// administración y ventas van al gasto operacional, ver getGastosOperacionales).
export const getCostoNominaMensual = (empleados = [], params = PARAMS_NOMINA_DEFAULT, area = null) => {
  const P = params || PARAMS_NOMINA_DEFAULT
  let salarios = 0, auxilios = 0, prestaciones = 0, parafiscales = 0, honorarios = 0
  for (const e of empleados) {
    if (e.estado && e.estado !== 'activo') continue
    if (e.archivado) continue
    if (area && (e.area_costeo || 'produccion') !== area) continue
    const c = costoEmpleadoMensual(e, P)
    salarios += c.salario; auxilios += c.auxilio; prestaciones += c.prestaciones
    parafiscales += c.parafiscales; honorarios += c.honorarios
  }
  const total = salarios + auxilios + prestaciones + parafiscales + honorarios
  return { salarios, auxilios, prestaciones, parafiscales, honorarios, total }
}

// Gastos operacionales/financieros/impuestos/pasivo del mes: ítems de CIF no-productivos
// (clasificados por 'grupo') + la nómina del área correspondiente. Estos NO se reparten
// entre productos — alimentan el estado de resultados (Grupos C y D de AUDITORIA_COSTOS.md).
export const getGastosOperacionales = (cifItems = [], empleados = [], params = PARAMS_NOMINA_DEFAULT) => {
  const itemsDe = (g) => getCIFTotalMensual(cifItems.filter(c => c.grupo === g))
  const bloque = (g, area) => {
    const items = itemsDe(g)
    const nomina = area ? getCostoNominaMensual(empleados, params, area).total : 0
    return { items, nomina, total: items + nomina }
  }
  return {
    administracion: bloque('administracion', 'administracion'),
    ventas:         bloque('ventas', 'ventas'),
    financiero:     bloque('financiero', null),
    impuestos:      bloque('impuesto', null),
    pasivo:         bloque('pasivo', null),
  }
}

// Estado de resultados mensual (ver Paso 7 de AUDITORIA_COSTOS.md).
// `cifNoAbsorbido`: costo de capacidad ociosa. El CIF del mes se causa completo, pero solo la
// parte que la producción real absorbió queda en el costo de los productos. Lo no absorbido no
// puede quedarse en el inventario (NIC 2): se reconoce como gasto del período dentro del costo
// de ventas, y por eso baja la utilidad bruta.
export const getEstadoResultados = ({ ventasNetas = 0, costoProduccion = 0, cifNoAbsorbido = 0, gastosAdmin = 0, gastosVentas = 0, gastosFinancieros = 0, impuestos = 0 }) => {
  const utilidadBruta = ventasNetas - costoProduccion - cifNoAbsorbido
  const utilidadOperacional = utilidadBruta - gastosAdmin - gastosVentas
  const utilidadAntesImpuestos = utilidadOperacional - gastosFinancieros
  const utilidadNeta = utilidadAntesImpuestos - impuestos
  const pct = (v) => (ventasNetas > 0 ? (v / ventasNetas) * 100 : 0)
  return {
    ventasNetas, costoProduccion, cifNoAbsorbido, utilidadBruta, gastosAdmin, gastosVentas,
    utilidadOperacional, gastosFinancieros, utilidadAntesImpuestos, impuestos, utilidadNeta,
    margenBrutoPct: pct(utilidadBruta), margenOperacionalPct: pct(utilidadOperacional), margenNetoPct: pct(utilidadNeta),
  }
}

// Semáforo de salud financiera — toma el peor de los dos indicadores (umbrales del Paso 9).
export const getSemaforoFinanciero = (margenBrutoPct = 0, margenNetoPct = 0) => {
  const banda = (v, alto, medio) => (v > alto ? 3 : v >= medio ? 2 : 1)
  const banda_ = Math.min(banda(margenBrutoPct, 40, 25), banda(margenNetoPct, 10, 5))
  return banda_ === 3 ? 'verde' : banda_ === 2 ? 'amarillo' : 'rojo'
}

// Formatea horas decimales a "HH:MM" (horas:minutos). Ej: 8.5 → "8:30".
export const fmtHoras = (h) => {
  const totMin = Math.round((Number(h) || 0) * 60)
  const neg = totMin < 0
  const a = Math.abs(totMin)
  const hh = Math.floor(a / 60), mm = a % 60
  return `${neg ? '-' : ''}${hh}:${String(mm).padStart(2, '0')}`
}

export const calcHoras = (entrada, salida) => {
  if (!entrada || !salida) return 0
  const [eh, em] = entrada.split(':').map(Number)
  const [sh, sm] = salida.split(':').map(Number)
  let mins = (sh * 60 + sm) - (eh * 60 + em)
  // Turno nocturno que cruza medianoche (ej. entra 22:00, sale 02:00): la salida es "al día
  // siguiente", no se puede tratar como negativo/0 — se asume que cruzó un solo día.
  if (mins < 0) mins += 24 * 60
  return Math.max(0, mins / 60)
}

// Cuenta los días hábiles (laborales) entre dos fechas YYYY-MM-DD inclusive
export const contarDiasHabiles = (desde, hasta, diasLaboralesSemana = 6) => {
  let n = 0
  const ini = new Date(desde + 'T12:00:00')
  const fin = new Date(hasta + 'T12:00:00')
  for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()   // 0 = domingo
    const habil = diasLaboralesSemana >= 7 ? true
      : diasLaboralesSemana >= 6 ? dow !== 0
      : (dow >= 1 && dow <= 5)
    if (habil) n++
  }
  return n
}

export const calcularNomina = (empleado, asistencia = [], periodo = 'mensual', mes = 1, año = 2026, params = PARAMS_NOMINA_DEFAULT, rango = null, unidadesDestajo = 0) => {
  if (!empleado) return null
  const P = params || PARAMS_NOMINA_DEFAULT
  const salario = empleado.salario || P.smlmv
  const tipo = empleado.tipo_pago || 'nomina'
  const factor = periodo === 'quincenal' ? 0.5 : 1

  // Horas y días trabajados según el listado de asistencia.
  // Si se pasa un rango {desde, hasta} se filtra por ese rango; si no, por mes/año.
  const enRango = asistencia.filter(a => {
    if (!a.fecha) return false
    if (rango && rango.desde && rango.hasta) return a.fecha >= rango.desde && a.fecha <= rango.hasta
    try {
      const d = new Date(a.fecha + 'T12:00:00')
      return d.getMonth() + 1 === mes && d.getFullYear() === año
    } catch { return false }
  })
  let horas = 0, diasTrab = 0
  enRango.forEach(a => {
    const h = calcHoras(a.entrada, a.salida)
    if (h > 0) { horas += h; diasTrab++ }
  })

  // ---------- Contrato de prestación de servicios (CPS) ----------
  if (tipo === 'cps') {
    const honorarios = salario * factor
    const ibc       = honorarios * P.cps.ibc        // base de cotización (40%)
    const salud     = ibc * P.cps.salud             // 12.5%
    const pension   = ibc * P.cps.pension           // 16%
    const retencion = honorarios * (P.cps.retencion || 0)
    const neto      = honorarios - salud - pension - retencion
    return {
      tipo, esCPS: true, salario, incluyeAux: false, horas, diasTrab,
      salBase: honorarios, auxTransp: 0,
      salud, pension, retencion, ibc, neto,
      cesantias: 0, intCes: 0, prima: 0, vacaciones: 0, totalPrestaciones: 0,
      parafiscales: { salud: 0, pension: 0, arl: 0, caja: 0, icbf: 0, sena: 0, total: 0 },
      costoEmpleador: honorarios,
    }
  }

  // ---------- Destajo por hora (informal, SIN prestaciones ni parafiscales) ----------
  if (tipo === 'destajo_hora') {
    const vh = parseFloat(empleado.valor_hora) || 0
    const salBase = horas * vh
    return {
      tipo, esCPS: false, esDestajoHora: true, salario, incluyeAux: false, horas, diasTrab,
      salBase, auxTransp: 0, valorHora: vh,
      salud: 0, pension: 0, neto: salBase,
      cesantias: 0, intCes: 0, prima: 0, vacaciones: 0, totalPrestaciones: 0,
      parafiscales: { salud: 0, pension: 0, arl: 0, caja: 0, icbf: 0, sena: 0, total: 0 },
      costoEmpleador: salBase,
    }
  }

  // ---------- Contrato laboral (nómina / horas / destajo) ----------
  const incluyeAux = salario <= P.topeAuxSMLMV * P.smlmv
  let auxTransp = incluyeAux ? P.auxTransporte * factor : 0
  // Pago por horas: el auxilio se prorratea por días trabajados (no se paga completo)
  if (incluyeAux && tipo === 'horas' && P.prorrateaAuxDias) {
    auxTransp = P.auxTransporte * (diasTrab / 30)
  }

  let salBase
  if (tipo === 'horas') {
    const valorHora = salario / (P.horasMes || 230)
    salBase = horas * valorHora
  } else if (tipo === 'destajo') {
    // Destajo por producción: unidades producidas × tarifa por unidad (con prestaciones)
    salBase = (parseFloat(unidadesDestajo) || 0) * (parseFloat(empleado.tarifa_destajo) || 0)
  } else {
    salBase = salario * factor   // nómina fija
  }

  // ----- Descuentos por inasistencia (solo nómina fija; no aplica a 'horas' que ya paga lo trabajado) -----
  const jornadaDiaria = (P.horasSemana || 44) / (P.diasLaboralesSemana || 6)   // horas/día
  const valorDia  = salario / 30
  const valorHora = salario / (P.horasMes || 230)
  let diasNoLaborados = 0, horasFaltantes = 0, descuentoDias = 0, descuentoHoras = 0
  if (P.descuentaInasistencia && tipo === 'nomina') {
    if (P.modoInasistencia === 'manual') {
      // Días marcados como inasistencia injustificada en el listado
      diasNoLaborados = enRango.filter(a => a.estado_dia === 'injustificada').length
      // Horas faltantes en los días efectivamente asistidos
      if (P.descuentaHorasFaltantes) {
        enRango.filter(a => a.estado_dia !== 'injustificada' && a.estado_dia !== 'justificada')
          .forEach(a => { const h = calcHoras(a.entrada, a.salida); if (h > 0) horasFaltantes += Math.max(0, jornadaDiaria - h) })
      }
    } else {
      // Automático: días hábiles del rango (desde la vinculación) menos días asistidos
      const desdeEf = empleado.fecha_ingreso && empleado.fecha_ingreso > rango?.desde ? empleado.fecha_ingreso : rango?.desde
      const diasHabiles = desdeEf && rango?.hasta ? contarDiasHabiles(desdeEf, rango.hasta, P.diasLaboralesSemana || 6) : 0
      diasNoLaborados = Math.max(0, diasHabiles - diasTrab)
      if (P.descuentaHorasFaltantes) {
        // Déficit de jornada en los días asistidos
        horasFaltantes = Math.max(0, diasTrab * jornadaDiaria - horas)
      }
    }
    descuentoDias  = diasNoLaborados * valorDia
    descuentoHoras = horasFaltantes * valorHora
  }
  const descuentoInasistencia = descuentoDias + descuentoHoras

  // Deducciones del empleado
  const salud   = salBase * P.empleado.salud
  const pension = salBase * P.empleado.pension
  const neto    = salBase + auxTransp - salud - pension - descuentoInasistencia

  // Provisión de prestaciones
  // Base legal: cesantías, intereses de cesantías y prima se liquidan sobre el salario
  // + el auxilio de transporte. Las vacaciones se liquidan SOLO sobre el salario
  // (el auxilio de transporte no es factor salarial para vacaciones).
  const basePrestaciones = salBase + auxTransp
  const cesantias  = basePrestaciones * P.prestaciones.cesantias
  // Intereses cesantías: 12% anual sobre cesantías ≈ 1% mensual sobre la base (salario + aux)
  const intCes     = basePrestaciones * P.prestaciones.intCesantias
  const prima      = basePrestaciones * P.prestaciones.prima
  const vacaciones = salBase * P.prestaciones.vacaciones
  const totalPrestaciones = cesantias + intCes + prima + vacaciones

  // Aportes del empleador (parafiscales) — con exoneración Ley 1607 si aplica
  const exime = P.exoneraParafiscales && salario < 10 * P.smlmv
  const paraSalud   = exime ? 0 : salBase * P.empleador.salud
  const paraPension = salBase * P.empleador.pension
  const paraArl     = salBase * P.empleador.arl
  const paraCaja    = salBase * P.empleador.caja
  const paraIcbf    = exime ? 0 : salBase * P.empleador.icbf
  const paraSena    = exime ? 0 : salBase * P.empleador.sena
  const paraTotal   = paraSalud + paraPension + paraArl + paraCaja + paraIcbf + paraSena

  const costoEmpleador = salBase + auxTransp + totalPrestaciones + paraTotal

  // Garantía de salario mínimo (destajo): lo devengado no puede ser inferior al mínimo proporcional
  // al tiempo trabajado. El SMLMV se toma de los parámetros (P.smlmv).
  const diasMin = diasTrab > 0 ? diasTrab : (periodo === 'quincenal' ? 15 : 30)
  const minimoProporcional = tipo === 'destajo' ? P.smlmv * (diasMin / 30) : 0
  const cumpleMinimo = tipo !== 'destajo' || salBase >= minimoProporcional
  const faltanteMinimo = Math.max(0, minimoProporcional - salBase)

  return {
    tipo, esCPS: false, salario, incluyeAux, horas, diasTrab,
    salBase, auxTransp, salud, pension, neto,
    unidadesDestajo: tipo === 'destajo' ? (parseFloat(unidadesDestajo) || 0) : 0,
    tarifaDestajo: tipo === 'destajo' ? (parseFloat(empleado.tarifa_destajo) || 0) : 0,
    minimoProporcional, cumpleMinimo, faltanteMinimo,
    cesantias, intCes, prima, vacaciones, totalPrestaciones,
    diasNoLaborados, horasFaltantes, descuentoDias, descuentoHoras, descuentoInasistencia,
    parafiscales: { salud: paraSalud, pension: paraPension, arl: paraArl, caja: paraCaja, icbf: paraIcbf, sena: paraSena, total: paraTotal, exime },
    costoEmpleador,
  }
}

// ==================== CALCULADORA DE RECETA ====================

// Cuántas unidades base cubre el precio de una MP. El costo es (precio ÷ presentación) × cantidad:
//   $/Kg o $/Litro → 1000, porque la cantidad se digita en gramos/mililitros.
//   $/Gramo, $/Mililitro, $/Unidad → 1, porque la cantidad va en la misma unidad del precio.
// Si no se conoce la unidad se asume 1000 (Kg), que es el caso más común en materias primas.
export const presDeUnidad = (u) => (u === 'Gramo' || u === 'Mililitro' || u === 'Unidad') ? 1 : 1000

// Calcula el batch completo a partir de un ingrediente ancla
// ingredientes: [{ nombre, pct, precio, tipo ('normal'|'relativo'), base }]
export const calcularReceta = ({ ingredientes = [], ancla, cantidadAncla = 0, rendimiento = 62, desperdicio = 2, pesoUnidad = 1000 }) => {
  if (!ancla || cantidadAncla <= 0 || !ingredientes.length) return null

  const anclaRow = ingredientes.find(r => r.nombre === ancla)
  if (!anclaRow || anclaRow.pct <= 0) return null

  // base de un relativo: 'total', un nombre, o varios nombres (relativo a la suma)
  const baseList = (b) => Array.isArray(b) ? b.filter(Boolean) : (b && b !== 'total' ? [b] : [])

  // Fracción del ancla sobre el total de la mezcla.
  // - Normal: su % es directamente sobre el total.
  // - Relativo: su % es sobre la suma de sus bases → fracción = (Σ fracción de bases) × (su % / 100).
  let anclaFrac
  if (anclaRow.tipo === 'relativo' && baseList(anclaRow.base).length) {
    const baseFrac = baseList(anclaRow.base).reduce((s, bn) => {
      const br = ingredientes.find(x => x.nombre === bn)
      return s + (br ? (br.pct / 100) : 0)
    }, 0)
    anclaFrac = baseFrac * (anclaRow.pct / 100)
  } else {
    anclaFrac = anclaRow.pct / 100
  }
  if (anclaFrac <= 0) return null
  // Total de mezcla calculado desde el ancla
  const totalMezcla = cantidadAncla / anclaFrac
  const calculados = ingredientes.map(r => {
    let cantidad
    const bases = r.tipo === 'relativo' ? baseList(r.base) : []
    if (bases.length) {
      const baseCant = bases.reduce((s, bn) => {
        const br = ingredientes.find(x => x.nombre === bn)
        return s + (br ? totalMezcla * (br.pct / 100) : 0)
      }, 0)
      cantidad = baseCant * (r.pct / 100)
    } else {
      cantidad = totalMezcla * (r.pct / 100)
    }
    // El precio se expresa por cada "presentacion" gramos (1000 = $/Kg; 1 = $/g, ej. MP compradas por gramo).
    // Antes se asumía siempre /1000, lo que multiplicaba por 1000 el costo de insumos priced por gramo.
    const costoTotal = (r.precio / (r.presentacion || 1000)) * cantidad
    return { ...r, cantidad, costoTotal }
  })

  const totalCostoMP = calculados.reduce((s, r) => s + r.costoTotal, 0)
  // Masa real de la mezcla = suma de TODOS los ingredientes ya resueltos. No se usa `totalMezcla`
  // (que sale de despejar el ancla sobre los % de los normales) porque los ingredientes RELATIVOS
  // aportan masa por encima de ese total: contarla de menos subestimaba las unidades del bache y
  // por tanto inflaba el costo por unidad. Sin relativos y con % sumando 100, ambos coinciden.
  const masaTotal    = calculados.reduce((s, r) => s + (r.cantidad || 0), 0)
  const pesoEsperado = masaTotal * (rendimiento / 100)
  const pesoDesp     = pesoEsperado * (desperdicio / 100)
  const pesoFinal    = pesoEsperado - pesoDesp
  const unidades     = pesoUnidad > 0 ? pesoFinal / pesoUnidad : 0
  const costoMPkilo  = pesoFinal > 0 ? (totalCostoMP / pesoFinal) * 1000 : 0
  const costoMPcaja  = unidades > 0 ? totalCostoMP / unidades : 0

  return { calculados, totalMezcla, masaTotal, totalCostoMP, pesoEsperado, pesoDesp, pesoFinal, unidades, costoMPkilo, costoMPcaja }
}

// ==================== INVENTARIO ====================
export const getEstadoStock = (stock = 0, stockMin = 0) => {
  if (stock < 0)        return { label: 'Negativo', badge: 'badge-rojo' }
  if (stock === 0)      return { label: 'Sin stock', badge: 'badge-rojo' }
  if (stock <= stockMin) return { label: 'Stock bajo', badge: 'badge-dorado' }
  return { label: 'OK', badge: 'badge-verde' }
}

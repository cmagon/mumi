# MUMI AMAZONIA — Auditoría y Corrección del Módulo de Costos
## Archivo de contexto para Claude Code

---

## 🎯 OBJETIVO

Realizar una auditoría contable completa del módulo de calculadora de
costos de la app Mumi Amazonia. Corregir la clasificación de todos los
costos, recalcular desde cero usando metodología correcta, y actualizar
el sistema con los resultados.

---

## 📋 INSTRUCCIONES PARA EL AGENTE

### Paso 0 — Preparación
1. Lee este archivo completo antes de tocar cualquier código
2. Lee PROYECTO.md para entender la arquitectura general
3. Abre el módulo de calculadora de costos en el código
4. Abre el módulo de nómina en el código
5. Usa el plugin `finance` para validar cálculos contables
6. NO modifiques ningún código hasta completar el diagnóstico completo

### Paso 1 — Auditoría del módulo de nómina
Antes de calcular cualquier costo de producto, necesitas los datos
correctos de mano de obra. Audita el módulo de nómina:

```
VERIFICAR EN EL MÓDULO DE NÓMINA:
□ Salario mínimo 2026 = $1.750.905
□ Auxilio de transporte 2026 = $249.095 (solo si salario ≤ 2 × SMMLV)
□ Prestaciones sociales correctas:
  - Cesantías: 8.33%
  - Intereses sobre cesantías: 1%
  - Prima de servicios: 8.33%
  - Vacaciones: 4.17%
  - Total prestaciones: 25.83%
□ Aportes parafiscales (empleador):
  - Salud empleador: 8.5%
  - Pensión empleador: 12%
  - ARL (riesgo I): 0.522% (verificar nivel de riesgo)
  - ICBF: 3%
  - SENA: 2%
  - Caja compensación: 4%
  - Total parafiscales empleador: ~30%
□ Costo REAL mensual por operaria:
  Salario base
  + Auxilio transporte (si aplica)
  + Prestaciones sociales (% sobre salario)
  + Parafiscales empleador (% sobre salario)
  = COSTO TOTAL MENSUAL por persona
□ Verificar que el sistema usa costo TOTAL (no solo salario base)
  para calcular el costo/hora y costo/minuto
```

### Paso 2 — Calcular costo/minuto CORRECTO

```
FÓRMULA CORRECTA:

Costo total mensual operaria = Salario + Prestaciones + Parafiscales

Minutos productivos disponibles al mes:
  22 días hábiles × 8 horas × 60 minutos = 10.560 minutos brutos
  - 15% improductividad (alistamiento, descansos, imprevistos)
  = 10.560 × 0.85 = 8.976 minutos productivos/mes

Costo por minuto = Costo total mensual operaria ÷ minutos productivos

IMPORTANTE: Si hay 2 operarias trabajando en paralelo en un proceso,
el costo/minuto de ese proceso = costo/minuto × número de operarias
```

### Paso 3 — Auditoría y reclasificación del CIF

Audita cada ítem de costo fijo registrado en el sistema y clasifícalo
según la siguiente tabla de reglas:

#### REGLA MAESTRA DE CLASIFICACIÓN

```
PREGUNTA 1: ¿Este costo existe PORQUE PRODUCIMOS?
  SÍ → Es costo de producción (CIF o variable directo)
  NO → Es gasto del período (administración, ventas o financiero)

PREGUNTA 2 (si es costo de producción): ¿Se puede asignar directamente
  a un producto específico?
  SÍ → Costo variable directo (va 100% al producto)
  NO → CIF (se distribuye entre todos los productos)

PREGUNTA 3 (si es gasto del período): ¿Para qué sirve?
  Gestionar la empresa → Gasto administrativo
  Vender productos → Gasto de ventas
  Financiar la operación → Gasto financiero
  Pagar impuestos sobre ingresos → Impuesto (línea separada)
```

#### CLASIFICACIÓN CORRECTA POR ÍTEM

```
ÍTEM                          CLASIFICACIÓN CORRECTA
─────────────────────────────────────────────────────────────────
Arriendo espacio producción   CIF (% área productiva)
Arriendo área administrativa  Gasto administrativo (% área admin)
──────────────────────────────────────────────────────────────────
Energía equipos producción    CIF
(horno, licuadora, selladora)
Energía área administrativa   Gasto administrativo
──────────────────────────────────────────────────────────────────
Agua proceso productivo       CIF
(lavado fruta, limpieza MP)
Agua uso general              Gasto administrativo
──────────────────────────────────────────────────────────────────
Mantenimiento equipos prod.   CIF ✅
Mantenimiento inmueble/local  Gasto administrativo ← CORRECCIÓN
──────────────────────────────────────────────────────────────────
Honorarios Contador           Gasto administrativo ← SACAR DEL CIF
──────────────────────────────────────────────────────────────────
Transporte compra MP          Costo de materia prima (suma al precio MP)
Transporte entrega pedidos    Gasto de ventas ← SEPARAR
──────────────────────────────────────────────────────────────────
Publicidad / redes sociales   Gasto de ventas ← SACAR DEL CIF
──────────────────────────────────────────────────────────────────
Útiles y papelería oficina    Gasto administrativo ← SACAR DEL CIF
Etiquetas / empaque producto  Costo variable directo ← SEPARAR
──────────────────────────────────────────────────────────────────
Aseo área de producción       CIF ✅ (parte productiva)
Cafetería / bienestar equipo  Gasto administrativo ← SEPARAR
──────────────────────────────────────────────────────────────────
Registro Mercantil            Gasto administrativo ← SACAR DEL CIF
(causar $130.000/mes del anual)
──────────────────────────────────────────────────────────────────
Impuesto ICA                  Impuesto s/ingresos ← LÍNEA SEPARADA
(no es gasto admin, es impuesto sobre ventas brutas)
──────────────────────────────────────────────────────────────────
Capital préstamo              PASIVO ← SACAR COMPLETAMENTE
(no es gasto, reduce la deuda)
──────────────────────────────────────────────────────────────────
Intereses préstamo            Gasto financiero ← SACAR DEL CIF
──────────────────────────────────────────────────────────────────
Seguro préstamo               Gasto administrativo ← SACAR DEL CIF
──────────────────────────────────────────────────────────────────
Comunicación celular          Gasto administrativo ← SACAR DEL CIF
──────────────────────────────────────────────────────────────────
Dotación operarias            CIF ✅ (tapabocas, guantes, delantal)
──────────────────────────────────────────────────────────────────
Insumos limpieza producción   CIF ✅
──────────────────────────────────────────────────────────────────
Salario personal admin        Gasto administrativo
(NO va al CIF ni al producto)
──────────────────────────────────────────────────────────────────
Comisiones vendedores         Gasto de ventas
──────────────────────────────────────────────────────────────────
Ferias y eventos              Gasto de ventas
──────────────────────────────────────────────────────────────────
Comisiones bancarias          Gasto financiero
```

### Paso 4 — Estructura de módulos a crear/corregir en el sistema

Después de la auditoría, el sistema debe tener CUATRO grupos de costos
separados, no uno solo llamado "CIF":

```
GRUPO A: COSTOS VARIABLES DIRECTOS (van 100% al producto)
─────────────────────────────────────────────────────────
□ Materia prima (con transporte de compra incluido)
□ Mano de obra directa (en minutos × costo/minuto)
□ Empaque y etiquetas directas del producto

GRUPO B: CIF — Costos Indirectos de Fabricación
─────────────────────────────────────────────────────────
□ Solo lo que existe porque hay producción
□ Se distribuye por participación proporcional en ventas
□ Tiene frecuencia: mensual / trimestral / semestral / anual

GRUPO C: GASTOS OPERACIONALES (no van al producto)
─────────────────────────────────────────────────────────
  C1. Gastos de administración:
      □ Honorarios contador
      □ Comunicación celular
      □ Registro mercantil (÷ 12)
      □ Seguro préstamo
      □ Útiles y papelería
      □ Cafetería / bienestar
      □ Mantenimiento inmueble
      □ Software / herramientas digitales
      □ Salarios personal administrativo

  C2. Gastos de ventas:
      □ Publicidad
      □ Transporte entregas
      □ Comisiones vendedores
      □ Ferias y eventos
      □ Empaque de regalo / presentación

GRUPO D: GASTOS FINANCIEROS E IMPUESTOS
─────────────────────────────────────────────────────────
  D1. Gastos financieros:
      □ Intereses préstamo
      □ Comisiones bancarias
  D2. Impuestos:
      □ ICA (sobre ingresos brutos)
      □ Renta (sobre utilidad)
  D3. Pasivos (NO son gastos):
      □ Capital préstamo (solo aparece en flujo de caja)
```

### Paso 5 — Distribución correcta del CIF entre productos

```
MÉTODO: Participación proporcional en ventas (Margen de Contribución
Ponderado) — método multiproducto.

FÓRMULA:
  % participación producto X =
    (Unidades/mes × Precio venta) del producto X
    ÷ Suma (Unidades/mes × Precio venta) de TODOS los productos

  CIF asignado producto X = CIF total mensual × % participación X

  CIF por unidad producto X = CIF asignado X ÷ Unidades/mes X

VERIFICAR QUE EL SISTEMA:
□ Usa precio de venta MAYOR (no detal) para calcular participación
□ Recalcula automáticamente cuando se agrega o modifica un producto
□ Muestra la tabla de distribución con % de cada producto
□ Actualiza el CIF/unidad en cada ficha de costos automáticamente
```

### Paso 6 — Cálculo completo del costo unitario por producto

```
ESTRUCTURA CORRECTA:

1. COSTO DE PRODUCCIÓN UNITARIO
   + Materia prima por unidad
     (precio MP + transporte compra ÷ total MP comprada)
   + Mano de obra directa por unidad
     (minutos del proceso × costo/minuto × n° operarias)
   + Empaque directo por unidad
     (caja + bolsa + etiqueta + papel parafinado)
   + CIF por unidad (proporcional)
   ═══════════════════════════════
   = COSTO DE PRODUCCIÓN UNITARIO

2. INDICADORES POR PRODUCTO
   Utilidad bruta unitaria = Precio venta - Costo producción unitario
   % Margen bruto = (Utilidad bruta ÷ Precio venta) × 100

   Contribución a gastos operacionales:
   (La utilidad bruta de TODOS los productos debe cubrir
    los gastos de administración + ventas + financieros)

3. PUNTO DE EQUILIBRIO
   PE unidades = Gastos fijos totales (CIF + Admin + Ventas + Financiero)
                 ÷ Margen de contribución ponderado promedio

   donde:
   Margen contribución unitario = Precio venta - Costos variables directos
   Margen contribución ponderado = Σ (% participación × margen unitario)
```

### Paso 7 — Estado de resultados mensual que el sistema debe generar

```
VENTAS NETAS                               $X.XXX.XXX    100%
- Costos de producción (Grupo A + B)       $X.XXX.XXX     XX%
══════════════════════════════════════════════════════════════
= UTILIDAD BRUTA                           $X.XXX.XXX     XX%
  (margen bruto — debe ser > 40% idealmente)

- Gastos de administración (Grupo C1)      $X.XXX.XXX     XX%
- Gastos de ventas (Grupo C2)              $X.XXX.XXX     XX%
══════════════════════════════════════════════════════════════
= UTILIDAD OPERACIONAL (EBITDA aprox)      $X.XXX.XXX     XX%
  (debe ser > 15% para ser sostenible)

- Gastos financieros (Grupo D1)            $X.XXX.XXX     XX%
══════════════════════════════════════════════════════════════
= UTILIDAD ANTES DE IMPUESTOS              $X.XXX.XXX     XX%

- ICA y otros impuestos (Grupo D2)         $X.XXX.XXX     XX%
══════════════════════════════════════════════════════════════
= UTILIDAD NETA                            $X.XXX.XXX     XX%
  (meta: > 10% sobre ventas)

NOTA FLUJO DE CAJA (no aparece en resultados):
  Capital préstamo pagado                  $X.XXX.XXX
  (reduce pasivo, no afecta utilidad)
```

### Paso 8 — Indicadores adicionales a calcular por producto

```
Para cada producto en la ficha de costos mostrar:

□ Costo de producción unitario (detallado por componente)
□ % que representa cada componente sobre el costo total:
  - % MP / costo total
  - % MO / costo total
  - % Empaque / costo total
  - % CIF / costo total

□ Precio venta mayor y detal
□ Utilidad bruta mayor ($) y (%)
□ Utilidad bruta detal ($) y (%)
□ Margen de contribución unitario (precio - variables)
□ % participación en el portafolio (para distribución CIF)
□ CIF absorbido mensualmente por este producto ($)
□ Punto de equilibrio individual (unidades/mes para cubrir su CIF)
□ Punto de equilibrio del portafolio (unidades totales/mes)
□ Rentabilidad sobre costo: (utilidad ÷ costo) × 100
```

### Paso 9 — Cambios específicos en la UI del módulo

```
MÓDULO CIF — cambios requeridos:
□ Renombrar de "CIF" a "Costos Indirectos de Fabricación (CIF)"
□ Agregar campo "Grupo" con opciones: CIF / Administrativo / Ventas /
  Financiero / Impuesto / Pasivo
□ Los ítems marcados como no-CIF siguen apareciendo en el módulo
  pero en secciones separadas con su propio subtotal
□ Solo los marcados como "CIF" se distribuyen entre productos
□ Los demás grupos muestran su total mensual para el estado de resultados
□ Agregar campo "Descripción extendida" para anotar qué incluye cada ítem

MÓDULO CALCULADORA DE COSTOS — cambios requeridos:
□ Mostrar desglose de costo/minuto con todos los componentes
□ Mostrar la tabla de distribución CIF antes del resumen
□ En el resumen añadir: % de cada componente sobre costo total
□ Añadir sección "Rentabilidad" con todos los indicadores del Paso 8
□ Añadir opción para ver precio Mayor y precio Detal en paralelo

MÓDULO NÓMINA — cambios requeridos:
□ Mostrar costo total real del empleado (no solo salario neto)
□ Mostrar la diferencia entre: salario neto, costo empresa, y
  valor que se usa para calcular costo/minuto
□ El costo/minuto debe usar el COSTO TOTAL EMPRESA, no el salario base

DASHBOARD — cambios requeridos:
□ Agregar sección "Análisis financiero del mes"
□ Mostrar el estado de resultados resumido (Paso 7)
□ Semáforo de salud financiera:
  - Verde: margen bruto > 40%, margen neto > 10%
  - Amarillo: margen bruto 25-40%, margen neto 5-10%
  - Rojo: margen bruto < 25%, margen neto < 5%
```

---

## ⚠️ ERRORES CRÍTICOS A CORREGIR

Los siguientes son errores contables que generan información incorrecta:

```
ERROR 1 — Capital del préstamo en CIF
El capital de amortización del préstamo ($278.221/mes) está
registrado como costo. NUNCA es un gasto. Inflaba el CIF en
$278.221/mes y hacía que los productos parecieran más costosos
de lo que son.
CORRECCIÓN: Eliminar del sistema de costos completamente.
Registrar solo en flujo de caja.

ERROR 2 — Intereses y seguro del préstamo en CIF
Estos NO son costos de producción. No van al producto.
CORRECCIÓN: Mover a Gasto financiero y Gasto administrativo
respectivamente.

ERROR 3 — Honorarios contador, publicidad, papelería en CIF
Existen aunque no haya producción. No son costos de fabricar.
CORRECCIÓN: Mover a Gastos operacionales (admin y ventas).

ERROR 4 — Costo/minuto calculado sin prestaciones completas
Si el sistema usa solo el salario base para calcular costo/hora,
el costo de mano de obra está subestimado en ~30-35%.
El costo real incluye: salario + prestaciones + parafiscales empleador.
CORRECCIÓN: Auditar la fórmula de costo/minuto y corregir.

ERROR 5 — ICA tratado como gasto administrativo
El ICA es un impuesto sobre los ingresos brutos, no un gasto
de administración. Debe aparecer como línea separada después
de la utilidad operacional, o como deducción de ventas según
el régimen.
CORRECCIÓN: Crear línea separada "Impuestos sobre ingresos".
```

---

## 📊 VALIDACIONES CON EL PLUGIN FINANCE

Al terminar las correcciones, usar el plugin finance para validar:

```
□ Verificar que la suma de todos los grupos de costo es correcta
□ Verificar que el margen bruto de cada producto es coherente
  con el sector (alimentos artesanales: 40-60% es normal)
□ Verificar punto de equilibrio multiproducto
□ Verificar que el estado de resultados cuadra:
  Ventas - Costos - Gastos = Utilidad antes impuestos
□ Verificar costo/minuto contra el valor del mercado laboral 2026
□ Generar análisis de sensibilidad:
  ¿Qué pasa con la utilidad si las ventas bajan 20%?
  ¿Qué pasa si la MP sube 15%?
```

---

## 🔢 DATOS DE REFERENCIA 2026

```javascript
// Parámetros legales Colombia 2026
const PARAMS_2026 = {
  smmlv: 1750905,
  auxTransporte: 249095,        // solo si salario <= 2 × smmlv

  // Prestaciones sociales (% sobre salario)
  cesantias: 0.0833,
  intCesantias: 0.01,
  prima: 0.0833,
  vacaciones: 0.0417,
  totalPrestaciones: 0.2183,

  // Parafiscales empleador (% sobre salario)
  saludEmpleador: 0.085,
  pensionEmpleador: 0.12,
  arl: 0.00522,                 // riesgo I — verificar nivel real
  icbf: 0.03,                   // exento si salario < 10 smmlv
  sena: 0.02,                   // exento si salario < 10 smmlv
  cajaCompensacion: 0.04,
  totalParafiscales: 0.30022,   // verificar exenciones

  // Jornada laboral
  diasHabilesMes: 22,
  horasDia: 8,
  minutosDia: 480,
  minutosMesBrutos: 10560,
  factorImproductividad: 0.15,
  minutosMesProductivos: 8976,  // 10560 × 0.85

  // Costo total empresa por operaria (calcular con fórmula):
  // costoTotalMensual = smmlv × (1 + totalPrestaciones + totalParafiscales)
  // costoMinuto = costoTotalMensual / minutosMesProductivos
};
```

---

## 📁 ARCHIVOS A REVISAR EN EL PROYECTO

```
Revisar en este orden:
1. /src/modules/nomina/        → auditar cálculo costo empleado
2. /src/modules/costos/        → auditar CIF y calculadora
3. /src/modules/dashboard/     → actualizar indicadores
4. /src/lib/calculations.ts    → verificar fórmulas base
5. /src/types/costos.ts        → verificar estructura de datos
6. Supabase tablas:
   - cif_items                 → agregar campo "grupo"
   - products_costing          → agregar campos de indicadores
   - employees                 → verificar campos de costo total
```

---

## ✅ CHECKLIST FINAL

Antes de hacer commit, verificar:

```
□ Costo/minuto recalculado con costo total empresa (no salario base)
□ Todos los ítems de costo reclasificados en su grupo correcto
□ Capital del préstamo eliminado de gastos
□ CIF solo contiene costos del proceso productivo
□ Distribución CIF por participación proporcional en ventas funciona
□ Ficha de costos muestra % de cada componente
□ Estado de resultados mensual generado correctamente
□ Punto de equilibrio multiproducto calculado
□ Semáforo de salud financiera en dashboard
□ Validación con plugin finance sin errores
□ Datos de prueba verificados contra valores reales de Mumi
```


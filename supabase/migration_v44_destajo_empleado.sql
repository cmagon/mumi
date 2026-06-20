-- v44: tarifas para empleados pagados por destajo
--   tarifa_destajo: valor por unidad producida (tipo_pago = 'destajo')
--   valor_hora:     valor por hora trabajada (tipo_pago = 'destajo_hora', sin prestaciones)
alter table employees add column if not exists tarifa_destajo numeric;
alter table employees add column if not exists valor_hora numeric;

-- Permitir el nuevo tipo de pago 'destajo_hora' en la restricción CHECK
alter table employees drop constraint if exists employees_tipo_pago_check;
alter table employees add constraint employees_tipo_pago_check
  check (tipo_pago in ('nomina','horas','destajo','destajo_hora','cps'));

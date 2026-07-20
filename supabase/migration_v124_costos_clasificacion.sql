-- v124 — Auditoría de costos: clasificación contable de CIF y área de empleados.
-- Ver AUDITORIA_COSTOS.md — el CIF mezclaba gastos que no son de fabricación
-- (préstamo, honorarios contador, publicidad...) y la nómina del CIF incluía
-- a todo el personal (incluido administrativo/ventas). Esta migración agrega
-- los campos necesarios para separarlos; el código sigue funcionando igual
-- que antes hasta que se reclasifiquen los ítems desde la UI.

-- cif_items: clasificación contable del ítem.
alter table cif_items add column if not exists grupo text not null default 'cif';
alter table cif_items drop constraint if exists cif_items_grupo_check;
alter table cif_items add constraint cif_items_grupo_check
  check (grupo in ('cif','administracion','ventas','financiero','impuesto','pasivo'));
alter table cif_items add column if not exists descripcion_extendida text default '';

-- Sugerencia automática de clasificación por palabras clave sobre los ítems
-- existentes (revisable/corregible después desde la UI de Costos → CIF).
update cif_items set grupo = case
  when descripcion ilike '%capital%' and descripcion ilike '%prestamo%' then 'pasivo'
  when descripcion ilike '%interes%' or descripcion ilike '%comision%bancaria%' then 'financiero'
  when descripcion ilike '%ica%' then 'impuesto'
  when descripcion ilike '%contador%' or descripcion ilike '%papeleria%'
    or descripcion ilike '%registro mercantil%' or descripcion ilike '%seguro%prestamo%'
    or descripcion ilike '%celular%' or descripcion ilike '%comunicacion%'
    or descripcion ilike '%mantenimiento%inmueble%' or descripcion ilike '%mantenimiento%local%'
    or descripcion ilike '%cafeteria%' or descripcion ilike '%bienestar%'
    or descripcion ilike '%software%' or descripcion ilike '%arriendo%admin%' then 'administracion'
  when descripcion ilike '%publicidad%' or descripcion ilike '%redes%'
    or descripcion ilike '%comision%vendedor%' or descripcion ilike '%feria%'
    or descripcion ilike '%transporte%entrega%' or descripcion ilike '%transporte%pedido%' then 'ventas'
  else 'cif'
end;

-- employees: área de costeo, para separar la nómina de producción (entra al
-- CIF/costo-minuto) de la de administración/ventas (entra al gasto operacional).
alter table employees add column if not exists area_costeo text not null default 'produccion';
alter table employees drop constraint if exists employees_area_costeo_check;
alter table employees add constraint employees_area_costeo_check
  check (area_costeo in ('produccion','administracion','ventas'));

update employees set area_costeo = case
  when cargo ilike '%administrador%' or cargo ilike '%gerente%' or cargo ilike '%contador%' then 'administracion'
  when cargo ilike '%vendedor%' then 'ventas'
  else 'produccion'
end;

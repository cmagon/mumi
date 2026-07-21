-- v129 — Valoración RETROACTIVA de los saldos de mezcla que ya existían.
--
-- Los saldos creados antes de la v128 no tienen costo. Este script se los calcula con la misma
-- fórmula que usa la app al crear un saldo nuevo:
--     costo por unidad de peso = (costo_final de la ficha − empaque por unidad) ÷ peso_unidad
-- Se descuenta el empaque porque la mezcla todavía no está empacada.
-- Es idempotente: solo toca saldos disponibles que aún no tengan costo.
--
-- Requiere la v128 (columna mezcla_saldos.costo_unitario).

with ficha as (
  select
    p.id,
    coalesce(p.costo_final, 0)                                   as costo_final,
    coalesce(p.peso_unidad, 0)                                   as peso_unidad,
    coalesce(p.bache, 0) * (1 - coalesce(p.merma, 0) / 100.0)    as unids_bache,
    -- El empaque puede venir como array jsonb o como texto JSON (según cómo se guardó la ficha)
    case jsonb_typeof(p.empaque)
      when 'array'  then p.empaque
      when 'string' then (p.empaque #>> '{}')::jsonb
      else '[]'::jsonb
    end as empaque_json
  from products_costing p
),
emp as (
  select
    f.id,
    f.costo_final,
    f.peso_unidad,
    f.unids_bache,
    coalesce(sum(
      (coalesce(nullif(e->>'precio', '')::numeric, 0)
        / nullif(coalesce(nullif(e->>'presentacion', '')::numeric, 1), 0))
      * coalesce(nullif(e->>'cantidad', '')::numeric, 0)
    ), 0) as emp_bache
  from ficha f
  left join lateral jsonb_array_elements(f.empaque_json) e on true
  group by f.id, f.costo_final, f.peso_unidad, f.unids_bache
),
costo as (
  select
    id,
    peso_unidad,
    -- Costo unitario de la mezcla SIN empaque, nunca negativo
    greatest(0, costo_final - case when unids_bache > 0 then emp_bache / unids_bache else 0 end) as costo_sin_empaque
  from emp
)
update mezcla_saldos s
   set costo_unitario = case when s.unidad = 'Kg'
                             then (c.costo_sin_empaque / c.peso_unidad) * 1000
                             else  c.costo_sin_empaque / c.peso_unidad
                        end
  from costo c
 where s.origen_id = c.id
   and c.peso_unidad > 0
   and s.costo_unitario is null
   and s.estado = 'disponible';

-- Resumen: cuántos quedaron valorados y cuáles no se pudieron (sin ficha o sin peso_unidad)
select
  count(*) filter (where costo_unitario is not null) as valorados,
  count(*) filter (where costo_unitario is null)     as sin_valorar,
  round(coalesce(sum(peso * costo_unitario), 0))     as valor_total_en_proceso
from mezcla_saldos
where estado = 'disponible' and peso > 0;

-- v173 — Número de pedido correlativo diario SIN guion: AAMMDDNN (ej. 25091504 = 4.º del 15/09).
-- Reemplaza el formato con guion de v172. El correlativo = (pedidos de hoy) + 1, con 2 dígitos
-- mínimo; el índice único de `codigo` y el loop protegen contra duplicados por carreras.

create or replace function catalogo_nuevo_codigo_pedido()
returns text
language plpgsql
as $$
declare
  v_fecha text := to_char(now() at time zone 'America/Bogota', 'YYMMDD');
  v_n int;
  v text;
begin
  -- N.º de orden del día = cuántos pedidos ya llevan la fecha de hoy + 1.
  select count(*) + 1 into v_n
    from pedidos_catalogo
   where codigo like v_fecha || '%';

  loop
    v := v_fecha || lpad(v_n::text, 2, '0');   -- 2 dígitos mínimo; crece solo si pasa de 99
    exit when not exists (select 1 from pedidos_catalogo where codigo = v);
    v_n := v_n + 1;   -- si por una carrera ya existe, toma el siguiente
  end loop;
  return v;
end;
$$;

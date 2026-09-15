-- v172 — Número de pedido correlativo diario: AAMMDD-NN (ej. 250915-04 = 4.º pedido del 15/09).
-- Más corto y legible que el AAMMDD+4 aleatorio (v166), fácil de dictar/buscar en WhatsApp.
-- Convive con los códigos antiguos (sin guion): el correlativo solo cuenta los del NUEVO
-- formato del día, y el índice único de `codigo` protege contra duplicados.

create or replace function catalogo_nuevo_codigo_pedido()
returns text
language plpgsql
as $$
declare
  v_fecha text := to_char(now() at time zone 'America/Bogota', 'YYMMDD');
  v_n int;
  v text;
begin
  loop
    -- Siguiente correlativo del día: mayor NN existente con el formato AAMMDD-NN + 1.
    select coalesce(max(split_part(codigo, '-', 2)::int), 0) + 1
      into v_n
      from pedidos_catalogo
     where codigo ~ ('^' || v_fecha || '-[0-9]+$');

    v := v_fecha || '-' || lpad(v_n::text, 2, '0');   -- 2 dígitos mínimo (01, 02… y 100+ crece solo)
    exit when not exists (select 1 from pedidos_catalogo where codigo = v);
    -- Si por una carrera ya existe, el loop recalcula y toma el siguiente.
  end loop;
  return v;
end;
$$;

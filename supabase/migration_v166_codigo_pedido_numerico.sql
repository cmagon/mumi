-- v166 — El número de pedido pasa a ser SOLO numérico (sin prefijo MUMI- ni letras).
-- Formato: YYMMDD + 4 dígitos aleatorios (10 dígitos). Se conserva la unicidad.

create or replace function catalogo_nuevo_codigo_pedido()
returns text
language plpgsql
as $$
declare
  v text;
begin
  loop
    v := to_char(now() at time zone 'America/Bogota', 'YYMMDD')
         || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from pedidos_catalogo where codigo = v);
  end loop;
  return v;
end;
$$;

-- v140 — Asegura columna proveedor en lotes PEPS (idempotente).
-- Si v89 no se aplicó en el entorno, los ingresos guardaban el lote sin proveedor
-- (el cliente reintentaba el insert omitiendo la columna).
alter table raw_material_lots add column if not exists proveedor text;
comment on column raw_material_lots.proveedor is
  'Proveedor / productor de este lote de materia prima (trazabilidad PEPS).';

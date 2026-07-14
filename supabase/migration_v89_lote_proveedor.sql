-- v89 — Proveedor por lote de materia prima: registra a quién se le compró cada lote
-- (ej. pulpas/frutas de campesinos) para trazabilidad completa desde las órdenes de producción.
alter table raw_material_lots add column if not exists proveedor text;

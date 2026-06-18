-- ============================================================
-- MUMI AMAZONIA — Migration v28 (idempotente)
-- Inventario PEPS por lote (Primeras Entradas, Primeras Salidas)
--   raw_material_lots: cada entrada de MP genera un lote con saldo propio.
--   Las salidas consumen primero el lote más antiguo / próximo a vencer.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS raw_material_lots (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mp_id            bigint REFERENCES raw_materials(id) ON DELETE CASCADE,
  lote             text,
  vencimiento      date,
  fecha_entrada    date NOT NULL DEFAULT current_date,
  cantidad_inicial numeric NOT NULL DEFAULT 0,
  cantidad_actual  numeric NOT NULL DEFAULT 0,
  costo_unitario   numeric DEFAULT 0,
  creado_por       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rm_lots_mp ON raw_material_lots (mp_id, vencimiento, fecha_entrada);

ALTER TABLE raw_material_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rm_lots_select ON raw_material_lots;
CREATE POLICY rm_lots_select ON raw_material_lots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS rm_lots_write ON raw_material_lots;
CREATE POLICY rm_lots_write ON raw_material_lots FOR ALL TO authenticated USING (true) WITH CHECK (true);

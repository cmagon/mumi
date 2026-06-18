-- ============================================================
-- MUMI AMAZONIA — Migration v25 (idempotente)
-- Histórico de cambios de cantidades/costos de ingredientes en las fichas
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS product_cost_history (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  bigint,
  snapshot    jsonb,
  costo_mp    numeric,
  cvu         numeric,
  costo_total numeric,
  creado_por  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_cost_history_prod ON product_cost_history (product_id, created_at DESC);

ALTER TABLE product_cost_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_cost_history_all ON product_cost_history;
CREATE POLICY product_cost_history_all ON product_cost_history
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));

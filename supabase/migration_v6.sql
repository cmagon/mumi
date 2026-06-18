-- ============================================================
-- MUMI AMAZONIA — Migration v6 (idempotente)
-- Permisos finos: autor de recetas y aprobación de registros de producción
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Quién creó la receta rápida (para que el operario no borre las del admin)
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS creado_por TEXT DEFAULT '';

-- Registros de producción creados por operario: requieren aprobación del admin
ALTER TABLE production_records
  ADD COLUMN IF NOT EXISTS aprobado   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS creado_por TEXT    DEFAULT '';

-- ============================================================
-- RLS para que operario pueda usar la Fase 2
-- ============================================================
-- Recetas: admin y operario pueden crear/editar/borrar (la UI limita el borrado al autor)
DROP POLICY IF EXISTS "Recipes write op" ON recipes;
CREATE POLICY "Recipes write op" ON recipes FOR ALL TO authenticated
  USING (get_my_role() IN ('admin','operario')) WITH CHECK (get_my_role() IN ('admin','operario'));

-- Órdenes de producción: el operario puede crearlas
DROP POLICY IF EXISTS "Op create orders" ON production_orders;
CREATE POLICY "Op create orders" ON production_orders FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin','operario'));

-- Registros de producción: operario puede crear y editar
DROP POLICY IF EXISTS "Op create prod records" ON production_records;
CREATE POLICY "Op create prod records" ON production_records FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin','operario'));
DROP POLICY IF EXISTS "Op update prod records" ON production_records;
CREATE POLICY "Op update prod records" ON production_records FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin','operario')) WITH CHECK (get_my_role() IN ('admin','operario'));

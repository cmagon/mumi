-- ============================================================
-- MUMI AMAZONIA — Migration v20 (idempotente)
-- Tipos de producto gestionables (galleta, bocadillo, ...)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS product_types (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre     text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado
DROP POLICY IF EXISTS product_types_select ON product_types;
CREATE POLICY product_types_select ON product_types
  FOR SELECT TO authenticated USING (true);

-- Crear / eliminar: solo administradores
DROP POLICY IF EXISTS product_types_write ON product_types;
CREATE POLICY product_types_write ON product_types
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));

-- Tipos por defecto (coinciden con los valores ya usados)
INSERT INTO product_types (nombre) VALUES
  ('galleta'), ('bocadillo'), ('infusion'), ('mermelada')
ON CONFLICT (nombre) DO NOTHING;

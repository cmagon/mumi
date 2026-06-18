-- ============================================================
-- MUMI AMAZONIA — Migration v10 (idempotente)
-- 1) user_profiles.archivado (usuarios antiguos)
-- 2) Tabla role_permissions (gestión de permisos por rol)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) Columna para archivar usuarios (usuarios antiguos)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS archivado boolean NOT NULL DEFAULT false;

-- 2) Permisos por rol (módulos y secciones visibles)
CREATE TABLE IF NOT EXISTS role_permissions (
  rol        text PRIMARY KEY,
  permisos   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (el front necesita conocer su propia config)
DROP POLICY IF EXISTS role_permissions_select ON role_permissions;
CREATE POLICY role_permissions_select ON role_permissions
  FOR SELECT TO authenticated USING (true);

-- Escritura: solo administradores
DROP POLICY IF EXISTS role_permissions_write ON role_permissions;
CREATE POLICY role_permissions_write ON role_permissions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));

-- Valores por defecto (no sobrescribe si ya existen)
INSERT INTO role_permissions (rol, permisos) VALUES
  ('operario', '{"modulos":["dashboard","costos","inventario","ordenes","produccion","nomina"],"secciones":{}}'::jsonb),
  ('auxiliar', '{"modulos":["dashboard","costos","inventario","ordenes","nomina"],"secciones":{}}'::jsonb)
ON CONFLICT (rol) DO NOTHING;

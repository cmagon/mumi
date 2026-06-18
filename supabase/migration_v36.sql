-- ============================================================
-- MUMI AMAZONIA — Migration v36 (idempotente)
-- 1) Copia visible de la contraseña en el perfil (para que el admin la consulte).
-- 2) Solicitudes de recuperación de contraseña (desde el login, sin sesión).
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS password_visible text;

CREATE TABLE IF NOT EXISTS password_requests (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario     text,
  mensaje     text,
  atendido    boolean DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE password_requests ENABLE ROW LEVEL SECURITY;
-- Cualquiera (incluso sin sesión) puede CREAR una solicitud desde el login
DROP POLICY IF EXISTS password_requests_insert ON password_requests;
CREATE POLICY password_requests_insert ON password_requests FOR INSERT TO anon, authenticated WITH CHECK (true);
-- Solo admin puede ver/gestionar las solicitudes
DROP POLICY IF EXISTS password_requests_admin ON password_requests;
CREATE POLICY password_requests_admin ON password_requests FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));

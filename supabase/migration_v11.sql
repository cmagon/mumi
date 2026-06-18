-- ============================================================
-- MUMI AMAZONIA — Migration v11 (idempotente)
-- Datos básicos adicionales del empleado
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS correo               text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS direccion            text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fecha_nacimiento     date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fecha_ingreso        date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS eps                  text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contacto_emergencia  text;

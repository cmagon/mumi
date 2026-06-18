-- ============================================================
-- MUMI AMAZONIA — Migration v23 (idempotente)
-- Auditoría: quién creó cada orden de producción
-- (la fecha/hora ya queda en created_at)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS creado_por text;

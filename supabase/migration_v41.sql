-- ============================================================
-- MUMI AMAZONIA — Migration v41 (idempotente)
-- Empaque surtido/mezclado: con qué lote(s) se combinó.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE production_records ADD COLUMN IF NOT EXISTS surtido boolean DEFAULT false;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS lote_mezcla text;
ALTER TABLE production_orders  ADD COLUMN IF NOT EXISTS surtido boolean DEFAULT false;
ALTER TABLE production_orders  ADD COLUMN IF NOT EXISTS lote_mezcla text;

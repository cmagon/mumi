-- ============================================================
-- MUMI AMAZONIA — Migration v4 (idempotente)
-- Lotes multi-etapa + fotos múltiples + ventana de edición del operario
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) Registro de producción: tipo, etapas del lote, completado, fotos múltiples
ALTER TABLE production_records
  ADD COLUMN IF NOT EXISTS tipo_registro TEXT    DEFAULT 'final',     -- 'final' | 'subproducto'
  ADD COLUMN IF NOT EXISTS etapas        JSONB   DEFAULT '[]',        -- etapas del lote (producción, empacado, ...)
  ADD COLUMN IF NOT EXISTS completado    BOOLEAN DEFAULT TRUE,        -- el lote ya está terminado
  ADD COLUMN IF NOT EXISTS fotos         JSONB   DEFAULT '[]';        -- varias fotos por registro

-- 2) Órdenes de producción: marca de tiempo del envío (ventana de edición de 1 día hábil)
ALTER TABLE production_orders
  ADD COLUMN IF NOT EXISTS fecha_envio TIMESTAMPTZ;

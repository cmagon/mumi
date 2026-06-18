-- ============================================================
-- MUMI AMAZONIA — Migration v17 (idempotente)
-- Estado del día en asistencia (para descuentos por inasistencia)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS estado_dia text NOT NULL DEFAULT 'asistio';
-- valores esperados: 'asistio' | 'justificada' | 'injustificada'

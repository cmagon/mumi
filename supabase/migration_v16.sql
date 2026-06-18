-- ============================================================
-- MUMI AMAZONIA — Migration v16 (idempotente)
-- Rango de fechas en los registros de liquidación de nómina
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS fecha_desde date;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS fecha_hasta date;

CREATE INDEX IF NOT EXISTS idx_payroll_records_emp_rango
  ON payroll_records (emp_id, fecha_desde, fecha_hasta);

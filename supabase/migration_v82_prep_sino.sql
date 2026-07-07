-- v82 — Guardar "tal cual" las respuestas SI/NO del diligenciamiento (borrador), para que al
-- reabrir el modal queden exactamente como el usuario las dejó (conforme, surtido, sobrante).
-- Ejecutar manualmente en el SQL Editor de Supabase.
alter table production_orders add column if not exists prep_sino jsonb;

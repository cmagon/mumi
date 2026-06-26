-- v75: modo de diligenciamiento de tiempos. false = básico (solo hora inicio/fin),
-- true = avanzado (todos los procesos con fecha/hora inicio/fin).
alter table production_orders add column if not exists modo_avanzado boolean not null default false;

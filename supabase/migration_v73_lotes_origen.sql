-- v73: columna lotes_origen en production_records (lotes combinados del rotulado surtido).
alter table production_records add column if not exists lotes_origen text;

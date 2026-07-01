-- v80: ficha de MATERIA PRIMA VENDIBLE. La ficha creada desde una MP vendible se marca como tipo='mp'
-- y se vincula a la materia prima (raw_materials) para reflejar su stock.
alter table products_costing add column if not exists mp_id integer;

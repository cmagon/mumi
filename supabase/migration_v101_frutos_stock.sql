-- v101 — Frutos configurables (el admin puede crear más) + umbrales de stock relativo.

-- 1) Tabla de frutos del catálogo (antes estaban hardcodeados)
create table if not exists frutos_catalogo (
  id          text primary key,               -- slug: 'asai', 'moriche', ...
  nombre      text not null,
  cientifico  text,
  emoji       text default '🌿',
  color       text default '#2d5a3d',
  descripcion text,
  beneficios  text[] default '{}',
  aliases     text[] default '{}',            -- palabras para autodetectar por nombre (sin tildes)
  orden       integer default 0
);
alter table frutos_catalogo enable row level security;
drop policy if exists frutos_read on frutos_catalogo;
create policy frutos_read on frutos_catalogo for select to anon using (true);
drop policy if exists frutos_read_auth on frutos_catalogo;
create policy frutos_read_auth on frutos_catalogo for select to authenticated using (true);
drop policy if exists frutos_admin on frutos_catalogo;
create policy frutos_admin on frutos_catalogo for all to authenticated using (true) with check (true);

-- Seed de los 5 frutos base (idempotente)
insert into frutos_catalogo (id, nombre, cientifico, emoji, color, descripcion, beneficios, aliases, orden) values
  ('asai',    'Açaí',    'Euterpe Oleracea',       '🫐', '#4a1a6b', 'Palmera nativa amazónica; frutos morados ricos en antioxidantes.', '{"Alto en antioxidantes","Antiinflamatorio","Vitaminas y minerales"}', '{asai,acai}', 1),
  ('araza',   'Arazá',   'Eugenia Stipitata',      '🟡', '#c8a900', 'La guayaba amazónica, pulpa jugosa ácido-dulce.', '{"Alto en vitamina C","Fortalece el sistema inmune","Antioxidantes"}', '{araza}', 2),
  ('copoazu', 'Copoazú', 'Theobroma Grandiflorum', '🟤', '#6b3a1a', 'El cacao blanco amazónico, pulpa ácida y aromática.', '{"Omega-9 y Omega-3","Antioxidantes","Fuente de fibra"}', '{copoazu}', 3),
  ('seje',    'Seje',    'Oenocarpus Bataua',      '🌴', '#1a5c1a', 'Palmera sagrada amazónica (patabá/milpeso).', '{"Ácidos grasos insaturados","Vitaminas A y E","Antioxidantes"}', '{seje}', 4),
  ('cocona',  'Cocona',  'Solanum Sessiliflorum',  '🔴', '#8b1a1a', 'El lulo amazónico, sabor ácido e intenso.', '{"Alto en vitamina C","Regula el colesterol","Favorece la digestión"}', '{cocona}', 5)
on conflict (id) do nothing;

-- 2) Umbrales de stock relativo (para mostrar urgencia sin revelar la cantidad exacta)
alter table config_catalogo add column if not exists mostrar_stock  boolean default true;
alter table config_catalogo add column if not exists umbral_pocas   integer default 10;   -- "quedan pocas"
alter table config_catalogo add column if not exists umbral_ultimas integer default 3;    -- "¡últimas!"

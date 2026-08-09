-- v145 — Paletas de color guardadas por el usuario (además de las 6 predefinidas)
alter table config_catalogo
  add column if not exists paletas_guardadas jsonb default '[]'::jsonb;

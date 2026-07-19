-- v121 — Categorías creadas por el usuario (para productos/combos adicionales).
alter table config_catalogo add column if not exists categorias_extra jsonb default '[]'::jsonb;

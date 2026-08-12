-- Degradado vertical de banners (móvil): alcance 0–100
alter table banners_catalogo
  add column if not exists overlay_fade numeric;

comment on column banners_catalogo.overlay_fade is
  'Alcance de la capa de opacidad en vertical (móvil): 0=corta/corte, 100=larga/suave. Independiente de overlay_opacidad (intensidad).';

update banners_catalogo
set overlay_fade = 48
where overlay_fade is null;

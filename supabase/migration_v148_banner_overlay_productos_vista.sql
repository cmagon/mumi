-- v148 — Overlay de texto en banners (color + opacidad) + vista de productos (clásico)
alter table banners_catalogo
  add column if not exists color_overlay text,
  add column if not exists overlay_opacidad numeric,
  add column if not exists color_texto text,
  add column if not exists color_boton text,
  add column if not exists color_fondo text;

-- Si ya había color_fondo (v147), úsalo como capa del texto
update banners_catalogo
set color_overlay = color_fondo
where color_overlay is null
  and color_fondo is not null
  and trim(color_fondo) <> '';

alter table config_catalogo
  add column if not exists productos_vista text default 'scroll';

comment on column config_catalogo.productos_vista is 'scroll = fila horizontal; grid = cuadrícula sin scroll (plantilla clásica)';
comment on column banners_catalogo.color_overlay is 'Color de la capa/fondito detrás del texto del banner';
comment on column banners_catalogo.overlay_opacidad is 'Opacidad 0–100 de la capa de texto';

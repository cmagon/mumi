-- v124 — Plantilla de mensaje de WhatsApp para el pedido MAYORISTA.
-- Las demás plantillas reutilizan columnas existentes:
--   wa_texto_stock      → pedido al detal
--   wa_texto_sin_stock  → consulta de disponibilidad (sin stock)
--   mayorista_wa_texto  → solicitud para ser mayorista
alter table config_catalogo add column if not exists wa_texto_mayorista text;

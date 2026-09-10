-- v170 — Seguridad de formularios públicos con Cloudflare Turnstile (captcha).
-- La site key es pública (va en el navegador); se guarda en config_catalogo para que el
-- admin la configure sin tocar código. La secret key vive solo como secreto de la Edge
-- Function `catalogo-form`, que verifica el token del lado servidor antes de escribir.
-- Si la site key está vacía, los formularios siguen funcionando sin captcha (degradación).

alter table config_catalogo
  add column if not exists turnstile_site_key text;

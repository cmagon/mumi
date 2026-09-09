-- v165 — Corrige el CHECK de formato de correo de suscriptores_catalogo.
-- El patrón original usaba '\\.' que, con standard_conforming_strings on, exige un
-- backslash literal en vez de un punto → rechazaba correos válidos ("suscriptores_email_format").
-- Se reemplaza el punto por la clase [.] (punto literal, sin ambigüedad de escapes).

alter table suscriptores_catalogo drop constraint if exists suscriptores_email_format;
alter table suscriptores_catalogo
  add constraint suscriptores_email_format check (
    char_length(email) between 3 and 254
    and email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  );

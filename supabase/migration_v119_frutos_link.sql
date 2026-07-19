-- v119 — Enlace por fruto (para el mosaico "Mis frutos", cada fruto puede apuntar a un link).
alter table frutos_catalogo add column if not exists link text;

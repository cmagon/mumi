-- v174 — Etiquetas/categorías MANUALES por cliente (CRM). Complementan las automáticas
-- (suscrito, compró, favoritos…): el admin puede agregar/quitar categorías a mano
-- (VIP, mayorista potencial, revisar, no comprar, etc.). Se guardan por correo.

create table if not exists catalogo_crm_etiquetas (
  email      text primary key,
  etiquetas  text[] not null default '{}',
  updated_at timestamptz default now()
);

alter table catalogo_crm_etiquetas enable row level security;

drop policy if exists crm_etiquetas_admin on catalogo_crm_etiquetas;
create policy crm_etiquetas_admin on catalogo_crm_etiquetas for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

grant select, insert, update, delete on catalogo_crm_etiquetas to authenticated;

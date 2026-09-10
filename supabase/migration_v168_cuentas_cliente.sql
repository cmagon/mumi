-- v168 — Cuentas de cliente del catálogo (login sin contraseña vía Supabase Auth OTP).
--
-- Los clientes inician sesión con un código enviado a su correo (signInWithOtp). Al
-- autenticarse obtienen el rol `authenticated`, así que ANTES de exponer datos hay que
-- garantizar que ese rol NO da acceso a información del negocio:
--   · Las políticas de config/visitas/pedidos/suscriptores/mensajes ya exigen
--     is_catalog_admin() (v107) → un cliente autenticado NO las pasa. ✔
--   · favoritos_catalogo y carritos_catalogo aún tenían `using (true)` → se endurecen aquí.
-- Los clientes leen/escriben SOLO lo suyo mediante RPCs security-definer (favoritos,
-- carritos) y una política propia para su perfil e historial de pedidos.

-- 1) Endurecer favoritos y carritos: solo el admin ve/gestiona directamente la tabla.
--    (El público y los clientes operan por las RPCs security-definer existentes.)
drop policy if exists favoritos_admin on favoritos_catalogo;
create policy favoritos_admin on favoritos_catalogo for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

drop policy if exists carritos_admin on carritos_catalogo;
create policy carritos_admin on carritos_catalogo for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

-- 2) Perfil del cliente (1 fila por usuario de Auth).
create table if not exists clientes_catalogo (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  nombre_completo     text,
  telefono            text,
  -- Envío
  departamento        text,
  ciudad              text,
  barrio              text,
  direccion           text,
  referencia          text,
  -- Facturación electrónica
  factura_electronica boolean default false,
  doc_tipo            text,     -- 'CC' | 'NIT'
  doc_numero          text,
  email_factura       text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

alter table clientes_catalogo enable row level security;

-- El cliente gestiona SOLO su propia fila.
drop policy if exists clientes_self on clientes_catalogo;
create policy clientes_self on clientes_catalogo for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- El admin del catálogo puede leerlas (para el CRM).
drop policy if exists clientes_admin on clientes_catalogo;
create policy clientes_admin on clientes_catalogo for select to authenticated
  using (public.is_catalog_admin());

grant select, insert, update, delete on clientes_catalogo to authenticated;

-- 3) Historial de pedidos del propio cliente: puede leer las filas cuyo correo coincide
--    con el correo verificado de su sesión (JWT). No expone pedidos de otros clientes.
drop policy if exists pedidos_cliente_propios on pedidos_catalogo;
create policy pedidos_cliente_propios on pedidos_catalogo for select to authenticated
  using (
    email is not null
    and auth.jwt() ->> 'email' is not null
    and lower(email) = lower(auth.jwt() ->> 'email')
  );

-- 4) Favoritos del propio cliente por su correo verificado (lectura directa opcional;
--    las escrituras siguen por RPC). Facilita la vista de favoritos ligada a la cuenta.
drop policy if exists favoritos_cliente_propios on favoritos_catalogo;
create policy favoritos_cliente_propios on favoritos_catalogo for select to authenticated
  using (
    email is not null
    and auth.jwt() ->> 'email' is not null
    and lower(email) = lower(auth.jwt() ->> 'email')
  );

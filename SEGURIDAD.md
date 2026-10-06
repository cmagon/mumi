# Seguridad — modelo y reglas

## Regla de oro: `authenticated` ≠ personal

Un JWT con rol `authenticated` **no** significa "empleado de Mumi":

- El alta de usuarios usa `signUp` con la **anon key**, que es pública. Con el registro por
  email habilitado, cualquiera obtiene un JWT `authenticated`.
- Los invitados externos de Gestión Documental entran por OTP y **no tienen perfil**.

Por eso, en toda política RLS, Storage y Edge Function interna:

| Quién | Cómo se exige |
|---|---|
| Personal (cualquier rol activo) | `public.is_staff()` (RLS) · `requireUser()` (Edge Functions) |
| Administrador | `public.is_admin()` · `requireAdmin()` |
| Con permiso de módulo | `public.has_modulo('<modulo>')` |

**Nunca** escribas `for ... to authenticated using (true)` en una tabla interna.
Las tablas públicas por diseño (catálogo) usan `to anon` con `select`/`insert` acotados.

Migración de referencia: `supabase/migration_v182_seguridad_staff_rls.sql`
(incluye una consulta de verificación al final que debe devolver 0 filas).

## Qué se permite a invitados externos (OTP, sin perfil)

- Leer **solo sus** comparticiones (`document_shares_guest_read`, por email del JWT).
- Leer/editar los documentos de su carpeta compartida (políticas `documentos_*_invitado`).
- Subir archivos **nuevos** al bucket `documentos` (no sobrescribir ni borrar).
- Guardar el orden de carpetas (`app_settings`, fila `id = 2`).

El público anónimo ve una compartición **solo por token** (`get_share(uuid)`); no puede listarlas.

## Secretos

- Ningún secreto en el repositorio. La anon/publishable key de Supabase es pública por diseño.
- Credenciales de Alegra, Resend, Turnstile y webhooks: `supabase secrets set ...`.
- `setup.js` ya no trae contraseñas: usa `SETUP_ADMIN_PASSWORD` o genera una aleatoria.

## Cabeceras HTTP

`public/_headers` (Cloudflare Workers Assets), `vercel.json` y `catalogo/worker.js` aplican
`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS y una CSP mínima.
La CSP **completa** está en `Content-Security-Policy-Report-Only`: revisa la consola del
navegador y, cuando no haya avisos, cambia el nombre de la cabecera a `Content-Security-Policy`.

## Riesgos conocidos (aceptados / pendientes)

- **`xlsx` (SheetJS 0.18.5)**: prototype pollution y ReDoS al *leer* archivos; no hay parche en
  npm (el oficial está en `cdn.sheetjs.com`). Solo el personal importa archivos; no abras
  planillas de origen desconocido. Pendiente: migrar al paquete oficial 0.20.x.
- **`react-router` 6**: avisos moderados (redirección abierta con `\` en `<Link>`/`navigate`,
  hidratación SSR). La app no usa SSR ni navega a URLs de terceros. Requiere saltar a v7.
- **Alta de usuarios en el cliente (`signUp`)**: mientras exista, el registro público debe seguir
  habilitado. Mejora recomendada: crear usuarios desde una Edge Function con la service key y
  desactivar el registro público en Supabase → Authentication.
- **Inserciones anónimas del catálogo** (`mensajes`, `suscriptores`, `pedidos`, `visitas`): tienen
  restricciones de formato (v107); solo `password_requests` y `share_solicitudes` tienen límite de
  frecuencia (v49). La vía con captcha (Turnstile, función `catalogo-form`) es la única que valida bots.
- **Historial de git**: las credenciales que tenían `check_v6.mjs`/`diag.mjs` (eliminados) siguen en
  commits antiguos. Rotar esa contraseña es obligatorio si no se cambió.

// Instrucciones que viajan DENTRO del ZIP de respaldo (LEEME.md)
export function generarLeeme({ origenUrl = '', generado = '', tablas = {}, excluidas = [], advertencias = [] } = {}) {
  const nTablas = Object.keys(tablas).length
  const nFilas = Object.values(tablas).reduce((s, n) => s + (Number(n) || 0), 0)
  return `# Respaldo de la base de datos — Mumi

Generado: ${generado}
Proyecto de origen: ${origenUrl}
Contenido: ${nTablas} tablas, ${nFilas.toLocaleString('es-CO')} filas.
${excluidas.length ? `Tablas NO incluidas: ${excluidas.join(', ')}.\n` : ''}${advertencias.length ? `\n## ⚠ Advertencias del respaldo\n${advertencias.map(a => `- ${a}`).join('\n')}\n` : ''}
> **Este archivo contiene datos sensibles** (clientes, nómina, costos…). Guárdalo en un lugar privado y bórralo
> cuando termines la migración. No lo envíes por canales abiertos.

## Qué trae este ZIP
- \`esquema/\` — la estructura completa de la base (tablas, llaves, índices, funciones, triggers, seguridad RLS, permisos y buckets de Storage), generada de la base VIVA. \`esquema_completo.sql\` es lo mismo en un solo archivo.
- \`datos/\` — una tabla por archivo (.json).
- \`manifest.json\` — resumen y conteos por tabla (sirve para verificar la importación).
- \`catalogo.json\` — descripción técnica de la estructura (referencia).
- Los archivos de **Storage** (imágenes, documentos) se exportan aparte desde la misma pantalla, por bucket.

## Pasos para pasar todo a otro proyecto de Supabase (otra cuenta / otro usuario)

### 1. Crear el proyecto nuevo
En supabase.com crea el proyecto. Anota la **URL** y la **anon/publishable key** (Project Settings → API).

### 2. Crear la estructura
En el proyecto NUEVO abre **SQL Editor** y ejecuta, en este orden, los archivos de \`esquema/\`:
\`01_…\`, \`02_…\`, \`03_…\`, \`04_…\`, \`05_…\`, \`06_…\` (o solo \`esquema_completo.sql\` si el editor lo admite).
Son repetibles: si algo falla, corrígelo y vuelve a ejecutar. Si una extensión no se pudo habilitar,
actívala en Database → Extensions y repite la parte 01.

### 3. Conectar la aplicación al proyecto nuevo
Publica la app (o una copia) con las variables:
\`VITE_SUPABASE_URL\` = URL del proyecto nuevo · \`VITE_SUPABASE_ANON_KEY\` = su anon/publishable key.

### 4. Crear el usuario administrador del proyecto nuevo
1. En Supabase → **Authentication → Users → Add user**: correo \`TULOGIN@mumi.internal\` (el sistema inicia sesión con *usuario*; el correo es siempre \`usuario@mumi.internal\`) y una contraseña. Marca «Auto confirm user».
2. Copia el **UID** del usuario creado y ejecuta en el SQL Editor:

\`\`\`sql
insert into public.user_profiles (id, nombre, login, rol, estado)
values ('PEGA-AQUI-EL-UID', 'Administrador', 'TULOGIN', 'admin', 'activo');
\`\`\`

(Los usuarios del proyecto viejo no se copian: sus contraseñas no se pueden exportar. Créalos de nuevo desde la app, en Usuarios.)

### 5. Importar los datos
Entra a la app del proyecto nuevo con ese administrador → **Configuración → Respaldo y migración → Importar**
y elige este ZIP. Deja «No traer perfiles de usuario» marcado (recomendado). Al terminar compara los conteos con \`manifest.json\`.
Después importa los ZIP de archivos de Storage (uno por bucket), si los exportaste.

### 6. Pendientes que NO viajan en el respaldo (se configuran a mano)
- **Edge Functions**: despliega las de \`supabase/functions/\` del repositorio en el proyecto nuevo.
- **Secretos**: \`ALEGRA_EMAIL\`, \`ALEGRA_TOKEN\`, \`ALEGRA_WEBHOOK_SECRET\`, \`RESEND_API_KEY\`, \`CORREO_FROM\`, \`TURNSTILE_SECRET_KEY\` (Edge Functions → Secrets). El token de Alegra de la tabla \`alegra_config\` se exporta VACÍO a propósito.
- **Tareas programadas (cron)**: extensiones pg_cron/pg_net y las migraciones \`migration_v133\`, \`v160\`, \`v178\` (necesitan la service key en el Vault).
- **Autenticación**: en Authentication → Providers/Settings deja habilitado el registro por correo mientras la app cree usuarios con signUp; ajusta la plantilla de correo (\`supabase/email_template_otp.html\`).
- **Webhook de Alegra**: apunta al nuevo \`https://<proyecto>.supabase.co/functions/v1/alegra-webhook?secret=…\`.
- **Dominio y CORS**: si usas dominio propio, agrégalo en Authentication → URL Configuration.

### 7. Verificar
Compara \`manifest.json\` (conteos de origen) con los de la importación, abre unas órdenes, productos y clientes,
y prueba descargar una orden en PDF.
`
}

// Credenciales de Alegra para las Edge Functions.
//
// Precedencia: PRIMERO los secretos del proyecto, DESPUÉS la tabla alegra_config.
// Al revés (como estaba) un token guardado en la tabla ganaba siempre, así que
// configurar el secreto no servía de nada y el token seguía viviendo en la base
// en texto plano. Con este orden se puede migrar sin tocar la app:
//
//   supabase secrets set ALEGRA_EMAIL=... ALEGRA_TOKEN=...
//   update alegra_config set token = null where id = 1;   -- opcional, ya no se usa
//
// La tabla se mantiene como respaldo para no romper instalaciones que aún no
// tengan los secretos puestos.
//
// La columna token no es legible desde el navegador (ver migración v134): solo la
// service key que usan estas funciones puede leerla.

export type AlegraCreds = {
  email: string
  token: string
  /** Cabecera lista para usar con la API de Alegra. Vacía si faltan credenciales. */
  authHeader: string
  /** Fila completa de alegra_config, para las columnas extra que pida cada función. */
  cfg: Record<string, unknown>
}

/**
 * @param extra Columnas adicionales de alegra_config que necesita la función
 *              (p. ej. ['price_list_mayor', 'price_list_detal'] o ['sync_desde']).
 */
export async function getAlegraCreds(supabase: any, extra: string[] = []): Promise<AlegraCreds> {
  const cols = ['email', 'token', ...extra].join(', ')
  const { data } = await supabase.from('alegra_config').select(cols).eq('id', 1).maybeSingle()
  const email = (Deno.env.get('ALEGRA_EMAIL') || (data as any)?.email || '').trim()
  const token = (Deno.env.get('ALEGRA_TOKEN') || (data as any)?.token || '').trim()
  return {
    email,
    token,
    authHeader: email && token ? 'Basic ' + btoa(`${email}:${token}`) : '',
    cfg: (data as Record<string, unknown>) || {},
  }
}

// Supabase Edge Function: genera TÍTULO SEO y DESCRIPCIÓN SEO de un producto con IA.
// Experta en SEO y marketing para e-commerce. Se orienta por el nombre + la descripción
// corta + las características del producto.
//
// Soporta dos proveedores (usa el que tengas configurado; Gemini tiene capa GRATIS):
//   · Google Gemini  → secreto GEMINI_API_KEY   (modelo por defecto: gemini-2.5-flash)
//   · OpenAI         → secreto OPENAI_API_KEY    (modelo por defecto: gpt-4o-mini)
// Si ambos están, se usa Gemini. Puedes forzar modelo con GEMINI_MODEL / OPENAI_MODEL.
//
// Publicar SIN CLI (navegador): Dashboard → Edge Functions → catalogo-resumen → Edit →
// pega este archivo → Deploy. "Verify JWT" debe estar OFF (la función valida por dentro).
//
// Devuelve: { "titulo": string, "descripcion": string }
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const err = (msg: string, status: number) => json({ error: msg }, status)

const MAX_TEXTO = 6000
const MAX_TITULO = 60
const MAX_DESC = 155

const sinHtml = (s: string) =>
  (s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()

const SISTEMA =
  'Eres un experto en SEO y copywriting para e-commerce de una marca de productos ' +
  'naturales amazónicos. A partir del nombre, la descripción corta y las características ' +
  'del producto, redacta metadatos SEO en español (Colombia) optimizados para Google y ' +
  'para compartir en redes. Reglas:\n' +
  `- Título SEO: máximo ${MAX_TITULO} caracteres. Empieza por lo más relevante, incluye el ` +
  'nombre del producto y 1 palabra clave natural. Atractivo, sin relleno ni comillas.\n' +
  `- Descripción SEO (meta description): máximo ${MAX_DESC} caracteres. Incluye un beneficio ` +
  'clave y una invitación sutil a la acción. Palabras clave naturales, sin repetir el título, ' +
  'sin comillas.\n' +
  '- No inventes datos que no estén en la información dada.\n' +
  'Responde ÚNICAMENTE con un objeto JSON válido, sin texto extra ni ```: ' +
  '{"titulo": "...", "descripcion": "..."}'

// Extrae {titulo, descripcion} de la respuesta del modelo (tolerante a texto alrededor)
function parseSEO(txt: string): { titulo: string; descripcion: string } | null {
  if (!txt) return null
  let s = txt.trim().replace(/^```(?:json)?/i, '').replace(/```$/,'').trim()
  const m = s.match(/\{[\s\S]*\}/)
  if (m) s = m[0]
  try {
    const o = JSON.parse(s)
    const titulo = String(o.titulo || o.title || '').trim().slice(0, MAX_TITULO)
    const descripcion = String(o.descripcion || o.description || '').trim().slice(0, MAX_DESC)
    if (titulo || descripcion) return { titulo, descripcion }
  } catch { /* noop */ }
  return null
}

async function generarGemini(apiKey: string, prompt: string): Promise<string> {
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const r = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 400, temperature: 0.6, responseMimeType: 'application/json' },
    }),
  })
  if (!r.ok) throw new Error(`Gemini (${r.status}): ${(await r.text().catch(() => '')).slice(0, 300)}`)
  const data = await r.json()
  const parts = data?.candidates?.[0]?.content?.parts || []
  return parts.map((p: { text?: string }) => p?.text || '').join(' ').trim()
}

async function generarOpenAI(apiKey: string, prompt: string): Promise<string> {
  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 400, temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: prompt }],
    }),
  })
  if (!r.ok) throw new Error(`OpenAI (${r.status}): ${(await r.text().catch(() => '')).slice(0, 300)}`)
  const data = await r.json()
  return String(data?.choices?.[0]?.message?.content || '').trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return err('No autenticado', 401)

    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!geminiKey && !openaiKey) return err('Configura GEMINI_API_KEY (gratis) u OPENAI_API_KEY en los secretos de Supabase', 500)

    const body = await req.json().catch(() => ({}))
    const nombre = String(body?.nombre || '').slice(0, 200).trim()
    const corta = sinHtml(String(body?.corta || '')).slice(0, MAX_TEXTO)
    const caracteristicas = sinHtml(String(body?.caracteristicas || '')).slice(0, MAX_TEXTO)
    if (!nombre && corta.length < 10 && caracteristicas.length < 10) {
      return err('Faltan datos: escribe el nombre y la descripción del producto', 400)
    }
    const prompt =
      `Nombre del producto: ${nombre || '(sin nombre)'}\n\n` +
      `Descripción corta: ${corta || '(vacía)'}\n\n` +
      `Características: ${caracteristicas || '(vacías)'}\n\n` +
      'Genera el JSON con "titulo" y "descripcion" SEO.'

    const raw = geminiKey ? await generarGemini(geminiKey, prompt) : await generarOpenAI(openaiKey!, prompt)
    const seo = parseSEO(raw)
    if (!seo) return err('No se pudo generar el SEO (respuesta no válida del modelo)', 502)
    return json(seo)
  } catch (e) {
    return err((e as Error)?.message || 'Error inesperado', 502)
  }
})

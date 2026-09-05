// Supabase Edge Function: genera un resumen corto de la descripción de un producto con IA.
// Soporta dos proveedores; usa el que tengas configurado (Gemini tiene capa GRATIS):
//   · Google Gemini  → secreto GEMINI_API_KEY   (modelo por defecto: gemini-1.5-flash)
//   · OpenAI         → secreto OPENAI_API_KEY    (modelo por defecto: gpt-4o-mini)
// Si ambos están, se usa Gemini. Puedes forzar modelo con GEMINI_MODEL / OPENAI_MODEL.
//
// Publicar SIN CLI (desde el navegador):
//   1. Dashboard → Edge Functions → "Deploy a new function" → Via editor.
//      Nombre EXACTO: catalogo-resumen. Pega este archivo y publica.
//   2. Edge Functions → Secrets: agrega GEMINI_API_KEY (recomendado, gratis) u OPENAI_API_KEY.
//      Consigue la de Gemini gratis en https://aistudio.google.com/apikey
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

const MAX_TEXTO = 8000
const MAX_RESUMEN_CHARS = 200

const sinHtml = (s: string) =>
  (s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()

const SISTEMA =
  'Eres redactor de e-commerce para una marca de productos amazónicos. ' +
  'Escribe un resumen breve y atractivo de la descripción del producto, en español, ' +
  'en 1 o 2 frases (máximo ~160 caracteres). Tono cálido y natural. ' +
  'No inventes datos que no estén en el texto. Devuelve solo el resumen, sin comillas ni prefijos.'

// --- Google Gemini (capa gratuita) ---
async function resumirGemini(apiKey: string, prompt: string): Promise<string> {
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-1.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.5 },
    }),
  })
  if (!r.ok) throw new Error(`Gemini (${r.status}): ${(await r.text().catch(() => '')).slice(0, 300)}`)
  const data = await r.json()
  const parts = data?.candidates?.[0]?.content?.parts || []
  return parts.map((p: { text?: string }) => p?.text || '').join(' ').trim()
}

// --- OpenAI ---
async function resumirOpenAI(apiKey: string, prompt: string): Promise<string> {
  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 300, temperature: 0.5,
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
    if (!geminiKey && !openaiKey) {
      return err('Configura GEMINI_API_KEY (gratis) u OPENAI_API_KEY en los secretos de Supabase', 500)
    }

    const body = await req.json().catch(() => ({}))
    const texto = sinHtml(String(body?.texto || '')).slice(0, MAX_TEXTO)
    if (texto.length < 20) return err('El texto es muy corto para resumir', 400)
    const nombre = String(body?.nombre || '').slice(0, 160)
    const prompt = `Producto: ${nombre || '(sin nombre)'}\n\nDescripción:\n${texto}\n\nResumen:`

    // Gemini primero (gratis); OpenAI como alternativa
    const resumen = (geminiKey
      ? await resumirGemini(geminiKey, prompt)
      : await resumirOpenAI(openaiKey!, prompt)).slice(0, MAX_RESUMEN_CHARS)

    if (!resumen) return err('No se pudo generar el resumen', 502)
    return json({ resumen })
  } catch (e) {
    return err((e as Error)?.message || 'Error inesperado', 502)
  }
})

// Supabase Edge Function: genera un resumen corto de la descripción de un producto con OpenAI.
//
// Cómo publicarla y configurarla SIN CLI (todo desde el navegador):
//   1. Dashboard de Supabase → Edge Functions → "Deploy a new function" (o "Create function").
//      Nombre EXACTO: catalogo-resumen. Pega este archivo como index.ts y publica.
//   2. Edge Functions → Secrets (o Project Settings → Edge Functions → Secrets):
//        OPENAI_API_KEY = sk-...           (tu clave de OpenAI)
//        OPENAI_MODEL   = gpt-4o-mini      (opcional; es el más barato/rápido)
//
// Solo lo usa el panel de administración (un editor pulsa "Generar resumen"), así que
// exige sesión autenticada y limita el tamaño del texto para acotar el costo por llamada.
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

// Modelo de OpenAI. gpt-4o-mini es el más económico y de sobra para resúmenes.
const MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'
const MAX_TEXTO = 8000        // caracteres de entrada (de sobra para una descripción)
const MAX_RESUMEN_CHARS = 200

const sinHtml = (s: string) =>
  (s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    // Exigir sesión válida: la generación cuesta dinero, no debe quedar abierta.
    const authHeader = req.headers.get('Authorization') || ''
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return err('No autenticado', 401)

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) return err('Falta configurar OPENAI_API_KEY en los secretos de Supabase', 500)

    const body = await req.json().catch(() => ({}))
    const texto = sinHtml(String(body?.texto || '')).slice(0, MAX_TEXTO)
    if (texto.length < 20) return err('El texto es muy corto para resumir', 400)

    const nombre = String(body?.nombre || '').slice(0, 160)

    const sistema =
      'Eres redactor de e-commerce para una marca de productos amazónicos. ' +
      'Escribe un resumen breve y atractivo de la descripción del producto, en español, ' +
      'en 1 o 2 frases (máximo ~160 caracteres). Tono cálido y natural. ' +
      'No inventes datos que no estén en el texto. Devuelve solo el resumen, sin comillas ni prefijos.'

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        temperature: 0.5,
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: `Producto: ${nombre || '(sin nombre)'}\n\nDescripción:\n${texto}\n\nResumen:` },
        ],
      }),
    })

    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      return err(`Error del generador (${r.status}): ${detail.slice(0, 300)}`, 502)
    }
    const data = await r.json()
    const resumen = String(data?.choices?.[0]?.message?.content || '').trim().slice(0, MAX_RESUMEN_CHARS)

    if (!resumen) return err('No se pudo generar el resumen', 502)
    return json({ resumen })
  } catch (e) {
    return err((e as Error)?.message || 'Error inesperado', 500)
  }
})

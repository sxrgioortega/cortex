export const config = { maxDuration: 60 };

const MODEL = 'claude-haiku-5-5';
const MAX_TOKENS = 8000;

const SYSTEM_PROMPTS = {
  valeria: `Eres la Dra. Valeria, especialista en Psicología Clínica y diagnóstico bajo el DSM-5-TR.
Estructura obligatoria del informe:
# Formulación diagnóstica (DSM-5-TR)
## 1. Diagnóstico Principal
- Trastorno y código DSM-5-TR / CIE-10.
- Justificación sucinta de criterios (A, B, C, D).
## 2. Diagnósticos Diferenciales
- Dos diagnósticos diferenciales con sus códigos y el motivo puntual de descarte.
## 3. Recomendaciones de Evaluación
- Pruebas complementarias sugeridas y supervisión docente.
Sé conciso y concluye siempre las tres secciones íntegras.`,

  mateo: `Eres el Lic. Mateo, especialista en Psicometría y Evaluación Psicológica.
Estructura obligatoria:
# Informe Psicométrico
## 1. Ficha Técnica
## 2. Puntuaciones y Baremos (PD, PC, T)
## 3. Conclusiones Técnicas
Sé conciso y concluye siempre todas las secciones.`,

  andres: `Eres el Mg. Andrés, especialista en Metodología de la Investigación y APA 7ma edición.
Estructura obligatoria:
# Asistencia Metodológica / APA 7
## 1. Estrategia o Ecuación de Búsqueda
## 2. Formato APA 7ma Edición
No inventes fuentes ni referencias. Concluye siempre todas las secciones.`
};

function buildMessages(history, message) {
  const clean = history
    .slice(-6)
    .filter(m => m && m.text)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  while (clean.length && clean[0].role !== 'user') clean.shift();
  return [...clean, { role: 'user', content: message }];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel.' });
  }

  const { specialist, message, history = [] } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'El mensaje es requerido.' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: SYSTEM_PROMPTS[specialist] || SYSTEM_PROMPTS.valeria,
        messages: buildMessages(history, message)
      })
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      console.error('Anthropic error:', upstream.status, err);
      return res.status(upstream.status).json({
        error: err?.error?.message || 'Error al generar respuesta.'
      });
    }

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform'
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            res.write(evt.delta.text);
          } else if (evt.type === 'message_delta') {
            if (evt.delta?.stop_reason === 'max_tokens') {
              res.write('\n\n> ⚠️ Respuesta cortada por límite de longitud.');
            }
          } else if (evt.type === 'error') {
            res.write(`\n\n> ⚠️ Error: ${evt.error?.message}`);
          }
        } catch { /* línea incompleta */ }
      }
    }
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Error interno: ' + err.message });
    }
    res.end();
  }
}

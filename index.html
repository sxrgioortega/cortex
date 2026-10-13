export const config = { maxDuration: 60 };

const MODEL = 'claude-haiku-5-5';

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
Concluye siempre todas las secciones completas.`,

  mateo: `Eres el Lic. Mateo, especialista en Psicometría y Evaluación Psicológica.
Estructura obligatoria:
# Informe Psicométrico
## 1. Ficha Técnica
## 2. Puntuaciones y Baremos (PD, PC, T)
## 3. Conclusiones Técnicas
Concluye siempre todas las secciones completas.`,

  andres: `Eres el Mg. Andrés, especialista en Metodología de la Investigación y APA 7ma edición.
Estructura obligatoria:
# Asistencia Metodológica / APA 7
## 1. Estrategia o Ecuación de Búsqueda
## 2. Formato APA 7ma Edición
No inventes fuentes ni referencias. Concluye siempre todas las secciones completas.`
};

function buildMessages(history, message) {
  const clean = (history || [])
    .slice(-6)
    .filter(m => m && (m.text || m.content))
    .map(m => ({ 
      role: m.role === 'user' ? 'user' : 'assistant', 
      content: m.text || m.content 
    }));
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
        max_tokens: 3500,
        system: SYSTEM_PROMPTS[specialist] || SYSTEM_PROMPTS.valeria,
        messages: buildMessages(history, message)
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || 'Error en la API de Anthropic.'
      });
    }

    const textBlock = (data.content || []).find(b => b.type === 'text');
    const reply = textBlock ? textBlock.text : '';

    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message });
  }
}

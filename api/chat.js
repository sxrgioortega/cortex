export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel.' });
  }

  const { specialist, message, history = [] } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'El mensaje es requerido.' });
  }

  const SYSTEM_PROMPTS = {
    valeria: `Eres la Dra. Valeria, especialista en Psicología Clínica y diagnóstico bajo el DSM-5-TR.
Tu tarea es emitir formulaciones diagnósticas completas, estructuradas y precisas.

Estructura obligatoria del informe:
# Formulación diagnóstica (DSM-5-TR)
## 1. Diagnóstico Principal
- Trastorno y código DSM-5-TR / CIE-10.
- Justificación sucinta de criterios (A, B, C, D).
## 2. Diagnósticos Diferenciales
- Dos diagnósticos diferenciales con sus códigos y el motivo puntual de descarte.
## 3. Recomendaciones de Evaluación
- Pruebas o escalas complementarias sugeridas y supervisión docente.

IMPORTANTE: Concluye siempre el reporte completo sin dejar ninguna sección a medias.`,

    mateo: `Eres el Lic. Mateo, especialista en Psicometría y Evaluación Psicológica.
Entrega informes psicométricos estructurados y completos:
# Informe Psicométrico
## 1. Ficha Técnica
## 2. Puntuaciones y Baremos (PD, PC, T)
## 3. Conclusiones Técnicas`,

    andres: `Eres el Mg. Andrés, especialista en Metodología de la Investigación y APA 7ma edición.
Entrega respuestas estructuradas, precisas y libres de citas inventadas:
# Asistencia Metodológica / APA 7
## 1. Estrategia o Ecuación de Búsqueda
## 2. Formato APA 7ma Edición`
  };

  const systemPrompt = SYSTEM_PROMPTS[specialist] || SYSTEM_PROMPTS.valeria;

  const formattedMessages = [
    ...history.slice(-4).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    })),
    { role: 'user', content: message }
  ];

  try {
    const modelsResponse = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    const modelsData = await modelsResponse.json();

    if (!modelsResponse.ok) {
      return res.status(modelsResponse.status).json({
        error: modelsData?.error?.message || 'Error al listar modelos.'
      });
    }

    const availableModels = (modelsData.data || []).map(m => m.id);

    // Priorizar modelos rápidos y directos
    const selectedModel = availableModels.find(m => m.includes('haiku')) ||
                          availableModels.find(m => m.includes('sonnet')) ||
                          availableModels[0];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 4000,
        thinking: { type: "disabled" },
        system: systemPrompt,
        messages: formattedMessages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // Si la API no soporta el parámetro thinking disabled en este modelo específico, reintentar sin él
      const fallbackRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: 4000,
          system: systemPrompt,
          messages: formattedMessages
        })
      });

      const fallbackData = await fallbackRes.json();
      if (!fallbackRes.ok) {
        return res.status(fallbackRes.status).json({
          error: fallbackData?.error?.message || 'Error al generar respuesta.'
        });
      }

      const textBlock = (fallbackData.content || []).find(b => b.type === 'text');
      return res.status(200).json({ reply: textBlock?.text || fallbackData.content?.[0]?.text || '' });
    }

    const textBlock = (data.content || []).find(b => b.type === 'text');
    const reply = textBlock ? textBlock.text : (data.content?.[0]?.text || '');

    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message });
  }
}

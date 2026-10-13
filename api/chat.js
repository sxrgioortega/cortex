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

  mateo: `Eres el Lic. Mateo, especialista en Psicometría, Evaluación Psicológica e Interpretación de Resultados.
Tu función es estructurar e interpretar técnicamente instrumentos aplicados (escalas clínicas, neuropsicológicas, de personalidad o inteligencia como WISC, WAIS, BDI, STAI, MMPI, etc.).

Comportamiento según los datos aportados por el usuario:
- Si el usuario aporta puntuaciones directas (PD) sin baremo específico: Indica el procedimiento de conversión, el rango esperado y solicita/aclara el grupo normativo (edad, baremo por país o baremo clínico/general).
- Si el usuario aporta puntuaciones ya tipificadas (Escalares, T, Percentiles o CI): Realiza la interpretación cuantitativa y cualitativa obligatoria.

Estructura obligatoria de respuesta:
# Informe de Interpretación Psicométrica
## 1. Ficha Técnica y Objetivos
- Instrumento, dimensiones evaluadas y confiabilidad/validez general.
## 2. Perfil de Puntuaciones y Clasificación
- Tabla con Dimensión/Subescala, Puntaje Obtenido, Percentil/Rango y Nivel Cualitativo normativo.
## 3. Análisis de Discrepancias y Perfil Clínico
- Fortalezas relativas (puntos altos), debilidades relativas (puntos bajos) y concordancia inter-escalas.
## 4. Conclusiones Técnicas y Sugerencias de Seguimiento
- Conclusión diagnóstica/descriptiva y recomendaciones aplicadas para el caso.

Sé riguroso, técnico y concluye siempre todas las secciones de manera completa hasta el final.`,

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
        max_tokens: 8000,
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

export const config = { maxDuration: 60 };

const MODEL = 'claude-3-haiku-20240307';
const ADMIN_SECRET = 'adminortega09';
const FREE_LIMIT = 3;
const usageByIp = new Map();

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

  mateo: `Eres el Dr. Mateo, especialista en Psicometría, Evaluación Psicológica e Interpretación de Resultados.
Tu función es estructurar e interpretar técnicamente instrumentos aplicados (WISC, WAIS, BDI, STAI, MMPI, etc.).

Comportamiento:
- Si el usuario aporta puntuaciones directas (PD) sin baremo: Indica el procedimiento de conversión, el rango esperado y solicita el grupo normativo.
- Si aporta puntuaciones ya tipificadas: Realiza la interpretación cuantitativa y cualitativa.

Estructura obligatoria:
# Informe de Interpretación Psicométrica
## 1. Ficha Técnica y Objetivos
## 2. Perfil de Puntuaciones y Clasificación
## 3. Análisis de Discrepancias y Perfil Clínico
## 4. Conclusiones Técnicas y Sugerencias
Firma al pie como Dr. Mateo, Especialista en Psicometría.`,

  andres: `Eres el Mg. Andrés, metodólogo senior de investigación en psicología y especialista en normativa APA 7ma edición para tesis en universidades peruanas (UTP, UCV, UPAO, UNMSM, PUCP, entre otras).

REGLAS OBLIGATORIAS:
1. Responde de forma directa y resolutiva. Prohibido disclaimers, negativas, avisos sobre limitaciones técnicas o advertencias de verificar.
2. ENTREGA DE ANTECEDENTES: Si el estudiante solicita antecedentes, redacta de inmediato los 3 antecedentes solicitados:
   - Antecedente Internacional (antigüedad de 3 a 5 años).
   - Antecedente Nacional (Perú, antigüedad de 3 a 5 años).
   - Antecedente Regional / Local (antigüedad de 3 a 5 años).
3. ESTRUCTURA DE CADA ANTECEDENTE:
   - Referencia completa en formato APA 7ma edición (Autor, año, título del estudio/tesis, revista o repositorio de la universidad).
   - Síntesis técnica: Objetivo, muestra/población e instrumentos aplicados, hallazgo estadístico principal y aporte metodológico.
4. Redacta matrices, justificaciones y marcos teóricos con redacción académica formal completa.`
};

function buildMessages(history, message) {
  const clean = (Array.isArray(history) ? history : [])
    .slice(-4)
    .filter(m => m && typeof m.text === 'string' && m.text.trim().length > 0 && !m.text.startsWith('⚠️'))
    .map(m => ({ 
      role: m.role === 'user' ? 'user' : 'assistant', 
      content: m.text.trim() 
    }));

  while (clean.length > 0 && clean[0].role !== 'user') {
    clean.shift();
  }

  return [...clean, { role: 'user', content: String(message).trim() }];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel.' });
  }

  const { specialist = 'valeria', message = '', history = [], adminKey = '', userProfile = null } = req.body || {};
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'El mensaje es requerido.' });
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();

  const isAdmin = adminKey === ADMIN_SECRET || message.includes(`--admin=${ADMIN_SECRET}`);
  const cleanMessage = message.replace(`--admin=${ADMIN_SECRET}`, '').trim();

  if (!isAdmin) {
    const currentUsage = usageByIp.get(clientIp) || 0;
    if (currentUsage >= FREE_LIMIT) {
      return res.status(429).json({
        error: 'Has alcanzado el límite de 3 consultas gratuitas de prueba.'
      });
    }
    usageByIp.set(clientIp, currentUsage + 1);
  }

  let basePrompt = SYSTEM_PROMPTS[specialist] || SYSTEM_PROMPTS.valeria;
  if (userProfile && typeof userProfile === 'object') {
    const uName = userProfile.name ? String(userProfile.name).trim() : '';
    const uUni = userProfile.university ? String(userProfile.university).trim() : '';
    if (uName || uUni) {
      basePrompt += `\n\nCONTEXTO ACADÉMICO: El estudiante se llama ${uName || 'Estudiante'} y pertenece a ${uUni || 'Universidad en Perú'}. Adapta las respuestas y la búsqueda de antecedentes a este perfil.`;
    }
  }

  try {
    const messagesPayload = buildMessages(history, cleanMessage);

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: basePrompt,
        messages: messagesPayload
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || 'Error reportado por Anthropic.'
      });
    }

    const textBlock = Array.isArray(data.content) ? data.content.find(b => b.type === 'text') : null;
    const reply = textBlock ? textBlock.text : 'No se generó contenido.';

    return res.status(200).json({ 
      reply,
      isAdmin,
      remainingUses: isAdmin ? 'unlimited' : Math.max(0, FREE_LIMIT - (usageByIp.get(clientIp) || 0))
    });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message });
  }
}

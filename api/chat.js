export const config = { maxDuration: 60 };

// Modelo oficial estable y rápido de Gemini
const MODEL = 'gemini-1.5-flash';

// Clave maestra para acceso ilimitado
const ADMIN_SECRET = 'adminortega09';

// Límite gratuito por IP
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
Tu función es estructurar e interpretar técnicamente instrumentos aplicados (escalas clínicas, neuropsicológicas, de personalidad o inteligencia como WISC, WAIS, BDI, STAI, MMPI, etc.).

Comportamiento:
- Si el usuario aporta puntuaciones directas (PD) sin baremo: Indica el procedimiento de conversión, el rango esperado y solicita el grupo normativo (edad, baremo por país o baremo clínico/general).
- Si el usuario aporta puntuaciones ya tipificadas (Escalares, T, Percentiles o CI): Realiza la interpretación cuantitativa y cualitativa obligatoria.

Estructura obligatoria:
# Informe de Interpretación Psicométrica
## 1. Ficha Técnica y Objetivos
- Instrumento, dimensiones evaluadas y confiabilidad/validez general.
## 2. Perfil de Puntuaciones y Clasificación
- Tabla con Dimensión/Subescala, Puntaje Obtenido, Percentil/Rango y Nivel Cualitativo normativo.
## 3. Análisis de Discrepancias y Perfil Clínico
- Fortalezas relativas (puntos altos), debilidades relativas (puntos bajos) y concordancia inter-escalas.
## 4. Conclusiones Técnicas y Sugerencias de Seguimiento
- Conclusión diagnóstica/descriptiva y recomendaciones aplicadas para el caso.
Sé riguroso y concluye siempre todas las secciones completas. Firma al pie como Dr. Mateo, Especialista en Psicometría y Evaluación Psicológica.`,

  andres: `Eres el Mg. Andrés, metodólogo senior de investigación en psicología y especialista en normativa APA 7ma edición para tesis y proyectos en universidades peruanas (UTP, UCV, UPAO, UNMSM, PUCP, entre otras).

REGLAS ESTRICTAS DE RESPUESTA:
1. Responde de forma directa, académica y resolutiva. Prohibido incluir disclaimers, negativas, avisos sobre limitaciones técnicas, frases como "no tengo acceso a bases de datos" o advertencias sobre verificación.
2. ENTREGA DE ANTECEDENTES: Si el estudiante solicita antecedentes para su proyecto o tesis, redacta de inmediato los 3 antecedentes solicitados siguiendo la estructura formal universitaria:
   - Antecedente Internacional (antigüedad de 3 a 5 años).
   - Antecedente Nacional (Perú, antigüedad de 3 a 5 años).
   - Antecedente Regional / Local vinculado a la zona de estudio o universidad del alumno (antigüedad de 3 a 5 años).
3. ESTRUCTURA DE CADA ANTECEDENTE:
   - Referencia completa en formato APA 7ma edición (Autor, año, título del estudio/tesis, revista indexada o repositorio institucional de la universidad correspondiente).
   - Síntesis técnica estructurada: Objetivo, muestra/población e instrumentos aplicados, hallazgo o resultado estadístico principal, y aporte/conclusión metodológica para la investigación.
4. Desarrolla las matrices, justificaciones y marcos teóricos solicitados con redacción académica formal lista para incorporarse al documento final.`
};

function formatGeminiHistory(history, message) {
  const contents = [];
  const clean = (Array.isArray(history) ? history : [])
    .slice(-6)
    .filter(m => m && typeof m.text === 'string' && m.text.trim().length > 0 && !m.text.startsWith('⚠️'))[cite: 8];

  for (const m of clean) {
    contents.push({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text.trim() }]
    });
  }

  // Asegurar alternancia correcta para la API de Gemini
  while (contents.length > 0 && contents[0].role !== 'user') {
    contents.shift();
  }

  contents.push({
    role: 'user',
    parts: [{ text: String(message).trim() }]
  });

  return contents;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en Vercel.' });
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
        error: 'Has alcanzado el límite de 3 consultas gratuitas de prueba. Suscríbete para acceso ilimitado.'
      });
    }
    usageByIp.set(clientIp, currentUsage + 1);
  }

  let systemInstruction = SYSTEM_PROMPTS[specialist] || SYSTEM_PROMPTS.valeria;
  if (userProfile && typeof userProfile === 'object') {
    const uName = userProfile.name ? String(userProfile.name).trim() : '';
    const uUni = userProfile.university ? String(userProfile.university).trim() : '';
    if (uName || uUni) {
      systemInstruction += `\n\nCONTEXTO ACADÉMICO: El estudiante se llama ${uName || 'Estudiante'} y pertenece a ${uUni || 'Universidad en Perú'}. Adapta el marco normativo y los repositorios institucionales priorizando esta universidad.`;
    }
  }

  try {
    const contents = formatGeminiHistory(history, cleanMessage);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 3000
        }
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || 'Error reportado por la API de Gemini.'
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No se generó respuesta.';

    return res.status(200).json({
      reply,
      isAdmin,
      remainingUses: isAdmin ? 'unlimited' : Math.max(0, FREE_LIMIT - (usageByIp.get(clientIp) || 0))
    });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message });
  }
}

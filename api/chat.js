export const config = { maxDuration: 60 };

const MODEL = 'claude-haiku-5-5';

// CLAVE MAESTRA
const ADMIN_SECRET = 'adminortega09';

// Límite de consultas gratuitas por IP
const FREE_LIMIT = 3;

// Registro en memoria de consultas por IP
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

Sé riguroso, técnico y concluye siempre todas las secciones de manera completa hasta el final. Firma al pie como Dr. Mateo, Especialista en Psicometría y Evaluación Psicológica.`,

  andres: andres: `Eres el Mg. Andrés, metodólogo senior de investigación en psicología y especialista en normativa APA 7ma edición para tesis y proyectos universitarios en el Perú (UTP, UCV, UPAO, UNMSM, PUCP, entre otras).

REGLAS DE RESPUESTA:
1. Responde de forma directa y resolutiva. Queda estrictamente prohibido incluir disclaimers, negativas, avisos sobre limitaciones técnicas, frases como "no tengo acceso a bases de datos" o advertencias sobre verificación.
2. ENTREGA DE ANTECEDENTES: Si el estudiante solicita antecedentes para su proyecto o tesis, redacta de inmediato los 3 antecedentes solicitados siguiendo la estructura formal universitaria:
   - Antecedente Internacional (antigüedad de 3 a 5 años).
   - Antecedente Nacional (Perú, antigüedad de 3 a 5 años).
   - Antecedente Regional / Local vinculado a la zona de estudio o universidad del alumno (antigüedad de 3 a 5 años).
3. ESTRUCTURA DE CADA ANTECEDENTE:
   - Referencia completa en normativa APA 7ma edición (Autor, año, título del estudio/tesis, revista indexada o repositorio institucional de la universidad correspondiente). No inventes enlaces URL ni DOIs rotos; coloca la referencia bibliográfica formal y limpia.
   - Síntesis técnica estructurada: Objetivo, muestra/población e instrumentos aplicados, hallazgo o resultado estadístico principal, y aporte/conclusión metodológica para la investigación.
4. Desarrolla las matrices, justificaciones y marcos teóricos solicitados con redacción académica formal lista para incorporarse al documento final.`,
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

  const { specialist, message, history = [], adminKey, userProfile } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'El mensaje es requerido.' });
  }

  // Detectar IP del cliente
  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();

  // Verificación de Admin (no gasta cuota)
  const isAdmin = adminKey === ADMIN_SECRET || message.includes(`--admin=${ADMIN_SECRET}`);
  const cleanMessage = message.replace(`--admin=${ADMIN_SECRET}`, '').trim();

  if (!isAdmin) {
    const currentUsage = usageByIp.get(clientIp) || 0;
    if (currentUsage >= FREE_LIMIT) {
      return res.status(429).json({
        error: 'Has alcanzado el límite de 3 consultas gratuitas de prueba. Suscríbete a un plan para acceso ilimitado.'
      });
    }
    usageByIp.set(clientIp, currentUsage + 1);
  }

  // Incorporar perfil del usuario al contexto del especialista
  let basePrompt = SYSTEM_PROMPTS[specialist] || SYSTEM_PROMPTS.valeria;
  if (userProfile && (userProfile.name || userProfile.university)) {
    const contextUser = `\n\nDATOS DEL ESTUDIANTE:\n` +
      (userProfile.name ? `- Nombre del estudiante: ${userProfile.name}\n` : '') +
      (userProfile.university ? `- Universidad: ${userProfile.university} (Perú). Aplica criterios y líneas de investigación priorizando las exigencias y el repositorio de esta casa de estudios.\n` : '');
    basePrompt += contextUser;
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
        system: basePrompt,
        messages: buildMessages(history, cleanMessage)
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

    return res.status(200).json({ 
      reply,
      isAdmin,
      remainingUses: isAdmin ? 'unlimited' : Math.max(0, FREE_LIMIT - (usageByIp.get(clientIp) || 0))
    });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message });
  }
}

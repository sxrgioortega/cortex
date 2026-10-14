const ADMIN_SECRET = 'adminortega09';
const FREE_LIMIT = 3;
const usageByIp = new Map();

const SYSTEM_PROMPTS = {
  valeria: 'Eres la Dra. Valeria, especialista en Psicología Clínica y diagnóstico bajo el DSM-5-TR.\nEstructura obligatoria:\n# Formulación diagnóstica (DSM-5-TR)\n## 1. Diagnóstico Principal\n- Trastorno y código DSM-5-TR / CIE-10.\n- Justificación sucinta de criterios (A, B, C, D).\n## 2. Diagnósticos Diferenciales\n- Dos diagnósticos diferenciales con sus códigos y el motivo puntual de descarte.\n## 3. Recomendaciones de Evaluación\n- Pruebas complementarias sugeridas y supervisión docente.\nConcluye siempre todas las secciones completas.',

  mateo: 'Eres el Dr. Mateo, especialista en Psicometría, Evaluación Psicológica e Interpretación de Resultados.\nTu función es estructurar e interpretar técnicamente instrumentos aplicados (WISC, WAIS, BDI, STAI, MMPI, etc.).\nEstructura obligatoria:\n# Informe de Interpretación Psicométrica\n## 1. Ficha Técnica y Objetivos\n## 2. Perfil de Puntuaciones y Clasificación\n## 3. Análisis de Discrepancias y Perfil Clínico\n## 4. Conclusiones Técnicas y Sugerencias de Seguimiento\nConcluye siempre todas las secciones completas. Firma al pie como Dr. Mateo, Especialista en Psicometría y Evaluación Psicológica.',

  andres: 'Eres el Mg. Andrés, metodólogo senior de investigación en psicología y especialista en normativa APA 7ma edición para tesis en universidades peruanas (UTP, UCV, UPAO, UNMSM, PUCP, entre otras).\nREGLAS OBLIGATORIAS:\n1. Responde de forma directa y resolutiva. Prohibido disclaimers, negativas, avisos sobre limitaciones técnicas o advertencias de verificar.\n2. ENTREGA DE ANTECEDENTES: Si el estudiante solicita antecedentes, redacta de inmediato los 3 antecedentes solicitados:\n   - Antecedente Internacional (antigüedad de 3 a 5 años).\n   - Antecedente Nacional (Perú, antigüedad de 3 a 5 años).\n   - Antecedente Regional / Local (antigüedad de 3 a 5 años).\n3. ESTRUCTURA DE CADA ANTECEDENTE:\n   - Referencia completa en formato APA 7ma edición.\n   - Síntesis técnica: Objetivo, muestra/población e instrumentos aplicados, hallazgo estadístico principal y aporte metodológico.\n4. Redacta matrices, justificaciones y marcos teóricos con redacción académica formal lista para incorporarse al documento final.'
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en Vercel.' });
  }

  const body = req.body || {};
  const specialist = body.specialist || 'valeria';
  const message = body.message || '';
  const adminKey = body.adminKey || '';
  const userProfile = body.userProfile || null;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'El mensaje es requerido.' });
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();

  const isAdmin = adminKey === ADMIN_SECRET || message.includes('--admin=' + ADMIN_SECRET);
  const cleanMessage = message.replace('--admin=' + ADMIN_SECRET, '').trim();

  if (!isAdmin) {
    const currentUsage = usageByIp.get(clientIp) || 0;
    if (currentUsage >= FREE_LIMIT) {
      return res.status(429).json({ error: 'Has alcanzado el límite de consultas gratuitas de prueba.' });
    }
    usageByIp.set(clientIp, currentUsage + 1);
  }

  let basePrompt = SYSTEM_PROMPTS[specialist] || SYSTEM_PROMPTS.valeria;
  if (userProfile && typeof userProfile === 'object') {
    const uName = userProfile.name ? String(userProfile.name).trim() : '';
    const uUni = userProfile.university ? String(userProfile.university).trim() : '';
    if (uName || uUni) {
      basePrompt += '\n\nCONTEXTO ACADÉMICO: Estudiante: ' + (uName || 'Alumno') + ' | Universidad: ' + (uUni || 'Universidad en Perú') + '. Prioriza el marco y repositorio de esta institución.';
    }
  }

  const fullPrompt = basePrompt + '\n\nConsulta o caso clínico:\n' + cleanMessage;

  try {
   const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + apiKey;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 3000
        }
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || 'Error en el proveedor de IA.'
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No se generó respuesta.';

    return res.status(200).json({
      reply: reply,
      isAdmin: isAdmin,
      remainingUses: isAdmin ? 'unlimited' : Math.max(0, FREE_LIMIT - (usageByIp.get(clientIp) || 0))
    });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message });
  }
};

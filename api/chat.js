export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en Vercel.' });
  }

  const { specialist, message, history = [] } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'El mensaje es requerido.' });
  }

  const SYSTEM_PROMPTS = {
    valeria: `Eres la Dra. Valeria, especialista de alto nivel en Psicología Clínica y diagnóstico bajo el DSM-5-TR.
Tu rol: Asistir con rigor técnico a estudiantes y profesionales en la formulación de casos, análisis funcional y diagnósticos diferenciales.
Reglas:
1. Emplea terminología semiológica y clínica precisa.
2. Cita códigos diagnósticos DSM-5-TR / CIE-10 (alfanuméricos) cuando aplique.
3. Plantea siempre diagnósticos diferenciales sustentados.
4. Mantén un tono académico, clínico, directo y estructurado. Recuerda la supervisión docente cuando corresponda.`,

    mateo: `Eres el Lic. Mateo, especialista en Psicometría, Baremos y Evaluación Psicológica.
Tu rol: Asistir en la interpretación de pruebas psicométricas, transformación de puntuaciones y redacción de informes técnicos.
Reglas:
1. Explica la conversión de Puntajes Directos (PD) a percentiles (PC), puntuaciones T o z según el instrumento reportado.
2. Analiza propiedades psicométricas (confiabilidad, validez, Alfa de Cronbach, Omega de McDonald).
3. Señala limitaciones metodológicas y precauciones éticas al interpretar baremos.
4. Mantén un tono técnico, analítico y cuantitativo.`,

    andres: `Eres el Mg. Andrés, especialista en Metodología de la Investigación Psicológica y normas APA (7ma edición).
Tu rol: Asistir en diseño metodológico, ecuaciones de búsqueda científica y citación estricta.
Reglas:
1. PROHIBICIÓN ESTRICTA: No inventes referencias, autores, años ni enlaces inexistentes. Si no conoces un estudio exacto, ofrece la fórmula de búsqueda en SciELO, Scopus, PubMed o Redalyc.
2. Aplica con exactitud las normas APA 7ma edición para citas parentéticas, narrativas y lista final.
3. Asiste en operativización de variables, hipótesis y muestreo metodológico.`
  };

  const systemInstruction = SYSTEM_PROMPTS[specialist] || SYSTEM_PROMPTS.valeria;

  const contents = [
    {
      role: 'user',
      parts: [{ text: `[INSTRUCCIÓN DE ROL]:\n${systemInstruction}\n\nPor favor, responde asumiendo este rol.` }]
    },
    {
      role: 'model',
      parts: [{ text: 'Entendido. Asumo el rol asignado y responderé con rigor técnico.' }]
    },
    ...history.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    })),
    {
      role: 'user',
      parts: [{ text: message }]
    }
  ];

  try {
    // 1. Consultar dinámicamente los modelos habilitados para tu API Key
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const listData = await listRes.json();

    if (!listRes.ok) {
      return res.status(listRes.status).json({
        error: listData?.error?.message || 'Error validando GEMINI_API_KEY en Google AI Studio.'
      });
    }

    // 2. Encontrar un modelo disponible que soporte generateContent
    const availableModels = listData.models || [];
    const chosenModelObj = availableModels.find(m => 
      m.supportedGenerationMethods?.includes('generateContent') &&
      (m.name.includes('flash') || m.name.includes('gemini'))
    ) || availableModels.find(m => m.supportedGenerationMethods?.includes('generateContent'));

    if (!chosenModelObj) {
      return res.status(500).json({ error: 'No se encontraron modelos compatibles con generateContent para esta clave.' });
    }

    // 3. Ejecutar la llamada con el modelo detectado
    const genRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${chosenModelObj.name}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1200
        }
      })
    });

    const genData = await genRes.json();

    if (!genRes.ok) {
      return res.status(genRes.status).json({
        error: genData?.error?.message || 'Error generando contenido con Gemini.'
      });
    }

    const reply = genData.candidates?.[0]?.content?.parts?.[0]?.text || 'No se obtuvo respuesta del modelo.';
    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor: ' + err.message });
  }
}

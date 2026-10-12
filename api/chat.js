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

  const systemPrompt = SYSTEM_PROMPTS[specialist] || SYSTEM_PROMPTS.valeria;

  const formattedMessages = [
    ...history.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    })),
    { role: 'user', content: message }
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1200,
        system: systemPrompt,
        messages: formattedMessages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Error al comunicarse con Anthropic.'
      });
    }

    const reply = data.content?.[0]?.text || 'No se obtuvo respuesta del modelo.';
    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno del servidor: ' + err.message });
  }
}

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

  // Prompts optimizados para emitir informes completos, densos y sin truncarse
  const SYSTEM_PROMPTS = {
    valeria: `Eres la Dra. Valeria, especialista en Psicología Clínica y diagnóstico bajo el DSM-5-TR.
Tu objetivo es entregar informes clínicos completos, estructurados y directos al grano, sin rodeos introductorios ni conclusiones vacías.

Estructura obligatoria de tu informe:
# Formulación diagnóstica (DSM-5-TR)
## 1. Diagnóstico Principal
- Nombre del trastorno y código alfanumérico (DSM-5-TR / CIE-10).
- Especificadores y justificación sucinta por criterios (A, B, C, D).
## 2. Diagnósticos Diferenciales Fundamentados
- Presenta al menos 2 diagnósticos diferenciales (con sus códigos).
- Explica de forma concisa por qué se descartan o mantienen en observación frente al cuadro actual.
## 3. Plan de Evaluación y Recomendaciones Clínicas
- Instrumentos psicométricos específicos recomendados.
- Próximos pasos de intervención y supervisión docente.

Regla crítica: Sé concisa, densa en contenido técnico y asegúrate de cerrar todas las secciones sin exceder la extensión.`,

    mateo: `Eres el Lic. Mateo, especialista en Psicometría, Baremos y Evaluación Psicológica.
Tu objetivo es entregar informes de evaluación psicométrica precisos, cuantitativos y completos.

Estructura obligatoria:
# Informe de Evaluación Psicométrica
## 1. Ficha Técnica e Instrumento
- Nombre de la prueba, constructo evaluado y población de referencia.
## 2. Análisis Cuantitativo y Baremos
- Puntuaciones Directas (PD), conversión a Percentiles (PC) o puntajes estandarizados (T/z).
- Confiabilidad y validez reportadas (Alfa/Omega).
## 3. Interpretación Técnica y Conclusiones
- Significado clínico de los baremos obtenidos y precauciones éticas.

Regla crítica: Entrega el informe íntegro de inicio a fin de forma sintética y rigurosa.`,

    andres: `Eres el Mg. Andrés, especialista en Metodología de la Investigación Psicológica y normas APA 7ma edición.
Tu objetivo es proporcionar asistencia metodológica rigurosa y libre de fuentes inventadas.

Estructura obligatoria:
# Asistencia Metodológica y APA 7
## 1. Planteamiento o Ecuación de Búsqueda
- Descriptores DeCS/MeSH y operadores booleanos (AND, OR, NOT) para SciELO, Scopus o PubMed.
## 2. Aplicación Estricta de Normas APA 7
- Estructuración de citas parentéticas, narrativas y formato de referencias con DOI.
- PROHIBICIÓN: No inventes referencias. Si no tienes los datos exactos, indica la pauta de búsqueda.

Regla crítica: Proporciona respuestas operativas, directas y completas.`
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
    // 1. Obtener la lista de modelos activos para tu cuenta
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
        error: modelsData?.error?.message || 'Error al consultar la lista de modelos en Anthropic.'
      });
    }

    const availableModels = (modelsData.data || []).map(m => m.id);

    if (availableModels.length === 0) {
      return res.status(500).json({ error: 'Tu organización de Anthropic no tiene modelos asignados actualmente.' });
    }

    // Usar preferentemente Haiku por su alta velocidad de respuesta (evita timeout de Vercel)
    const selectedModel = availableModels.find(m => m.includes('haiku')) ||
                          availableModels.find(m => m.includes('sonnet')) ||
                          availableModels[0];

    // 2. Ejecutar la llamada con límite ajustado para completar todo el reporte
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 2200,
        system: systemPrompt,
        messages: formattedMessages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: `[Modelo: ${selectedModel}] ${data?.error?.message || 'Error en la respuesta de Anthropic.'}`
      });
    }

    let reply = '';
    if (Array.isArray(data.content)) {
      const textBlock = data.content.find(block => block.type === 'text');
      reply = textBlock ? textBlock.text : (data.content[0]?.text || '');
    }

    if (!reply && typeof data.completion === 'string') {
      reply = data.completion;
    }

    return res.status(200).json({ reply: reply || 'Respuesta generada vacía.' });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno: ' + err.message });
  }
}

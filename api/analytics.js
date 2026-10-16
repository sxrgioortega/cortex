const { getAnalyticsData, resetAnalyticsData, verifyAdminKey } = require('./tracker');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extracción flexible y segura de la clave del administrador
  let authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    authHeader = authHeader.slice(7).trim();
  }

  let queryKey = '';
  try {
    const parsedUrl = new URL(req.url, 'http://localhost');
    queryKey = parsedUrl.searchParams.get('adminKey') || parsedUrl.searchParams.get('key') || '';
  } catch (e) {}

  const body = req.body || {};
  const providedKey = String(
    req.headers['x-admin-key'] ||
    authHeader ||
    body.adminKey ||
    queryKey ||
    ''
  ).trim();

  if (!verifyAdminKey(providedKey)) {
    return res.status(403).json({
      success: false,
      error: 'Acceso no autorizado. Clave de administrador inválida o no proporcionada.'
    });
  }

  // Manejo de reseteo si es explícitamente solicitado
  if (req.method === 'POST' && (body.action === 'reset' || body.reset === true)) {
    const resetResult = resetAnalyticsData(providedKey);
    return res.status(200).json(resetResult);
  }

  // Devolución de métricas completas
  const data = getAnalyticsData(providedKey);
  return res.status(200).json(data);
};

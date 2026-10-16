const { verifyLicenseCode } = require('./licenses');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Utiliza POST.' });
  }

  const body = req.body || {};
  const code = String(body.code || '').trim();

  if (!code) {
    return res.status(400).json({ success: false, error: 'Por favor ingresa un código de activación.' });
  }

  const result = verifyLicenseCode(code);

  if (!result || !result.isValid) {
    return res.status(401).json({
      success: false,
      error: 'Código de activación inválido o no reconocido. Verifica que esté bien escrito o consulta por WhatsApp.'
    });
  }

  return res.status(200).json({
    success: true,
    plan: result.plan,
    name: result.name,
    queries: result.queries,
    durationDays: result.durationDays,
    isMaster: result.isMaster || false,
    code: result.code
  });
};

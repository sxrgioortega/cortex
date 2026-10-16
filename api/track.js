const { extractClientIp, recordEvent } = require('./tracker');

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

  try {
    const ip = extractClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const body = req.body || {};

    const email = body.email || body.userProfile?.email || null;
    const name = body.name || body.userProfile?.name || null;
    const university = body.university || body.userProfile?.university || null;
    const action = body.action || 'visit';
    const reqPath = body.path || '/';
    const details = body.details || '';
    const plan = body.plan || '';

    const logged = recordEvent({
      ip,
      email,
      name,
      university,
      userAgent,
      path: reqPath,
      action,
      details,
      plan
    });

    return res.status(200).json({
      success: true,
      ip,
      eventId: logged.id
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Error al registrar evento: ' + err.message
    });
  }
};

const { ADMIN_SECRET, generateLicenseCode } = require('./licenses');

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
  const adminKey = String(body.adminKey || '').trim();
  const planType = String(body.planType || 'apuros').toLowerCase().trim();

  // Validación estricta: sólo el dueño con su clave maestra puede generar códigos
  if (!adminKey || adminKey.toUpperCase() !== ADMIN_SECRET.toUpperCase()) {
    return res.status(403).json({
      success: false,
      error: 'No autorizado. Se requiere la clave maestra del administrador.'
    });
  }

  const generated = generateLicenseCode(planType);

  const whatsappMessage = `¡Hola! Muchas gracias por tu pago en Córtex 🧠.\n\nAquí tienes tu clave de activación oficial:\n👉 *${generated.code}*\n\n📌 *Beneficio:* ${generated.name} (${generated.queries === Infinity ? 'Ilimitado' : generated.queries + ' consultas completas'})\n🌐 *Ingrésalo en:* https://psicortex.vercel.app\n\n¡Éxitos con tus informes y casos!`;

  return res.status(200).json({
    success: true,
    license: generated,
    whatsappMessage
  });
};

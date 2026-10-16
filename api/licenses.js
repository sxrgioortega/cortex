const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'adminortega09';
const LICENSES_FILE = path.join(__dirname, 'licenses.json');

// Almacenamiento local persistente cuando el sistema de archivos está disponible
let licensesStore = {};
try {
  if (fs.existsSync(LICENSES_FILE)) {
    licensesStore = JSON.parse(fs.readFileSync(LICENSES_FILE, 'utf8'));
  }
} catch (e) {
  licensesStore = {};
}

function saveStore() {
  try {
    fs.writeFileSync(LICENSES_FILE, JSON.stringify(licensesStore, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Genera un código criptográfico firmado según el plan solicitado.
 * Funciona de manera autónoma tanto en servidor local como en Vercel Serverless.
 * @param {'apuros' | 'mensual' | 'pro'} planType
 */
function generateLicenseCode(planType) {
  const normalizedPlan = String(planType || 'apuros').toLowerCase().trim();
  const prefixMap = {
    apuros: 'AP',
    mensual: 'MES',
    pro: 'PRO'
  };
  const prefix = prefixMap[normalizedPlan] || 'AP';
  const randomPart = Math.floor(1000 + Math.random() * 9000); // 4 dígitos aleatorios
  const payload = `${prefix}-${randomPart}`;
  
  // Firma HMAC SHA-256 de 4 caracteres usando ADMIN_SECRET
  const signature = crypto
    .createHmac('sha256', ADMIN_SECRET)
    .update(payload)
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();
    
  const fullCode = `${payload}-${signature}`;

  const planMetadata = {
    apuros: { name: 'Pase Estudiante en Apuros', queries: 6, durationDays: 30, price: 'S/ 4.90' },
    mensual: { name: 'Plan Estudiante Mensual', queries: 100, durationDays: 30, price: 'S/ 19.90' },
    pro: { name: 'Plan Profesional', queries: 250, durationDays: 30, price: 'S/ 34.90' }
  }[normalizedPlan] || { name: 'Pase Estudiante en Apuros', queries: 6, durationDays: 30, price: 'S/ 4.90' };

  licensesStore[fullCode] = {
    plan: normalizedPlan,
    name: planMetadata.name,
    queries: planMetadata.queries,
    durationDays: planMetadata.durationDays,
    createdAt: new Date().toISOString(),
    usedCount: 0
  };
  saveStore();

  return {
    code: fullCode,
    plan: normalizedPlan,
    name: planMetadata.name,
    queries: planMetadata.queries,
    durationDays: planMetadata.durationDays,
    price: planMetadata.price
  };
}

/**
 * Valida un código ingresado por el usuario o estudiante.
 * @param {string} code
 */
function verifyLicenseCode(code) {
  if (!code || typeof code !== 'string') return null;
  const clean = code.trim().toUpperCase();

  // 1. Clave Maestra del Dueño / Administrador
  if (clean === ADMIN_SECRET.toUpperCase()) {
    return {
      isValid: true,
      plan: 'admin',
      name: 'Dueño / Administrador Maestro',
      isMaster: true,
      queries: Infinity,
      durationDays: Infinity,
      code: clean
    };
  }

  // 2. Comprobación en memoria o almacenamiento local persistente
  if (licensesStore[clean]) {
    const item = licensesStore[clean];
    return {
      isValid: true,
      plan: item.plan,
      name: item.name || (item.plan === 'apuros' ? 'Pase Estudiante en Apuros' : item.plan === 'mensual' ? 'Plan Estudiante Mensual' : 'Plan Profesional'),
      isMaster: false,
      queries: item.queries || (item.plan === 'apuros' ? 6 : item.plan === 'mensual' ? 100 : 250),
      durationDays: item.durationDays || 30,
      code: clean
    };
  }

  // 3. Verificación Algorítmica con Firma Criptográfica (Ideal para Vercel Serverless)
  const parts = clean.split('-');
  if (parts.length === 3) {
    const prefix = parts[0];
    const randomPart = parts[1];
    const userSig = parts[2];
    const payload = `${prefix}-${randomPart}`;
    const expectedSig = crypto
      .createHmac('sha256', ADMIN_SECRET)
      .update(payload)
      .digest('hex')
      .slice(0, 4)
      .toUpperCase();

    if (userSig === expectedSig) {
      if (prefix === 'AP') {
        return { isValid: true, plan: 'apuros', name: 'Pase Estudiante en Apuros', queries: 6, durationDays: 30, isMaster: false, code: clean };
      }
      if (prefix === 'MES') {
        return { isValid: true, plan: 'mensual', name: 'Plan Estudiante Mensual', queries: 100, durationDays: 30, isMaster: false, code: clean };
      }
      if (prefix === 'PRO') {
        return { isValid: true, plan: 'pro', name: 'Plan Profesional', queries: 250, durationDays: 30, isMaster: false, code: clean };
      }
    }
  }

  // 4. Códigos promocionales predefinidos para demostración o cortesía
  const predefined = {
    'APUROS490': { plan: 'apuros', name: 'Pase Estudiante en Apuros', queries: 6, durationDays: 30, isMaster: false, code: 'APUROS490' },
    'CORTEXMES': { plan: 'mensual', name: 'Plan Estudiante Mensual', queries: 100, durationDays: 30, isMaster: false, code: 'CORTEXMES' },
    'PROTESIS': { plan: 'pro', name: 'Plan Profesional', queries: 250, durationDays: 30, isMaster: false, code: 'PROTESIS' }
  };
  if (predefined[clean]) {
    return { isValid: true, ...predefined[clean] };
  }

  return null;
}

module.exports = {
  ADMIN_SECRET,
  generateLicenseCode,
  verifyLicenseCode
};

const fs = require('fs');
const path = require('path');
const { ADMIN_SECRET: DEFAULT_SECRET } = require('./licenses');

const ADMIN_SECRET = process.env.ADMIN_SECRET || DEFAULT_SECRET || 'adminortega09';
const DATA_FILE = path.join(__dirname, 'visitors.json');

// Estructura en memoria con respaldo persistente en archivo
let store = {
  totalVisits: 0,
  visitorsByIp: {},
  usersByEmail: {},
  logs: []
};

// Carga inicial segura
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      store = {
        totalVisits: Number(parsed.totalVisits) || 0,
        visitorsByIp: parsed.visitorsByIp || {},
        usersByEmail: parsed.usersByEmail || {},
        logs: Array.isArray(parsed.logs) ? parsed.logs : []
      };
    }
  }
} catch (e) {
  // En entornos de solo lectura o primer inicio, se inicia con el almacén por defecto
}

function persistStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    // Si el entorno serverless es efímero/read-only, los datos se preservan en memoria
  }
}

/**
 * Extrae la dirección IP real del cliente considerando proxies y balanceadores de carga
 */
function extractClientIp(req) {
  let ip = (
    req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.headers['cf-connecting-ip'] ||
    req.headers['true-client-ip'] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    '127.0.0.1'
  );

  if (typeof ip === 'string') {
    if (ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
    // Limpieza de formato IPv6-mapped IPv4
    if (ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '');
    }
    if (ip === '::1') {
      ip = '127.0.0.1';
    }
  }
  return String(ip || '127.0.0.1').trim();
}

/**
 * Parsea el User-Agent para obtener información comprensible de dispositivo y navegador
 */
function parseUserAgent(uaString) {
  const ua = String(uaString || '');
  let browser = 'Navegador Web';
  let os = 'Desconocido';
  let isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);

  // Detección de Sistema Operativo
  if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  // Detección de Navegador
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Google Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Opera|OPR\//i.test(ua)) browser = 'Opera';

  return {
    raw: ua.slice(0, 200),
    browser,
    os,
    isMobile,
    summary: `${browser} · ${os} (${isMobile ? 'Móvil' : 'Escritorio'})`
  };
}

/**
 * Registra un evento de ingreso, inicio de sesión o consulta
 */
function recordEvent({ ip, email, name, university, userAgent, path: reqPath, action = 'visit', details = '', plan = '' }) {
  const now = new Date().toISOString();
  const cleanIp = String(ip || '127.0.0.1').trim();
  const cleanEmail = email && typeof email === 'string' ? email.trim().toLowerCase() : null;
  const cleanName = name && typeof name === 'string' ? name.trim().slice(0, 100) : null;
  const cleanUni = university && typeof university === 'string' ? university.trim().slice(0, 120) : null;
  const uaInfo = parseUserAgent(userAgent);

  if (action === 'visit') {
    store.totalVisits += 1;
  }

  // 1. Actualización de datos por Dirección IP
  if (!store.visitorsByIp[cleanIp]) {
    store.visitorsByIp[cleanIp] = {
      ip: cleanIp,
      email: cleanEmail,
      name: cleanName,
      university: cleanUni,
      allEmails: cleanEmail ? [cleanEmail] : [],
      device: uaInfo.summary,
      firstSeen: now,
      lastSeen: now,
      visitsCount: action === 'visit' ? 1 : 0,
      chatCount: action === 'chat' ? 1 : 0,
      lastAction: action,
      lastPath: reqPath || '/'
    };
  } else {
    const v = store.visitorsByIp[cleanIp];
    v.lastSeen = now;
    v.device = uaInfo.summary || v.device;
    v.lastAction = action;
    if (reqPath) v.lastPath = reqPath;
    if (action === 'visit') v.visitsCount = (v.visitsCount || 0) + 1;
    if (action === 'chat') v.chatCount = (v.chatCount || 0) + 1;

    if (cleanEmail) {
      v.email = cleanEmail;
      v.allEmails = v.allEmails || [];
      if (!v.allEmails.includes(cleanEmail)) {
        v.allEmails.push(cleanEmail);
      }
    }
    if (cleanName) v.name = cleanName;
    if (cleanUni) v.university = cleanUni;
  }

  // 2. Actualización de datos por Correo Electrónico (si está identificado)
  if (cleanEmail) {
    if (!store.usersByEmail[cleanEmail]) {
      store.usersByEmail[cleanEmail] = {
        email: cleanEmail,
        name: cleanName || cleanEmail.split('@')[0],
        university: cleanUni || 'No especificada',
        allIps: [cleanIp],
        primaryIp: cleanIp,
        firstSeen: now,
        lastSeen: now,
        visitsCount: action === 'visit' ? 1 : 1,
        chatCount: action === 'chat' ? 1 : 0,
        device: uaInfo.summary,
        plan: plan || 'free'
      };
    } else {
      const u = store.usersByEmail[cleanEmail];
      u.lastSeen = now;
      u.primaryIp = cleanIp;
      u.device = uaInfo.summary || u.device;
      u.allIps = u.allIps || [];
      if (!u.allIps.includes(cleanIp)) {
        u.allIps.push(cleanIp);
      }
      if (cleanName) u.name = cleanName;
      if (cleanUni) u.university = cleanUni;
      if (plan) u.plan = plan;
      if (action === 'visit') u.visitsCount = (u.visitsCount || 0) + 1;
      if (action === 'chat') u.chatCount = (u.chatCount || 0) + 1;
    }
  }

  // 3. Bitácora de eventos cronológicos (últimos 300 eventos)
  const logItem = {
    id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    timestamp: now,
    ip: cleanIp,
    email: cleanEmail,
    name: cleanName,
    university: cleanUni,
    action,
    path: reqPath || '/',
    device: uaInfo.summary,
    details: details || ''
  };

  store.logs.unshift(logItem);
  if (store.logs.length > 300) {
    store.logs = store.logs.slice(0, 300);
  }

  persistStore();
  return logItem;
}

/**
 * Valida la clave maestra de administrador
 */
function verifyAdminKey(providedKey) {
  if (!providedKey || typeof providedKey !== 'string') return false;
  const currentSecret = process.env.ADMIN_SECRET || ADMIN_SECRET || DEFAULT_SECRET;
  return providedKey.trim().toUpperCase() === currentSecret.toUpperCase();
}

/**
 * Obtiene métricas y consolidado completo para el Administrador
 */
function getAnalyticsData(providedKey) {
  if (!verifyAdminKey(providedKey)) {
    return { success: false, error: 'No autorizado. Clave de administrador inválida.' };
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const visitorsList = Object.values(store.visitorsByIp).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  const usersList = Object.values(store.usersByEmail).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

  // Cálculo de estadísticas
  const totalVisits = store.totalVisits;
  const uniqueIpsCount = visitorsList.length;
  const registeredEmailsCount = usersList.length;

  const todayVisits = visitorsList.reduce((acc, v) => {
    return new Date(v.lastSeen) >= oneDayAgo ? acc + (v.visitsCount || 1) : acc;
  }, 0);

  const todayUniqueIps = visitorsList.filter(v => new Date(v.lastSeen) >= oneDayAgo).length;

  const todayLogins = usersList.filter(u => new Date(u.lastSeen) >= oneDayAgo).length;

  const totalChats = visitorsList.reduce((acc, v) => acc + (v.chatCount || 0), 0);

  return {
    success: true,
    stats: {
      totalVisits,
      uniqueIpsCount,
      registeredEmailsCount,
      todayVisits,
      todayUniqueIps,
      todayLogins,
      totalChats,
      serverTime: now.toISOString()
    },
    users: usersList,
    visitors: visitorsList,
    recentLogs: store.logs.slice(0, 150)
  };
}

/**
 * Reinicia las métricas de prueba si el administrador lo requiere
 */
function resetAnalyticsData(providedKey) {
  if (!verifyAdminKey(providedKey)) {
    return { success: false, error: 'No autorizado. Clave de administrador inválida.' };
  }

  store = {
    totalVisits: 0,
    visitorsByIp: {},
    usersByEmail: {},
    logs: []
  };

  persistStore();
  return { success: true, message: 'Métricas e historial reseteados con éxito.' };
}

module.exports = {
  ADMIN_SECRET,
  extractClientIp,
  parseUserAgent,
  recordEvent,
  verifyAdminKey,
  getAnalyticsData,
  resetAnalyticsData
};

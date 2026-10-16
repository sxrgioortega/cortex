// ====================================================================
// Servidor de Desarrollo Local para Córtex
// Ejecución directa con Node.js (Sin dependencias externas requeridas)
// Uso: node server.js
// ====================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

// Carga automática de .env si existe en el directorio
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val;
      }
    });
  }
} catch (e) {}

const PORT = process.env.PORT || 3000;

// Carga resiliente de endpoints Serverless
function loadHandler(relPath) {
  try {
    return require(relPath);
  } catch (e) {
    try {
      return require(path.join(__dirname, 'cortex-main', relPath));
    } catch (err) {
      return null;
    }
  }
}

const chatHandler = loadHandler('./api/chat.js');
const configHandler = loadHandler('./api/config.js');
const verifyLicenseHandler = loadHandler('./api/verify-license.js');
const generateLicenseHandler = loadHandler('./api/generate-license.js');
const trackHandler = loadHandler('./api/track.js');
const analyticsHandler = loadHandler('./api/analytics.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function runServerless(handler, req, res) {
  let bodyData = '';
  req.on('data', chunk => { bodyData += chunk; });
  req.on('end', async () => {
    try {
      req.body = JSON.parse(bodyData || '{}');
    } catch (e) {
      req.body = {};
    }

    res.status = function(code) {
      res.statusCode = code;
      return res;
    };
    res.json = function(data) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
      return res;
    };

    try {
      await handler(req, res);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Error del servidor: ' + err.message }));
    }
  });
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || 'localhost:' + PORT;
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = parsedUrl.pathname;

  // Manejo de preflight CORS universal
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // 1. Endpoint /api/config
  if (pathname === '/api/config' || pathname === '/api/config.js') {
    if (configHandler) return runServerless(configHandler, req, res);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' }));
  }

  // 2. Endpoint /api/chat
  if (pathname === '/api/chat' || pathname === '/api/chat/' || pathname === '/api/chat.js') {
    if (chatHandler) return runServerless(chatHandler, req, res);
  }

  // 3. Endpoint /api/verify-license (Verificación de códigos por plan)
  if (pathname === '/api/verify-license' || pathname === '/api/verify-license.js') {
    if (verifyLicenseHandler) return runServerless(verifyLicenseHandler, req, res);
  }

  // 4. Endpoint /api/generate-license (Generación de códigos por el dueño)
  if (pathname === '/api/generate-license' || pathname === '/api/generate-license.js') {
    if (generateLicenseHandler) return runServerless(generateLicenseHandler, req, res);
  }

  // 5. Endpoint /api/track (Registro de accesos, visitas y logins)
  if (pathname === '/api/track' || pathname === '/api/track.js') {
    if (trackHandler) return runServerless(trackHandler, req, res);
  }

  // 6. Endpoint /api/analytics (Métricas protegidas de visitas, correos e IPs para el dueño)
  if (pathname === '/api/analytics' || pathname === '/api/analytics.js') {
    if (analyticsHandler) return runServerless(analyticsHandler, req, res);
  }

  // Seguridad: Prohibir acceso directo estático a archivos sensibles o scripts del backend
  if (pathname.startsWith('/api/') || pathname.startsWith('/.env') || pathname.endsWith('.env')) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'Acceso no permitido a recursos internos' }));
  }

  // 7. Favicon
  if (pathname === '/favicon.ico') {
    let icoPath = path.join(__dirname, 'favicon.ico');
    if (!fs.existsSync(icoPath)) {
      icoPath = path.join(__dirname, 'cortex-main', 'favicon.ico');
    }
    if (fs.existsSync(icoPath)) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      fs.createReadStream(icoPath).pipe(res);
      return;
    }
  }

  // 8. Archivos estáticos del frontend
  let safePath = pathname === '/' ? '/index.html' : pathname === '/admin' ? '/admin.html' : pathname;
  safePath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, safePath);

  if (!fs.existsSync(filePath)) {
    const nestedPath = path.join(__dirname, 'cortex-main', safePath);
    if (fs.existsSync(nestedPath)) {
      filePath = nestedPath;
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 No encontrado: ' + pathname);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('\n======================================================');
  console.log('[Córtex] Workspace de Psicología Activo');
  console.log(`[DOMINIO LOCAL]:   http://cortex.local:${PORT} o http://localhost:${PORT}`);
  console.log(`[DOMINIO WEB]:     https://psicortex.vercel.app`);
  console.log(`[ENDPOINT IA]:     http://localhost:${PORT}/api/chat`);
  console.log(`[PANEL DE DUEÑO]:  http://localhost:${PORT}/admin (Protegido por ADMIN_SECRET)`);
  console.log(`[SISTEMA PLANES]:  Apuros (6 consultas), Mensual (30 días), Profesional`);
  console.log(`[AUTH GEMINI]:     ${process.env.GEMINI_API_KEY ? 'Configurada (OK)' : 'No configurada (establecer en .env) [AVISO]'}`);
  console.log('======================================================\n');
});

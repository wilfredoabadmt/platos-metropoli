const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { dbService } = require('./data/db.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// Tipos MIME soportados
const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'text/javascript; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=UTF-8'
};

// Control anti-spam y rate-limiting por IP (Ventana deslizante de 60 segundos)
const ipRequestWindow = new Map();
const COOLDOWN_MS = 1500;
const ipCooldownMap = new Map();

function isIpRateLimited(ip) {
    const now = Date.now();
    const windowStart = now - 60000;
    let timestamps = ipRequestWindow.get(ip) || [];
    timestamps = timestamps.filter(t => t > windowStart);
    if (timestamps.length >= 15) { // Máximo 15 votos por minuto por IP
        ipRequestWindow.set(ip, timestamps);
        return true;
    }
    timestamps.push(now);
    ipRequestWindow.set(ip, timestamps);
    return false;
}

function cleanOldWindows() {
    const now = Date.now();
    const windowStart = now - 60000;
    for (const [ip, timestamps] of ipRequestWindow.entries()) {
        const active = timestamps.filter(t => t > windowStart);
        if (active.length === 0) {
            ipRequestWindow.delete(ip);
        } else {
            ipRequestWindow.set(ip, active);
        }
    }
    for (const [ip, timestamp] of ipCooldownMap.entries()) {
        if (now - timestamp > 30000) {
            ipCooldownMap.delete(ip);
        }
    }
}
setInterval(cleanOldWindows, 30000);

// Pool de clientes Server-Sent Events (SSE) para tiempo real
const sseClients = new Set();

function broadcastSse(eventType, data) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(payload);
        } catch {
            sseClients.delete(client);
        }
    }
}

// Keep-alive heartbeat cada 25 segundos para proxies y CDNs
setInterval(() => {
    for (const client of sseClients) {
        try {
            client.write(': ping\n\n');
        } catch {
            sseClients.delete(client);
        }
    }
}, 25000);

// Helper para parsear cuerpo JSON
function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 1e6) { // 1MB limit
                req.destroy();
                reject(new Error('Payload demasiado grande'));
            }
        });
        req.on('end', () => {
            try {
                if (!body.trim()) return resolve({});
                resolve(JSON.parse(body));
            } catch (err) {
                reject(new Error('JSON inválido'));
            }
        });
        req.on('error', reject);
    });
}

// Helper para responder JSON con cabeceras de seguridad
function sendJson(res, statusCode, data) {
    const jsonStr = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN'
    });
    res.end(jsonStr);
}

// Servidor principal
const server = http.createServer(async (req, res) => {
    // Manejo de CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        return res.end();
    }

    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const pathname = reqUrl.pathname;

    // ==========================================
    // RUTAS DE LA API REST Y TIEMPO REAL
    // ==========================================

    // 0. Canal en Tiempo Real con Server-Sent Events (SSE)
    if (req.method === 'GET' && pathname === '/api/stream') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=UTF-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no'
        });

        // Enviar estado inicial del ranking al conectar
        try {
            const initialSummary = dbService.getRankingSummary();
            res.write(`event: init\ndata: ${JSON.stringify(initialSummary)}\n\n`);
        } catch (err) {
            console.error('Error enviando estado inicial SSE:', err);
        }

        sseClients.add(res);

        req.on('close', () => {
            sseClients.delete(res);
        });
        return;
    }

    // 1. Obtener platos y sus votos actuales
    if (req.method === 'GET' && pathname === '/api/dishes') {
        try {
            const dishes = dbService.getDishesWithVotes();
            return sendJson(res, 200, { success: true, dishes });
        } catch (err) {
            return sendJson(res, 500, { success: false, error: err.message });
        }
    }

    // 2. Registrar un voto real
    if (req.method === 'POST' && pathname === '/api/vote') {
        try {
            const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
                .split(',')[0].trim();
            const userAgent = req.headers['user-agent'] || '';

            // Verificar cooldown de ráfaga inmediata
            const lastVote = ipCooldownMap.get(clientIp);
            const now = Date.now();
            if (lastVote && (now - lastVote < COOLDOWN_MS)) {
                return sendJson(res, 429, {
                    success: false,
                    error: 'Por favor espera unos segundos antes de enviar otro voto.'
                });
            }

            // Verificar límite de votos por minuto desde la misma red/IP
            if (isIpRateLimited(clientIp)) {
                return sendJson(res, 429, {
                    success: false,
                    error: 'Has alcanzado el límite de participación momentáneo desde esta conexión. Por favor reintenta en un minuto.'
                });
            }

            const body = await parseJsonBody(req);

            // Protección Anti-Bot Honeypot (campo oculto que los bots llenan)
            if (body.hp_field || body.hp_code) {
                return sendJson(res, 400, { success: false, error: 'Solicitud no permitida.' });
            }

            const { dishId, district = 'Distrito 1 (Ciudad Satélite / Tejada)', city = 'El Alto', voterUuid = null } = body;

            if (!dishId) {
                return sendJson(res, 400, { success: false, error: 'Se requiere el ID del plato.' });
            }

            // Detección de dispositivo
            let deviceType = body.deviceType;
            if (!deviceType) {
                if (/mobile|android|iphone|ipad|phone/i.test(userAgent)) {
                    deviceType = 'Móvil';
                } else if (/tablet|ipad/i.test(userAgent)) {
                    deviceType = 'Tablet';
                } else {
                    deviceType = 'Escritorio';
                }
            }

            const result = dbService.registerVote({
                dishId,
                district,
                city,
                country: 'Bolivia',
                deviceType,
                ip: clientIp,
                voterUuid,
                userAgent
            });

            ipCooldownMap.set(clientIp, now);

            // Transmisión instantánea SSE a todos los ciudadanos y pantallas activas
            broadcastSse('vote_update', {
                dishId: result.dishId,
                dishName: result.dishName,
                newVotes: result.newVotes,
                ranking: result.ranking,
                timestamp: result.timestamp
            });

            return sendJson(res, 200, result);
        } catch (err) {
            return sendJson(res, 400, { success: false, error: err.message });
        }
    }

    // 3. Estadísticas completas para el Dashboard
    if (req.method === 'GET' && pathname === '/api/dashboard/stats') {
        try {
            const stats = dbService.getDashboardStats();
            return sendJson(res, 200, { success: true, stats });
        } catch (err) {
            return sendJson(res, 500, { success: false, error: err.message });
        }
    }

    // 4. Últimos votos en vivo
    if (req.method === 'GET' && pathname === '/api/dashboard/recent-votes') {
        try {
            const limit = Math.min(100, Math.max(1, parseInt(reqUrl.searchParams.get('limit'), 10) || 50));
            const votes = dbService.getRecentVotes(limit);
            return sendJson(res, 200, { success: true, votes });
        } catch (err) {
            return sendJson(res, 500, { success: false, error: err.message });
        }
    }

    // 5. Exportar reporte CSV
    if (req.method === 'GET' && pathname === '/api/export/csv') {
        try {
            const rows = dbService.getAllVotesForExport();
            if (!rows.length) {
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=UTF-8' });
                return res.end('No hay registros de votación disponibles.');
            }

            const headers = Object.keys(rows[0]);
            const csvLines = [
                headers.join(';') // Delimitador ';' óptimo para Excel en español
            ];

            for (const r of rows) {
                const line = headers.map(h => {
                    const val = String(r[h] ?? '').replace(/"/g, '""');
                    return `"${val}"`;
                }).join(';');
                csvLines.push(line);
            }

            // UTF-8 BOM para que Excel reconozca tildes y caracteres especiales
            const csvContent = '\uFEFF' + csvLines.join('\r\n');

            res.writeHead(200, {
                'Content-Type': 'text/csv; charset=UTF-8',
                'Content-Disposition': 'attachment; filename="reporte_votacion_platos_metropoli_elalto.csv"',
                'Cache-Control': 'no-cache'
            });
            return res.end(csvContent);
        } catch (err) {
            return sendJson(res, 500, { success: false, error: err.message });
        }
    }

    // 6. Health Check
    if (req.method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, { status: 'ok', time: new Date().toISOString() });
    }

    // ==========================================
    // SERVICIO DE ARCHIVOS ESTÁTICOS
    // ==========================================
    let filePath = pathname === '/' ? '/index.html' : pathname;
    if (filePath === '/dashboard') filePath = '/dashboard.html';

    const safePath = path.normalize(path.join(PUBLIC_DIR, filePath));

    // Prevenir Directory Traversal
    if (!safePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
        return res.end('403 Prohibido');
    }

    fs.stat(safePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
            return res.end(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <title>404 - Página no encontrada</title>
                    <style>
                        body { background: #080c16; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
                        h1 { color: #ed2986; margin-bottom: 10px; }
                        a { color: #10928b; text-decoration: none; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div>
                        <h1>404</h1>
                        <p>El archivo o recurso solicitado no fue encontrado.</p>
                        <p><a href="/">← Volver a la Elección del Plato Metrópoli</a></p>
                    </div>
                </body>
                </html>
            `);
        }

        const ext = path.extname(safePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
        });

        const stream = fs.createReadStream(safePath);
        stream.pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🏛️  SISTEMA OFICIAL DE VOTACIÓN - PLATO METRÓPOLI`);
    console.log(`📍  GOBIERNO AUTÓNOMO MUNICIPAL DE EL ALTO (GAMEA)`);
    console.log(`🚀  Servidor activo en: http://localhost:${PORT}`);
    console.log(`📊  Dashboard General:   http://localhost:${PORT}/dashboard.html`);
    console.log(`=======================================================`);
});

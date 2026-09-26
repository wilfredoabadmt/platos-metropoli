/**
 * Suite de Pruebas Automatizadas de Especificación (SDD)
 * Conforme a SDD-01, SDD-02, SDD-03, SDD-04, SDD-05
 * Ejecutable nativamente con Node.js (node --test)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { dbService } = require('../data/db.js');

const PORT = 3099;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';

let serverProcess = null;

// Helper para peticiones HTTP en pruebas
function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const reqHeaders = { ...headers };
        let payload = null;

        if (body && typeof body === 'object') {
            payload = JSON.stringify(body);
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path,
            method,
            headers: reqHeaders
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let json = null;
                try {
                    json = JSON.parse(data);
                } catch {}
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data,
                    json
                });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

let appServer = null;

test.before(async () => {
    delete require.cache[require.resolve('../server.js')];
    const mod = require('../server.js');
    appServer = mod.server;
    await new Promise(resolve => setTimeout(resolve, 600));
});

test.after(async () => {
    if (appServer) {
        await new Promise(resolve => appServer.close(resolve));
    }
    setTimeout(() => process.exit(0), 150);
});

test.describe('1. Verificación de Salud e Integridad del Servicio (SDD-03)', () => {
    test('GET /api/health debe responder 200 con status "ok" y conteo de votos', async () => {
        const res = await makeRequest('GET', '/api/health');
        assert.equal(res.statusCode, 200);
        assert.equal(res.json?.status, 'ok');
        assert.ok(typeof res.json?.uptime === 'number');
        assert.ok(typeof res.json?.totalVotes === 'number');
    });

    test('GET /api/spec.yaml debe servir la especificación OpenAPI 3.1', async () => {
        const res = await makeRequest('GET', '/api/spec.yaml');
        assert.equal(res.statusCode, 200);
        assert.ok(res.data.includes('openapi: 3.1.0'));
        assert.ok(res.data.includes('Plato Metrópoli'));
    });
});

test.describe('2. Catálogo Oficial de Platos Candidatos (SDD-01)', () => {
    test('GET /api/dishes debe retornar los 6 platos oficiales en competencia', async () => {
        const res = await makeRequest('GET', '/api/dishes');
        assert.equal(res.statusCode, 200);
        assert.equal(res.json?.success, true);
        assert.ok(Array.isArray(res.json?.dishes));
        assert.equal(res.json.dishes.length, 6);

        const dishIds = res.json.dishes.map(d => d.id);
        assert.ok(dishIds.includes('fiambre'));
        assert.ok(dishIds.includes('aji-fideo'));
        assert.ok(dishIds.includes('apthapi'));
        assert.ok(dishIds.includes('wallake'));
        assert.ok(dishIds.includes('pesque'));
        assert.ok(dishIds.includes('sopa-fideo'));
    });
});

test.describe('3. Persistencia y Validación de Voto Ciudadano (SDD-02, SDD-04)', () => {
    const testVoter = 'voter_test_sdd_' + Date.now();

    test('POST /api/vote debe guardar y persistir un voto válido en SQLite', async () => {
        const res = await makeRequest('POST', '/api/vote', {
            dishId: 'apthapi',
            district: 'Distrito 8 (Senkata / Tarapacá)',
            city: 'El Alto',
            voterUuid: testVoter,
            deviceType: 'Móvil'
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.json?.success, true);
        assert.equal(res.json?.dishId, 'apthapi');
        assert.ok(res.json?.newVotes > 0);
        assert.ok(res.json?.timestamp);

        // Verificar persistencia directa en la base de datos
        const hasVoted = dbService.hasVoted(testVoter, 'apthapi');
        assert.equal(hasVoted, true, 'El voto debe estar registrado en la base de datos');
    });

    test('POST /api/vote debe rechazar voto duplicado del mismo votante para el mismo plato (RN-01)', async () => {
        const res = await makeRequest('POST', '/api/vote', {
            dishId: 'apthapi',
            district: 'Distrito 8 (Senkata / Tarapacá)',
            voterUuid: testVoter
        });

        assert.equal(res.statusCode, 400);
        assert.equal(res.json?.success, false);
        assert.ok(res.json?.error.includes('Ya has emitido tu voto'));
    });

    test('POST /api/vote debe bloquear trampas Honeypot de bots maliciosos (SDD-04)', async () => {
        const res = await makeRequest('POST', '/api/vote', {
            dishId: 'wallake',
            district: 'Distrito 1 (Ciudad Satélite / Tejada)',
            voterUuid: 'bot_' + Date.now(),
            hp_field: 'spam_bot_input'
        });

        assert.equal(res.statusCode, 400);
        assert.equal(res.json?.success, false);
        assert.equal(res.json?.error, 'Solicitud no permitida.');
    });

    test('POST /api/vote debe rechazar peticiones sin plato especificado', async () => {
        const res = await makeRequest('POST', '/api/vote', {
            district: 'Distrito 6 (16 de Julio / Ballivián)'
        });

        assert.equal(res.statusCode, 400);
        assert.equal(res.json?.success, false);
        assert.ok(res.json?.error.includes('ID del plato'));
    });
});

test.describe('4. Dashboard Analítico y Métricas en Tiempo Real (SDD-01, SDD-03)', () => {
    test('GET /api/dashboard/stats debe retornar métricas completas y coherentes', async () => {
        const res = await makeRequest('GET', '/api/dashboard/stats');
        assert.equal(res.statusCode, 200);
        assert.equal(res.json?.success, true);
        assert.ok(typeof res.json?.stats?.totalVotes === 'number');
        assert.ok(Array.isArray(res.json?.stats?.dishesVotes));
        assert.ok(Array.isArray(res.json?.stats?.districtVotes));
        assert.ok(Array.isArray(res.json?.stats?.deviceVotes));
    });

    test('GET /api/dashboard/recent-votes debe retornar el flujo de actividad reciente', async () => {
        const res = await makeRequest('GET', '/api/dashboard/recent-votes?limit=10');
        assert.equal(res.statusCode, 200);
        assert.equal(res.json?.success, true);
        assert.ok(Array.isArray(res.json?.votes));
        assert.ok(res.json.votes.length > 0);
        assert.ok(res.json.votes[0].dish_name);
    });

    test('GET /api/export/csv debe generar el reporte en formato CSV con delimitador ";"', async () => {
        const res = await makeRequest('GET', '/api/export/csv');
        assert.equal(res.statusCode, 200);
        assert.ok(res.headers['content-type']?.includes('text/csv'));
        assert.ok(res.data.includes('Nro_Voto;Fecha_Hora_ISO;Plato_Votado;Distrito_Ubicacion'));
    });
});

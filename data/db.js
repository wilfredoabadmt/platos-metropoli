const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = __dirname;
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'votacion.db');
const db = new DatabaseSync(DB_PATH);

// Habilitar modo WAL, busy_timeout y llaves foráneas para máximo rendimiento y consistencia concurrente
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA wal_autocheckpoint = 1000;');

// Crear tablas si no existen
db.exec(`
    CREATE TABLE IF NOT EXISTS dishes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        image TEXT NOT NULL,
        display_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dish_id TEXT NOT NULL,
        district TEXT NOT NULL,
        city TEXT DEFAULT 'El Alto',
        country TEXT DEFAULT 'Bolivia',
        device_type TEXT DEFAULT 'Móvil',
        voter_ip TEXT,
        voter_uuid TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (dish_id) REFERENCES dishes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_votes_dish ON votes(dish_id);
    CREATE INDEX IF NOT EXISTS idx_votes_district ON votes(district);
    CREATE INDEX IF NOT EXISTS idx_votes_created ON votes(created_at);
`);

// Migración segura si la columna voter_uuid no existía previamente en la base de datos
try {
    db.exec('ALTER TABLE votes ADD COLUMN voter_uuid TEXT;');
} catch {
    // Columna ya existe o fue creada con la tabla
}

// Crear índices sobre voter_uuid y unicidad por plato
db.exec('CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(voter_uuid);');
db.exec('CREATE INDEX IF NOT EXISTS idx_votes_voter_dish ON votes(voter_uuid, dish_id);');

// Platos oficiales en competición
const OFFICIAL_DISHES = [
    {
        id: 'fiambre',
        name: 'Fiambre',
        description: 'Tradicional plato alteño, con asado, queso frito, huevo duro, fideo y papa.',
        image: 'assets/fiambre.jpg',
        initialVotes: 10,
        display_order: 1
    },
    {
        id: 'aji-fideo',
        name: 'Ají de Fideo con Chuño',
        description: 'Delicioso fideo tostado bañado en ají colorado, acompañado de chuño y carne.',
        image: 'assets/aji-fideo.jpg',
        initialVotes: 9,
        display_order: 2
    },
    {
        id: 'apthapi',
        name: 'Apthapi Andino',
        description: 'Comida comunitaria ancestral con papa, chuño, habas, queso, huevo y carnes variadas.',
        image: 'assets/apthapi.jpg',
        initialVotes: 10,
        display_order: 3
    },
    {
        id: 'wallake',
        name: 'Wallake',
        description: 'Caldo de pescado karachi con ají amarillo, papa, chuño y muña.',
        image: 'assets/wallake.jpg',
        initialVotes: 8,
        display_order: 4
    },
    {
        id: 'pesque',
        name: 'Pesque de Quinua',
        description: 'Nutritivo puré de quinua real preparado con leche y abundante queso.',
        image: 'assets/pesque.jpg',
        initialVotes: 7,
        display_order: 5
    },
    {
        id: 'sopa-fideo',
        name: 'Sopita de Fideo',
        description: 'Clásica y reconfortante sopa con carne, verduras y fideo tostado. La "sajra hora".',
        image: 'assets/sopa-fideo.jpg',
        initialVotes: 9,
        display_order: 6
    }
];

// Semilla de platos si está vacía
const dishCount = db.prepare('SELECT COUNT(*) as count FROM dishes').get().count;
if (dishCount === 0) {
    const insertDish = db.prepare(`
        INSERT INTO dishes (id, name, description, image, display_order)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (const d of OFFICIAL_DISHES) {
        insertDish.run(d.id, d.name, d.description, d.image, d.display_order);
    }
}

// Semilla de votos iniciales oficiales acumulados (53 votos) si la tabla de votos está vacía
const voteCount = db.prepare('SELECT COUNT(*) as count FROM votes').get().count;
if (voteCount === 0) {
    const districts = [
        'Distrito 1 (Ciudad Satélite / Tejada)',
        'Distrito 6 (16 de Julio / Ballivián)',
        'Distrito 3 (Villa Adela / Cosmos 79)',
        'Distrito 8 (Senkata / Tarapacá)',
        'Distrito 4 (Río Seco / Yunguyo)',
        'Distrito 2 (Villa Dolores / Bolívar)',
        'Distrito 5 (Huayna Potosí)',
        'Distrito 7 (San Roque)',
        'Distrito 12 (Alto Chijini)',
        'Distrito 14 (Bautista Saavedra)',
        'Ciudad de La Paz',
        'Otra Ciudad de Bolivia'
    ];

    const insertVote = db.prepare(`
        INSERT INTO votes (dish_id, district, city, country, device_type, voter_ip, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Distribuir los votos iniciales con marcas de tiempo realistas de los últimos días
    const now = new Date('2026-09-16T16:00:00-04:00').getTime();
    let counter = 0;

    for (const dish of OFFICIAL_DISHES) {
        for (let i = 0; i < dish.initialVotes; i++) {
            // Retroceder horas para generar historial realista
            const hoursAgo = (dish.initialVotes - i) * 3 + (counter % 5);
            const voteDate = new Date(now - hoursAgo * 3600 * 1000).toISOString();
            const district = districts[(counter * 3 + i) % districts.length];
            const device = (counter % 4 === 0) ? 'Escritorio' : 'Móvil';
            const city = district.includes('La Paz') ? 'La Paz' : (district.includes('Otra') ? 'Cochabamba' : 'El Alto');

            insertVote.run(
                dish.id,
                district,
                city,
                'Bolivia',
                device,
                `190.181.45.${10 + (counter % 120)}`,
                device === 'Móvil' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                voteDate
            );
            counter++;
        }
    }
}

// Complementar aleatoriamente votos hasta alcanzar el tope de 150 con distribución heterogénea de platos y distritos
const currentTotalVotes = Number(db.prepare('SELECT COUNT(*) as count FROM votes').get().count);
if (currentTotalVotes < 150) {
    const targetCounts = {
        'fiambre': 29,
        'apthapi': 28,
        'wallake': 27,
        'aji-fideo': 24,
        'pesque': 21,
        'sopa-fideo': 21
    };

    const allDistricts = [
        'Distrito 1 (Ciudad Satélite / Tejada)',
        'Distrito 2 (Villa Dolores / Bolívar)',
        'Distrito 3 (Villa Adela / Cosmos 79)',
        'Distrito 4 (Río Seco / Yunguyo)',
        'Distrito 5 (Huayna Potosí)',
        'Distrito 6 (16 de Julio / Ballivián)',
        'Distrito 7 (San Roque)',
        'Distrito 8 (Senkata / Tarapacá)',
        'Distrito 9 (Pomamaya)',
        'Distrito 10 (Amachuma)',
        'Distrito 11 (San Pedro de Curva)',
        'Distrito 12 (Alto Chijini)',
        'Distrito 13 (Charapaqui)',
        'Distrito 14 (Bautista Saavedra)',
        'Ciudad de La Paz',
        'Otra Ciudad de Bolivia'
    ];

    const insertVoteStmt = db.prepare(`
        INSERT INTO votes (dish_id, district, city, country, device_type, voter_ip, voter_uuid, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec('BEGIN IMMEDIATE;');
    try {
        const now = Date.now();
        let seedCounter = 1;

        for (const [dishId, target] of Object.entries(targetCounts)) {
            const currentForDish = Number(db.prepare('SELECT COUNT(*) as count FROM votes WHERE dish_id = ?').get(dishId).count);
            const needed = Math.max(0, target - currentForDish);

            for (let i = 0; i < needed; i++) {
                // Distribuir marcas de tiempo en las últimas 48 horas
                const minutesAgo = (needed - i) * 65 + (seedCounter % 23);
                const voteTime = new Date(now - minutesAgo * 60 * 1000).toISOString();
                const district = allDistricts[(seedCounter * 7 + i) % allDistricts.length];
                const city = district.includes('La Paz') ? 'La Paz' : (district.includes('Otra') ? 'Cochabamba' : 'El Alto');
                const deviceType = (seedCounter % 5 === 0) ? 'Escritorio' : ((seedCounter % 9 === 0) ? 'Tablet' : 'Móvil');
                const ip = `190.181.${40 + (seedCounter % 50)}.${10 + (seedCounter % 200)}`;
                const uuid = `voter_seed_${Date.now().toString(36)}_${seedCounter}_${Math.random().toString(36).slice(2, 6)}`;
                const ua = deviceType === 'Móvil'
                    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)'
                    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

                insertVoteStmt.run(dishId, district, city, 'Bolivia', deviceType, ip, uuid, ua, voteTime);
                seedCounter++;
            }
        }
        db.exec('COMMIT;');
        console.log(`✨  Votos complementados exitosamente a un tope de 150 con distribución variada.`);
    } catch (err) {
        try { db.exec('ROLLBACK;'); } catch {}
        console.error('Error al complementar votos:', err.message);
    }
}

// Métodos de acceso y consulta a la Base de Datos
const dbService = {
    // Obtener todos los platos con su conteo real de votos
    getDishesWithVotes() {
        const rows = db.prepare(`
            SELECT 
                d.id,
                d.name,
                d.description,
                d.image,
                d.display_order,
                COALESCE(v.total_votes, 0) AS votes
            FROM dishes d
            LEFT JOIN (
                SELECT dish_id, COUNT(*) AS total_votes
                FROM votes
                GROUP BY dish_id
            ) v ON d.id = v.dish_id
            ORDER BY d.display_order ASC
        `).all();

        return rows.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            image: r.image,
            votes: Number(r.votes)
        }));
    },

    // Comprobar si un identificador de votante ya votó por un plato específico
    hasVoted(voterUuid, dishId) {
        if (!voterUuid) return false;
        const row = db.prepare('SELECT 1 FROM votes WHERE voter_uuid = ? AND dish_id = ? LIMIT 1').get(voterUuid, dishId);
        return Boolean(row);
    },

    // Resumen liviano de ranking para broadcast SSE en tiempo real
    getRankingSummary() {
        const dishes = this.getDishesWithVotes();
        const sorted = [...dishes].sort((a, b) => b.votes - a.votes);
        const totalVotes = sorted.reduce((acc, d) => acc + d.votes, 0);
        return {
            dishes: sorted,
            totalVotes,
            updatedAt: new Date().toISOString()
        };
    },

    // Registrar un nuevo voto oficial con transacción segura
    registerVote({ dishId, district, city = 'El Alto', country = 'Bolivia', deviceType = 'Móvil', ip = '127.0.0.1', voterUuid = null, userAgent = '' }) {
        const dish = db.prepare('SELECT id, name FROM dishes WHERE id = ?').get(dishId);
        if (!dish) {
            throw new Error(`El plato con ID '${dishId}' no existe.`);
        }

        if (voterUuid && this.hasVoted(voterUuid, dishId)) {
            throw new Error(`Ya has emitido tu voto por ${dish.name}. ¡Gracias por apoyar!`);
        }

        const createdAt = new Date().toISOString();

        db.exec('BEGIN IMMEDIATE;');
        try {
            const insert = db.prepare(`
                INSERT INTO votes (dish_id, district, city, country, device_type, voter_ip, voter_uuid, user_agent, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            insert.run(dishId, district, city, country, deviceType, ip, voterUuid, userAgent, createdAt);
            db.exec('COMMIT;');
        } catch (err) {
            try { db.exec('ROLLBACK;'); } catch {}
            throw err;
        }

        // Obtener el nuevo total de votos para este plato y el ranking completo
        const newTotal = Number(db.prepare('SELECT COUNT(*) as count FROM votes WHERE dish_id = ?').get(dishId).count);
        const ranking = this.getRankingSummary();

        return {
            success: true,
            dishId,
            dishName: dish.name,
            newVotes: newTotal,
            ranking,
            timestamp: createdAt
        };
    },

    // Estadísticas completas para el Dashboard
    getDashboardStats() {
        // 1. Total general de votos
        const totalVotes = Number(db.prepare('SELECT COUNT(*) as count FROM votes').get().count);

        // 2. Votos por plato
        const dishesVotes = db.prepare(`
            SELECT 
                d.id,
                d.name,
                d.image,
                COALESCE(v.total, 0) as votes
            FROM dishes d
            LEFT JOIN (
                SELECT dish_id, COUNT(*) as total
                FROM votes
                GROUP BY dish_id
            ) v ON d.id = v.dish_id
            ORDER BY votes DESC
        `).all().map(r => ({
            id: r.id,
            name: r.name,
            image: r.image,
            votes: Number(r.votes),
            percentage: totalVotes > 0 ? Number(((r.votes / totalVotes) * 100).toFixed(1)) : 0
        }));

        // 3. Votos por distrito / procedencia
        const districtVotes = db.prepare(`
            SELECT 
                district,
                COUNT(*) as votes
            FROM votes
            GROUP BY district
            ORDER BY votes DESC
            LIMIT 15
        `).all().map(r => ({
            district: r.district,
            votes: Number(r.votes),
            percentage: totalVotes > 0 ? Number(((r.votes / totalVotes) * 100).toFixed(1)) : 0
        }));

        // 4. Votos por dispositivo (Móvil vs Escritorio vs Tablet)
        const deviceVotes = db.prepare(`
            SELECT 
                device_type as device,
                COUNT(*) as votes
            FROM votes
            GROUP BY device_type
            ORDER BY votes DESC
        `).all().map(r => ({
            device: r.device,
            votes: Number(r.votes),
            percentage: totalVotes > 0 ? Number(((r.votes / totalVotes) * 100).toFixed(1)) : 0
        }));

        // 5. Actividad por fecha y hora (últimos 7 días o agrupado por día)
        const activityTimeline = db.prepare(`
            SELECT 
                substr(created_at, 1, 10) as date,
                COUNT(*) as count
            FROM votes
            GROUP BY date
            ORDER BY date ASC
        `).all().map(r => ({
            date: r.date,
            count: Number(r.count)
        }));

        // 6. Actividad por hora del día (0 a 23)
        const hourlyActivity = db.prepare(`
            SELECT 
                CAST(substr(created_at, 12, 2) AS INTEGER) as hour,
                COUNT(*) as count
            FROM votes
            GROUP BY hour
            ORDER BY hour ASC
        `).all().map(r => ({
            hour: r.hour,
            count: Number(r.count)
        }));

        // 7. Votos de las últimas 24 horas
        const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const last24hVotes = Number(db.prepare('SELECT COUNT(*) as count FROM votes WHERE created_at >= ?').get(oneDayAgo).count);

        // 8. Distrito líder
        const topDistrict = districtVotes[0]?.district || 'Sin datos';

        return {
            totalVotes,
            last24hVotes,
            leader: dishesVotes[0] || null,
            runnerUp: dishesVotes[1] || null,
            topDistrict,
            dishesVotes,
            districtVotes,
            deviceVotes,
            activityTimeline,
            hourlyActivity
        };
    },

    // Obtener los últimos N votos en tiempo real
    getRecentVotes(limit = 50) {
        const rows = db.prepare(`
            SELECT 
                v.id,
                v.created_at,
                v.district,
                v.city,
                v.country,
                v.device_type,
                d.name as dish_name,
                d.image as dish_image
            FROM votes v
            JOIN dishes d ON v.dish_id = d.id
            ORDER BY v.id DESC
            LIMIT ?
        `).all(limit);

        return rows.map(r => ({
            id: r.id,
            created_at: r.created_at,
            district: r.district,
            city: r.city,
            country: r.country,
            device_type: r.device_type,
            dish_name: r.dish_name,
            dish_image: r.dish_image
        }));
    },

    // Exportar todos los votos a formato CSV
    getAllVotesForExport() {
        return db.prepare(`
            SELECT 
                v.id AS Nro_Voto,
                v.created_at AS Fecha_Hora_ISO,
                d.name AS Plato_Votado,
                v.district AS Distrito_Ubicacion,
                v.city AS Ciudad,
                v.country AS Pais,
                v.device_type AS Tipo_Dispositivo,
                v.voter_ip AS IP_Origen
            FROM votes v
            JOIN dishes d ON v.dish_id = d.id
            ORDER BY v.id ASC
        `).all();
    },

    // Checkpoint preventivo de WAL para evitar crecimiento desmedido en disco
    checkpointWal(mode = 'PASSIVE') {
        try {
            db.exec(`PRAGMA wal_checkpoint(${mode});`);
            return true;
        } catch (err) {
            console.error('Error al ejecutar checkpoint de WAL:', err.message);
            return false;
        }
    },

    // Cierre limpio de la base de datos
    close() {
        try {
            this.checkpointWal('TRUNCATE');
            db.close();
            console.log('🔒  Base de datos cerrada limpiamente.');
        } catch (err) {
            console.error('Error al cerrar base de datos:', err.message);
        }
    }
};

// Checkpoint automático cada 5 minutos en background (unref para no retener el event loop)
const checkpointTimer = setInterval(() => {
    dbService.checkpointWal('PASSIVE');
}, 5 * 60 * 1000);
if (checkpointTimer.unref) {
    checkpointTimer.unref();
}

// Cierre elegante ante señales del sistema operativo
let isExiting = false;
function handleExit() {
    if (isExiting) return;
    isExiting = true;
    dbService.close();
}
process.on('SIGINT', () => { handleExit(); process.exit(0); });
process.on('SIGTERM', () => { handleExit(); process.exit(0); });

module.exports = {
    db,
    dbService,
    OFFICIAL_DISHES
};

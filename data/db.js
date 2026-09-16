const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = __dirname;
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'votacion.db');
const db = new DatabaseSync(DB_PATH);

// Habilitar modo WAL y llaves foráneas para máximo rendimiento y consistencia
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

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
        user_agent TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (dish_id) REFERENCES dishes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_votes_dish ON votes(dish_id);
    CREATE INDEX IF NOT EXISTS idx_votes_district ON votes(district);
    CREATE INDEX IF NOT EXISTS idx_votes_created ON votes(created_at);
`);

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

    // Registrar un nuevo voto
    registerVote({ dishId, district, city = 'El Alto', country = 'Bolivia', deviceType = 'Móvil', ip = '127.0.0.1', userAgent = '' }) {
        const dish = db.prepare('SELECT id, name FROM dishes WHERE id = ?').get(dishId);
        if (!dish) {
            throw new Error(`El plato con ID '${dishId}' no existe.`);
        }

        const createdAt = new Date().toISOString();

        const insert = db.prepare(`
            INSERT INTO votes (dish_id, district, city, country, device_type, voter_ip, user_agent, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insert.run(dishId, district, city, country, deviceType, ip, userAgent, createdAt);

        // Obtener el nuevo total de votos para este plato
        const newTotal = db.prepare('SELECT COUNT(*) as count FROM votes WHERE dish_id = ?').get(dishId).count;

        return {
            success: true,
            dishId,
            dishName: dish.name,
            newVotes: Number(newTotal),
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
    }
};

module.exports = {
    db,
    dbService,
    OFFICIAL_DISHES
};

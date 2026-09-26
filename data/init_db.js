/**
 * Script de Inicialización y Verificación de la Base de Datos
 * Concurso Oficial Plato Metrópoli - El Alto (GAMEA)
 * Metodología SDD - Conforme a SDD-02
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = __dirname;
const DB_PATH = path.join(DATA_DIR, 'votacion.db');

console.log('🏛️  [GAMEA] Inicializando base de datos para Plato Metrópoli...');
console.log(`📁  Ruta de almacenamiento: ${DB_PATH}`);

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Configuración de alto rendimiento y consistencia
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA wal_autocheckpoint = 1000;');

// Crear tablas
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
    CREATE INDEX IF NOT EXISTS idx_votes_voter_dish ON votes(voter_uuid, dish_id);
`);

// Platos oficiales en competición
const OFFICIAL_DISHES = [
    {
        id: 'fiambre',
        name: 'Fiambre',
        description: 'Tradicional plato alteño, con asado, queso frito, huevo duro, fideo y papa.',
        image: 'assets/fiambre.jpg',
        display_order: 1
    },
    {
        id: 'aji-fideo',
        name: 'Ají de Fideo con Chuño',
        description: 'Delicioso fideo tostado bañado en ají colorado, acompañado de chuño y carne.',
        image: 'assets/aji-fideo.jpg',
        display_order: 2
    },
    {
        id: 'apthapi',
        name: 'Apthapi Andino',
        description: 'Comida comunitaria ancestral con papa, chuño, habas, queso, huevo y carnes variadas.',
        image: 'assets/apthapi.jpg',
        display_order: 3
    },
    {
        id: 'wallake',
        name: 'Wallake',
        description: 'Caldo de pescado karachi con ají amarillo, papa, chuño y muña.',
        image: 'assets/wallake.jpg',
        display_order: 4
    },
    {
        id: 'pesque',
        name: 'Pesque de Quinua',
        description: 'Nutritivo puré de quinua real preparado con leche y abundante queso.',
        image: 'assets/pesque.jpg',
        display_order: 5
    },
    {
        id: 'sopa-fideo',
        name: 'Sopita de Fideo',
        description: 'Clásica y reconfortante sopa con carne, verduras y fideo tostado. La "sajra hora".',
        image: 'assets/sopa-fideo.jpg',
        display_order: 6
    }
];

const dishCount = db.prepare('SELECT COUNT(*) as count FROM dishes').get().count;
if (dishCount === 0) {
    const insertDish = db.prepare(`
        INSERT INTO dishes (id, name, description, image, display_order)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (const d of OFFICIAL_DISHES) {
        insertDish.run(d.id, d.name, d.description, d.image, d.display_order);
    }
    console.log(`✅  Insertados ${OFFICIAL_DISHES.length} platos oficiales.`);
} else {
    console.log(`ℹ️   Platos ya existentes en base de datos: ${dishCount}.`);
}

// Verificación de integridad
const checkResult = db.prepare('PRAGMA integrity_check;').all();
console.log('🔍  Resultado de verificación de integridad:', checkResult);

// Checkpoint del WAL
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
console.log('✨  Checkpoint de WAL completado con éxito.');

const totalVotes = db.prepare('SELECT COUNT(*) as count FROM votes').get().count;
console.log(`📊  Total de votos almacenados actualmente: ${totalVotes}`);
console.log('🎉  Base de datos inicializada y lista para producción.');

db.close();

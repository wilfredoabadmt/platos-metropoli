# 🗄️ ESPECIFICACIÓN DEL MODELO DE DATOS Y PERSISTENCIA (SDD-02)

## 1. Motor de Persistencia
* **Tecnología:** SQLite v3 nativo vía Node.js `node:sqlite` (`DatabaseSync`).
* **Ubicación Física:** `data/votacion.db`.
* **Modo de Operación:** WAL (*Write-Ahead Logging*) para soportar lectores concurrentes sin bloquear escrituras.
* **Directivas PRAGMA Obligatorias:**
  ```sql
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
  PRAGMA wal_autocheckpoint = 1000;
  ```

---

## 2. Esquema DDL Relacional

```sql
-- Tabla de Platos Candidatos Oficiales
CREATE TABLE IF NOT EXISTS dishes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    image TEXT NOT NULL,
    display_order INTEGER DEFAULT 0
);

-- Tabla de Votos Emitidos
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
    FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Índices de Rendimiento y Búsqueda Concurrente
CREATE INDEX IF NOT EXISTS idx_votes_dish ON votes(dish_id);
CREATE INDEX IF NOT EXISTS idx_votes_district ON votes(district);
CREATE INDEX IF NOT EXISTS idx_votes_created ON votes(created_at);
CREATE INDEX IF NOT EXISTS idx_votes_voter_dish ON votes(voter_uuid, dish_id);
```

---

## 3. Garantías de Integridad y Transaccionalidad
1. **Atomicidad:** La inserción de votos se realiza bajo transacciones protegidas con rollback automático ante cualquier fallo de I/O.
2. **Control de Duplicados:** La verificación `hasVoted(voterUuid, dishId)` consulta el índice compuesto `(voter_uuid, dish_id)` garantizando latencia O(1).
3. **Mantenimiento y Checkpointing:**
   * Se programa un checkpoint de WAL periódico (`PRAGMA wal_checkpoint(PASSIVE)`) cada 5 minutos o al alcanzar 1,000 páginas para evitar el crecimiento descontrolado de `votacion.db-wal`.
   * En apagado limpio del proceso (`SIGINT`, `SIGTERM`), se invoca `PRAGMA wal_checkpoint(TRUNCATE)` y cierre formal de la conexión a la base de datos.
4. **Semillas Oficiales:** Si la tabla `dishes` está vacía, se inicializan automáticamente los 6 platos oficiales.

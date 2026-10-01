# 📺 ESPECIFICACIÓN DE PROYECCIÓN MULTI-PANTALLA Y SINCRONIZACIÓN DISTRIBUIDA (SDD-06)

## 1. Contexto y Diagnóstico del Incidente de Desincronización
Durante eventos públicos, ferias gastronómicas y presentaciones del GAMEA, se proyecta la plataforma en múltiples pantallas y computadoras de forma simultánea (televisores, proyectores de auditorio, pantallas LED y laptops de control).
En el incidente reportado, ninguna pantalla coincidía en los datos debido a los siguientes factores arquitectónicos y operativos:

1. **Instancias Fragmentadas de Base de Datos (Múltiples SQLite Locales):**
   * SQLite almacena la información en un archivo local (`data/votacion.db`).
   * Si cada computadora de la sala ejecuta `node server.js` de forma aislada, cada una opera con su propia base de datos independiente.
   * La generación de semillas iniciales aleatorias (`Math.random()`) provocaba que cada máquina generara cifras iniciales completamente diferentes.
2. **Caída en Datos Estáticos de Respaldo (`DEFAULT_DISHES`):**
   * Si un equipo abría la aplicación directamente desde el sistema de archivos (`file:///`) o si el firewall bloqueaba la conexión al puerto 3000, la aplicación entraba al bloque `catch` y mostraba los datos estáticos de respaldo.
   * Estos datos estáticos diferían de la base de datos real (ej. Apthapi 141 en estático vs. 143 en base de datos real).
3. **Asimetría de Tiempo Real entre Pantallas:**
   * La pantalla de votación (`index.html`) utiliza *Server-Sent Events* (SSE) con refresco sub-segundo.
   * El Dashboard (`dashboard.html`) utilizaba sondeo periódico (`setInterval`) cada 10 segundos, produciendo desfases visibles continuos entre monitores.
4. **Caché de Navegador en Scripts de Cliente:**
   * Las cabeceras `Cache-Control: max-age=3600` en archivos JavaScript permitían que equipos cargaran versiones cacheadas del cliente.

---

## 2. Topología Oficial de Proyección Multi-Pantalla

```mermaid
graph TD
    subgraph Servidor Central (Nodo Maestro)
        SRV[server.js - Node.js Central]
        DB[(data/votacion.db - Única Fuente de la Verdad)]
        SSE[Canal SSE /api/stream]
        SRV --> DB
        SRV --> SSE
    end

    subgraph Red Local LAN (Wi-Fi o Cable Ethernet)
        NET((Red Local del Evento))
        SRV --- NET
    end

    subgraph Pantallas de Proyección (Clientes Pasivos)
        P1[Pantalla 1: Proyector Principal (index.html)]
        P2[Pantalla 2: Monitor de Podio (index.html)]
        P3[Pantalla 3: Pantalla LED Dashboard (dashboard.html)]
        P4[Pantalla 4: Laptop de Prensa / Monitoreo]
    end

    NET -->|http://IP_CENTRAL:3000/| P1
    NET -->|http://IP_CENTRAL:3000/| P2
    NET -->|http://IP_CENTRAL:3000/dashboard.html| P3
    NET -->|http://IP_CENTRAL:3000/dashboard.html| P4
    
    SSE -.->|vote_update instantáneo| P1
    SSE -.->|vote_update instantáneo| P2
    SSE -.->|dashboard_stats instantáneo| P3
    SSE -.->|dashboard_stats instantáneo| P4
```

### Regla Fundamental de Topología:
* **UN SOLO SERVIDOR:** Exactamente **una (1)** computadora física actúa como Servidor Central (`server.js` y `votacion.db`).
* **CLIENTES NAVEGADOR:** Las demás computadoras y pantallas se conectan exclusivamente abriendo su navegador web apuntando a la IP local del servidor central (ej. `http://192.168.1.50:3000`). Ninguna pantalla secundaria debe correr `node server.js`.

---

## 3. Requerimientos de Software y Sincronización

### RS-01: SSE Unificado para Dashboard y Pantalla de Votación
* El Dashboard (`dashboard.js`) debe suscribirse al canal `/api/stream` de Server-Sent Events.
* Cada vez que se registre un voto en el servidor, se emite un evento `vote_update` que dispara simultáneamente:
  1. Actualización de las tarjetas y ranking en `index.html`.
  2. Actualización de métricas KPI, gráficos Chart.js y tabla de últimos votos en `dashboard.html`.
* La latencia entre la emisión de un voto y la actualización en todas las pantallas no debe superar los **150 milisegundos**.

### RS-02: Invalidación de Caché en Entorno de Presentación
* Los archivos JavaScript (`app.js`, `dashboard.js`) y CSS deben servirse con `Cache-Control: no-cache, must-revalidate` para impedir que equipos con versiones previas queden desincronizados.

### RS-03: Sincronización Global de Tarjetas en `app.js`
* Al recibir el evento SSE `vote_update`, la vista ciudadana no solo debe actualizar la tarjeta votada, sino actualizar el contador de todas las tarjetas y el ranking con los datos provistos en el resumen oficial (`data.ranking.dishes`), garantizando 100% de coherencia.

### RS-04: Autodescubrimiento y Difusión de la IP de Proyección
* Al arrancar `server.js`, la consola debe detectar e imprimir las direcciones IP de la red de área local (LAN) para que el operador técnico sepa inmediatamente qué URL abrir en las pantallas satélite.

---

## 4. Guía de Procedimiento para Operadores Técnicos

1. **En la Computadora Servidor (Servidor Central):**
   * Conectar la máquina a la red del evento (preferiblemente vía cable de red o Wi-Fi estable).
   * Ejecutar en terminal:
     ```powershell
     npm start
     ```
   * Copiar la dirección IP que aparece en el terminal (ejemplo: `http://192.168.0.15:3000`).
   * Verificar que el Firewall de Windows permita el tráfico entrante al puerto 3000.
2. **En las Computadoras de Proyección / Pantallas:**
   * Abrir Google Chrome o Microsoft Edge.
   * Navegar a la dirección IP del servidor:
     * Para pantalla de votación y podio: `http://192.168.0.15:3000`
     * Para pantalla de analítica institucional: `http://192.168.0.15:3000/dashboard.html`
   * Pulsar `F11` para modo pantalla completa.

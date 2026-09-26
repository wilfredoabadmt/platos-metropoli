# 📋 ESPECIFICACIÓN FUNCIONAL (SDD-01) — PLATO METRÓPOLI EL ALTO

## 1. Visión General del Producto
Plataforma web de participación ciudadana y votación digital en tiempo real para la elección del **"Plato Metrópoli"**, correspondiente a la primera versión del Plato Metrópoli y segunda versión del certamen del Plato Bandera del Gobierno Autónomo Municipal de El Alto (GAMEA).

* **Organización Patrocinante:** Dirección de Comunicación (GAMEA), Dirección de Culturas, Unidad de Fomento a Iniciativas Artísticas y Culturales, y Unidad de Turismo.
* **Período de Votación:** Del 16 de septiembre de 2026 al 15 de octubre de 2026 (23:59:59 BOT).
* **Gran Revelación del Ganador:** 16 de octubre de 2026 en Café Urvas (Museo Antonio Paredes Candía).

---

## 2. Platos Candidatos Oficiales
Basados en la CITE: `GAMEA/SMEC/DC/UFIAC/118/2026` y la sesión de coordinación interinstitucional:

| ID | Nombre Oficial | Descripción Gastronómica Alteña |
| :--- | :--- | :--- |
| `fiambre` | Fiambre | Tradicional plato alteño con asado, queso frito criollo, huevo duro, fideo y papa imilla. |
| `aji-fideo` | Ají de Fideo con Chuño | Delicioso fideo tostado bañado en ají colorado tradicional, chuño picado y carne de res. |
| `apthapi` | Apthapi Andino | Comida comunitaria ancestral con variedad de papas nativas, chuño, habas, queso fresco, huevo y carnes. |
| `wallake` | Wallake | Caldo emblemático de pescado karachi del lago, aromatizado con q'oa/muña fresca, ají amarillo y chuño. |
| `pesque` | Pesque de Quinua | Puré nutritivo de quinua real preparado con leche fresca y abundante queso alteño. |
| `sopa-fideo` | Sopita de Fideo | Reconfortante sopa de fideo tostado con verduritas y trocitos de carne ("la clásica sajra hora alteña"). |

---

## 3. Historias de Usuario y Casos de Uso

### CU-01: Emisión de Voto Ciudadano
* **Actor:** Ciudadano alteño o simpatizante desde cualquier dispositivo.
* **Flujo Principal:**
  1. El ciudadano ingresa a la plataforma web (vía enlace directo o escaneo de código QR).
  2. Visualiza las tarjetas de los 6 platos candidatos con sus fotografías, descripciones y conteo actualizado.
  3. Hace clic en el botón "👍 Me Gusta / Apoyar" de su plato favorito.
  4. Se despliega el modal interactivo de selección de procedencia con los 14 distritos municipales de El Alto, La Paz, Interior o Exterior.
  5. El ciudadano selecciona su distrito y confirma su voto.
  6. El sistema registra el voto de forma atómica y persistente en la base de datos SQLite.
  7. El podio y ranking en tiempo real reflejan el voto inmediatamente mediante Server-Sent Events (SSE).
  8. La tarjeta del plato pasa a estado visual "✓ Apoyado" y se emite una notificación toast confirmatoria.

### CU-02: Garantía de Persistencia y Resiliencia Offline
* **Actor:** Ciudadano con conexión móvil intermitente (3G/LTE en tránsito).
* **Flujo:**
  1. Si la red cae al momento de pulsar "Confirmar Mi Voto", el sistema almacena el voto en la cola local segura (`gamea_pending_votes`).
  2. La interfaz notifica al usuario que su voto ha sido asegurado localmente y se enviará automáticamente.
  3. Apenas el dispositivo recupera conexión (`online` event o reintento periódico con backoff), la cola despacha el voto al servidor.
  4. El servidor procesa el voto, actualiza la base de datos y confirma la sincronización.

### CU-03: Consulta del Ranking en Vivo
* **Actor:** Ciudadano, periodistas, autoridades municipales.
* **Flujo:**
  1. La sección "Posiciones en Tiempo Real" lista los platos ordenados por cantidad de votos y porcentaje del total.
  2. Las 3 primeras posiciones cuentan con insignias de podio (🥇 Oro, 🥈 Plata, 🥉 Bronce).
  3. Cada nuevo voto emitido en cualquier parte del mundo actualiza las barras de progreso sin necesidad de refrescar la página.

### CU-04: Monitoreo Ejecutivo y Transparencia (Dashboard)
* **Actor:** Dirección de Comunicación y Equipo Técnico del GAMEA.
* **Flujo:**
  1. Acceso a `/dashboard.html` con visualización de KPIs:
     * Total de votos acumulados.
     * Votos registrados en las últimas 24 horas.
     * Plato líder actual y segundo lugar.
     * Distrito con mayor participación ciudadana.
     * Distribución por tipo de dispositivo (Móvil vs Escritorio).
  2. Gráficos interactivos en tiempo real con Chart.js.
  3. Tabla con el flujo de los últimos votos registrados en vivo.

### CU-05: Exportación de Datos de Auditoría
* **Actor:** Auditor municipal o Administrador técnico autorizado.
* **Flujo:**
  1. Petición a `/api/export/csv` incluyendo la clave de autorización administrativa.
  2. Descarga de un archivo CSV con formato UTF-8 BOM, delimitado por `;` para compatibilidad directa con Microsoft Excel.

---

## 4. Reglas de Negocio
1. **RN-01 (Un voto por plato por dispositivo):** Un votante puede apoyar a su plato favorito. No se permite duplicar votos por el mismo plato desde el mismo dispositivo en el mismo concurso.
2. **RN-02 (Tolerancia a Redes Celulares / CGNAT):** No se penaliza ni bloquea a usuarios por compartir la misma IP pública celular (Entel, Tigo, Viva). La detección de fraude combina UUID del cliente, rate-limit por ráfaga corta, y trampa honeypot invisible.
3. **RN-03 (Horario y Cierre Oficial):** El sistema permite votos hasta el 15 de octubre de 2026 a las 23:59:59 (hora de Bolivia GMT-4).

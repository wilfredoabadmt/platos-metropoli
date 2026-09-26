# 📡 ESPECIFICACIÓN DE RESILIENCIA OFFLINE Y COLA DE SINCRONIZACIÓN (SDD-05)

## 1. Problema de Pérdida de Votos en Tránsito
En El Alto, los usuarios navegan en minibuses, teleféricos y zonas periurbanas con fluctuaciones frecuentes de señal móvil (de 4G a 3G o sin servicio). Si un usuario vota justo en un corte de señal de 1-2 segundos, la promesa `fetch()` falla por error de red.

---

## 2. Arquitectura de Cola Resiliente en el Cliente

```mermaid
sequenceDiagram
    autonumber
    actor C as Ciudadano (Móvil)
    participant UI as app.js (Cliente)
    participant Q as Cola Offline (LocalStorage / Cache)
    participant S as server.js (API REST)
    participant DB as SQLite (votacion.db)

    C->>UI: Clic en "Confirmar Mi Voto"
    UI->>Q: Encolar voto con estado 'PENDIENTE'
    UI->>S: POST /api/vote con payload
    alt Conexión Exitosa (Online)
        S->>DB: INSERT transacción atómica
        DB-->>S: OK
        S-->>UI: 200 OK (Voto guardado)
        UI->>Q: Eliminar voto de la cola
        UI->>C: Toast "¡Voto Registrado con Éxito!"
    else Fallo de Red / Sin Conexión (Offline)
        S--xUI: NetworkError / Timeout
        UI->>C: Toast "⚠️ Voto asegurado localmente. Se enviará automáticamente."
        Note over UI,Q: Escucha eventos 'online' y temporizador de reintento
        UI->>S: Reintento automático con Backoff exponencial
        S->>DB: INSERT transacción atómica
        S-->>UI: 200 OK (Sincronizado)
        UI->>Q: Limpiar cola
        UI->>C: Toast "✅ ¡Tu voto pendiente ha sido confirmado y guardado!"
    end
```

---

## 3. Especificación Técnica de la Cola
1. **Estructura en `localStorage` (`gamea_pending_votes`):**
   ```json
   [
     {
       "id": "pend_m3k9a1",
       "dishId": "fiambre",
       "district": "Distrito 1 (Ciudad Satélite / Tejada)",
       "city": "El Alto",
       "voterUuid": "voter_...",
       "timestamp": 1727319000000,
       "attempts": 0
     }
   ]
   ```
2. **Disparadores de Despacho:**
   * Al emitir el voto (intento inmediato).
   * Al dispararse el evento `window.addEventListener('online')`.
   * Al cargar la página (`DOMContentLoaded`).
   * Intervalo periódico de sincronización de fondo cada 20 segundos si hay elementos en cola.
3. **Idempotencia:**
   * Si el voto ya había alcanzado a guardarse en el servidor antes de cortarse la respuesta del cliente, el servidor responderá con el estado actual o mensaje amigable y la cola se vaciará limpiamente.

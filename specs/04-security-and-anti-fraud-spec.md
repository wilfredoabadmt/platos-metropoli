# 🛡️ ESPECIFICACIÓN DE SEGURIDAD Y PROTECCIÓN ANTI-FRAUDE (SDD-04)

## 1. Contexto de Red en Bolivia y Desafío CGNAT
En Bolivia, la gran mayoría del tráfico móvil (Entel, Tigo y Viva) y de conexiones compartidas institucionales (universidades como UPEA, colegios y edificios de la Alcaldía de El Alto) opera bajo **Carrier-Grade NAT (CGNAT)**:
* Cientos o miles de terminales móviles comparten una única dirección IPv4 pública de salida.
* **Riesgo:** Un rate-limiting estricto por IP bloquea injustamente a votantes legítimos con errores HTTP 429.

---

## 2. Estrategia Multi-Capa de Protección

### 2.1 Extracción Confiable de IP detrás de Proxies
El servidor debe resolver la IP real del cliente siguiendo la jerarquía estándar:
1. `cf-connecting-ip` (si se utiliza Cloudflare).
2. `x-real-ip` (si se utiliza Nginx o Traefik/Coolify).
3. Primer elemento de `x-forwarded-for` (limpiando espacios).
4. `req.socket.remoteAddress` como fallback.

### 2.2 Rate Limiting Adaptativo
* **Ventana por IP:** Ventana deslizante de 60 segundos con un umbral ampliado a **60 solicitudes/minuto por IP** para permitir el tráfico simultáneo de redes celulares legítimas.
* **Cooldown por Dispositivo (`voterUuid`):** Mínimo 1.5 segundos entre peticiones para frenar scripts automatizados directos.
* **Unicidad de Voto:** La base de datos rechaza votos duplicados para un mismo plato por el mismo `voterUuid` (`idx_votes_voter_dish`).

### 2.3 Trampa Honeypot Anti-Bot
* El formulario incluye campos invisibles para usuarios humanos (`hp_field`, `hp_code`).
* Los bots de spam y scrapers suelen autocompletar todos los inputs disponibles. Si el payload contiene algún valor en estos campos, la solicitud es rechazada inmediatamente con código 400 sin procesar.

### 2.4 Control de Acceso Administrativo a Exportaciones
* El endpoint `/api/export/csv` contiene datos sensibles (direcciones IP, horas exactas).
* Se habilita verificación por cabecera `X-Admin-Token` o parámetro `?token=...` coincidente con `ADMIN_EXPORT_TOKEN` (definible vía variable de entorno, con clave por defecto para auditoría interna).

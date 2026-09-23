# Imagen base oficial con Node.js 22 LTS (soporte nativo y estable de node:sqlite)
FROM node:22-alpine

# Definir directorio de trabajo
WORKDIR /app

# Copiar configuración de dependencias
COPY package.json ./

# Instalar dependencias si existiesen en package.json
RUN npm install --omit=dev || true

# Copiar el código de la aplicación
COPY . .

# Exponer el puerto del servidor
EXPOSE 3000

# Variables de entorno por defecto
ENV PORT=3000
ENV NODE_ENV=production

# Declarar volumen para persistencia de la base de datos en Coolify
VOLUME ["/app/data"]

# Comando de inicio
CMD ["node", "server.js"]

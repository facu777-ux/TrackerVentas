# Usamos la imagen de Node.js para el Backend
FROM node:20-slim

# Instalamos dependencias mínimas si fueran necesarias
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Preparamos nuestra app
WORKDIR /app

# Copiamos package.json primero para aprovechar cache de Docker
COPY package*.json ./
RUN npm install --production

# Copiamos el resto del código
COPY . .

# Exponemos el puerto del backend (Render suele usar el que definas o 10000 por defecto)
# Pero mantenemos el 3001 por consistencia con tu config local
EXPOSE 3001

# Arrancamos directamente con npm start
CMD ["npm", "start"]

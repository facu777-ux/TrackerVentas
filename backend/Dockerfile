# Traemos el binario oficial de Tailscale
FROM tailscale/tailscale:latest AS tailscale

# Usamos la imagen de Node.js para el Backend
FROM node:20-slim

# Instalamos dependencias mínimas para red
RUN apt-get update && apt-get install -y ca-certificates iptables && rm -rf /var/lib/apt/lists/*

# Copiamos el binario de Tailscale desde la primera imagen
COPY --from=tailscale /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY --from=tailscale /usr/local/bin/tailscale /usr/local/bin/tailscale

# Preparamos directorios para Tailscale
RUN mkdir -p /var/lib/tailscale /var/cache/tailscale /var/run/tailscale

# Preparamos nuestra app
WORKDIR /app

# Copiamos package.json primero para aprovechar cache de Docker
COPY package*.json ./
RUN npm install --production

# Copiamos el resto del código
COPY . .

# Copiamos el script que manejará ambos procesos
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Exponemos el puerto del backend
EXPOSE 3001

CMD ["/start.sh"]

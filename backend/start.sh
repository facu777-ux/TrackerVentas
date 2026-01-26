#!/bin/sh

echo "🔧 Iniciando Tailscale daemon..."

# 1. Iniciar el demonio de Tailscale en segundo plano (modo userspace)
/usr/local/bin/tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state &

# 2. Esperar a que tailscaled inicie correctamente
sleep 10

echo "🔐 Conectando a la red Tailscale..."

# 3. Autenticar y conectar a tu red privada
/usr/local/bin/tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=render-backend

# 4. Verificar conexión
echo "📡 Estado de Tailscale:"
/usr/local/bin/tailscale status

# 5. Iniciar tu Backend
echo "🚀 Tailscale conectado. Iniciando Backend..."
exec npm start

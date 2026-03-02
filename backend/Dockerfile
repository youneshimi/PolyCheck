FROM node:20-alpine

WORKDIR /app

# Installer les dépendances
COPY package*.json ./
RUN npm install --omit=dev

# Copier le code
COPY src/ ./src/

# Exposer le port
EXPOSE 3001

# Démarrer l'application
CMD ["node", "src/index.js"]

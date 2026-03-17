FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY bin/ ./bin/
COPY src/ ./src/

RUN chmod +x bin/polycheck.js

ENTRYPOINT ["node", "bin/polycheck.js"]

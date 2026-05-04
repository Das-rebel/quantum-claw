FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY index.js ./
COPY public/ ./public/

EXPOSE 8080

CMD ["node", "index.js"]
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY server.js .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]

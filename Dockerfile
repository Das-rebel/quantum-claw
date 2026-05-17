FROM node:22-alpine

WORKDIR /app

# Copy entire omniclaw repo (needed for cross-app requires like ../../../clients/)
COPY . .

# Install all workspace dependencies (apps/*, clients/*, skills/*, services/*)
RUN npm install --workspaces --include-workspace-root --omit=dev

ENV PORT=8080
ENV TELEGRAM_MODE=webhook
ENV NODE_ENV=production
ENV OPENCLAW_ENDPOINT=http://localhost:8080

EXPOSE 8080

CMD ["node", "apps/telegram/index.js"]

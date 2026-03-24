FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy source code
COPY src/ ./src/

# Create non-root user
RUN addgroup -g 1001 -S quantumclaw && \
    adduser -S quantumclaw -u 1001 && \
    chown -R quantumclaw:quantumclaw /app

# Switch to non-root user
USER quantumclaw

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "src/server.js"]
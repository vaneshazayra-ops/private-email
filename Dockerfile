FROM node:22-alpine

WORKDIR /app

# Copy application files
COPY config.js package.json ./
COPY server/ ./server/
COPY public/ ./public/

# Create data directory
RUN mkdir -p /app/data

# Expose ports (Web + SMTP)
EXPOSE 8080 25

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/config || exit 1

# Start the application
CMD ["node", "server/app.js"]

# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
# Install only production dependencies
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY public ./public

# Cloud Run injects the PORT env var (usually 8080)
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]

# Stage 1: Build
FROM node:22-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production
FROM node:22-slim

# Set environment to production
ENV NODE_ENV=production

# Install Runtime Dependencies
# 1. System tools
# 2. Python & UV (for MCP servers)
# 3. Chromium & Dependencies (for Puppeteer)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    git \
    gnupg \
    wget \
    ca-certificates \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install UV for MCP fetch/research
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

# Copy package info and install production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy build artifacts and public assets
COPY --from=builder /app/dist ./dist
COPY public ./public
# Ensure mcp config is present
COPY src/plugins/mcp/mcp_config.json ./dist/plugins/mcp/

# Cloud Run injects the PORT env var (usually 8080)
ENV PORT=8080
EXPOSE 8080

# Puppeteer environment variables for containerized Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set the command to run the server
CMD ["node", "dist/server.js"]

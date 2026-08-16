FROM node:20-bookworm-slim

WORKDIR /app

# Install Python 3, pip, redis-server, bash, and Playwright Chromium OS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    redis-server \
    bash \
    ca-certificates \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libdbus-1-3 libexpat1 libxcb1 libxkbcommon0 libatspi2.0-0 libx11-6 \
    libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libglib2.0-0 libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies and Playwright Chromium browser
COPY Gmap-scrapper/requirements.txt ./Gmap-scrapper/requirements.txt
RUN python3 -m pip install --no-cache-dir --break-system-packages -r Gmap-scrapper/requirements.txt && \
    python3 -m playwright install chromium

# Copy Node dependency manifests and install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Copy project files
COPY . .

# Generate Prisma client and build Next.js app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npx prisma generate
RUN npm run build

# Make start script executable
RUN chmod +x scripts/start-all.sh

EXPOSE 3000

CMD ["/bin/bash", "scripts/start-all.sh"]

FROM node:20-slim

# 1) System Chromium + common fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
      fonts-noto-cjk \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 2) Tell Puppeteer not to download its own Chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# 3) Cache-friendly install
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# 4) Safer defaults in containers
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox"

EXPOSE 5000
CMD ["node", "server.js"]

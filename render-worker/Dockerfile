# Build context MUST be the repo root so we can copy src/remotion into the worker.
#   docker build -f render-worker/Dockerfile -t tu-render-worker .
FROM node:20-bookworm-slim

# Chrome + ffmpeg deps for headless rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libnss3 libxss1 libasound2 libatk-bridge2.0-0 libgtk-3-0 \
    libgbm1 libxshmfence1 libdrm2 \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV REMOTION_CHROME_EXECUTABLE=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

COPY render-worker/package.json ./package.json
RUN npm install --omit=dev

# Copy worker source and the shared Remotion compositions from the repo root
COPY render-worker/server.mjs ./server.mjs
COPY render-worker/src ./src
COPY src/remotion ./src/remotion

EXPOSE 8080
CMD ["node", "server.mjs"]
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY server.js ./
COPY README.md ./

RUN mkdir -p /app/data /app/exports/quotes

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV QUOTES_DIR=/app/exports/quotes

EXPOSE 3000

CMD ["node", "server.js"]

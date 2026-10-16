FROM node:22.22.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts ./scripts
COPY web ./web
COPY worker ./worker
COPY drizzle ./drizzle
COPY .openai ./.openai
RUN node scripts/build.mjs
RUN npm prune --omit=dev
ENV NODE_ENV=production
CMD ["node", "scripts/v3-start.mjs"]

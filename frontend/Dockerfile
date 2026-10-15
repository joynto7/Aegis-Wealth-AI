# Aegis Wealth AI web app: Next.js standalone build talking to the API through the /api rewrite.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Both are read at build time: the mock switch is inlined, and the rewrite target is baked into the routes.
ARG NEXT_PUBLIC_API_MOCK=0
ARG API_BASE_URL=http://api:8000
ENV NEXT_PUBLIC_API_MOCK=$NEXT_PUBLIC_API_MOCK \
    API_BASE_URL=$API_BASE_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]

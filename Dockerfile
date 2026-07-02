FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
# Disable Prisma's update check / telemetry: the outbound checkpoint request can
# hang in some container networks, preventing the CLI process from ever exiting,
# which blocks the "&& node dist/main.js" step and kills the healthcheck.
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
EXPOSE 3000

CMD ["sh","-c","echo '[cmd] container start (image v5)' && npx prisma db push --skip-generate && echo '[cmd] prisma done, launching node' && node dist/main.js"]

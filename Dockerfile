FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
EXPOSE 3000

# NOTE: prisma db push was REMOVED from the start command on purpose.
# It was hanging at container start and blocking node from ever launching.
# The database schema is already in sync; run schema pushes as a one-off
# job (e.g. `npx prisma db push` in a shell) when the schema actually changes.
CMD ["sh","-c","echo '[cmd] image v6: starting node directly (no prisma at runtime)' && node dist/main.js"]

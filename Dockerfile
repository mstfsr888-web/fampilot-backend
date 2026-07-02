FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN rm -rf dist && npm run build && ls -la dist && test -f dist/main.js

ENV NODE_ENV=production
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
EXPOSE 3000

CMD ["node", "scripts/diag.js"]

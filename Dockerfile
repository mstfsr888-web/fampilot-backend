FROM node:20-slim
# Prisma needs openssl
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
RUN npm install            # runs postinstall -> prisma generate

COPY . .
RUN npm run build          # nest build -> dist/ (includes worker.js)

ENV NODE_ENV=production
EXPOSE 3000

# Web service: apply schema to the DB, then start the API.
# (Worker service overrides this command with: node dist/worker.js)
CMD ["sh","-c","npx prisma db push --skip-generate && node dist/main.js"]

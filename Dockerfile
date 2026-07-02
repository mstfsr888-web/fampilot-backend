FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
# Clean any leaked build artifacts, then build and PROVE dist/main.js exists.
# If it does not, the BUILD fails right here with a visible error instead of
# a silent hang at runtime.
RUN rm -rf dist && npm run build && ls -la dist && test -f dist/main.js

ENV NODE_ENV=production
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
EXPOSE 3000

CMD ["sh","-c","echo '[cmd] image v9' && ls dist | head -30 && node dist/main.js; echo \"[cmd] node exited with code $?\""]

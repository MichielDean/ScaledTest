FROM node:20-alpine
WORKDIR /app
RUN npm install -g tsx
COPY worker.ts ./
COPY package.json ./
ENTRYPOINT ["tsx", "worker.ts"]

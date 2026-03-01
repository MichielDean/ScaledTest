FROM node:20-alpine
WORKDIR /app

# Pin tsx to a specific version for reproducible builds.
# Update intentionally by bumping this value after review.
RUN npm install -g tsx@4.21.0

# Copy lockfile + manifest first so the install layer is cached until deps change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY worker.ts ./
ENTRYPOINT ["tsx", "worker.ts"]

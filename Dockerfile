# Stage 1: Build frontend
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Build Go binary with embedded frontend
FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/frontend/dist /app/internal/spa/dist
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/bin/scaledtest ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/bin/scaledtest-worker ./cmd/worker

# Stage 3: Minimal runtime
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
RUN addgroup -S scaledtest && adduser -S scaledtest -G scaledtest
COPY --from=builder /app/bin/scaledtest /usr/local/bin/scaledtest
COPY --from=builder /app/bin/scaledtest-worker /usr/local/bin/scaledtest-worker
USER scaledtest
EXPOSE 8080
ENTRYPOINT ["scaledtest"]

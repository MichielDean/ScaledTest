# Development Dockerfile for Go backend
FROM golang:1.24-alpine AS development

# Install required tools
RUN apk add --no-cache git make wget

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Install air for hot reloading (v1.52.0 compatible with Go 1.24)
RUN go install github.com/cosmtrek/air@v1.52.0

# Expose ports
EXPOSE 8080 50051

# Run with air for hot reload
CMD ["air", "-c", ".air.toml"]

# Production build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go mod files and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main cmd/server/main.go

# Production stage
FROM alpine:latest AS production

RUN apk --no-cache add ca-certificates wget

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/main .

EXPOSE 8080 50051

CMD ["./main"]

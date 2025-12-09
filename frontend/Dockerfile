# Development Dockerfile for Vite frontend
FROM node:20-alpine AS development

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Start development server
CMD ["npm", "run", "dev"]

# Production build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage with nginx
FROM nginx:alpine AS production

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Default backend host (overridden by K8s environment variable)
ENV BACKEND_HOST=backend

EXPOSE 80

# nginx:alpine automatically runs envsubst on /etc/nginx/templates/*.template files
CMD ["nginx", "-g", "daemon off;"]

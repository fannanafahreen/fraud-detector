# ── Frontend Dockerfile ───────────────────────────────────────────────────────
# Two-stage build:
#   Stage 1 (builder): installs Node dependencies and builds the React app
#   Stage 2 (nginx):   serves the built static files with nginx
#
# Build:  docker build -t fraud-frontend .
# Run:    docker run -p 80:80 fraud-frontend

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci                  # clean install (faster + reproducible)

# Copy source code
COPY . .

# Build the production bundle (outputs to /app/dist)
# VITE_API_URL tells the frontend where the backend is deployed
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:alpine

# Copy the built React app into nginx's web root
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config to support React Router (client-side routing)
# Without this, refreshing /transactions gives a 404
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

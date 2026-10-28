# Production Multi-Stage Dockerfile for CubeSat Mission Control
FROM node:20-alpine AS build

WORKDIR /app

# Install root dependencies
COPY package*.json ./
RUN npm install

# Build React frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY frontend ./frontend
RUN cd frontend && npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/frontend/dist ./frontend/dist
COPY server.js ./
COPY public ./public

EXPOSE 3000

CMD ["node", "server.js"]

# StudyFlow — one image that serves both the API and the built React app on port 3001.

# ---- Stage 1: build the frontend (needs Vite and other dev dependencies) ----
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --include=dev
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: the runtime image (backend + built frontend only) ----
FROM node:20-slim
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend/ ./backend/
# server.js serves ../frontend/dist when it exists
COPY --from=frontend /app/frontend/dist ./frontend/dist

# The SQLite file and uploaded notes live here. Volumes are attached from outside
# (docker-compose.yml locally, a Railway volume in production) — Railway rejects
# the VOLUME instruction, and its volumes mount as root, so the app runs as root.
RUN mkdir -p backend/data backend/uploads

EXPOSE 3001
CMD ["node", "backend/server.js"]

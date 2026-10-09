FROM node:20-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci -w frontend --include-workspace-root
COPY frontend frontend
RUN npm run build -w frontend

FROM node:20-alpine
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static frontend/.next/static
USER app
EXPOSE 3000
CMD ["node", "frontend/server.js"]

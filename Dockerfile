# Build and serve the app. WebHID runs in the visiting browser, so the
# container only needs to serve static files over HTTP; opening the app
# via http://localhost:8080 keeps the secure context WebHID requires.
FROM node:26-alpine

WORKDIR /app

# Install dependencies first so Docker caches them across source changes
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:prod

# The dev server binds to localhost by default, which is unreachable
# through Docker's port mapping
ENV HOST=0.0.0.0

EXPOSE 8080

CMD ["node", "dev-server.js"]

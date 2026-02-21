# Pimcore DataHub REST API Service
# Simulates Pimcore's REST API for local development
FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./

ENV PORT=80
EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:80/api/health || exit 1

CMD ["node", "server.js"]

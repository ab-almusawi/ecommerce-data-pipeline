FROM node:20-alpine

WORKDIR /server

RUN apk add --no-cache python3 make g++

RUN npm install -g @medusajs/medusa-cli

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
    CMD wget -q --spider http://localhost:9000/health || exit 1

CMD ["sh", "-c", "npx medusa migrations run 2>/dev/null; npx medusa start"]

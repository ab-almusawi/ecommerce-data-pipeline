const dotenv = require("dotenv");

let ENV_FILE_NAME = "";
switch (process.env.NODE_ENV) {
  case "production":
    ENV_FILE_NAME = ".env.production";
    break;
  case "staging":
    ENV_FILE_NAME = ".env.staging";
    break;
  case "test":
    ENV_FILE_NAME = ".env.test";
    break;
  case "development":
  default:
    ENV_FILE_NAME = ".env";
    break;
}

try {
  dotenv.config({ path: process.cwd() + "/" + ENV_FILE_NAME });
} catch (e) {}

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL || "postgres://localhost/medusa-store";

const plugins = [
  `medusa-fulfillment-manual`,
  `medusa-payment-manual`,
];

const modules = {
  eventBus: {
    resolve: "@medusajs/event-bus-local",
  },
  cacheService: {
    resolve: "@medusajs/cache-inmemory",
  },
};

module.exports = {
  projectConfig: {
    redis_url: REDIS_URL,
    database_url: DATABASE_URL,
    database_type: "postgres",
    store_cors: process.env.STORE_CORS || "http://localhost:8000",
    admin_cors: process.env.ADMIN_CORS || "http://localhost:7000,http://localhost:7001",
    jwt_secret: process.env.JWT_SECRET || "supersecret",
    cookie_secret: process.env.COOKIE_SECRET || "supersecret",
  },
  plugins,
  modules,
};

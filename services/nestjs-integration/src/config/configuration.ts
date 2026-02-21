/**
 * Application configuration with validation.
 */

import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1)
  @IsOptional()
  PORT: number = 3000;

  // AWS Configuration
  @IsString()
  @IsOptional()
  AWS_REGION: string = 'us-east-1';

  @IsString()
  @IsOptional()
  AWS_ENDPOINT?: string;

  @IsString()
  @IsOptional()
  AWS_ACCESS_KEY_ID: string = 'test';

  @IsString()
  @IsOptional()
  AWS_SECRET_ACCESS_KEY: string = 'test';

  // SQS Configuration
  @IsString()
  SQS_QUEUE_URL: string = 'http://localhost:4566/000000000000/product-ingestion-queue';

  @IsNumber()
  @Min(1)
  @IsOptional()
  SQS_POLL_INTERVAL_MS: number = 5000;

  @IsNumber()
  @Min(1)
  @IsOptional()
  SQS_MAX_MESSAGES: number = 10;

  @IsNumber()
  @Min(1)
  @IsOptional()
  SQS_WAIT_TIME_SECONDS: number = 20;

  // Pimcore Configuration
  @IsString()
  PIMCORE_API_URL: string = 'http://localhost:8080/api';

  @IsString()
  @IsOptional()
  PIMCORE_API_KEY?: string;

  @IsNumber()
  @Min(1000)
  @IsOptional()
  PIMCORE_TIMEOUT_MS: number = 30000;

  // MedusaJS Configuration
  @IsString()
  MEDUSA_API_URL: string = 'http://localhost:9000';

  @IsString()
  @IsOptional()
  MEDUSA_API_KEY?: string;

  @IsNumber()
  @Min(1000)
  @IsOptional()
  MEDUSA_TIMEOUT_MS: number = 30000;

  @IsString()
  @IsOptional()
  MEDUSA_ADMIN_EMAIL: string = 'admin@challenge.com';

  @IsString()
  @IsOptional()
  MEDUSA_ADMIN_PASSWORD: string = 'admin123';

  // Redis Configuration
  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  @IsOptional()
  REDIS_PORT: number = 6379;

  // Retry Configuration
  @IsNumber()
  @Min(1)
  @IsOptional()
  RETRY_MAX_ATTEMPTS: number = 3;

  @IsNumber()
  @Min(100)
  @IsOptional()
  RETRY_BASE_DELAY_MS: number = 1000;

  @IsNumber()
  @Min(1000)
  @IsOptional()
  RETRY_MAX_DELAY_MS: number = 30000;

  // Circuit Breaker Configuration
  @IsNumber()
  @Min(1)
  @IsOptional()
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: number = 5;

  @IsNumber()
  @Min(1000)
  @IsOptional()
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: number = 60000;

  // Idempotency Configuration
  @IsNumber()
  @Min(60000)
  @IsOptional()
  IDEMPOTENCY_TTL_MS: number = 86400000; // 24 hours
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => Object.values(error.constraints || {}).join(', '))
      .join('; ');
    throw new Error(`Configuration validation failed: ${errorMessages}`);
  }

  return validatedConfig;
}

export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },

  sqs: {
    queueUrl:
      process.env.SQS_QUEUE_URL ||
      'http://localhost:4566/000000000000/product-ingestion-queue',
    pollIntervalMs: parseInt(process.env.SQS_POLL_INTERVAL_MS || '5000', 10),
    maxMessages: parseInt(process.env.SQS_MAX_MESSAGES || '10', 10),
    waitTimeSeconds: parseInt(process.env.SQS_WAIT_TIME_SECONDS || '20', 10),
  },

  pimcore: {
    apiUrl: process.env.PIMCORE_API_URL || 'http://localhost:8080/api',
    apiKey: process.env.PIMCORE_API_KEY,
    timeoutMs: parseInt(process.env.PIMCORE_TIMEOUT_MS || '30000', 10),
  },

  medusa: {
    apiUrl: process.env.MEDUSA_API_URL || 'http://localhost:9000',
    apiKey: process.env.MEDUSA_API_KEY,
    timeoutMs: parseInt(process.env.MEDUSA_TIMEOUT_MS || '30000', 10),
    adminEmail: process.env.MEDUSA_ADMIN_EMAIL || 'admin@challenge.com',
    adminPassword: process.env.MEDUSA_ADMIN_PASSWORD || 'admin123',
  },

  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },

  retry: {
    maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || '3', 10),
    baseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS || '1000', 10),
    maxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '30000', 10),
  },

  circuitBreaker: {
    failureThreshold: parseInt(
      process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5',
      10,
    ),
    resetTimeoutMs: parseInt(
      process.env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS || '60000',
      10,
    ),
  },

  idempotency: {
    ttlMs: parseInt(process.env.IDEMPOTENCY_TTL_MS || '86400000', 10),
  },
});

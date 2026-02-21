/**
 * Retry utilities with exponential backoff and jitter.
 */

import { Logger } from '@nestjs/common';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  jitter: boolean;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  jitter: true,
};

export function calculateDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_CONFIG,
): number {
  let delay = config.baseDelayMs * Math.pow(config.exponentialBase, attempt);
  delay = Math.min(delay, config.maxDelayMs);

  if (config.jitter) {
    const jitterFactor = 0.5 + Math.random();
    delay *= jitterFactor;
  }

  return Math.round(delay);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  logger?: Logger,
  operationName = 'operation',
): Promise<T> {
  const fullConfig: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < fullConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < fullConfig.maxAttempts - 1) {
        const delay = calculateDelay(attempt, fullConfig);
        logger?.warn(
          `${operationName} failed (attempt ${attempt + 1}/${fullConfig.maxAttempts}): ${lastError.message}. Retrying in ${delay}ms`,
        );
        await sleep(delay);
      } else {
        logger?.error(
          `${operationName} failed after ${fullConfig.maxAttempts} attempts: ${lastError.message}`,
        );
      }
    }
  }

  throw lastError;
}

/**
 * Decorator for retrying class methods with exponential backoff.
 */
export function Retry(config: Partial<RetryConfig> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const logger = new Logger(target.constructor.name);

    descriptor.value = async function (...args: any[]) {
      return retryWithBackoff(
        () => originalMethod.apply(this, args),
        config,
        logger,
        propertyKey,
      );
    };

    return descriptor;
  };
}

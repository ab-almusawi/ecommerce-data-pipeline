/**
 * Circuit Breaker implementation for resilient external service calls.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failures exceeded threshold, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 */

import { Logger } from '@nestjs/common';
import { CircuitBreakerOpenException } from '../exceptions';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  resetTimeout: 60000,
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private readonly logger: Logger;
  private readonly config: CircuitBreakerConfig;

  constructor(
    private readonly serviceName: string,
    config: Partial<CircuitBreakerConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = new Logger(`CircuitBreaker:${serviceName}`);
  }

  get currentState(): CircuitState {
    return this.state;
  }

  get isOpen(): boolean {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
        return false;
      }
      return true;
    }
    return false;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      throw new CircuitBreakerOpenException(this.serviceName);
    }

    try {
      const result = await this.withTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  private async withTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);

      operation()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    this.logger.warn(
      `Failure recorded (${this.failureCount}/${this.config.failureThreshold}): ${error.message}`,
    );

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.config.resetTimeout;
  }

  private transitionTo(newState: CircuitState): void {
    this.logger.log(`State transition: ${this.state} -> ${newState}`);
    this.state = newState;

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }
  }

  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.lastFailureTime = null;
  }

  getStats(): Record<string, unknown> {
    return {
      serviceName: this.serviceName,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
        ? new Date(this.lastFailureTime).toISOString()
        : null,
    };
  }
}

const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  serviceName: string,
  config?: Partial<CircuitBreakerConfig>,
): CircuitBreaker {
  if (!circuitBreakers.has(serviceName)) {
    circuitBreakers.set(serviceName, new CircuitBreaker(serviceName, config));
  }
  return circuitBreakers.get(serviceName)!;
}

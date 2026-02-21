/**
 * Custom exceptions for the integration service.
 * Provides structured error handling with rich context.
 */

export enum ErrorCategory {
  VALIDATION = 'validation',
  INTEGRATION = 'integration',
  NETWORK = 'network',
  CONFIGURATION = 'configuration',
  IDEMPOTENCY = 'idempotency',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorContext {
  correlationId?: string;
  productId?: string;
  service?: string;
  operation?: string;
  timestamp: string;
  additionalData?: Record<string, unknown>;
}

export class IntegrationError extends Error {
  public readonly context: ErrorContext;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;
  public readonly originalError?: Error;

  constructor(
    message: string,
    options: {
      context?: Partial<ErrorContext>;
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      retryable?: boolean;
      originalError?: Error;
    } = {},
  ) {
    super(message);
    this.name = this.constructor.name;

    this.context = {
      timestamp: new Date().toISOString(),
      ...options.context,
    };
    this.category = options.category || ErrorCategory.INTEGRATION;
    this.severity = options.severity || ErrorSeverity.MEDIUM;
    this.retryable = options.retryable ?? true;
    this.originalError = options.originalError;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      retryable: this.retryable,
      context: this.context,
      originalError: this.originalError?.message,
    };
  }
}

export class ValidationException extends IntegrationError {
  constructor(
    message: string,
    field: string,
    context?: Partial<ErrorContext>,
  ) {
    super(message, {
      context: { ...context, additionalData: { field } },
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      retryable: false,
    });
  }
}

export class PimcoreException extends IntegrationError {
  constructor(
    message: string,
    operation: string,
    context?: Partial<ErrorContext>,
    originalError?: Error,
  ) {
    super(message, {
      context: { ...context, service: 'pimcore', operation },
      category: ErrorCategory.INTEGRATION,
      severity: ErrorSeverity.HIGH,
      retryable: true,
      originalError,
    });
  }
}

export class MedusaException extends IntegrationError {
  constructor(
    message: string,
    operation: string,
    context?: Partial<ErrorContext>,
    originalError?: Error,
  ) {
    super(message, {
      context: { ...context, service: 'medusa', operation },
      category: ErrorCategory.INTEGRATION,
      severity: ErrorSeverity.HIGH,
      retryable: true,
      originalError,
    });
  }
}

export class SqsException extends IntegrationError {
  constructor(
    message: string,
    operation: string,
    context?: Partial<ErrorContext>,
    originalError?: Error,
  ) {
    super(message, {
      context: { ...context, service: 'sqs', operation },
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      retryable: true,
      originalError,
    });
  }
}

export class ConfigurationException extends IntegrationError {
  constructor(message: string, configKey: string) {
    super(message, {
      context: { additionalData: { configKey } },
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.CRITICAL,
      retryable: false,
    });
  }
}

export class IdempotencyException extends IntegrationError {
  constructor(message: string, key: string) {
    super(message, {
      context: { additionalData: { idempotencyKey: key } },
      category: ErrorCategory.IDEMPOTENCY,
      severity: ErrorSeverity.LOW,
      retryable: false,
    });
  }
}

export class CircuitBreakerOpenException extends IntegrationError {
  constructor(serviceName: string) {
    super(`Circuit breaker is open for ${serviceName}`, {
      context: { service: serviceName },
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      retryable: false,
    });
  }
}

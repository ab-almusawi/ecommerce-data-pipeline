import {
  IntegrationError,
  ErrorCategory,
  ErrorSeverity,
  ValidationException,
  PimcoreException,
  MedusaException,
  ConfigurationException,
  CircuitBreakerOpenException,
} from '../src/common/exceptions';

describe('Custom Exceptions', () => {
  describe('IntegrationError', () => {
    it('should create with default values', () => {
      const error = new IntegrationError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('IntegrationError');
      expect(error.category).toBe(ErrorCategory.INTEGRATION);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.retryable).toBe(true);
    });

    it('should create with custom options', () => {
      const error = new IntegrationError('Test error', {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        context: { productId: '123' },
      });

      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.retryable).toBe(false);
      expect(error.context.productId).toBe('123');
    });

    it('should serialize to JSON', () => {
      const error = new IntegrationError('Test error');
      const json = error.toJSON();

      expect(json.name).toBe('IntegrationError');
      expect(json.message).toBe('Test error');
      expect(json.category).toBeDefined();
    });
  });

  describe('ValidationException', () => {
    it('should capture field information', () => {
      const error = new ValidationException(
        'Invalid field',
        'price',
        { productId: '123' },
      );

      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.retryable).toBe(false);
      expect(error.context.additionalData?.field).toBe('price');
    });
  });

  describe('PimcoreException', () => {
    it('should capture operation and service', () => {
      const error = new PimcoreException(
        'API error',
        'createProduct',
        { productId: '123' },
      );

      expect(error.context.service).toBe('pimcore');
      expect(error.context.operation).toBe('createProduct');
      expect(error.retryable).toBe(true);
    });
  });

  describe('MedusaException', () => {
    it('should capture operation and service', () => {
      const error = new MedusaException(
        'API error',
        'upsertProduct',
        { productId: '456' },
      );

      expect(error.context.service).toBe('medusa');
      expect(error.context.operation).toBe('upsertProduct');
    });
  });

  describe('ConfigurationException', () => {
    it('should be non-retryable', () => {
      const error = new ConfigurationException(
        'Missing config',
        'API_KEY',
      );

      expect(error.category).toBe(ErrorCategory.CONFIGURATION);
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.retryable).toBe(false);
    });
  });

  describe('CircuitBreakerOpenException', () => {
    it('should include service name', () => {
      const error = new CircuitBreakerOpenException('pimcore');

      expect(error.message).toContain('pimcore');
      expect(error.context.service).toBe('pimcore');
      expect(error.retryable).toBe(false);
    });
  });
});

import {
  CircuitBreaker,
  CircuitState,
} from '../src/common/utils/circuit-breaker.util';
import { CircuitBreakerOpenException } from '../src/common/exceptions';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 5000,
      resetTimeout: 100,
    });
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.currentState).toBe(CircuitState.CLOSED);
    });

    it('should not be open initially', () => {
      expect(circuitBreaker.isOpen).toBe(false);
    });
  });

  describe('successful operations', () => {
    it('should execute operation successfully', async () => {
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should remain closed after success', async () => {
      await circuitBreaker.execute(async () => 'success');
      expect(circuitBreaker.currentState).toBe(CircuitState.CLOSED);
    });
  });

  describe('failure handling', () => {
    it('should open after reaching failure threshold', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('failure');
          });
        } catch (e) {
          // Expected
        }
      }

      expect(circuitBreaker.currentState).toBe(CircuitState.OPEN);
    });

    it('should throw CircuitBreakerOpenException when open', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('failure');
          });
        } catch (e) {
          // Expected
        }
      }

      await expect(
        circuitBreaker.execute(async () => 'should not run'),
      ).rejects.toThrow(CircuitBreakerOpenException);
    });
  });

  describe('recovery', () => {
    it('should transition to HALF_OPEN after reset timeout', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('failure');
          });
        } catch (e) {
          // Expected
        }
      }

      expect(circuitBreaker.currentState).toBe(CircuitState.OPEN);

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(circuitBreaker.isOpen).toBe(false);
      expect(circuitBreaker.currentState).toBe(CircuitState.HALF_OPEN);
    });

    it('should close after successful operations in HALF_OPEN', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('failure');
          });
        } catch (e) {
          // Expected
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 150));

      await circuitBreaker.execute(async () => 'success');
      await circuitBreaker.execute(async () => 'success');

      expect(circuitBreaker.currentState).toBe(CircuitState.CLOSED);
    });
  });

  describe('stats', () => {
    it('should return stats', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.serviceName).toBe('test-service');
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset to closed state', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('failure');
          });
        } catch (e) {
          // Expected
        }
      }

      circuitBreaker.reset();
      expect(circuitBreaker.currentState).toBe(CircuitState.CLOSED);
    });
  });
});

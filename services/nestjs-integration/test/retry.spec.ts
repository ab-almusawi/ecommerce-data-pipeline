import {
  calculateDelay,
  retryWithBackoff,
  sleep,
} from '../src/common/utils/retry.util';

describe('Retry Utilities', () => {
  describe('calculateDelay', () => {
    it('should calculate exponential delay', () => {
      const config = {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        exponentialBase: 2,
        jitter: false,
      };

      expect(calculateDelay(0, config)).toBe(1000);
      expect(calculateDelay(1, config)).toBe(2000);
      expect(calculateDelay(2, config)).toBe(4000);
    });

    it('should cap delay at maxDelayMs', () => {
      const config = {
        maxAttempts: 3,
        baseDelayMs: 10000,
        maxDelayMs: 30000,
        exponentialBase: 2,
        jitter: false,
      };

      expect(calculateDelay(5, config)).toBe(30000);
    });

    it('should apply jitter when enabled', () => {
      const config = {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        exponentialBase: 2,
        jitter: true,
      };

      const delays = Array.from({ length: 10 }, () => calculateDelay(0, config));
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const result = await retryWithBackoff(
        async () => {
          attempts++;
          return 'success';
        },
        { maxAttempts: 3, baseDelayMs: 10 },
      );

      expect(result).toBe('success');
      expect(attempts).toBe(1);
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      const result = await retryWithBackoff(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('temporary failure');
          }
          return 'success';
        },
        { maxAttempts: 3, baseDelayMs: 10 },
      );

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max attempts', async () => {
      let attempts = 0;
      await expect(
        retryWithBackoff(
          async () => {
            attempts++;
            throw new Error('permanent failure');
          },
          { maxAttempts: 3, baseDelayMs: 10 },
        ),
      ).rejects.toThrow('permanent failure');

      expect(attempts).toBe(3);
    });
  });
});

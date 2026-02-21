import {
  IdempotencyManager,
  IdempotencyStatus,
  InMemoryIdempotencyStore,
} from '../src/common/utils/idempotency.util';

describe('Idempotency', () => {
  describe('InMemoryIdempotencyStore', () => {
    let store: InMemoryIdempotencyStore;

    beforeEach(() => {
      store = new InMemoryIdempotencyStore();
    });

    it('should return null for non-existent key', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeNull();
    });

    it('should set and get record', async () => {
      const record = {
        key: 'test-key',
        status: IdempotencyStatus.PROCESSING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.set('test-key', record, 60000);
      const result = await store.get('test-key');

      expect(result).toEqual(record);
    });

    it('should delete record', async () => {
      const record = {
        key: 'test-key',
        status: IdempotencyStatus.COMPLETED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.set('test-key', record, 60000);
      await store.delete('test-key');
      const result = await store.get('test-key');

      expect(result).toBeNull();
    });

    it('should expire records after TTL', async () => {
      const record = {
        key: 'test-key',
        status: IdempotencyStatus.COMPLETED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.set('test-key', record, 50);
      
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      const result = await store.get('test-key');
      expect(result).toBeNull();
    });
  });

  describe('IdempotencyManager', () => {
    let manager: IdempotencyManager;
    let store: InMemoryIdempotencyStore;

    beforeEach(() => {
      store = new InMemoryIdempotencyStore();
      manager = new IdempotencyManager(store, 60000);
    });

    it('should generate consistent keys', () => {
      const key1 = manager.generateKey('product-1', 'event-1');
      const key2 = manager.generateKey('product-1', 'event-1');
      expect(key1).toBe(key2);
    });

    it('should return NOT_FOUND for new key', async () => {
      const status = await manager.checkAndLock('test-key');
      expect(status).toBe(IdempotencyStatus.NOT_FOUND);
    });

    it('should return PROCESSING for locked key', async () => {
      await manager.checkAndLock('test-key');
      const status = await manager.checkAndLock('test-key');
      expect(status).toBe(IdempotencyStatus.PROCESSING);
    });

    it('should mark as completed', async () => {
      await manager.checkAndLock('test-key');
      await manager.markCompleted('test-key', { result: 'success' });
      
      const status = await manager.checkAndLock('test-key');
      expect(status).toBe(IdempotencyStatus.COMPLETED);
    });

    it('should mark as failed', async () => {
      await manager.checkAndLock('test-key');
      await manager.markFailed('test-key', 'error message');
      
      const status = await manager.checkAndLock('test-key');
      expect(status).toBe(IdempotencyStatus.FAILED);
    });

    it('should release lock', async () => {
      await manager.checkAndLock('test-key');
      await manager.release('test-key');
      
      const status = await manager.checkAndLock('test-key');
      expect(status).toBe(IdempotencyStatus.NOT_FOUND);
    });
  });
});

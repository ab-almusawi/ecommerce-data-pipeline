/**
 * Idempotency utilities for preventing duplicate processing.
 * Supports both in-memory (dev) and Redis (production) backends.
 */

import { Logger } from '@nestjs/common';

export enum IdempotencyStatus {
  NOT_FOUND = 'NOT_FOUND',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface IdempotencyRecord {
  key: string;
  status: IdempotencyStatus;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(key: string, record: IdempotencyRecord, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * In-memory idempotency store for development/testing.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly store = new Map<string, { record: IdempotencyRecord; expiresAt: number }>();
  private readonly logger = new Logger(InMemoryIdempotencyStore.name);

  async get(key: string): Promise<IdempotencyRecord | null> {
    const entry = this.store.get(key);
    
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.record;
  }

  async set(key: string, record: IdempotencyRecord, ttlMs: number): Promise<void> {
    this.store.set(key, {
      record,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

/**
 * Redis-based idempotency store for production.
 */
export class RedisIdempotencyStore implements IdempotencyStore {
  private readonly logger = new Logger(RedisIdempotencyStore.name);
  private readonly keyPrefix = 'idempotency:';

  constructor(private readonly redis: any) {}

  async get(key: string): Promise<IdempotencyRecord | null> {
    try {
      const data = await this.redis.get(this.keyPrefix + key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(`Failed to get idempotency record: ${error}`);
      return null;
    }
  }

  async set(key: string, record: IdempotencyRecord, ttlMs: number): Promise<void> {
    try {
      await this.redis.set(
        this.keyPrefix + key,
        JSON.stringify(record),
        'PX',
        ttlMs,
      );
    } catch (error) {
      this.logger.error(`Failed to set idempotency record: ${error}`);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.keyPrefix + key);
    } catch (error) {
      this.logger.error(`Failed to delete idempotency record: ${error}`);
    }
  }
}

/**
 * Idempotency manager for handling duplicate detection.
 */
export class IdempotencyManager {
  private readonly logger = new Logger(IdempotencyManager.name);
  private readonly defaultTtlMs = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly store: IdempotencyStore,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
  ) {}

  async checkAndLock(key: string): Promise<IdempotencyStatus> {
    const existing = await this.store.get(key);

    if (existing) {
      this.logger.debug(`Found existing record for key ${key}: ${existing.status}`);
      return existing.status;
    }

    const record: IdempotencyRecord = {
      key,
      status: IdempotencyStatus.PROCESSING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.store.set(key, record, this.ttlMs);
    return IdempotencyStatus.NOT_FOUND;
  }

  async markCompleted(key: string, result?: unknown): Promise<void> {
    const record: IdempotencyRecord = {
      key,
      status: IdempotencyStatus.COMPLETED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result,
    };

    await this.store.set(key, record, this.ttlMs);
    this.logger.debug(`Marked ${key} as completed`);
  }

  async markFailed(key: string, error: string): Promise<void> {
    const record: IdempotencyRecord = {
      key,
      status: IdempotencyStatus.FAILED,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error,
    };

    await this.store.set(key, record, this.ttlMs);
    this.logger.debug(`Marked ${key} as failed: ${error}`);
  }

  async release(key: string): Promise<void> {
    await this.store.delete(key);
    this.logger.debug(`Released lock for ${key}`);
  }

  generateKey(productId: string, eventId: string): string {
    return `product:${productId}:event:${eventId}`;
  }
}

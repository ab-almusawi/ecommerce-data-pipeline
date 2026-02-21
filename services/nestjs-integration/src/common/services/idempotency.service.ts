/**
 * Idempotency service for preventing duplicate message processing.
 * Uses Redis when available, falls back to in-memory store.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IdempotencyManager,
  IdempotencyStatus,
  IdempotencyStore,
  InMemoryIdempotencyStore,
  RedisIdempotencyStore,
} from '../utils/idempotency.util';
import { RedisService } from './redis.service';

@Injectable()
export class IdempotencyService implements OnModuleInit {
  private readonly logger = new Logger(IdempotencyService.name);
  private manager!: IdempotencyManager;
  private store!: IdempotencyStore;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  onModuleInit() {
    const ttlMs = this.configService.get<number>('idempotency.ttlMs', 86400000);

    if (this.redisService.isAvailable) {
      this.store = new RedisIdempotencyStore(this.redisService.getClient());
      this.logger.log('Using Redis-based idempotency store');
    } else {
      this.store = new InMemoryIdempotencyStore();
      this.logger.warn('Using in-memory idempotency store (not suitable for production)');
    }

    this.manager = new IdempotencyManager(this.store, ttlMs);
  }

  async checkAndLock(productId: string, eventId: string): Promise<IdempotencyStatus> {
    const key = this.manager.generateKey(productId, eventId);
    return this.manager.checkAndLock(key);
  }

  async markCompleted(productId: string, eventId: string, result?: unknown): Promise<void> {
    const key = this.manager.generateKey(productId, eventId);
    await this.manager.markCompleted(key, result);
  }

  async markFailed(productId: string, eventId: string, error: string): Promise<void> {
    const key = this.manager.generateKey(productId, eventId);
    await this.manager.markFailed(key, error);
  }

  async release(productId: string, eventId: string): Promise<void> {
    const key = this.manager.generateKey(productId, eventId);
    await this.manager.release(key);
  }

  isProcessed(status: IdempotencyStatus): boolean {
    return status === IdempotencyStatus.COMPLETED;
  }

  isProcessing(status: IdempotencyStatus): boolean {
    return status === IdempotencyStatus.PROCESSING;
  }
}

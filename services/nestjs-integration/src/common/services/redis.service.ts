/**
 * Redis service for caching and idempotency.
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('redis.url');
    const redisHost = this.configService.get<string>('redis.host', 'localhost');
    const redisPort = this.configService.get<number>('redis.port', 6379);

    try {
      if (redisUrl) {
        this.client = new Redis(redisUrl);
      } else {
        this.client = new Redis({
          host: redisHost,
          port: redisPort,
          retryStrategy: (times) => {
            if (times > 3) {
              this.logger.warn('Redis connection failed, using in-memory fallback');
              return null;
            }
            return Math.min(times * 100, 3000);
          },
        });
      }

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Connected to Redis');
      });

      this.client.on('error', (error) => {
        this.logger.error(`Redis error: ${error.message}`);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.logger.warn('Redis connection closed');
      });

      await this.client.ping();
    } catch (error) {
      this.logger.warn(
        `Failed to connect to Redis: ${error}. Using in-memory fallback.`,
      );
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  get isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  getClient(): Redis | null {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.error(`Redis GET error for ${key}: ${error}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlMs?: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (ttlMs) {
        await this.client.set(key, value, 'PX', ttlMs);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      this.logger.error(`Redis SET error for ${key}: ${error}`);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      this.logger.error(`Redis DEL error for ${key}: ${error}`);
      return false;
    }
  }

  async setNX(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.set(key, value, 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Redis SETNX error for ${key}: ${error}`);
      return false;
    }
  }
}

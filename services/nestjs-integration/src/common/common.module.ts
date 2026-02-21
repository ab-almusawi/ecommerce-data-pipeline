/**
 * Common module providing shared services across the application.
 */

import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './services/redis.service';
import { IdempotencyService } from './services/idempotency.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService, IdempotencyService],
  exports: [RedisService, IdempotencyService],
})
export class CommonModule {}

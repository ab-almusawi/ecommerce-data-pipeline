/**
 * Health check endpoints for monitoring and orchestration.
 */

import { Controller, Get } from '@nestjs/common';
import { PimcoreService } from '../pimcore/pimcore.service';
import { MedusaService } from '../medusa/medusa.service';
import { SqsConsumerService } from '../sqs/sqs-consumer.service';
import { RedisService } from '../common/services/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly pimcoreService: PimcoreService,
    private readonly medusaService: MedusaService,
    private readonly sqsConsumer: SqsConsumerService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'nestjs-integration',
      version: '1.0.0',
    };
  }

  @Get('ready')
  readiness() {
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      redis: this.redisService.isAvailable ? 'connected' : 'disconnected',
    };
  }

  @Get('live')
  liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('metrics')
  metrics(): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(),
      consumer: this.sqsConsumer.getMetrics(),
      circuitBreakers: {
        pimcore: this.pimcoreService.getCircuitBreakerStats(),
        medusa: this.medusaService.getCircuitBreakerStats(),
      },
      redis: {
        available: this.redisService.isAvailable,
      },
    };
  }
}

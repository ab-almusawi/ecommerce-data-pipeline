/**
 * Main application module with comprehensive configuration.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import configuration from './config/configuration';
import { CommonModule } from './common/common.module';
import { SqsModule } from './sqs/sqs.module';
import { PimcoreModule } from './pimcore/pimcore.module';
import { MedusaModule } from './medusa/medusa.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),
    CommonModule,
    SqsModule,
    PimcoreModule,
    MedusaModule,
    HealthModule,
  ],
})
export class AppModule {}

/**
 * Health module for monitoring endpoints.
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PimcoreModule } from '../pimcore/pimcore.module';
import { MedusaModule } from '../medusa/medusa.module';
import { SqsModule } from '../sqs/sqs.module';

@Module({
  imports: [PimcoreModule, MedusaModule, SqsModule],
  controllers: [HealthController],
})
export class HealthModule {}

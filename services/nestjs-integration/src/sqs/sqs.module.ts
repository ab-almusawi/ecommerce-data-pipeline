/**
 * SQS Module for message consumption and processing.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SqsConsumerService } from './sqs-consumer.service';
import { SqsService } from './sqs.service';
import { PimcoreModule } from '../pimcore/pimcore.module';

@Module({
  imports: [ConfigModule, PimcoreModule],
  providers: [SqsService, SqsConsumerService],
  exports: [SqsService, SqsConsumerService],
})
export class SqsModule {}

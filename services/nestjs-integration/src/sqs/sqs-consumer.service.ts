/**
 * SQS Consumer Service with idempotency, retry logic, and structured error handling.
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SqsService } from './sqs.service';
import { PimcoreService } from '../pimcore/pimcore.service';
import { IdempotencyService } from '../common/services/idempotency.service';
import { IdempotencyStatus } from '../common/utils/idempotency.util';
import { SqsException } from '../common/exceptions';
import {
  CanonicalProduct,
  ProductIngestedEvent,
  SqsMessageBody,
} from '../common/interfaces/product.interface';

interface ProcessingMetrics {
  processed: number;
  skipped: number;
  failed: number;
  totalDurationMs: number;
}

@Injectable()
export class SqsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumerService.name);
  private isProcessing = false;
  private shouldStop = false;
  private metrics: ProcessingMetrics = {
    processed: 0,
    skipped: 0,
    failed: 0,
    totalDurationMs: 0,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly sqsService: SqsService,
    private readonly pimcoreService: PimcoreService,
    private readonly idempotencyService: IdempotencyService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.logger.log('SQS Consumer Service initialized');
  }

  onModuleDestroy() {
    this.shouldStop = true;
    this.logger.log('SQS Consumer Service shutting down gracefully');
    this.logMetrics();
  }

  @Interval(5000)
  async pollMessages(): Promise<void> {
    if (this.isProcessing || this.shouldStop) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      const maxMessages = this.configService.get<number>('sqs.maxMessages', 10);
      const waitTime = this.configService.get<number>('sqs.waitTimeSeconds', 5);
      
      const messages = await this.sqsService.receiveMessages(maxMessages, waitTime);

      if (messages.length > 0) {
        this.logger.log(`Received ${messages.length} messages from SQS`);
        await this.processMessageBatch(messages);
      }
    } catch (error) {
      this.logger.error(`Error polling SQS: ${(error as Error).message}`);
    } finally {
      this.isProcessing = false;
      this.metrics.totalDurationMs += Date.now() - startTime;
    }
  }

  private async processMessageBatch(messages: any[]): Promise<void> {
    const results = await Promise.allSettled(
      messages.map((message) => this.processMessageWithRetry(message)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(`Message processing failed: ${result.reason}`);
      }
    }
  }

  private async processMessageWithRetry(message: any): Promise<void> {
    const startTime = Date.now();
    
    try {
      const body = JSON.parse(message.Body) as SqsMessageBody;
      const eventDetail = body.detail;

      if (!eventDetail?.product) {
        this.logger.warn(`Invalid message format: ${message.MessageId}`);
        await this.sqsService.deleteMessage(message.ReceiptHandle);
        return;
      }

      const product = eventDetail.product;
      const eventId = eventDetail.eventId;
      const correlationId = eventDetail.correlationId || eventId;

      const status = await this.idempotencyService.checkAndLock(
        product.id,
        eventId,
      );

      if (this.idempotencyService.isProcessed(status)) {
        this.logger.debug(
          `Skipping already processed message: ${product.id}/${eventId}`,
        );
        this.metrics.skipped++;
        await this.sqsService.deleteMessage(message.ReceiptHandle);
        return;
      }

      if (this.idempotencyService.isProcessing(status)) {
        this.logger.debug(
          `Message already being processed: ${product.id}/${eventId}`,
        );
        return;
      }

      try {
        await this.processProduct(product, eventDetail, correlationId);
        
        await this.idempotencyService.markCompleted(product.id, eventId, {
          processedAt: new Date().toISOString(),
        });
        
        await this.sqsService.deleteMessage(message.ReceiptHandle);
        
        this.metrics.processed++;
        this.logger.log(
          `Successfully processed product ${product.id} in ${Date.now() - startTime}ms`,
        );
      } catch (error) {
        await this.idempotencyService.markFailed(
          product.id,
          eventId,
          (error as Error).message,
        );
        
        this.metrics.failed++;
        throw error;
      }
    } catch (error) {
      const sqsError = error as Error;
      this.logger.error(
        `Failed to process message ${message.MessageId}: ${sqsError.message}`,
      );
      throw new SqsException(
        `Message processing failed: ${sqsError.message}`,
        'processMessage',
        { correlationId: message.MessageId },
        sqsError,
      );
    }
  }

  private async processProduct(
    product: CanonicalProduct,
    eventDetail: ProductIngestedEvent,
    correlationId: string,
  ): Promise<void> {
    this.logger.log(
      `Processing product: ${product.id} (${product.name.en || product.name.ar})`,
      { correlationId },
    );

    const pimcoreResult = await this.pimcoreService.upsertProduct(product);

    this.eventEmitter.emit('product.synced.pimcore', {
      product,
      pimcoreId: pimcoreResult.id,
      batchId: eventDetail.metadata.batchId,
      correlationId,
    });

    this.logger.log(
      `Product ${product.id} synced to Pimcore: ${pimcoreResult.id}`,
      { correlationId },
    );
  }

  private logMetrics(): void {
    this.logger.log('Consumer metrics', {
      processed: this.metrics.processed,
      skipped: this.metrics.skipped,
      failed: this.metrics.failed,
      avgProcessingTimeMs:
        this.metrics.processed > 0
          ? Math.round(this.metrics.totalDurationMs / this.metrics.processed)
          : 0,
    });
  }

  getMetrics(): ProcessingMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      processed: 0,
      skipped: 0,
      failed: 0,
      totalDurationMs: 0,
    };
  }
}

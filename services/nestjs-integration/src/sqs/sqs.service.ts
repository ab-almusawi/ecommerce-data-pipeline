/**
 * SQS Service for interacting with AWS SQS.
 * Provides low-level SQS operations with retry logic.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  GetQueueAttributesCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { SqsException } from '../common/exceptions';
import { retryWithBackoff } from '../common/utils/retry.util';

@Injectable()
export class SqsService implements OnModuleInit {
  private readonly logger = new Logger(SqsService.name);
  private sqsClient!: SQSClient;
  private queueUrl!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const awsEndpoint = this.configService.get<string>('aws.endpoint');
    const awsRegion = this.configService.get<string>('aws.region', 'us-east-1');

    this.sqsClient = new SQSClient({
      region: awsRegion,
      ...(awsEndpoint && {
        endpoint: awsEndpoint,
        credentials: {
          accessKeyId: this.configService.get<string>('aws.accessKeyId', 'test'),
          secretAccessKey: this.configService.get<string>('aws.secretAccessKey', 'test'),
        },
      }),
    });

    this.queueUrl = this.configService.get<string>(
      'sqs.queueUrl',
      'http://localhost:4566/000000000000/product-ingestion-queue',
    );

    this.logger.log(`SQS Service initialized with queue: ${this.queueUrl}`);
  }

  async receiveMessages(
    maxMessages = 10,
    waitTimeSeconds = 20,
  ): Promise<Message[]> {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        WaitTimeSeconds: waitTimeSeconds,
        MessageAttributeNames: ['All'],
        AttributeNames: ['All'],
      });

      const response = await this.sqsClient.send(command);
      return response.Messages || [];
    } catch (error) {
      throw new SqsException(
        `Failed to receive messages: ${(error as Error).message}`,
        'receiveMessages',
        {},
        error as Error,
      );
    }
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    await retryWithBackoff(
      async () => {
        const command = new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: receiptHandle,
        });
        await this.sqsClient.send(command);
      },
      { maxAttempts: 3, baseDelayMs: 500 },
      this.logger,
      'deleteMessage',
    );
  }

  async extendVisibilityTimeout(
    receiptHandle: string,
    timeoutSeconds: number,
  ): Promise<void> {
    try {
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: timeoutSeconds,
      });
      await this.sqsClient.send(command);
    } catch (error) {
      this.logger.warn(
        `Failed to extend visibility timeout: ${(error as Error).message}`,
      );
    }
  }

  async getQueueAttributes(): Promise<Record<string, string>> {
    try {
      const command = new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
          'ApproximateNumberOfMessagesDelayed',
        ],
      });
      const response = await this.sqsClient.send(command);
      return response.Attributes || {};
    } catch (error) {
      this.logger.warn(
        `Failed to get queue attributes: ${(error as Error).message}`,
      );
      return {};
    }
  }
}

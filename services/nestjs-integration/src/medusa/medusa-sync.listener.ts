/**
 * Event listener for syncing products to MedusaJS after Pimcore sync.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MedusaService } from './medusa.service';
import { CanonicalProduct } from '../common/interfaces/product.interface';

interface PimcoreSyncedEvent {
  product: CanonicalProduct;
  pimcoreId: string;
  batchId: string;
  correlationId: string;
}

@Injectable()
export class MedusaSyncListener {
  private readonly logger = new Logger(MedusaSyncListener.name);

  constructor(private readonly medusaService: MedusaService) {}

  @OnEvent('product.synced.pimcore')
  async handlePimcoreSynced(event: PimcoreSyncedEvent): Promise<void> {
    const { product, pimcoreId, batchId, correlationId } = event;

    this.logger.log(
      `Received product.synced.pimcore event for ${product.id}`,
      { correlationId, batchId, pimcoreId },
    );

    try {
      const medusaResult = await this.medusaService.upsertProduct(product);

      this.logger.log(
        `Product ${product.id} synced to MedusaJS: ${medusaResult.id}`,
        { correlationId },
      );

      await this.medusaService.publishProduct(medusaResult.id);

      this.logger.log(
        `Product ${product.id} published in MedusaJS`,
        { correlationId },
      );
    } catch (error) {
      this.logger.error(
        `Failed to sync product ${product.id} to MedusaJS: ${(error as Error).message}`,
        { correlationId, error },
      );
    }
  }
}

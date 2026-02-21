/**
 * Pimcore Service with retry logic, circuit breaker, and comprehensive error handling.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { CanonicalProduct } from '../common/interfaces/product.interface';
import { PimcoreException } from '../common/exceptions';
import { retryWithBackoff, RetryConfig } from '../common/utils/retry.util';
import {
  CircuitBreaker,
  getCircuitBreaker,
} from '../common/utils/circuit-breaker.util';

export interface PimcoreProductResponse {
  id: string;
  path: string;
  key: string;
  published: boolean;
}

@Injectable()
export class PimcoreService implements OnModuleInit {
  private readonly logger = new Logger(PimcoreService.name);
  private httpClient!: AxiosInstance;
  private circuitBreaker!: CircuitBreaker;
  private retryConfig!: RetryConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    const apiUrl = this.configService.get<string>(
      'pimcore.apiUrl',
      'http://localhost:8080/api',
    );
    const apiKey = this.configService.get<string>('pimcore.apiKey');
    const timeout = this.configService.get<number>('pimcore.timeoutMs', 30000);

    this.httpClient = axios.create({
      baseURL: apiUrl,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'X-API-Key': apiKey }),
      },
    });

    this.httpClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        this.logger.error(
          `Pimcore API error: ${error.message}`,
          error.response?.data,
        );
        return Promise.reject(error);
      },
    );

    this.circuitBreaker = getCircuitBreaker('pimcore', {
      failureThreshold: this.configService.get<number>(
        'circuitBreaker.failureThreshold',
        5,
      ),
      resetTimeout: this.configService.get<number>(
        'circuitBreaker.resetTimeoutMs',
        60000,
      ),
      timeout,
    });

    this.retryConfig = {
      maxAttempts: this.configService.get<number>('retry.maxAttempts', 3),
      baseDelayMs: this.configService.get<number>('retry.baseDelayMs', 1000),
      maxDelayMs: this.configService.get<number>('retry.maxDelayMs', 30000),
      exponentialBase: 2,
      jitter: true,
    };

    this.logger.log(`Pimcore Service initialized with API: ${apiUrl}`);
  }

  async upsertProduct(product: CanonicalProduct): Promise<PimcoreProductResponse> {
    return this.circuitBreaker.execute(async () => {
      return retryWithBackoff(
        async () => this.doUpsertProduct(product),
        this.retryConfig,
        this.logger,
        `upsertProduct:${product.id}`,
      );
    });
  }

  private async doUpsertProduct(
    product: CanonicalProduct,
  ): Promise<PimcoreProductResponse> {
    try {
      const existingProduct = await this.findProductByExternalId(product.id);

      if (existingProduct) {
        return this.updateProduct(existingProduct.id, product);
      } else {
        return this.createProduct(product);
      }
    } catch (error) {
      throw new PimcoreException(
        `Failed to upsert product ${product.id}: ${(error as Error).message}`,
        'upsertProduct',
        { productId: product.id },
        error as Error,
      );
    }
  }

  private async findProductByExternalId(
    externalId: string,
  ): Promise<PimcoreProductResponse | null> {
    try {
      const response = await this.httpClient.get('/objects', {
        params: {
          className: 'Product',
          filter: JSON.stringify({
            externalId: { $eq: externalId },
          }),
        },
      });

      const items = response.data?.items || response.data?.data || [];
      return items.length > 0 ? items[0] : null;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        return null;
      }
      this.logger.debug(
        `Product not found by external ID ${externalId}, will create new`,
      );
      return null;
    }
  }

  private async createProduct(
    product: CanonicalProduct,
  ): Promise<PimcoreProductResponse> {
    const pimcoreData = this.transformToPimcoreFormat(product);
    const key = this.generateKey(product);

    const response = await this.httpClient.post('/objects', {
      className: 'Product',
      parentId: 1,
      key,
      published: false,
      data: pimcoreData,
    });

    const result: PimcoreProductResponse = {
      id: response.data.id || response.data.objectId || `new-${product.id}`,
      path: response.data.path || `/products/${key}`,
      key,
      published: false,
    };

    this.logger.log(`Created Pimcore product: ${result.id} for ${product.id}`);
    return result;
  }

  private async updateProduct(
    pimcoreId: string,
    product: CanonicalProduct,
  ): Promise<PimcoreProductResponse> {
    const pimcoreData = this.transformToPimcoreFormat(product);

    const response = await this.httpClient.put(`/objects/${pimcoreId}`, {
      data: pimcoreData,
    });

    const result: PimcoreProductResponse = {
      id: pimcoreId,
      path: response.data.path || `/products/${this.generateKey(product)}`,
      key: this.generateKey(product),
      published: response.data.published || false,
    };

    this.logger.log(`Updated Pimcore product: ${result.id}`);
    return result;
  }

  async publishProduct(pimcoreId: string): Promise<void> {
    await this.circuitBreaker.execute(async () => {
      await this.httpClient.put(`/objects/${pimcoreId}`, {
        published: true,
      });

      this.eventEmitter.emit('product.published.pimcore', { pimcoreId });
      this.logger.log(`Published Pimcore product: ${pimcoreId}`);
    });
  }

  private transformToPimcoreFormat(
    product: CanonicalProduct,
  ): Record<string, unknown> {
    return {
      externalId: product.id,
      sku: product.sku,
      name: {
        en: product.name.en,
        ar: product.name.ar || product.name.en,
      },
      description: product.description
        ? {
            en: product.description.en,
            ar: product.description.ar || product.description.en,
          }
        : null,
      categories: product.categories.map((cat) => ({
        id: cat.id,
        name: cat.name.en,
        slug: cat.slug,
        level: cat.level,
      })),
      attributes: product.attributes.map((attr) => ({
        name: attr.name.en,
        value: attr.value.en,
        type: attr.type,
      })),
      variants: product.variants.map((variant) => ({
        sku: variant.sku,
        color: variant.color?.name,
        colorCode: variant.color?.code,
        size: variant.size,
        price: variant.price.amount,
        currency: variant.price.currency,
        originalPrice: variant.price.originalAmount,
        discountPercent: variant.price.discountPercent,
        stock: variant.stock,
        images: variant.images,
      })),
      images: product.images.map((img) => ({
        url: img.url,
        type: img.type,
        sortOrder: img.sortOrder,
        variantId: img.variantId,
      })),
      metadata: {
        sourceSystem: product.metadata.source,
        sourceId: product.metadata.sourceId,
        importedAt: product.metadata.importedAt,
        productRelationId: product.metadata.productRelationId,
      },
    };
  }

  private generateKey(product: CanonicalProduct): string {
    const name = product.name.en || product.name.ar || 'product';
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    return `${slug}-${product.id}`;
  }

  getCircuitBreakerStats(): Record<string, unknown> {
    return this.circuitBreaker.getStats();
  }
}

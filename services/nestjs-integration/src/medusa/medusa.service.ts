/**
 * MedusaJS Service with retry logic, circuit breaker, and comprehensive error handling.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { CanonicalProduct, Variant } from '../common/interfaces/product.interface';
import { MedusaException } from '../common/exceptions';
import { retryWithBackoff, RetryConfig } from '../common/utils/retry.util';
import {
  CircuitBreaker,
  getCircuitBreaker,
} from '../common/utils/circuit-breaker.util';

export interface MedusaProductResponse {
  id: string;
  handle: string;
  title: string;
  status: string;
}

@Injectable()
export class MedusaService implements OnModuleInit {
  private readonly logger = new Logger(MedusaService.name);
  private httpClient!: AxiosInstance;
  private circuitBreaker!: CircuitBreaker;
  private retryConfig!: RetryConfig;
  private sessionCookie: string | null = null;
  private apiUrl!: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.apiUrl = this.configService.get<string>(
      'medusa.apiUrl',
      'http://localhost:9000',
    );
    const apiKey = this.configService.get<string>('medusa.apiKey');
    const timeout = this.configService.get<number>('medusa.timeoutMs', 30000);

    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'x-medusa-access-token': apiKey }),
      },
      withCredentials: true,
    });

    this.httpClient.interceptors.request.use((config) => {
      if (this.sessionCookie) {
        config.headers.Cookie = this.sessionCookie;
      }
      return config;
    });

    this.httpClient.interceptors.response.use(
      (response) => {
        const setCookie = response.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) {
          this.sessionCookie = setCookie[0].split(';')[0];
        }
        return response;
      },
      (error: AxiosError) => {
        this.logger.error(
          `Medusa API error: ${error.message}`,
          error.response?.data,
        );
        return Promise.reject(error);
      },
    );

    this.circuitBreaker = getCircuitBreaker('medusa', {
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

    this.logger.log(`Medusa Service initialized with API: ${this.apiUrl}`);

    await this.authenticate();
  }

  private async authenticate(): Promise<void> {
    const email = this.configService.get<string>('medusa.adminEmail', 'admin@challenge.com');
    const password = this.configService.get<string>('medusa.adminPassword', 'admin123');

    try {
      const response = await this.httpClient.post('/admin/auth', { email, password });
      this.logger.log(`Authenticated to Medusa as ${email}`);
      
      const setCookie = response.headers['set-cookie'];
      if (setCookie && setCookie.length > 0) {
        this.sessionCookie = setCookie[0].split(';')[0];
        this.logger.debug(`Session cookie captured`);
      }
    } catch (error) {
      this.logger.warn(`Failed to authenticate to Medusa: ${error}. Products won't sync to MedusaJS.`);
    }
  }

  async upsertProduct(product: CanonicalProduct): Promise<MedusaProductResponse> {
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
  ): Promise<MedusaProductResponse> {
    try {
      const handle = this.generateHandle(product);
      const existingProduct = await this.findProductByHandle(handle);

      if (existingProduct) {
        return this.updateProduct(existingProduct.id, product);
      } else {
        return this.createProduct(product);
      }
    } catch (error) {
      throw new MedusaException(
        `Failed to upsert product ${product.id}: ${(error as Error).message}`,
        'upsertProduct',
        { productId: product.id },
        error as Error,
      );
    }
  }

  private async findProductByHandle(
    handle: string,
  ): Promise<MedusaProductResponse | null> {
    try {
      const response = await this.httpClient.get('/admin/products', {
        params: { handle },
      });

      const products = response.data?.products || [];
      return products.length > 0 ? products[0] : null;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        return null;
      }
      this.logger.debug(`Product not found by handle ${handle}, will create new`);
      return null;
    }
  }

  private async createProduct(
    product: CanonicalProduct,
  ): Promise<MedusaProductResponse> {
    const medusaData = this.transformToMedusaFormat(product);

    const response = await this.httpClient.post('/admin/products', medusaData);

    const result: MedusaProductResponse = {
      id: response.data.product?.id || `new-${product.id}`,
      handle: response.data.product?.handle || this.generateHandle(product),
      title: response.data.product?.title || product.name.en,
      status: response.data.product?.status || 'draft',
    };

    this.logger.log(`Created Medusa product: ${result.id} for ${product.id}`);
    return result;
  }

  private async updateProduct(
    medusaId: string,
    product: CanonicalProduct,
  ): Promise<MedusaProductResponse> {
    const medusaData = this.transformToMedusaFormat(product);

    const response = await this.httpClient.post(
      `/admin/products/${medusaId}`,
      medusaData,
    );

    const result: MedusaProductResponse = {
      id: medusaId,
      handle: response.data.product?.handle || this.generateHandle(product),
      title: response.data.product?.title || product.name.en,
      status: response.data.product?.status || 'draft',
    };

    this.logger.log(`Updated Medusa product: ${result.id}`);
    return result;
  }

  async publishProduct(medusaId: string): Promise<void> {
    await this.circuitBreaker.execute(async () => {
      await retryWithBackoff(
        async () => {
          await this.httpClient.post(`/admin/products/${medusaId}`, {
            status: 'published',
          });
          this.logger.log(`Published Medusa product: ${medusaId}`);
        },
        this.retryConfig,
        this.logger,
        `publishProduct:${medusaId}`,
      );
    });
  }

  private transformToMedusaFormat(
    product: CanonicalProduct,
  ): Record<string, unknown> {
    const hasColorVariants = product.variants.some((v) => v.color);
    const hasSizeVariants = product.variants.some((v) => v.size);

    const options: Array<{ title: string }> = [];
    if (hasColorVariants) options.push({ title: 'Color' });
    if (hasSizeVariants) options.push({ title: 'Size' });
    if (options.length === 0) options.push({ title: 'Default' });

    const mainImage = product.images.find((img) => img.type === 'main');
    const galleryImages = product.images.filter(
      (img) => img.type === 'main' || img.type === 'gallery',
    );

    return {
      title: product.name.en,
      subtitle: product.name.ar,
      description: product.description?.en || '',
      handle: this.generateHandle(product),
      is_giftcard: false,
      status: 'draft',
      images: galleryImages.slice(0, 10).map((img) => ({ url: img.url })),
      thumbnail: mainImage?.url,
      options,
      variants: product.variants.map((variant) =>
        this.transformVariant(variant, hasColorVariants, hasSizeVariants),
      ),
      metadata: {
        sourceSystem: product.metadata.source,
        sourceId: product.metadata.sourceId,
        importedAt: product.metadata.importedAt,
        externalId: product.id,
      },
    };
  }

  private transformVariant(
    variant: Variant,
    hasColor: boolean,
    hasSize: boolean,
  ): Record<string, unknown> {
    const options: Array<{ value: string }> = [];

    if (hasColor) {
      options.push({ value: variant.color?.name || 'Default' });
    }
    if (hasSize) {
      options.push({ value: variant.size || 'One Size' });
    }
    if (options.length === 0) {
      options.push({ value: 'Default' });
    }

    const prices: Array<{ amount: number; currency_code: string }> = [];
    
    if (variant.price.amount > 0) {
      prices.push({
        amount: Math.round(variant.price.amount * 100),
        currency_code: variant.price.currency.toLowerCase(),
      });
    }

    if (variant.price.usdAmount && variant.price.usdAmount > 0) {
      prices.push({
        amount: Math.round(variant.price.usdAmount * 100),
        currency_code: 'usd',
      });
    }

    if (prices.length === 0) {
      prices.push({ amount: 0, currency_code: 'usd' });
    }

    return {
      title: this.generateVariantTitle(variant),
      sku: variant.sku || `${variant.id}`,
      inventory_quantity: Math.max(0, variant.stock),
      allow_backorder: false,
      manage_inventory: true,
      prices,
      options,
    };
  }

  private generateVariantTitle(variant: Variant): string {
    const parts: string[] = [];
    if (variant.color?.name) parts.push(variant.color.name);
    if (variant.size) parts.push(variant.size);
    return parts.length > 0 ? parts.join(' / ') : 'Default';
  }

  private generateHandle(product: CanonicalProduct): string {
    const name = product.name.en || product.name.ar || 'product';
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }

  getCircuitBreakerStats(): Record<string, unknown> {
    return this.circuitBreaker.getStats();
  }
}

/**
 * Product interfaces for the integration service.
 * These interfaces mirror the canonical model used in the Python Lambda.
 */

export interface LocalizedString {
  ar?: string;
  en: string;
}

export interface Category {
  id: string;
  name: LocalizedString;
  slug: string;
  parentId?: string;
  level: number;
  isLeaf: boolean;
}

export interface Attribute {
  id: string;
  name: LocalizedString;
  value: LocalizedString;
  type: string;
}

export interface Price {
  amount: number;
  currency: string;
  originalAmount?: number;
  discountPercent?: number;
  usdAmount?: number;
}

export interface ColorInfo {
  name: string;
  code: string;
}

export interface Variant {
  id: string;
  sku: string;
  color?: ColorInfo;
  size?: string;
  price: Price;
  stock: number;
  images: string[];
}

export interface Image {
  url: string;
  type: 'main' | 'gallery' | 'thumbnail';
  variantId?: string;
  sortOrder: number;
}

export interface ProductMetadata {
  source: string;
  sourceId: string;
  importedAt: string;
  productRelationId?: string;
}

export interface CanonicalProduct {
  id: string;
  sku: string;
  name: LocalizedString;
  description?: LocalizedString;
  categories: Category[];
  attributes: Attribute[];
  variants: Variant[];
  images: Image[];
  metadata: ProductMetadata;
}

export interface ProductIngestedEvent {
  eventId: string;
  timestamp: string;
  correlationId: string;
  product: CanonicalProduct;
  metadata: {
    s3Bucket: string;
    s3Key: string;
    batchId: string;
    itemIndex: number;
    totalItems: number;
  };
}

export interface SqsMessageBody {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  detail: ProductIngestedEvent;
}

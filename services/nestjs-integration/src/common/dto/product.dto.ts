/**
 * Data Transfer Objects for product data validation.
 */

import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  ValidateNested,
  Min,
  IsUrl,
  IsEnum,
} from 'class-validator';

export class LocalizedStringDto {
  @IsString()
  @IsOptional()
  ar?: string;

  @IsString()
  en!: string;
}

export class CategoryDto {
  @IsString()
  id!: string;

  @ValidateNested()
  @Type(() => LocalizedStringDto)
  name!: LocalizedStringDto;

  @IsString()
  slug!: string;

  @IsString()
  @IsOptional()
  parentId?: string;

  @IsNumber()
  @Min(0)
  level!: number;

  @IsBoolean()
  isLeaf!: boolean;
}

export class AttributeDto {
  @IsString()
  id!: string;

  @ValidateNested()
  @Type(() => LocalizedStringDto)
  name!: LocalizedStringDto;

  @ValidateNested()
  @Type(() => LocalizedStringDto)
  value!: LocalizedStringDto;

  @IsString()
  type!: string;
}

export class PriceDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  currency!: string;

  @IsNumber()
  @IsOptional()
  originalAmount?: number;

  @IsNumber()
  @IsOptional()
  discountPercent?: number;

  @IsNumber()
  @IsOptional()
  usdAmount?: number;
}

export class ColorInfoDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;
}

export class VariantDto {
  @IsString()
  id!: string;

  @IsString()
  sku!: string;

  @ValidateNested()
  @Type(() => ColorInfoDto)
  @IsOptional()
  color?: ColorInfoDto;

  @IsString()
  @IsOptional()
  size?: string;

  @ValidateNested()
  @Type(() => PriceDto)
  price!: PriceDto;

  @IsNumber()
  @Min(0)
  stock!: number;

  @IsArray()
  @IsString({ each: true })
  images!: string[];
}

export enum ImageType {
  MAIN = 'main',
  GALLERY = 'gallery',
  THUMBNAIL = 'thumbnail',
}

export class ImageDto {
  @IsUrl()
  url!: string;

  @IsEnum(ImageType)
  type!: ImageType;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsNumber()
  @Min(0)
  sortOrder!: number;
}

export class ProductMetadataDto {
  @IsString()
  source!: string;

  @IsString()
  sourceId!: string;

  @IsString()
  importedAt!: string;

  @IsString()
  @IsOptional()
  productRelationId?: string;
}

export class CanonicalProductDto {
  @IsString()
  id!: string;

  @IsString()
  sku!: string;

  @ValidateNested()
  @Type(() => LocalizedStringDto)
  name!: LocalizedStringDto;

  @ValidateNested()
  @Type(() => LocalizedStringDto)
  @IsOptional()
  description?: LocalizedStringDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryDto)
  categories!: CategoryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeDto)
  attributes!: AttributeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants!: VariantDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImageDto)
  images!: ImageDto[];

  @ValidateNested()
  @Type(() => ProductMetadataDto)
  metadata!: ProductMetadataDto;
}

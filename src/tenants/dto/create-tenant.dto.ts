import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PROVIDER_NAMES, type ProviderName } from '../tenant.entity.js';

export class CreateTenantDto {
  @Matches(/^[a-z0-9][a-z0-9-]{1,62}$/)
  slug: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[];

  @IsOptional()
  @IsIn(PROVIDER_NAMES)
  provider?: ProviderName;

  @IsOptional()
  @IsObject()
  providerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceThreshold?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  handoffKeywords?: string[];

  @IsOptional()
  @IsString()
  fallbackMessage?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  contactUrl?: string;
}

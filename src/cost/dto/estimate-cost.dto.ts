import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  PROVIDER_NAMES,
  type ProviderName,
} from '../../tenants/tenant.entity.js';

export class EstimateCostDto {
  /** 省略時は、このブランチで登録されている最初の方式 */
  @IsOptional()
  @IsIn(PROVIDER_NAMES)
  approach?: ProviderName;

  /** 上書きする前提（キーは GET /admin/cost/assumptions の fields） */
  @IsOptional()
  @IsObject()
  assumptions?: Record<string, unknown>;

  /** 会話ログの実測値（トークン数など）で前提を置き換える */
  @IsOptional()
  @IsBoolean()
  useMeasuredUsage?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(10_000, { each: true })
  tenantCounts?: number[];
}

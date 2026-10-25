import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CostService } from './cost.service.js';
import { EstimateCostDto } from './dto/estimate-cost.dto.js';

/** 費用の見積もり（モックのため認証なし）。画面は /cost.html */
@Controller('admin/cost')
export class CostController {
  constructor(private readonly cost: CostService) {}

  /** 見積もりの前提（項目の説明と既定値） */
  @Get('assumptions')
  assumptions() {
    return this.cost.assumptions();
  }

  /** 前提を上書きして、テナント数ごとの月の費用と収益分岐点を出す */
  @Post('estimate')
  @HttpCode(200)
  estimate(@Body() dto: EstimateCostDto) {
    return this.cost.estimate(dto);
  }

  /** 会話ログから集計した利用量の実測値 */
  @Get('usage')
  usage(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('tenantId', new ParseUUIDPipe({ optional: true })) tenantId?: string,
  ) {
    return this.cost.measuredUsage(Math.min(Math.max(days, 1), 365), tenantId);
  }
}

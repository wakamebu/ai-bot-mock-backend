import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { CostController } from './cost.controller.js';
import { CostService } from './cost.service.js';

/**
 * 費用の見積もり。方式ごとの見積もりモデルは src/providers/<name>/ が @RegisterCostModel() で登録する。
 */
@Module({
  imports: [DiscoveryModule],
  controllers: [CostController],
  providers: [CostService],
})
export class CostModule {}

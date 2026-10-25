import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsModule } from '../tenants/tenants.module.js';
import { KnowledgeDocument } from './knowledge-document.entity.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeService } from './knowledge.service.js';

/**
 * 資料の登録・管理（/admin/tenants/:tenantId/knowledge）。
 * 保存先は src/providers/<name>/ が @RegisterKnowledgeStore() で登録する。
 */
@Module({
  imports: [
    DiscoveryModule,
    TypeOrmModule.forFeature([KnowledgeDocument]),
    TenantsModule,
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}

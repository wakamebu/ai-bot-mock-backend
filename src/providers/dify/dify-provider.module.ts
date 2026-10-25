import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeDocument } from '../../knowledge/knowledge-document.entity.js';
import { DifyChatProvider } from './dify-chat.provider.js';
import { DifyClient } from './dify.client.js';
import { DifyCostModel } from './dify-cost.model.js';
import { DifyKnowledgeStore } from './dify-knowledge.store.js';
import { DifyProvisioner } from './dify-provisioner.js';

/**
 * Dify 方式（provider: "dify"）。
 * 回答（ChatProvider）・資料の保存先（KnowledgeStore）・費用の見積もり（CostModel）を登録する。
 */
@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeDocument])],
  providers: [
    DifyClient,
    DifyProvisioner,
    DifyChatProvider,
    DifyKnowledgeStore,
    DifyCostModel,
  ],
})
export class DifyProviderModule {}

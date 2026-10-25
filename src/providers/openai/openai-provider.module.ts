import { Module } from '@nestjs/common';
import { OpenAiChatProvider } from './openai-chat.provider.js';
import { OpenAiClient } from './openai.client.js';
import { OpenAiCostModel } from './openai-cost.model.js';
import { OpenAiKnowledgeStore } from './openai-knowledge.store.js';

/**
 * OpenAI File Search 方式（provider: "openai"）。
 * 回答（ChatProvider）・資料の保存先（KnowledgeStore）・費用の見積もり（CostModel）を登録する。
 */
@Module({
  providers: [
    OpenAiClient,
    OpenAiChatProvider,
    OpenAiKnowledgeStore,
    OpenAiCostModel,
  ],
})
export class OpenAiProviderModule {}

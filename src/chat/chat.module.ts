import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ChatProviderRegistry } from './providers/chat-provider.registry.js';

/**
 * チャット API とフォールバック判定。方式の実装は持たない。
 * 方式は src/providers/<name>/ のモジュールが @RegisterChatProvider() で登録する。
 */
@Module({
  imports: [DiscoveryModule, TenantsModule, ConversationsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatProviderRegistry],
})
export class ChatModule {}

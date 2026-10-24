import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { CHAT_PROVIDERS } from './providers/chat-provider.js';
import { ChatProviderRegistry } from './providers/chat-provider.registry.js';
import { MockChatProvider } from './providers/mock-chat.provider.js';

/**
 * 方式を追加するときは、実装クラスを providers と CHAT_PROVIDERS の inject に足す。
 */
@Module({
  imports: [TenantsModule, ConversationsModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatProviderRegistry,
    MockChatProvider,
    {
      provide: CHAT_PROVIDERS,
      useFactory: (...providers: unknown[]) => providers,
      inject: [MockChatProvider],
    },
  ],
})
export class ChatModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.module.js';
import { CostModule } from './cost/cost.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DemoModule } from './demo/demo.module.js';
import { HealthModule } from './health/health.module.js';
import { MockProviderModule } from './providers/mock/mock-provider.module.js';
import { TenantsModule } from './tenants/tenants.module.js';

/**
 * 機能ごとのモジュールを積み上げる。機能を足すときは src/<機能>/ にモジュールを作り、ここに import する。
 */
@Module({
  imports: [
    // 基盤
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    HealthModule,
    // 機能
    AuthModule,
    TenantsModule,
    ConversationsModule,
    ChatModule,
    DemoModule,
    CostModule,
    // 方式（RAG の実装）。@RegisterChatProvider() で ChatModule に登録される
    MockProviderModule,
  ],
})
export class AppModule {}

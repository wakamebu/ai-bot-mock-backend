import { Module } from '@nestjs/common';
import { MockChatProvider } from './mock-chat.provider.js';

/** LLM を使わない動作確認用の方式（provider: "mock"） */
@Module({ providers: [MockChatProvider] })
export class MockProviderModule {}

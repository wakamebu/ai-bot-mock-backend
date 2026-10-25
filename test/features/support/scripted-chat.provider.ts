import {
  type ChatProvider,
  type ChatProviderInput,
  type ChatProviderResult,
  RegisterChatProvider,
} from '../../../src/chat/providers/chat-provider.js';

/**
 * 受け入れテスト用の方式。シナリオで指定した通りに回答し、呼ばれた内容を記録する。
 * 方式ごとの実装（Dify / OpenAI）に依存せず、共通部分の振る舞いを確かめるために使う。
 *
 * テストでは MockChatProvider と差し替えるので、登録されるようにデコレーターを付ける。
 */
@RegisterChatProvider()
export class ScriptedChatProvider implements ChatProvider {
  readonly name = 'mock' as const;
  calls: ChatProviderInput[] = [];
  private next: Partial<ChatProviderResult> | Error = {};

  willRespond(result: Partial<ChatProviderResult>) {
    this.next = result;
  }

  willFail() {
    this.next = new Error('scripted provider failure');
  }

  reset() {
    this.calls = [];
    this.next = {};
  }

  generate(input: ChatProviderInput): Promise<ChatProviderResult> {
    this.calls.push(input);
    if (this.next instanceof Error) return Promise.reject(this.next);
    return Promise.resolve({
      answer: 'テスト用の回答です',
      answerable: true,
      confidence: 0.9,
      sources: [],
      ...this.next,
    });
  }
}

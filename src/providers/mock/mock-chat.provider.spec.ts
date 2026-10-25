import type { Tenant } from '../../tenants/tenant.entity.js';
import { MockChatProvider } from './mock-chat.provider.js';

const tenant = {
  providerConfig: {
    faq: [
      { keywords: ['予約'], answer: 'Webから予約できます', source: 'FAQ' },
      { keywords: ['料金', 'いくら'], answer: '198,000円です' },
    ],
  },
} as unknown as Tenant;

const generate = (message: string) =>
  new MockChatProvider().generate({
    tenant,
    message,
    history: [],
    providerConversationId: null,
  });

describe('MockChatProvider', () => {
  it('キーワードに一致した回答と根拠を返す', async () => {
    const result = await generate('予約したいです');
    expect(result).toMatchObject({
      answer: 'Webから予約できます',
      answerable: true,
      sources: [{ title: 'FAQ' }],
    });
  });

  it('一致したキーワードが多い回答を優先し、確信度も上がる', async () => {
    const one = await generate('料金は？');
    const two = await generate('料金はいくら？');
    expect(two.answer).toBe('198,000円です');
    expect(two.confidence!).toBeGreaterThan(one.confidence!);
  });

  it('一致しなければ answerable=false', async () => {
    const result = await generate('駐車場はありますか');
    expect(result.answerable).toBe(false);
  });
});

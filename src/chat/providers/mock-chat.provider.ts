import { Injectable } from '@nestjs/common';
import type {
  ChatProvider,
  ChatProviderInput,
  ChatProviderResult,
} from './chat-provider.js';

interface MockFaqEntry {
  keywords: string[];
  answer: string;
  source?: string;
}

/**
 * LLM を使わない動作確認用の方式。
 * providerConfig.faq のキーワードに一致した回答を返す。一致数に応じて確信度を上げる。
 */
@Injectable()
export class MockChatProvider implements ChatProvider {
  readonly name = 'mock' as const;

  generate({
    tenant,
    message,
  }: ChatProviderInput): Promise<ChatProviderResult> {
    const faq = (tenant.providerConfig.faq ?? []) as MockFaqEntry[];

    let best: { entry: MockFaqEntry; hits: number } | null = null;
    for (const entry of faq) {
      const hits = entry.keywords.filter((k) => message.includes(k)).length;
      if (hits > 0 && (!best || hits > best.hits)) best = { entry, hits };
    }

    if (!best) {
      return Promise.resolve({
        answer: '',
        answerable: false,
        confidence: 0,
        sources: [],
      });
    }

    return Promise.resolve({
      answer: best.entry.answer,
      answerable: true,
      confidence: Math.min(0.5 + best.hits * 0.2, 0.95),
      sources: best.entry.source ? [{ title: best.entry.source }] : [],
    });
  }
}

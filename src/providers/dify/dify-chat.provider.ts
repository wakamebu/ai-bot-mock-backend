import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AnswerSource } from '../../chat/chat.types.js';
import {
  type ChatProvider,
  type ChatProviderInput,
  type ChatProviderResult,
  RegisterChatProvider,
} from '../../chat/providers/chat-provider.js';
import { KnowledgeDocument } from '../../knowledge/knowledge-document.entity.js';
import {
  DifyApiError,
  DifyClient,
  type DifyChatResponse,
  type DifyRetrieverResource,
} from './dify.client.js';
import { parseDifyConfig } from './dify-config.js';

/**
 * チャットフローが「答えられない」ときに返す目印。
 * Dify 側の LLM ノードの指示文に「資料にない場合はこの目印だけを返す」と書いておく。
 */
export const NO_ANSWER_MARKER = '[[NO_ANSWER]]';

/**
 * Dify 方式。テナントごとの Dify インスタンスのチャットフローに、Service API で問い合わせる。
 * 会話の履歴は Dify 側が conversation_id で持つ。
 */
@RegisterChatProvider()
@Injectable()
export class DifyChatProvider implements ChatProvider {
  readonly name = 'dify' as const;
  private readonly logger = new Logger(DifyChatProvider.name);

  constructor(
    private readonly dify: DifyClient,
    @InjectRepository(KnowledgeDocument)
    private readonly documents: Repository<KnowledgeDocument>,
  ) {}

  async generate({
    tenant,
    conversationId,
    message,
    providerConversationId,
  }: ChatProviderInput): Promise<ChatProviderResult> {
    const config = parseDifyConfig(tenant.providerConfig);
    // Dify がまだ用意されていない（資料が1件もない）テナントは、答えられない
    if (!config) {
      return { answer: '', answerable: false, confidence: null, sources: [] };
    }
    const conn = { baseUrl: config.baseUrl, apiKey: config.apiKey };
    // user は Dify 側で利用者を区別する値。会話ごとにこちらの会話IDを渡す
    const request = { query: message, user: conversationId };

    let response: DifyChatResponse;
    try {
      response = await this.dify.chatMessages(conn, {
        ...request,
        ...(providerConversationId && {
          conversation_id: providerConversationId,
        }),
      });
    } catch (error) {
      // Dify 側の会話が消えていたら（期限切れなど）、新しい会話でやり直す
      if (!providerConversationId || !isConversationNotFound(error))
        throw error;
      this.logger.warn(
        `Dify conversation ${providerConversationId} not found; starting a new one`,
      );
      response = await this.dify.chatMessages(conn, request);
    }

    return this.toResult(tenant.id, response);
  }

  private async toResult(
    tenantId: string,
    response: DifyChatResponse,
  ): Promise<ChatProviderResult> {
    const resources = response.metadata?.retriever_resources ?? [];
    const answer = response.answer.replaceAll(NO_ANSWER_MARKER, '').trim();
    const scores = resources
      .map((r) => r.score)
      .filter((s): s is number => typeof s === 'number');
    const usage = response.metadata?.usage;

    return {
      answer,
      answerable:
        !response.answer.includes(NO_ANSWER_MARKER) &&
        answer.length > 0 &&
        resources.length > 0,
      confidence: scores.length > 0 ? Math.max(...scores) : null,
      sources: await this.toSources(tenantId, resources),
      providerConversationId: response.conversation_id,
      ...(usage && {
        usage: {
          inputTokens: usage.prompt_tokens ?? 0,
          outputTokens: usage.completion_tokens ?? 0,
          ...(usage.total_price &&
            usage.currency === 'USD' && {
              reportedCostUsd: Number(usage.total_price),
            }),
        },
      }),
      raw: response,
    };
  }

  /**
   * 検索結果を根拠にする。API で登録した資料なら、こちらに記録した題名と元の URL を使う。
   * Dify の画面で登録した資料は、Dify のドキュメント名をそのまま題名にする。
   */
  private async toSources(
    tenantId: string,
    resources: DifyRetrieverResource[],
  ): Promise<AnswerSource[]> {
    const ids = resources
      .map((r) => r.document_id)
      .filter((id): id is string => !!id);
    const registered = ids.length
      ? await this.documents.findBy({
          tenantId,
          providerDocumentId: In(ids),
        })
      : [];
    const byId = new Map(registered.map((d) => [d.providerDocumentId, d]));

    const best = new Map<string, DifyRetrieverResource>();
    for (const r of resources) {
      const key = r.document_id ?? r.document_name ?? '';
      const current = best.get(key);
      if (!current || (r.score ?? 0) > (current.score ?? 0)) best.set(key, r);
    }
    return [...best.values()]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map((r) => {
        const doc = r.document_id ? byId.get(r.document_id) : undefined;
        return {
          title: doc?.title ?? r.document_name ?? '資料',
          ...(doc?.sourceUrl && { url: doc.sourceUrl }),
          ...(r.content && { snippet: r.content.slice(0, 200) }),
          ...(r.score !== undefined && { score: r.score }),
        };
      });
  }
}

function isConversationNotFound(error: unknown): boolean {
  return (
    error instanceof DifyApiError &&
    error.status === 404 &&
    /conversation/i.test(error.message)
  );
}

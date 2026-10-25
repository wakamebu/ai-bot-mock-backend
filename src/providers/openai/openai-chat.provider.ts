import { Injectable } from '@nestjs/common';
import type { Response as OpenAiResponse } from 'openai/resources/responses/responses';
import type { AnswerSource } from '../../chat/chat.types.js';
import {
  type ChatProvider,
  type ChatProviderInput,
  type ChatProviderResult,
  RegisterChatProvider,
} from '../../chat/providers/chat-provider.js';
import { buildInstructions } from './instructions.js';
import { OpenAiClient } from './openai.client.js';
import { parseOpenAiConfig } from './openai-config.js';

const DEFAULT_MAX_NUM_RESULTS = 5;

/** モデルに返させる JSON の形 */
const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    answerable: { type: 'boolean' },
  },
  required: ['answer', 'answerable'],
  additionalProperties: false,
} as const;

/**
 * OpenAI Responses API + File Search の方式。
 * 検索対象はテナントの Vector Store だけ。会話の履歴は自前の DB から毎回渡し、OpenAI 側には保存させない（store: false）。
 */
@RegisterChatProvider()
@Injectable()
export class OpenAiChatProvider implements ChatProvider {
  readonly name = 'openai' as const;

  constructor(private readonly openai: OpenAiClient) {}

  async generate({
    tenant,
    message,
    history,
  }: ChatProviderInput): Promise<ChatProviderResult> {
    const config = parseOpenAiConfig(tenant.providerConfig);
    // 資料が1件も登録されていない（Vector Store がない）テナントは、答えられない
    if (!config.vectorStoreId) {
      return { answer: '', answerable: false, confidence: null, sources: [] };
    }

    const effort = this.openai.reasoningEffort;
    const response = await this.openai.get().responses.create({
      model: this.openai.model,
      instructions: buildInstructions(tenant, config.instructions),
      input: [
        ...history.map(({ role, content }) => ({ role, content })),
        { role: 'user' as const, content: message },
      ],
      tools: [
        {
          type: 'file_search',
          vector_store_ids: [config.vectorStoreId],
          max_num_results: config.maxNumResults ?? DEFAULT_MAX_NUM_RESULTS,
        },
      ],
      include: ['file_search_call.results'],
      text: {
        format: {
          type: 'json_schema',
          name: 'chat_answer',
          strict: true,
          schema: ANSWER_SCHEMA,
        },
      },
      store: false,
      ...(effort && {
        reasoning: { effort: effort as 'minimal' | 'low' | 'medium' | 'high' },
      }),
    });

    return toChatProviderResult(response);
  }
}

/** Responses API のレスポンスを共通の形に変換する */
export function toChatProviderResult(
  response: OpenAiResponse,
): ChatProviderResult {
  const searchCalls = response.output.filter(
    (item) => item.type === 'file_search_call',
  );
  const results = searchCalls.flatMap((call) => call.results ?? []);

  const parsed = parseAnswer(response.output_text);
  const sources = toSources(results);
  const scores = results
    .map((r) => r.score)
    .filter((s): s is number => typeof s === 'number');

  return {
    answer: parsed.answer.trim(),
    // 検索で何も見つからなかったのに答えている場合は、資料にもとづかない回答とみなす
    answerable: parsed.answerable && results.length > 0,
    confidence: scores.length > 0 ? Math.max(...scores) : null,
    sources,
    usage: {
      model: response.model,
      inputTokens: response.usage?.input_tokens ?? 0,
      cachedInputTokens:
        response.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      searchCalls: searchCalls.length,
    },
    raw: response,
  };
}

function parseAnswer(text: string): { answer: string; answerable: boolean } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`model output is not JSON: ${text.slice(0, 200)}`);
  }
  const { answer, answerable } = value as Record<string, unknown>;
  if (typeof answer !== 'string' || typeof answerable !== 'boolean') {
    throw new Error(`unexpected model output: ${text.slice(0, 200)}`);
  }
  return { answer, answerable };
}

type SearchResult = NonNullable<
  Extract<
    OpenAiResponse['output'][number],
    { type: 'file_search_call' }
  >['results']
>[number];

/** 同じファイルの検索結果は1つにまとめ、スコアの高い順に並べる */
function toSources(results: SearchResult[]): AnswerSource[] {
  const byFile = new Map<string, SearchResult>();
  for (const r of results) {
    const key = r.file_id ?? r.filename ?? '';
    const current = byFile.get(key);
    if (!current || (r.score ?? 0) > (current.score ?? 0)) byFile.set(key, r);
  }
  return [...byFile.values()]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((r) => {
      const attributes = r.attributes ?? {};
      const title =
        typeof attributes.title === 'string'
          ? attributes.title
          : (r.filename ?? '資料');
      const url =
        typeof attributes.source_url === 'string'
          ? attributes.source_url
          : undefined;
      return {
        title,
        ...(url && { url }),
        ...(r.text && { snippet: r.text.slice(0, 200) }),
        ...(r.score !== undefined && { score: r.score }),
      };
    });
}

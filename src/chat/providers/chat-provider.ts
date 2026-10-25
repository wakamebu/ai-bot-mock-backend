import { DiscoveryService } from '@nestjs/core';
import type { ProviderName, Tenant } from '../../tenants/tenant.entity.js';
import type { AnswerSource } from '../chat.types.js';

export interface ChatProviderInput {
  tenant: Tenant;
  /** こちらの会話ID（方式側で利用者を区別する値として使える） */
  conversationId: string;
  message: string;
  /** 今回の発言より前の会話（古い順） */
  history: { role: 'user' | 'assistant'; content: string }[];
  /** 前回この方式が返した会話ID */
  providerConversationId: string | null;
}

export interface ChatProviderResult {
  answer: string;
  /**
   * 方式が自分で「答えられる」と判断したか。
   * false ならフォールバックする（根拠資料なし・範囲外など）
   */
  answerable: boolean;
  /** 0〜1。方式が出せない場合は null（しきい値の判定をしない） */
  confidence: number | null;
  sources: AnswerSource[];
  providerConversationId?: string;
  /** 利用量（費用の見積もりに使う）。方式が返せる場合だけ入れる */
  usage?: ProviderUsage;
  /** ログ保存用の生データ */
  raw?: unknown;
}

/** 1回の回答で使った LLM・検索の量。会話ログに保存し、費用の見積もりに使う */
export interface ProviderUsage {
  /** 実際に使われたモデル名 */
  model?: string;
  inputTokens: number;
  /** inputTokens のうち、キャッシュから読まれた分（料金が安い） */
  cachedInputTokens?: number;
  /** 推論（reasoning）の分を含む */
  outputTokens: number;
  /** 回数で課金される検索の呼び出し回数（OpenAI の file_search など） */
  searchCalls?: number;
  /** 方式側が計算した金額（Dify の total_price など）。USD */
  reportedCostUsd?: number;
}

/**
 * RAG の方式ごとの実装（mock / dify / openai）が満たす契約。
 * フォールバックの判定・会話ログの保存は ChatService 側の共通処理が行うので、
 * 実装は「質問を投げて、答えと根拠と確信度を返す」ことだけに集中する。
 */
export interface ChatProvider {
  readonly name: ProviderName;
  generate(input: ChatProviderInput): Promise<ChatProviderResult>;
}

/**
 * 方式の実装クラスに付けるデコレーター。
 * 付けたクラスを含むモジュールを AppModule に import するだけで、ChatProviderRegistry に登録される。
 *
 * @example
 * ＠RegisterChatProvider()
 * ＠Injectable()
 * export class DifyChatProvider implements ChatProvider { ... }
 */
export const RegisterChatProvider = DiscoveryService.createDecorator();

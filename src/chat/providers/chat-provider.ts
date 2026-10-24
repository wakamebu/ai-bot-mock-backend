import type { Tenant, ProviderName } from '../../tenants/tenant.entity.js';
import type { AnswerSource } from '../chat.types.js';

/** 方式の実装一覧を注入するためのトークン */
export const CHAT_PROVIDERS = Symbol('CHAT_PROVIDERS');

export interface ChatProviderInput {
  tenant: Tenant;
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
  /** ログ保存用の生データ */
  raw?: unknown;
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

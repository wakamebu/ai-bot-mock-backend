/** チャット API のレスポンスと、方式（Dify / OpenAI など）との境界で使う型 */

export type FallbackReason =
  /** 担当者へ回すキーワードに該当した（医療的な判断など） */
  | 'sensitive'
  /** 方式が「答えられない」と判断した、または根拠資料が見つからない */
  | 'out_of_scope'
  /** 確信度がテナントのしきい値を下回った */
  | 'low_confidence'
  /** 方式の呼び出しに失敗した */
  | 'provider_error';

export interface AnswerSource {
  title: string;
  url?: string;
  /** 根拠の抜粋 */
  snippet?: string;
  /** 検索の関連度（0〜1、方式が返す場合のみ） */
  score?: number;
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  status: 'answered' | 'fallback';
  /** チャット欄に表示する文章。fallback のときはテナントの案内文 */
  answer: string;
  sources: AnswerSource[];
  fallback?: {
    reason: FallbackReason;
    contactUrl: string | null;
  };
}

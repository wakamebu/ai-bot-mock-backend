import type { Tenant } from '../../tenants/tenant.entity.js';
import type { FallbackReason } from '../chat.types.js';
import type { ChatProviderResult } from '../providers/chat-provider.js';

type FallbackTenant = Pick<Tenant, 'handoffKeywords' | 'confidenceThreshold'>;

/**
 * 方式を呼ぶ前の判定。担当者へ回すキーワードに該当したら LLM に渡さない。
 * （医療的な判断などを LLM に答えさせないため）
 */
export function checkBeforeGenerate(
  tenant: FallbackTenant,
  message: string,
): FallbackReason | null {
  const normalized = message.normalize('NFKC').toLowerCase();
  const hit = tenant.handoffKeywords.some((keyword) =>
    normalized.includes(keyword.normalize('NFKC').toLowerCase()),
  );
  return hit ? 'sensitive' : null;
}

/** 方式の回答を受け取った後の判定 */
export function checkAfterGenerate(
  tenant: FallbackTenant,
  result: ChatProviderResult,
): FallbackReason | null {
  if (!result.answerable || !result.answer.trim()) return 'out_of_scope';
  if (
    result.confidence !== null &&
    result.confidence < tenant.confidenceThreshold
  ) {
    return 'low_confidence';
  }
  return null;
}

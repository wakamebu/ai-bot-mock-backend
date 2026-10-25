/**
 * LLM のトークン料金（USD / 100万トークン）。
 * 費用の見積もり用の前提値。料金は改定されるので、見積もりの前に公式の料金表で確かめる。
 *
 * 出典：https://developers.openai.com/api/docs/pricing（2026-10-26 時点）
 */
export const LLM_PRICES_CHECKED_AT = '2026-10-26';
export const LLM_PRICES_SOURCE =
  'https://developers.openai.com/api/docs/pricing';

export interface LlmPrice {
  input: number;
  cachedInput: number;
  output: number;
}

export const LLM_PRICES_USD_PER_1M: Record<string, LlmPrice> = {
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2.0 },
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10.0 },
  'gpt-4.1-mini': { input: 0.4, cachedInput: 0.1, output: 1.6 },
  'gpt-4.1': { input: 2.0, cachedInput: 0.5, output: 8.0 },
};

export const LLM_MODELS = Object.keys(LLM_PRICES_USD_PER_1M);

/** 1回の回答の LLM 料金（USD） */
export function llmCostUsd(
  model: string,
  usage: {
    inputTokens: number;
    cachedInputTokens?: number;
    outputTokens: number;
  },
): number {
  const price = LLM_PRICES_USD_PER_1M[model];
  if (!price) throw new Error(`unknown model "${model}"`);
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  return (
    ((usage.inputTokens - cached) * price.input +
      cached * price.cachedInput +
      usage.outputTokens * price.output) /
    1_000_000
  );
}

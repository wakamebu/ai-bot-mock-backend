/** 方式が openai のテナントの providerConfig */
export interface OpenAiProviderConfig {
  /** テナントの Vector Store。資料を最初に登録したときに作られる */
  vectorStoreId?: string;
  /** テナントごとに足す指示（口調、案内してよい範囲など） */
  instructions?: string;
  /** 検索結果の最大件数（既定 5） */
  maxNumResults?: number;
}

export function parseOpenAiConfig(
  config: Record<string, unknown>,
): OpenAiProviderConfig {
  const { vectorStoreId, instructions, maxNumResults } = config;
  if (vectorStoreId !== undefined && typeof vectorStoreId !== 'string') {
    throw new Error('providerConfig.vectorStoreId must be a string');
  }
  if (instructions !== undefined && typeof instructions !== 'string') {
    throw new Error('providerConfig.instructions must be a string');
  }
  if (
    maxNumResults !== undefined &&
    (!Number.isInteger(maxNumResults) ||
      (maxNumResults as number) < 1 ||
      (maxNumResults as number) > 50)
  ) {
    throw new Error('providerConfig.maxNumResults must be an integer 1-50');
  }
  return {
    vectorStoreId,
    instructions,
    maxNumResults: maxNumResults as number | undefined,
  };
}

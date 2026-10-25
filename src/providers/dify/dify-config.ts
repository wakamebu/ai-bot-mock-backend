/**
 * 方式が dify のテナントの providerConfig。
 * 1テナント＝1 Dify インスタンスなので、接続先と API キーをテナントごとに持つ。
 */
export interface DifyProviderConfig {
  /** テナントの Dify の URL（例：https://dify-clinic-a.example.com） */
  baseUrl: string;
  /** チャットフローのアプリの API キー */
  apiKey: string;
  /** チャットフローが参照するナレッジ（データセット）の ID。資料を API で登録するときに使う */
  datasetId?: string;
  /** Knowledge API の API キー（アプリの API キーとは別） */
  datasetApiKey?: string;
}

/** 接続先が設定されていなければ null */
export function parseDifyConfig(
  config: Record<string, unknown>,
): DifyProviderConfig | null {
  const { baseUrl, apiKey, datasetId, datasetApiKey } = config;
  if (baseUrl === undefined && apiKey === undefined) return null;
  if (typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) {
    throw new Error('providerConfig.baseUrl must be an http(s) URL');
  }
  if (typeof apiKey !== 'string' || !apiKey) {
    throw new Error('providerConfig.apiKey is required');
  }
  for (const [key, value] of Object.entries({ datasetId, datasetApiKey })) {
    if (value !== undefined && typeof value !== 'string') {
      throw new Error(`providerConfig.${key} must be a string`);
    }
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    datasetId: datasetId as string | undefined,
    datasetApiKey: datasetApiKey as string | undefined,
  };
}

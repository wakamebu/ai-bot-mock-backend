import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Tenant } from '../../tenants/tenant.entity.js';
import type { DifyProviderConfig } from './dify-config.js';

/**
 * テナント用の Dify インスタンスを用意する。
 *
 * モックでは偽の Dify（tools/fake-dify）の POST /__fake/instances を呼ぶ。
 * 本番では「サーバーを立てる → Dify を docker compose で起動 → チャットフローの DSL を読み込む →
 * API キーを発行する」作業になり、数分〜数十分かかる。その場合はジョブにして非同期で行う
 * （docs/roadmap-dify.md のフェーズ 5）。
 */
@Injectable()
export class DifyProvisioner {
  constructor(private readonly config: ConfigService) {}

  async provision(tenant: Tenant): Promise<Required<DifyProviderConfig>> {
    const url = this.config.get<string>('DIFY_PROVISIONER_URL');
    if (!url) {
      throw new BadRequestException(
        'Dify の接続先が未設定です。providerConfig に baseUrl・apiKey・datasetId・datasetApiKey を設定するか、DIFY_PROVISIONER_URL（偽の Dify）を設定してください',
      );
    }
    const res = await fetch(`${url.replace(/\/+$/, '')}/__fake/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tenant.slug }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`failed to provision Dify: ${res.status}`);
    const created = (await res.json()) as Required<DifyProviderConfig>;
    return {
      baseUrl: created.baseUrl,
      apiKey: created.apiKey,
      datasetId: created.datasetId,
      datasetApiKey: created.datasetApiKey,
    };
  }
}

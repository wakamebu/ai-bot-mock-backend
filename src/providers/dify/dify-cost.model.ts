import { Injectable } from '@nestjs/common';
import {
  type Assumptions,
  type AssumptionField,
  type CostLine,
  type CostModel,
  num,
  str,
  RegisterCostModel,
} from '../../cost/cost-model.js';

const LIGHTSAIL_PRICING = 'https://aws.amazon.com/lightsail/pricing/';
const DIFY_PRICING = 'https://dify.ai/pricing';
const DIFY_REQUIREMENTS =
  'https://docs.dify.ai/en/self-host/quick-start/docker-compose';

/**
 * Dify 方式の費用。
 * ライセンス上 1テナント＝1 Dify インスタンスなので、テナントごとにサーバー代と運用（バージョンアップなど）がかかる。
 *
 * - self-host：テナントごとにサーバーを立てる。Dify の最低要件は 2コア・4GiB だが、
 *   10 前後のコンテナが動くので 8GB を既定にした（AWS Lightsail 8GB：$44/月、2026-10-26 時点の公開価格）
 * - cloud：テナントごとに Dify Cloud を契約する（Professional：$59/月）。
 *   商用でお客様に提供してよいかは、ライセンスの確認が必要
 */
@RegisterCostModel()
@Injectable()
export class DifyCostModel implements CostModel {
  readonly approach = 'dify' as const;
  readonly label = 'Dify（1テナント＝1インスタンス）';

  readonly fields: AssumptionField[] = [
    {
      key: 'difyHosting',
      label: 'Dify の置き場所',
      unit: '',
      group: 'Dify',
      options: ['self-host', 'cloud'],
      note: 'self-host：テナントごとにサーバーを立てる / cloud：テナントごとに Dify Cloud を契約',
    },
    {
      key: 'instanceUsdPerMonth',
      label: '1インスタンスのサーバー代',
      unit: 'USD/月',
      group: 'Dify',
      note: '既定は AWS Lightsail 8GB・2vCPU。最低要件は 2コア・4GiB（4GB なら $24）',
      source: LIGHTSAIL_PRICING,
    },
    {
      key: 'instanceExtraUsdPerMonth',
      label: '1インスタンスのバックアップ・ドメインなど',
      unit: 'USD/月',
      group: 'Dify',
    },
    {
      key: 'opsHoursPerInstancePerMonth',
      label: '1インスタンスの月の運用',
      unit: '時間/月',
      group: 'Dify',
      note: 'バージョンアップ（リリースが頻繁）、監視、バックアップの確認',
      source: DIFY_REQUIREMENTS,
    },
    {
      key: 'cloudPlanUsdPerMonth',
      label: 'Dify Cloud の月額（1テナント）',
      unit: 'USD/月',
      group: 'Dify',
      note: 'cloud のときだけ使う。Professional は $59',
      source: DIFY_PRICING,
    },
    {
      key: 'embeddingTokensPerQuery',
      label: '1回の質問の埋め込みトークン',
      unit: 'トークン',
      group: 'Dify',
      note: 'ナレッジ検索のための質問の埋め込み',
    },
    {
      key: 'embeddingUsdPer1M',
      label: '埋め込みの料金',
      unit: 'USD/100万トークン',
      group: 'Dify',
      note: 'text-embedding-3-small',
    },
  ];

  readonly defaults: Assumptions = {
    difyHosting: 'self-host',
    instanceUsdPerMonth: 44,
    instanceExtraUsdPerMonth: 5,
    opsHoursPerInstancePerMonth: 1.5,
    cloudPlanUsdPerMonth: 59,
    embeddingTokensPerQuery: 50,
    embeddingUsdPer1M: 0.02,
    // 残り：本物の Dify の構築とチャットフロー（DSL）、インスタンスを立てる手順の自動化、
    // バージョンアップ・バックアップの手順、本番環境の構築（仮置き）
    initialDevHours: 100,
    // インスタンスを立て、DSL を読み込み、資料を登録する作業
    onboardingHoursPerTenant: 6,
  };

  lines(a: Assumptions, tenants: number): CostLine[] {
    const usdJpy = num(a, 'usdJpy');
    const queries = tenants * num(a, 'queriesPerTenantPerMonth');
    const embedding: CostLine = {
      key: 'embedding',
      label: '質問の埋め込み',
      kind: 'per_query',
      jpyPerMonth:
        ((queries *
          num(a, 'embeddingTokensPerQuery') *
          num(a, 'embeddingUsdPer1M')) /
          1_000_000) *
        usdJpy,
    };

    if (str(a, 'difyHosting') === 'cloud') {
      return [
        {
          key: 'difyCloud',
          label: 'Dify Cloud の契約',
          kind: 'per_tenant',
          jpyPerMonth: tenants * num(a, 'cloudPlanUsdPerMonth') * usdJpy,
        },
        embedding,
      ];
    }
    return [
      {
        key: 'difyServer',
        label: 'Dify インスタンスのサーバー',
        kind: 'per_tenant',
        jpyPerMonth:
          tenants *
          (num(a, 'instanceUsdPerMonth') + num(a, 'instanceExtraUsdPerMonth')) *
          usdJpy,
      },
      {
        key: 'difyOps',
        label: 'Dify インスタンスの運用',
        kind: 'per_tenant',
        jpyPerMonth:
          tenants *
          num(a, 'opsHoursPerInstancePerMonth') *
          num(a, 'hourlyRateJpy'),
      },
      embedding,
    ];
  }
}

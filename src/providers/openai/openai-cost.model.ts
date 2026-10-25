import { Injectable } from '@nestjs/common';
import {
  type Assumptions,
  type AssumptionField,
  type CostLine,
  type CostModel,
  num,
  RegisterCostModel,
} from '../../cost/cost-model.js';
import { LLM_PRICES_SOURCE } from '../../cost/llm-prices.js';

/**
 * OpenAI File Search 方式の費用。
 * 1つのアプリで全テナントを扱うので、テナントが増えて増えるのは Vector Store の保存容量と質問数に比例する料金だけ。
 *
 * 料金の出典：https://developers.openai.com/api/docs/pricing（2026-10-26 時点）
 */
@RegisterCostModel()
@Injectable()
export class OpenAiCostModel implements CostModel {
  readonly approach = 'openai' as const;
  readonly label = 'OpenAI File Search（1アプリで全テナント）';

  readonly fields: AssumptionField[] = [
    {
      key: 'searchCallsPerQuery',
      label: '1回の回答あたりの file_search の呼び出し',
      unit: '回',
      group: 'OpenAI',
      note: 'モデルが検索を何回呼ぶか。会話ログの実測値で置き換えられる',
    },
    {
      key: 'fileSearchUsdPer1kCalls',
      label: 'file_search の料金',
      unit: 'USD/1,000回',
      group: 'OpenAI',
      source: LLM_PRICES_SOURCE,
    },
    {
      key: 'vectorStoreGbPerTenant',
      label: '1社あたりの Vector Store の容量',
      unit: 'GB',
      group: 'OpenAI',
      note: 'テキストの FAQ・料金表なら数MB。PDF のパンフレットが多いと増える',
    },
    {
      key: 'vectorStoreUsdPerGbDay',
      label: 'Vector Store の保存料金',
      unit: 'USD/GB/日',
      group: 'OpenAI',
      source: LLM_PRICES_SOURCE,
    },
    {
      key: 'vectorStoreFreeGb',
      label: 'Vector Store の無料枠（組織全体）',
      unit: 'GB',
      group: 'OpenAI',
      source: LLM_PRICES_SOURCE,
    },
  ];

  readonly defaults: Assumptions = {
    searchCallsPerQuery: 1,
    fileSearchUsdPer1kCalls: 2.5,
    vectorStoreGbPerTenant: 0.01,
    vectorStoreUsdPerGbDay: 0.1,
    vectorStoreFreeGb: 1,
    // 残り：管理画面（資料の登録）、本物の API での評価・調整、本番環境の構築（仮置き）
    initialDevHours: 120,
    // 資料を集めて FAQ に整え、登録する作業
    onboardingHoursPerTenant: 4,
  };

  lines(a: Assumptions, tenants: number): CostLine[] {
    const usdJpy = num(a, 'usdJpy');
    const queries = tenants * num(a, 'queriesPerTenantPerMonth');
    const storageGb = Math.max(
      0,
      tenants * num(a, 'vectorStoreGbPerTenant') - num(a, 'vectorStoreFreeGb'),
    );
    return [
      {
        key: 'fileSearch',
        label: 'file_search の呼び出し',
        kind: 'per_query',
        jpyPerMonth:
          ((queries *
            num(a, 'searchCallsPerQuery') *
            num(a, 'fileSearchUsdPer1kCalls')) /
            1_000) *
          usdJpy,
      },
      {
        key: 'vectorStorage',
        label: 'Vector Store の保存容量',
        kind: 'per_tenant',
        jpyPerMonth: storageGb * num(a, 'vectorStoreUsdPerGbDay') * 30 * usdJpy,
        note: `${Math.round(storageGb * 1000) / 1000} GB（無料枠を除く）`,
      },
    ];
  }
}

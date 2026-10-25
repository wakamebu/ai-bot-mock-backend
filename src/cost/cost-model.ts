import { DiscoveryService } from '@nestjs/core';
import type { ProviderName } from '../tenants/tenant.entity.js';
import { LLM_MODELS, LLM_PRICES_SOURCE, llmCostUsd } from './llm-prices.js';

/**
 * 費用の見積もりモデル。
 *
 * 費用を「テナント数に関係しない固定費」「テナント数に比例する費用」「質問数に比例する費用」に分け、
 * テナント数ごとの月の売上・費用・利益と、収益分岐点（利益が出始めるテナント数）を出す。
 * 前提の値はすべて仮置きで、見積もりのたびに上書きできる（POST /admin/cost/estimate）。
 */

export type AssumptionValue = number | string;
export type Assumptions = Record<string, AssumptionValue>;

export interface AssumptionField {
  key: string;
  label: string;
  unit: string;
  group: string;
  /** 選択肢（文字列の前提） */
  options?: string[];
  note?: string;
  source?: string;
}

export interface CostLine {
  key: string;
  label: string;
  /** fixed：テナント数に関係しない / per_tenant：テナント数に比例 / per_query：質問数に比例 */
  kind: 'fixed' | 'per_tenant' | 'per_query';
  /** 全テナント合計の月額（円） */
  jpyPerMonth: number;
  note?: string;
}

/** 方式ごとの見積もりモデル。共通部分（売上・LLM・自前 API の費用）は estimateCost() が足す */
export interface CostModel {
  readonly approach: ProviderName;
  readonly label: string;
  /** 方式に固有の前提 */
  readonly fields: AssumptionField[];
  /** 方式に固有の前提の既定値と、共通の前提のうちこの方式で変える既定値 */
  readonly defaults: Assumptions;
  /** 方式に固有の費用（全テナント合計の月額） */
  lines(a: Assumptions, tenants: number): CostLine[];
}

/** 見積もりモデルのクラスに付けるデコレーター。付けたクラスは CostService に登録される */
export const RegisterCostModel = DiscoveryService.createDecorator();

export const COMMON_FIELDS: AssumptionField[] = [
  {
    key: 'monthlyFeePerTenantJpy',
    label: '1社あたりの月額（売価）',
    unit: '円/月',
    group: '売上',
    note: '仮置き。競合の価格帯を見て決める',
  },
  {
    key: 'queriesPerTenantPerMonth',
    label: '1社あたりの月の質問数',
    unit: '件/月',
    group: '利用',
  },
  {
    key: 'llmModel',
    label: 'LLM のモデル',
    unit: '',
    group: 'LLM',
    options: LLM_MODELS,
    source: LLM_PRICES_SOURCE,
  },
  {
    key: 'inputTokensPerQuery',
    label: '1回の回答の入力トークン',
    unit: 'トークン',
    group: 'LLM',
    note: '指示文＋会話の履歴＋検索された資料。会話ログの実測値で置き換えられる',
  },
  {
    key: 'cachedInputRatio',
    label: '入力のうちキャッシュが効く割合',
    unit: '0〜1',
    group: 'LLM',
  },
  {
    key: 'outputTokensPerQuery',
    label: '1回の回答の出力トークン',
    unit: 'トークン',
    group: 'LLM',
    note: '推論（reasoning）の分を含む',
  },
  {
    key: 'usdJpy',
    label: '為替',
    unit: '円/USD',
    group: '共通',
    note: '仮置き',
  },
  {
    key: 'hourlyRateJpy',
    label: '作業の単価',
    unit: '円/時間',
    group: '共通',
    note: '仮置き',
  },
  {
    key: 'sharedInfraJpyPerMonth',
    label: '自前 API・DB のサーバー代（全社共通）',
    unit: '円/月',
    group: '共通',
  },
  {
    key: 'sharedOpsHoursPerMonth',
    label: '全社共通の運用（監視・障害対応）',
    unit: '時間/月',
    group: '共通',
  },
  {
    key: 'supportHoursPerTenantPerMonth',
    label: '1社あたりの月の対応（資料の更新・問い合わせ）',
    unit: '時間/月',
    group: '共通',
  },
  {
    key: 'onboardingHoursPerTenant',
    label: '1社あたりの導入作業',
    unit: '時間',
    group: '共通',
    note: '償却期間で月割りする',
  },
  {
    key: 'initialDevHours',
    label: '本番化までの残りの開発',
    unit: '時間',
    group: '共通',
    note: '仮置き。償却期間で月割りする',
  },
  {
    key: 'amortizationMonths',
    label: '初期費用の償却期間',
    unit: 'か月',
    group: '共通',
  },
];

export const COMMON_DEFAULTS: Assumptions = {
  monthlyFeePerTenantJpy: 30_000,
  queriesPerTenantPerMonth: 1_000,
  llmModel: 'gpt-5-mini',
  inputTokensPerQuery: 4_000,
  cachedInputRatio: 0,
  outputTokensPerQuery: 400,
  usdJpy: 150,
  hourlyRateJpy: 5_000,
  sharedInfraJpyPerMonth: 10_000,
  sharedOpsHoursPerMonth: 4,
  supportHoursPerTenantPerMonth: 1,
  onboardingHoursPerTenant: 4,
  initialDevHours: 100,
  amortizationMonths: 24,
};

export function num(a: Assumptions, key: string): number {
  const value = a[key];
  if (typeof value !== 'number')
    throw new Error(`assumption "${key}" is not a number`);
  return value;
}

export function str(a: Assumptions, key: string): string {
  return String(a[key]);
}

/** 1回の回答の LLM 料金（円） */
export function llmCostPerQueryJpy(a: Assumptions): number {
  const inputTokens = num(a, 'inputTokensPerQuery');
  return (
    llmCostUsd(str(a, 'llmModel'), {
      inputTokens,
      cachedInputTokens: inputTokens * num(a, 'cachedInputRatio'),
      outputTokens: num(a, 'outputTokensPerQuery'),
    }) * num(a, 'usdJpy')
  );
}

/** 方式に関係なくかかる費用 */
function commonLines(a: Assumptions, tenants: number): CostLine[] {
  const rate = num(a, 'hourlyRateJpy');
  const months = num(a, 'amortizationMonths');
  const queries = tenants * num(a, 'queriesPerTenantPerMonth');
  return [
    {
      key: 'sharedInfra',
      label: '自前 API・DB のサーバー',
      kind: 'fixed',
      jpyPerMonth: num(a, 'sharedInfraJpyPerMonth'),
    },
    {
      key: 'sharedOps',
      label: '全社共通の運用',
      kind: 'fixed',
      jpyPerMonth: num(a, 'sharedOpsHoursPerMonth') * rate,
    },
    {
      key: 'initialDev',
      label: '残りの開発（償却）',
      kind: 'fixed',
      jpyPerMonth: (num(a, 'initialDevHours') * rate) / months,
    },
    {
      key: 'support',
      label: '各社への対応',
      kind: 'per_tenant',
      jpyPerMonth: tenants * num(a, 'supportHoursPerTenantPerMonth') * rate,
    },
    {
      key: 'onboarding',
      label: '導入作業（償却）',
      kind: 'per_tenant',
      jpyPerMonth:
        (tenants * num(a, 'onboardingHoursPerTenant') * rate) / months,
    },
    {
      key: 'llm',
      label: `LLM（${str(a, 'llmModel')}）`,
      kind: 'per_query',
      jpyPerMonth: queries * llmCostPerQueryJpy(a),
    },
  ];
}

export function fieldsOf(model: CostModel): AssumptionField[] {
  return [...COMMON_FIELDS, ...model.fields];
}

export function defaultsOf(model: CostModel): Assumptions {
  return { ...COMMON_DEFAULTS, ...model.defaults };
}

/** 上書きする前提を検証して、既定値に重ねる。不正なら Error（メッセージは利用者向け） */
export function resolveAssumptions(
  model: CostModel,
  overrides: Record<string, unknown> = {},
): Assumptions {
  const fields = new Map(fieldsOf(model).map((f) => [f.key, f]));
  const resolved = defaultsOf(model);
  for (const [key, value] of Object.entries(overrides)) {
    const field = fields.get(key);
    if (!field) throw new Error(`unknown assumption "${key}"`);
    if (field.options) {
      if (typeof value !== 'string' || !field.options.includes(value)) {
        throw new Error(`"${key}" must be one of: ${field.options.join(', ')}`);
      }
    } else if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new Error(`"${key}" must be a non-negative number`);
    }
    resolved[key] = value;
  }
  if (num(resolved, 'amortizationMonths') <= 0) {
    throw new Error('"amortizationMonths" must be greater than 0');
  }
  return resolved;
}

export interface CostScenario {
  tenants: number;
  revenueJpy: number;
  costJpy: number;
  profitJpy: number;
  costPerTenantJpy: number;
  lines: CostLine[];
}

export function scenario(
  model: CostModel,
  a: Assumptions,
  tenants: number,
): CostScenario {
  const lines = [...commonLines(a, tenants), ...model.lines(a, tenants)].map(
    (line) => ({ ...line, jpyPerMonth: Math.round(line.jpyPerMonth) }),
  );
  const costJpy = lines.reduce((sum, line) => sum + line.jpyPerMonth, 0);
  const revenueJpy = tenants * num(a, 'monthlyFeePerTenantJpy');
  return {
    tenants,
    revenueJpy,
    costJpy,
    profitJpy: revenueJpy - costJpy,
    costPerTenantJpy: tenants > 0 ? Math.round(costJpy / tenants) : 0,
    lines,
  };
}

export const BREAK_EVEN_SEARCH_LIMIT = 1_000;

/** 月の利益が 0 以上になる最小のテナント数。上限まで探して見つからなければ null */
export function breakEvenTenants(
  model: CostModel,
  a: Assumptions,
): number | null {
  for (let tenants = 1; tenants <= BREAK_EVEN_SEARCH_LIMIT; tenants++) {
    if (scenario(model, a, tenants).profitJpy >= 0) return tenants;
  }
  return null;
}

export const DEFAULT_TENANT_COUNTS = [1, 3, 5, 10, 20, 30, 50, 100];

export interface CostEstimate {
  approach: ProviderName;
  label: string;
  assumptions: Assumptions;
  /** 1回の回答あたりの変動費（円）。LLM と、方式の質問数に比例する費用の合計 */
  costPerQueryJpy: number;
  breakEvenTenants: number | null;
  scenarios: CostScenario[];
}

/**
 * 1回の回答あたりの変動費（円）。質問数に比例する費用の合計を質問数で割る。
 * 丸め誤差を避けるため、十分に大きい質問数で計算する。
 */
export function costPerQueryJpy(model: CostModel, a: Assumptions): number {
  const queries = 1_000_000;
  const scaled = { ...a, queriesPerTenantPerMonth: queries };
  const total = [...commonLines(scaled, 1), ...model.lines(scaled, 1)]
    .filter((line) => line.kind === 'per_query')
    .reduce((sum, line) => sum + line.jpyPerMonth, 0);
  return Math.round((total / queries) * 100) / 100;
}

export function estimateCost(
  model: CostModel,
  a: Assumptions,
  tenantCounts: number[] = DEFAULT_TENANT_COUNTS,
): CostEstimate {
  return {
    approach: model.approach,
    label: model.label,
    assumptions: a,
    costPerQueryJpy: costPerQueryJpy(model, a),
    breakEvenTenants: breakEvenTenants(model, a),
    scenarios: tenantCounts.map((n) => scenario(model, a, n)),
  };
}

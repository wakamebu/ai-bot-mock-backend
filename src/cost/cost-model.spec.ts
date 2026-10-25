import {
  type Assumptions,
  type CostModel,
  breakEvenTenants,
  costPerQueryJpy,
  defaultsOf,
  num,
  resolveAssumptions,
  scenario,
} from './cost-model.js';

/** テナントごとに月 1,000 円、質問ごとに 1 円かかる方式 */
const model: CostModel = {
  approach: 'mock',
  label: 'テスト用',
  fields: [{ key: 'perTenantJpy', label: '', unit: '', group: '' }],
  defaults: { perTenantJpy: 1_000 },
  lines: (a, tenants) => [
    {
      key: 'tenant',
      label: '',
      kind: 'per_tenant',
      jpyPerMonth: tenants * num(a, 'perTenantJpy'),
    },
    {
      key: 'query',
      label: '',
      kind: 'per_query',
      jpyPerMonth: tenants * num(a, 'queriesPerTenantPerMonth'),
    },
  ],
};

/** LLM・作業の費用を 0 にして、方式の費用だけを見る */
const base: Assumptions = resolveAssumptions(model, {
  monthlyFeePerTenantJpy: 3_000,
  queriesPerTenantPerMonth: 1_000,
  inputTokensPerQuery: 0,
  outputTokensPerQuery: 0,
  sharedInfraJpyPerMonth: 10_000,
  sharedOpsHoursPerMonth: 0,
  supportHoursPerTenantPerMonth: 0,
  onboardingHoursPerTenant: 0,
  initialDevHours: 0,
});

describe('cost model', () => {
  it('費用を固定費・テナントごと・質問ごとに積み上げる', () => {
    const s = scenario(model, base, 10);
    expect(s.revenueJpy).toBe(30_000);
    expect(s.costJpy).toBe(10_000 + 10 * 1_000 + 10 * 1_000);
    expect(s.profitJpy).toBe(0);
    expect(s.costPerTenantJpy).toBe(3_000);
  });

  it('収益分岐点は、利益が 0 以上になる最小のテナント数', () => {
    // 1社あたりの粗利 = 3,000 - 1,000 - 1,000 = 1,000 円。固定費 10,000 円を回収するのは 10 社
    expect(breakEvenTenants(model, base)).toBe(10);
  });

  it('1社あたりの粗利がなければ収益分岐点は null', () => {
    expect(
      breakEvenTenants(model, { ...base, monthlyFeePerTenantJpy: 2_000 }),
    ).toBeNull();
  });

  it('1回の回答あたりの変動費を出す', () => {
    expect(costPerQueryJpy(model, base)).toBe(1);
  });

  it('LLM の料金はモデルとトークン数から計算する', () => {
    const a = {
      ...base,
      llmModel: 'gpt-5-mini',
      inputTokensPerQuery: 4_000,
      outputTokensPerQuery: 400,
      usdJpy: 150,
    };
    // (4000 * 0.25 + 400 * 2.0) / 1e6 USD = 0.0018 USD = 0.27 円 + 方式の 1 円
    expect(costPerQueryJpy(model, a)).toBeCloseTo(1.27, 2);
  });

  it('知らない前提や負の値は受け付けない', () => {
    expect(() => resolveAssumptions(model, { unknown: 1 })).toThrow(/unknown/);
    expect(() => resolveAssumptions(model, { perTenantJpy: -1 })).toThrow(
      /non-negative/,
    );
    expect(() => resolveAssumptions(model, { llmModel: 'gpt-x' })).toThrow(
      /one of/,
    );
  });

  it('方式の既定値は共通の既定値を上書きする', () => {
    expect(
      defaultsOf({ ...model, defaults: { initialDevHours: 1 } })
        .initialDevHours,
    ).toBe(1);
  });
});

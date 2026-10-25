import { expect } from 'vitest';
import type { CostEstimate } from '../../../src/cost/cost-model.js';
import { step } from './steps.js';
import { world } from './world.js';

/** 費用の見積もりのステップ */

async function estimate(body: Record<string, unknown> = {}) {
  world.response = await world.http().post('/admin/cost/estimate').send(body);
  return world.response;
}

function lastEstimate(): CostEstimate {
  expect(world.response!.status, JSON.stringify(world.response!.body)).toBe(
    200,
  );
  return world.response!.body as CostEstimate;
}

step('費用を見積もる', () => estimate());

step('1社あたりの月額を {int} 円として費用を見積もる', (_, fee: number) =>
  estimate({ assumptions: { monthlyFeePerTenantJpy: fee } }),
);

step('会話ログの実測値を使って費用を見積もる', () =>
  estimate({ useMeasuredUsage: true }),
);

step(
  '前提 {string} を {string} として費用を見積もる',
  (_, key: string, value: string) =>
    estimate({
      assumptions: {
        [key]: Number.isNaN(Number(value)) ? value : Number(value),
      },
    }),
);

step('見積もりの方式は {string} である', (_, approach: string) => {
  expect(lastEstimate().approach).toBe(approach);
});

step('収益分岐点のテナント数が示される', () => {
  expect(lastEstimate().breakEvenTenants).toBeGreaterThan(0);
});

step('収益分岐点には到達しない', () => {
  expect(lastEstimate().breakEvenTenants).toBeNull();
});

step(
  'テナント数 {int} 社の費用の内訳に {string} が含まれる',
  (_, tenants: number, label: string) => {
    const scenario = lastEstimate().scenarios.find(
      (s) => s.tenants === tenants,
    );
    expect(scenario?.lines.map((l) => l.label)).toContain(label);
  },
);

step('見積もりの入力トークンは会話ログの平均と同じである', async () => {
  const usage = await world.http().get('/admin/cost/usage');
  expect(usage.body.answersWithUsage).toBeGreaterThan(0);
  expect(lastEstimate().assumptions.inputTokensPerQuery).toBe(
    Math.round(usage.body.avgInputTokens),
  );
});

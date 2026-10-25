import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { afterAll, beforeAll } from 'vitest';
import './support/steps.js';
import './support/knowledge.steps.js';
import './support/cost.steps.js';
import './support/openai.steps.js';
import { world } from './support/world.js';

/**
 * features/ 配下の .feature をすべて実行する。
 * ステップは support/steps.ts で共有しているので、feature を追加するだけでテストになる。
 */
const FEATURES_DIR = 'features';

const featureFiles = readdirSync(FEATURES_DIR, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith('.feature'))
  .sort();

beforeAll(async () => {
  await world.start();
  await world.reset();
});
afterAll(() => world.stop());

for (const file of featureFiles) {
  const feature = await loadFeature(join(FEATURES_DIR, file), {
    language: 'ja',
  });

  describeFeature(feature, (f) => {
    // 背景（Background）はシナリオ前のフックより先に実行されるため、
    // 状態の初期化はシナリオの後に行う
    f.AfterEachScenario(() => world.reset());

    if (feature.background) f.Background(() => {});
    for (const scenario of feature.scenarii) {
      if ('examples' in scenario)
        f.ScenarioOutline(scenario.description, () => {});
      else f.Scenario(scenario.description, () => {});
    }
  });
}

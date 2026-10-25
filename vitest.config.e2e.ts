import { defineConfig } from 'vitest/config';
import { TEST_DB_NAME } from './test/features/support/test-env.js';

/** 受け入れテスト（features/*.feature）。DB を使うので docker compose up -d db が必要 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/features/support/global-setup.ts'],
    env: {
      DB_NAME: TEST_DB_NAME,
      DB_SYNCHRONIZE: 'true',
      SEED_DEMO: 'false',
    },
    // 1つの DB を使い回すので並列に実行しない
    fileParallelism: false,
    hookTimeout: 60_000,
  },
});

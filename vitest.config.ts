import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    // /mnt/c（WSL から Windows 側）上では Nest の初期化が遅く、既定の 5 秒を超えることがある
    testTimeout: 15_000,
  },
});

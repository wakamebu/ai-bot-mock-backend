import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** main.ts と受け入れテストで共通のアプリ設定 */
export function configureApp(app: NestExpressApplication) {
  // 埋め込み先のオリジンはテナントごとに ChatService で検証するので、CORS 自体は全許可
  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // チャット欄のスクリプトとデモページ
  app.useStaticAssets(join(import.meta.dirname, '..', 'public'));
}

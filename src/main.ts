import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();

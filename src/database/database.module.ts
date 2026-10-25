import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

/** PostgreSQL 接続。エンティティは各機能モジュールの forFeature から自動で読み込む */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: Number(config.get('DB_PORT', 5432)),
        username: config.get('DB_USER', 'aibot'),
        password: config.get('DB_PASSWORD', 'aibot'),
        database: config.get('DB_NAME', 'aibot'),
        autoLoadEntities: true,
        synchronize: config.get('DB_SYNCHRONIZE') === 'true',
      }),
    }),
  ],
})
export class DatabaseModule {}

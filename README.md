# ai-bot-mock / backend

AI ボット（Dify / OpenAI）モックのバックエンド。NestJS + PostgreSQL。

- Node.js 26（Volta で pin 済み）
- NestJS 12 / TypeORM / PostgreSQL 18

## セットアップ

```bash
cp .env.example .env   # 初回のみ
npm install
```

## 起動

### DB だけ Docker、アプリはローカル（開発向け）

```bash
docker compose up -d db
npm run start:dev
```

### 全部 Docker

```bash
docker compose --profile app up -d --build
```

### 停止

```bash
docker compose --profile app down        # データは残る
docker compose --profile app down -v     # データも削除
```

## ポート

| サービス | ホスト側 |
| --- | --- |
| API | http://localhost:3001 |
| PostgreSQL | localhost:5433 |

## 動作確認

```bash
curl localhost:3001/health   # {"status":"ok","db":"up"}
```

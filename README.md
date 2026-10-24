# ai-bot-mock / backend

AI ボット（Dify / OpenAI）モックのバックエンド。NestJS + PostgreSQL。

会社のサイトに小さなチャット欄を埋め込み、FAQ や資料をもとに質問へ回答する（RAG）。
答えられない質問や慎重に扱うべき質問は、担当者・問い合わせフォームへ案内する（フォールバック）。
1つの API で複数の会社（テナント）を扱う。

- Node.js 26（Volta で pin 済み）
- NestJS 12 / TypeORM / PostgreSQL 18

## ブランチ

| ブランチ | 内容 |
| --- | --- |
| `main` | 共通部分（テナント管理・チャット API・フォールバック判定・会話ログ・チャット欄）と、LLM を使わない `mock` 方式 |
| `dify-develop` | Dify 方式（テナントごとの Dify インスタンスを API で呼ぶ） |
| `openai-develop` | OpenAI File Search 方式（テナントごとの Vector Store） |

> **モックのため認証・認可は未実装。** `GET /auth/me` は中身のない雛形で、`/admin/*` も認証なしで呼べる。

## ドキュメント

- [API 仕様](docs/api.md)
- [工数記録](docs/effort-log.md)

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

`SEED_DEMO=true` のとき、起動時にデモテナント（公開キー `pk_demo_clinic`、方式 `mock`）が作られる。

- チャット欄のデモ：http://localhost:3001/demo.html
- API から：

```bash
curl -s localhost:3001/chat \
  -H 'Content-Type: application/json' -H 'X-Widget-Key: pk_demo_clinic' \
  -d '{"message":"予約方法を教えて"}'
```

## テスト

```bash
npm test
```

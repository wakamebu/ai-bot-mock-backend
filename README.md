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

各方式の今後の作業は、それぞれのブランチの `docs/roadmap-dify.md` / `docs/roadmap-openai.md` にまとめている。

> **モックのため認証・認可は未実装。** `GET /auth/me` は中身のない雛形で、`/admin/*` も認証なしで呼べる。

## ドキュメント

- [API 仕様](docs/api.md)

## ディレクトリ構成

機能ごとにディレクトリを分け、それぞれを Nest のモジュールとして `src/app.module.ts` に積み上げる。
機能を足すときは `src/<機能>/<機能>.module.ts` を作って `AppModule` に import する。

```
src/
├── main.ts / app.module.ts / app.setup.ts
├── database/        PostgreSQL 接続（TypeORM）
├── health/          GET /health
├── auth/            GET /auth/me（モックのため中身なし）
├── tenants/         テナント管理（/admin/tenants）
├── conversations/   会話ログ（/admin/tenants/:id/conversations）
├── chat/            POST /chat、フォールバック判定、方式の契約（ChatProvider）と登録
├── demo/            デモテナントの作成（SEED_DEMO=true）
└── providers/       方式（RAG の実装）。@RegisterChatProvider() で chat に登録される
    └── mock/        キーワード一致の動作確認用（dify / openai は各ブランチで追加）
public/              チャット欄（widget.js）とデモページ
features/            振る舞いの定義（Gherkin）
test/features/       Gherkin のステップ実装
```

今後の候補：`src/knowledge/`（資料の登録・管理）、`src/aio/`（AI 検索向けの対策）など。

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

## 振る舞いの定義（Gherkin）

あるべき振る舞いは [`features/`](features) に Gherkin（日本語）で書く。これがそのまま受け入れテストになる。

| ファイル | 内容 |
| --- | --- |
| `chat.feature` | 回答とフォールバック（範囲外・確信度不足・要注意トピック・方式の障害） |
| `widget-access.feature` | 公開キー・許可オリジンによる利用制限、入力の制限 |
| `conversation-log.feature` | 会話ログの記録 |
| `tenants.feature` | テナントの登録・変更 |
| `system.feature` | ヘルスチェック、`/auth/me`（モック） |

- ステップの実装は `test/features/support/steps.ts` に集約している。どの feature からも同じ文言で使える。
- 方式は `ScriptedChatProvider` に差し替え、シナリオで指定した通りに回答させる。共通部分の振る舞いを方式に依存せず確かめるため。
- `.feature` を `features/` に追加すれば、自動でテスト対象になる。新しい文言のステップは `steps.ts` に追加する。

## テスト

```bash
npm test             # ユニットテスト（src/**/*.spec.ts）
npm run test:e2e     # 受け入れテスト（features/*.feature）
```

受け入れテストは DB を使う。`docker compose up -d db` で起動しておくこと。
開発用とは別のデータベース `aibot_test` を自動で作り、シナリオごとに中身を空にする。

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
├── knowledge/       資料の登録・管理（/admin/tenants/:id/knowledge）。保存先は方式ごと
├── cost/            費用の見積もり（/admin/cost）。見積もりモデルは方式ごと
├── demo/            デモテナントの作成（SEED_DEMO=true、DEMO_PROVIDER で方式を切り替え）
└── providers/       方式（RAG の実装）。@RegisterChatProvider() で chat に登録される
    ├── mock/        キーワード一致の動作確認用
    └── dify/        Dify（回答・資料の保存先・インスタンスの用意・費用の見積もりモデル）
public/              チャット欄（widget.js）、デモページ、費用の見積もり画面（cost.html）
tools/fake-dify/     偽の Dify（開発・テスト用。テナントごとのインスタンスを模擬）
features/            振る舞いの定義（Gherkin）
test/features/       Gherkin のステップ実装
```

今後の候補：`src/aio/`（AI 検索向けの対策）など。

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

## Dify 方式で動かす（このブランチ）

本物の Dify がなくても、偽の Dify（`tools/fake-dify`）で一通り動かせる。

```bash
# .env に追記（.env.example を参照）
#   DEMO_PROVIDER=dify
#   DIFY_PROVISIONER_URL=http://localhost:5101

npm run fake:dify     # 偽の Dify（:5101）。状態は .fake-dify/state.json に保存
npm run start:dev     # 別のターミナルで
```

- 起動時にデモテナントの方式が `dify` になり、テナント用の Dify（偽物）が用意され、デモの FAQ が資料として登録される。
- チャット欄：http://localhost:3001/demo.html（ポートは `.env` の `PORT`）
- 費用の見積もり：http://localhost:3001/cost.html
- 本物の Dify を使うときは、テナントの `providerConfig` に `baseUrl`・`apiKey`（チャットフローのアプリ）・`datasetId`・`datasetApiKey`（ナレッジ）を入れる。

偽の Dify の状態（`.fake-dify/`）を消したときは、DB も作り直す（`docker compose down -v`）。テナントに古い接続先が残るため。

- ロードマップと進捗：[docs/roadmap-dify.md](docs/roadmap-dify.md)
- 費用の見積もり（たたき台）と OpenAI 方式との比較：[docs/cost-dify.md](docs/cost-dify.md)

## 振る舞いの定義（Gherkin）

あるべき振る舞いは [`features/`](features) に Gherkin（日本語）で書く。これがそのまま受け入れテストになる。

| ファイル | 内容 |
| --- | --- |
| `chat.feature` | 回答とフォールバック（範囲外・確信度不足・要注意トピック・方式の障害） |
| `widget-access.feature` | 公開キー・許可オリジンによる利用制限、入力の制限 |
| `conversation-log.feature` | 会話ログの記録 |
| `tenants.feature` | テナントの登録・変更 |
| `system.feature` | ヘルスチェック、`/auth/me`（モック） |
| `knowledge.feature` | 資料の登録・一覧・削除 |
| `cost.feature` | 費用の見積もり |
| `providers/dify.feature` | Dify 方式（偽の Dify を使う） |

- ステップの実装は `test/features/support/` の `steps.ts`（共通）と `knowledge.steps.ts`・`cost.steps.ts`・`dify.steps.ts`。どの feature からも同じ文言で使える。
- 方式 `mock` は `ScriptedChatProvider` に差し替え、シナリオで指定した通りに回答させる。共通部分の振る舞いを方式に依存せず確かめるため。
- 方式 `dify` のテナントは、テスト中に起動する偽の Dify に問い合わせる。
- `.feature` を `features/` に追加すれば、自動でテスト対象になる。新しい文言のステップは `steps.ts` に追加する。

## テスト

```bash
npm test             # ユニットテスト（src/**/*.spec.ts）
npm run test:e2e     # 受け入れテスト（features/*.feature）
```

受け入れテストは DB を使う。`docker compose up -d db` で起動しておくこと。
開発用とは別のデータベース `aibot_test` を自動で作り、シナリオごとに中身を空にする。

# ロードマップ：Dify 方式（dify-develop）

Dify を RAG の実行基盤として使い、チャット欄・テナント管理・フォールバック判定・会話ログは自前の API（main の共通部分）で持つ。

```
チャット欄 → POST /chat（自前 API）→ DifyChatProvider → テナントごとの Dify（チャットフロー）
                                                          └ ナレッジ（Dify のデータセット）
```

## 前提と方針

- **1テナント＝1 Dify インスタンス。** Dify のライセンスは、書面の許可なく1つの Dify で複数テナントを運用することを禁じている（テナント＝ワークスペース）。自前 API は1つのままで、テナントごとに Dify の URL と API キーを持つ。
- **Dify のフロントエンドは使わない。** ロゴ・著作権表示を消せない条項は、Dify のフロントエンドを使う場合が対象。チャット欄は自前の `widget.js` を使う。
- **Dify 側のアプリは「チャットフロー」で作る。** ナレッジ検索 → LLM → 回答の流れを Dify の画面で組み、DSL（YAML）として書き出してリポジトリで管理する。2社目以降はこの DSL を読み込んで作る。

## フェーズ 1：開発用の Dify を立てる

- [ ] Dify を Docker Compose でセルフホストする（Dify 公式リポジトリの `docker/`）。このリポジトリとは別のディレクトリに置く
  - 既定でポート 80/443 を使うので、`.env` の `EXPOSE_NGINX_PORT` などで空いているポートに変える
  - バージョンを固定する（比較資料の時点では v1.17.x）
- [ ] Dify の画面で LLM のプロバイダを設定する（OpenAI / Azure OpenAI 東日本 / Bedrock 東京 のどれを使うかは要相談）
- [ ] デモ用のナレッジ（脱毛クリニックの FAQ・料金表など、架空のデータ）を登録する
- [ ] チャットフローを作る
  - ナレッジ検索ノード → LLM ノード → 回答ノード
  - LLM への指示：資料にないことは答えない、医療的な判断はしない、予約は予約ページへ案内する
  - 答えられないときは決まった目印（例：`[[NO_ANSWER]]`）だけを返すよう指示する
- [ ] チャットフローを DSL で書き出し、`dify/templates/clinic-chatflow.yml` として保存する

**完了条件：** Dify の画面のプレビューで、FAQ にある質問には答え、ない質問には目印を返す。

## フェーズ 2：DifyChatProvider を作る

`src/providers/dify/` にモジュールを作り、`AppModule` に import する。

```
src/providers/dify/
├── dify-provider.module.ts
├── dify.client.ts           Dify の Service API を呼ぶ（fetch）
├── dify-chat.provider.ts    @RegisterChatProvider()、name = 'dify'
└── dify-config.ts           providerConfig の型と検証
```

- [ ] `dify.client.ts`：`POST {baseUrl}/v1/chat-messages`
  - `Authorization: Bearer {apiKey}`、`response_mode: 'blocking'`、`query`、`inputs: {}`
  - `user` には自前の会話ID を渡す（Dify 側で利用者を区別するための値）
  - `conversation_id` は2回目以降だけ渡す
  - タイムアウトを付ける（`AbortSignal.timeout`）
- [ ] `dify-chat.provider.ts`：Dify のレスポンスを `ChatProviderResult` に変換する

  | ChatProviderResult | Dify のレスポンス |
  | --- | --- |
  | `answer` | `answer`（目印を取り除く） |
  | `answerable` | 目印がなく、かつ `metadata.retriever_resources` が1件以上 |
  | `confidence` | `retriever_resources` の `score` の最大値（検索していなければ `null`） |
  | `sources` | `retriever_resources` の `document_name`・`content`・`score` |
  | `providerConversationId` | `conversation_id` |
  | `raw` | レスポンス全体 |

  `retriever_resources` の項目は Dify のバージョンで変わりうるので、実物のレスポンスで確認してから実装する。
- [ ] Dify 側で会話が見つからない場合（期限切れなど）は、`conversation_id` なしで1回だけやり直す
- [ ] `providerConfig` の形を決めて検証する：`{ baseUrl, apiKey }`
  - 共通部分の改善として、`ChatProvider` に「設定を検証する」メソッドを足し、テナント登録・更新時に方式ごとに検証する案がある（main で実装してから取り込む）
- [ ] デモテナントの方式を `dify` に切り替えて、`/demo.html` から動作を確かめる

**完了条件：** デモページのチャット欄から、Dify の回答と根拠が表示される。答えられない質問では問い合わせへ案内される。

## フェーズ 3：振る舞いを Gherkin で定義する

本物の Dify は使わず、テスト用の偽 Dify サーバー（`node:http` で立てる）に向けて実行する。

- [ ] `test/features/support/fake-dify-server.ts`：`/v1/chat-messages` を受けて、シナリオで指定したレスポンスを返す。受け取ったリクエストも記録する
- [ ] ステップを機能ごとのファイルに分ける（`test/features/support/steps/dify.steps.ts` など）
- [ ] `features/providers/dify.feature` に書くシナリオ
  - 根拠つきで回答されたら、回答と根拠（資料名）を返す
  - 検索結果が0件なら `out_of_scope` で案内する
  - 目印（`[[NO_ANSWER]]`）が返ったら `out_of_scope` で案内する
  - 検索スコアがしきい値未満なら `low_confidence` で案内する
  - 2回目の質問では、前回の `conversation_id` を Dify に渡す
  - Dify の会話が見つからないときは、新しい会話でやり直す
  - Dify が 5xx を返す、または時間切れになったら `provider_error` で案内する
  - API キーが間違っている（401）ときは `provider_error` で案内し、ログに残す
- [ ] 本物の Dify に対する確認は `@dify-real` タグを付け、普段のテストからは外す

**完了条件：** `npm run test:e2e` で上のシナリオがすべて通る。

## フェーズ 4：ナレッジの登録を API からできるようにする（任意）

最初は Dify の画面で登録すれば足りる。お客様の資料が多い、更新が頻繁、という場合に進める。

- [ ] `POST /admin/tenants/:id/knowledge`（ファイルのアップロード）→ Dify の `POST /v1/datasets/{dataset_id}/document/create-by-file` に転送する
  - データセット用の API キーは、チャット用のアプリの API キーとは別。`providerConfig` に `datasetId`・`datasetApiKey` を足す
  - 登録は非同期。返ってきた `batch` で、インデックス作成の状況を確認する API を呼んで完了を待つ
- [ ] 資料の一覧・削除
- [ ] OpenAI 方式と同じ形の API にしておく。共通の `src/knowledge/` モジュールを main に作り、方式ごとの実装を差し込めるようにする案がある

## フェーズ 5：テナントごとに Dify を立てる運用

- [ ] テナントの Dify を立てる手順をスクリプトにする
  - Compose のプロジェクト名とポートをテナントごとに変える
  - サブドメインを割り当て、リバースプロキシを設定する
  - DSL を読み込み、API キーを発行する
- [ ] 必要なサーバーの大きさを測る。Dify は API・worker・DB・Redis・ベクトル DB・sandbox・plugin daemon など複数のコンテナで動くので、1社ごとのサーバー費用がこの方式のいちばん大きなコストになる
- [ ] Dify のバージョンアップ手順。リリースが頻繁なので、全テナントの Dify を順に上げる手順と、上げた後に動作を確かめる手順が必要
- [ ] テナントごとの Dify のバックアップ（DB とベクトル DB）
- [ ] `providerConfig` の API キーの暗号化（共通部分の課題）

## 未決事項

- 本番は Dify をセルフホストするか、Dify Cloud（または Enterprise）を使うか。Cloud の blocking モードでは、応答が遅いと途中で接続が切れることがある
- 1社＝1インスタンスのサーバー費用を、お客様の月額に乗せられるか
- Dify の中で使う LLM と、そのリージョン（医療系のお客様のデータをどこに送るか）
- 商用提供の前に、Dify のライセンスについて法務の確認を受ける

## 参考

- [Dify Service API：チャットメッセージの送信](https://docs.dify.ai/en/api-reference/chat-messages/send-chat-message)
- [Dify Knowledge API：ファイルからドキュメントを作成](https://docs.dify.ai/en/api-reference/documents/create-document-by-file.md)
- [Dify LICENSE](https://github.com/langgenius/dify/blob/main/LICENSE)

# ロードマップ：OpenAI File Search 方式（openai-develop）

OpenAI の Responses API と File Search（Vector Store）で RAG を作る。
Dify のような別サーバーを持たず、1つの自前 API の中で全テナントを扱う。

```
チャット欄 → POST /chat（自前 API）→ OpenAiChatProvider → OpenAI Responses API
                                                            └ file_search（テナントごとの Vector Store）
資料の登録 → POST /admin/tenants/:id/knowledge → OpenAI Files → テナントの Vector Store
```

## 前提と方針

- **テナントごとに Vector Store を1つ持つ。** テナントの資料が他社の回答に混ざらないよう、検索対象をテナントの Vector Store だけに絞る。
- **会話の履歴は自前の DB から渡す。** OpenAI 側に会話を保存させる（`previous_response_id`）のではなく、毎回こちらで直前のやり取りを渡し、`store: false` にする。方式に依存しない作りを保ち、OpenAI 側に残るデータを減らすため。
- **資料の登録は自前の API で行う。** Dify と違って管理画面がないので、資料の登録・一覧・削除を作る必要がある。

## フェーズ 1：OpenAI を呼べるようにする

- [ ] 環境変数 `OPENAI_API_KEY`・`OPENAI_MODEL` を追加する（`.env.example` に追記）
- [ ] 公式 SDK（`openai`）を入れる
- [ ] 開発用と本番用で OpenAI のプロジェクトと API キーを分ける
- [ ] デモ用の資料（脱毛クリニックの FAQ・料金表など、架空のデータ）で Vector Store を手で作り、Playground などで検索結果を確かめる

**完了条件：** デモの資料を入れた Vector Store に対して、File Search で関連する資料が返ってくる。

## フェーズ 2：OpenAiChatProvider を作る

`src/providers/openai/` にモジュールを作り、`AppModule` に import する。

```
src/providers/openai/
├── openai-provider.module.ts
├── openai.client.ts           OpenAI SDK のクライアントを提供する
├── openai-chat.provider.ts    @RegisterChatProvider()、name = 'openai'
├── openai-config.ts           providerConfig の型と検証（vectorStoreId など）
└── instructions.ts            LLM への指示文の組み立て
```

- [ ] `openai-chat.provider.ts`：`responses.create` を呼ぶ
  - `instructions`：資料にないことは答えない、医療的な判断はしない、予約は予約ページへ案内する、日本語で答える
  - `input`：直前のやり取り（`history`）＋今回の質問
  - `tools: [{ type: 'file_search', vector_store_ids: [テナントの vectorStoreId], max_num_results: 5 }]`
  - `include: ['file_search_call.results']`（検索結果とスコアを受け取るため）
  - 出力形式を JSON スキーマで指定する：`{ answer: string, answerable: boolean }`
  - `store: false`
- [ ] レスポンスを `ChatProviderResult` に変換する

  | ChatProviderResult | OpenAI のレスポンス |
  | --- | --- |
  | `answer` | JSON の `answer` |
  | `answerable` | JSON の `answerable`、かつ検索結果が1件以上 |
  | `confidence` | 検索結果のスコアの最大値 |
  | `sources` | 検索結果のファイル名・本文の抜粋・スコア。資料の題名や URL はファイルの `attributes` から取る |
  | `raw` | レスポンス全体 |

  検索結果の項目名（スコアなど）は、実物のレスポンスで確認してから実装する。
- [ ] テナントごとの指示（口調、案内してよい範囲など）を足せるようにする。`providerConfig.instructions` に置くか、方式に依存しない共通の項目としてテナントに足すかを決める（後者なら main で実装してから取り込む）
- [ ] 429（レート制限）・5xx・時間切れは SDK の再試行に任せ、それでも失敗したら例外にする（共通部分が `provider_error` で案内する）
- [ ] デモテナントの方式を `openai` に切り替えて、`/demo.html` から動作を確かめる

**完了条件：** デモページのチャット欄から、資料にもとづく回答と根拠が表示される。資料にない質問では問い合わせへ案内される。

## フェーズ 3：資料の登録・管理

```
src/knowledge/                   資料の登録・一覧・削除（方式に依存しない部分）
├── knowledge.module.ts
├── knowledge-document.entity.ts テナント・題名・元の URL・方式側のファイルID・状態
├── knowledge.controller.ts      /admin/tenants/:id/knowledge
└── knowledge-store.ts           方式ごとの保存先の契約（OpenAI / Dify で実装）
src/providers/openai/
└── openai-knowledge.store.ts    Files と Vector Store への登録・削除
```

- [ ] 方式が `openai` のテナントを登録したら、Vector Store を自動で作り、`providerConfig.vectorStoreId` に入れる
- [ ] `POST /admin/tenants/:id/knowledge`（ファイルのアップロード）
  - OpenAI Files にアップロード → テナントの Vector Store に追加する
  - ファイルの `attributes` に題名と元の URL を入れる（回答の根拠として表示するため）
  - 取り込みは非同期なので、状態（処理中・完了・失敗）を DB に記録する
- [ ] `GET /admin/tenants/:id/knowledge`（一覧）、`DELETE /admin/tenants/:id/knowledge/:docId`（Vector Store と Files の両方から消す）
- [ ] FAQ は「質問と回答の1組」が1つのかたまりになるように整えてから登録する（CSV を Q&A ごとの Markdown に変換するなど）。検索の精度に直結する
- [ ] `knowledge-store.ts` の契約は Dify 方式と共通にできるので、`src/knowledge/` は main に置いて両ブランチから使う案がある

**完了条件：** API から資料を登録すると、その内容をもとにチャットが答えるようになる。削除すると答えなくなる。

## フェーズ 4：振る舞いを Gherkin で定義する

本物の OpenAI は使わず、テスト用の偽 OpenAI サーバーに向けて実行する。SDK の `baseURL` を差し替えるだけで済む。

- [ ] `test/features/support/fake-openai-server.ts`：`/responses`・`/files`・`/vector_stores` を受けて、シナリオで指定したレスポンスを返す。受け取ったリクエストも記録する
- [ ] ステップを機能ごとのファイルに分ける（`test/features/support/steps/openai.steps.ts` など）
- [ ] `features/providers/openai.feature` に書くシナリオ
  - 検索結果があり、モデルが答えられると判断したら、回答と根拠（資料の題名）を返す
  - 検索はテナントの Vector Store だけを対象にする（リクエストの `vector_store_ids` を確認）
  - 検索結果が0件なら `out_of_scope` で案内する
  - モデルが `answerable: false` を返したら `out_of_scope` で案内する
  - 検索スコアがしきい値未満なら `low_confidence` で案内する
  - 2回目の質問では、直前のやり取りが `input` に含まれる
  - OpenAI が 429・5xx を返し続けたら `provider_error` で案内する
- [ ] `features/knowledge.feature` に書くシナリオ
  - 方式が `openai` のテナントを登録すると Vector Store が作られる
  - 資料を登録すると、Vector Store に追加され、一覧に表示される
  - 資料を削除すると、Vector Store と一覧から消える
  - 他のテナントの資料は操作できない
- [ ] 本物の OpenAI に対する確認は `@openai-real` タグを付け、普段のテストからは外す

**完了条件：** `npm run test:e2e` で上のシナリオがすべて通る。

## フェーズ 5：回答の品質を測る

- [ ] 評価用の質問セットを作る。「答えるべき質問と期待する回答の要点」と「案内すべき質問とその理由」の両方を入れる
- [ ] 質問セットを本物の API で流し、結果を集計するスクリプト（`scripts/eval.ts` など）
- [ ] その結果をもとに、確信度のしきい値、`max_num_results`、指示文を調整する。スコアの分布は資料や言語で変わるので、しきい値は実測で決める

## フェーズ 6：運用

- [ ] 費用の把握：モデルのトークン料金、File Search の呼び出し料金、Vector Store の保存容量の料金。最新の料金表で、1社あたり月の問い合わせ件数から見積もる
- [ ] OpenAI に送るデータの扱い：お客様の資料に個人情報を入れない運用ルール、OpenAI のデータ保持の設定
- [ ] モデルの提供終了への備え（`OPENAI_MODEL` で切り替えられるようにしておく）
- [ ] `providerConfig` の値の暗号化（共通部分の課題）

## 未決事項

- OpenAI を直接使うか、Azure OpenAI（東日本リージョン）を使うか。医療系のお客様ではデータの保存場所を問われる可能性がある
- 使うモデル（回答の質・速さ・料金のバランス）
- Vector Store の分け方を「1テナント＝1つ」のままにするか、1つの Vector Store をファイルの属性で絞り込む形にするか（管理は楽になるが、絞り込みの設定を誤ると他社の資料が混ざる危険がある）

## 参考

- [OpenAI File Search ガイド](https://developers.openai.com/docs/guides/tools-file-search)
- [Responses API で File Search を使う（Cookbook）](https://developers.openai.com/cookbook/examples/file_search_responses)

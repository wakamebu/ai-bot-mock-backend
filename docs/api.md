# API 仕様（共通部分）

Dify 版（`dify-develop`）と OpenAI File Search 版（`openai-develop`）で共通の API。
方式が変わっても、チャット欄から見える API とレスポンスの形は変えない。

## 全体の流れ

```
サイト訪問者
  └─ チャット欄（public/widget.js）
       └─ POST /chat  (X-Widget-Key でテナントを識別)
            ├─ 1. テナント解決・オリジン検証
            ├─ 2. 事前判定：担当者へ回すキーワード → fallback(sensitive)
            ├─ 3. 方式（ChatProvider）に問い合わせ
            │      mock：キーワード一致（main）
            │      dify：テナントごとの Dify インスタンス（dify-develop）
            │      openai：テナントごとの Vector Store + File Search（openai-develop）
            ├─ 4. 事後判定：答えられない / 確信度不足 → fallback
            └─ 5. 会話ログ保存 → レスポンス
```

## 認証

| 対象 | 方式 |
| --- | --- |
| `POST /chat` | `X-Widget-Key` ヘッダーの公開キー + テナントの `allowedOrigins` によるオリジン検証 |
| `/admin/*` | **モックのため未実装（認証なしで呼べる）** |
| `GET /auth/me` | **モックのため中身なし**。常に `{ "user": null, "mock": true }` を返す |

- 公開キーはページの HTML に書かれるので秘密情報ではない。悪用対策はオリジン検証とレート制限（未実装）で行う。
- `allowedOrigins` が空のテナントはオリジンを制限しない（開発用）。
- `Origin` ヘッダーが無いリクエスト（curl などのサーバー間呼び出し）はモックでは通す。

## POST /chat

チャット欄からの発言を受け取り、回答を返す。

**リクエスト**

```http
POST /chat
Content-Type: application/json
X-Widget-Key: pk_demo_clinic

{ "message": "予約方法を教えて", "conversationId": "（2回目以降のみ）" }
```

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `message` | string | ○ | 1〜1000文字 |
| `conversationId` | uuid | | 前回のレスポンスの値。省略すると新しい会話になる |

**レスポンス（200）**

```json
{
  "conversationId": "3776ceea-…",
  "messageId": "170aa813-…",
  "status": "answered",
  "answer": "ご予約はWeb予約ページから24時間受け付けています。…",
  "sources": [{ "title": "よくある質問 > ご予約について" }]
}
```

フォールバック時は `answer` がテナントの案内文になり、`fallback` が付く。

```json
{
  "status": "fallback",
  "answer": "申し訳ありません、このご質問にはチャットでお答えできません。…",
  "sources": [],
  "fallback": { "reason": "sensitive", "contactUrl": "https://example.com/contact" }
}
```

| `fallback.reason` | 判定のタイミング | 条件 |
| --- | --- | --- |
| `sensitive` | 方式を呼ぶ前 | 質問がテナントの `handoffKeywords` を含む（医療的な判断など） |
| `out_of_scope` | 方式の回答後 | 方式が `answerable: false` を返した、または回答が空 |
| `low_confidence` | 方式の回答後 | `confidence` がテナントの `confidenceThreshold` 未満 |
| `provider_error` | 方式の呼び出し時 | 方式の呼び出しが例外になった |

**エラー**

| ステータス | 条件 |
| --- | --- |
| 400 | リクエストの形が不正 |
| 401 | `X-Widget-Key` が無い、または該当テナントが無い |
| 403 | `Origin` がテナントの `allowedOrigins` に含まれない |
| 404 | `conversationId` がそのテナントの会話に無い |

## 方式の実装（ChatProvider）

方式ごとの実装は `src/providers/<方式>/` にモジュールとして置く。
`src/chat/providers/chat-provider.ts` の `ChatProvider` を実装したクラスに `@RegisterChatProvider()` を付け、
そのモジュールを `AppModule` に import すれば登録される（`ChatModule` の変更は不要）。
フォールバック判定とログ保存は共通処理が行う。

```ts
interface ChatProvider {
  readonly name: 'mock' | 'dify' | 'openai';
  generate(input: {
    tenant: Tenant;
    message: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    providerConversationId: string | null;
  }): Promise<{
    answer: string;
    answerable: boolean;          // false → out_of_scope
    confidence: number | null;    // しきい値未満 → low_confidence。null なら判定しない
    sources: AnswerSource[];
    providerConversationId?: string;
    raw?: unknown;                // ログ保存用
  }>;
}
```

方式ごとの設定はテナントの `providerConfig`（jsonb）に入れる。想定するキー：

| 方式 | キー |
| --- | --- |
| `mock` | `faq: { keywords: string[]; answer: string; source?: string }[]` |
| `dify` | `baseUrl`, `apiKey`（テナントごとの Dify インスタンス） |
| `openai` | `vectorStoreId`（テナントごとの Vector Store） |

> モックのため `providerConfig` は平文で保存している。本番では API キーを暗号化するかシークレットストアに移す。

## 管理 API（モックのため認証なし）

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/admin/tenants` | テナント一覧 |
| GET | `/admin/tenants/:id` | テナント詳細 |
| POST | `/admin/tenants` | テナント作成（`publicKey` は自動発行） |
| PATCH | `/admin/tenants/:id` | テナント更新 |
| POST | `/admin/tenants/:id/rotate-key` | 公開キーの再発行 |
| GET | `/admin/tenants/:tenantId/conversations` | 会話一覧（新しい順に50件） |
| GET | `/admin/tenants/:tenantId/conversations/:id` | 会話とメッセージ |

**テナントの項目**

| 項目 | 説明 |
| --- | --- |
| `slug` | 管理用の識別子（英小文字・数字・ハイフン） |
| `name` | 表示名 |
| `allowedOrigins` | チャットを埋め込んでよいオリジン |
| `provider` | `mock` / `dify` / `openai` |
| `providerConfig` | 方式ごとの設定 |
| `confidenceThreshold` | 0〜1。既定 0.6 |
| `handoffKeywords` | 確信度に関係なく担当者へ回すキーワード |
| `fallbackMessage` | フォールバック時にチャット欄へ表示する文 |
| `contactUrl` | 問い合わせフォームの URL |

## データベース

| テーブル | 内容 |
| --- | --- |
| `tenants` | テナント |
| `conversations` | 会話（テナント単位、方式側の会話IDを保持） |
| `messages` | 発言。assistant には `status`・`fallbackReason`・`confidence`・`sources`・`providerRaw` を記録 |

フォールバックした回答でも、方式が返した根拠（`sources`）と生データ（`providerRaw`）はログに残す。
「なぜ答えられなかったか」を後から調べ、FAQ を追加する材料にするため。

## チャット欄（public/widget.js）

```html
<script src="https://<api>/widget.js" data-widget-key="pk_xxx" defer></script>
```

| 属性 | 説明 |
| --- | --- |
| `data-widget-key` | 必須。テナントの公開キー |
| `data-api-base` | API の URL（省略時は widget.js の配信元） |
| `data-title` | ヘッダーの表示名 |
| `data-greeting` | 最初のあいさつ |
| `data-color` | テーマカラー |

- Shadow DOM で描画するので、埋め込み先のサイトの CSS と干渉しない。
- 会話IDは `sessionStorage` に保存する（タブを閉じると新しい会話になる）。
- デモページ：`/demo.html`（デモテナント `pk_demo_clinic` を使用）

## 未実装（モックの範囲外）

- 管理者の認証・認可（`/auth/me` は空）
- レート制限、ボット対策
- `providerConfig` の暗号化
- 有人チャットへの引き継ぎ（将来のオプション）
- 予約の受付（予約ページへの案内のみ）
- マイグレーション（開発中は `DB_SYNCHRONIZE=true` で自動作成）

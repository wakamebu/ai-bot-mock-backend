/**
 * 偽の Dify（開発・受け入れテスト用）。
 *
 * 1つのプロセスで、テナントごとの Dify インスタンスを模擬する。
 * インスタンスは `POST /__fake/instances` で作り（＝テナント用の Dify を立てる作業の代わり）、
 * それぞれ `/i/<インスタンスID>/v1/...` で Service API（チャット）と Knowledge API を受ける。
 *
 * - チャットフローの模擬：ナレッジを2-gram の一致で検索し、いちばん近い資料の「A:」以降を回答する。
 *   見つからなければ、答えられない目印（[[NO_ANSWER]]）を返す（本物のチャットフローの指示と同じ）
 * - 利用量：1文字＝1トークンとして概算し、total_price も返す
 * - 資料の取り込み：すぐに completed にする
 *
 * テストからは willRespond / willFail / willDelay / expireConversations と requests を使う。
 *
 * 単体で起動：node tools/fake-dify/server.ts   （PORT=5101、FAKE_DIFY_STATE で状態を保存）
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname } from 'node:path';

export const NO_ANSWER_MARKER = '[[NO_ANSWER]]';

interface FakeDocument {
  id: string;
  name: string;
  text: string;
  created_at: number;
}

interface FakeConversation {
  id: string;
  user: string;
  messages: { query: string; answer: string }[];
}

interface FakeInstance {
  id: string;
  name: string;
  appApiKey: string;
  datasetApiKey: string;
  datasetId: string;
  documents: FakeDocument[];
  conversations: Record<string, FakeConversation>;
}

interface FakeState {
  instances: Record<string, FakeInstance>;
}

export interface FakeRetrieverResource {
  position: number;
  dataset_id: string;
  dataset_name: string;
  document_id: string;
  document_name: string;
  segment_id: string;
  score: number;
  content: string;
}

export interface RecordedRequest {
  instanceId: string | null;
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

interface ScriptedResponse {
  answer?: string;
  /** 検索結果を差し替える（score などを指定したいとき） */
  resources?: Partial<FakeRetrieverResource>[];
}

/** チャットの料金の概算に使う単価（USD / 100万トークン、gpt-5-mini 相当） */
const PRICE_INPUT = 0.25;
const PRICE_OUTPUT = 2.0;

function bigrams(text: string): Set<string> {
  const normalized = text.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const result = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    const gram = normalized.slice(i, i + 2);
    // ひらがなだけの組（「ます」「です」など）は一致の判定に使わない
    if (/^[\p{Script=Hiragana}\p{P}\p{S}]+$/u.test(gram)) continue;
    result.add(gram);
  }
  return result;
}

/** 質問の2-gram のうち、資料に含まれる割合（0〜1） */
export function matchRatio(query: string, text: string): number {
  const q = bigrams(query);
  if (q.size === 0) return 0;
  const t = bigrams(text);
  let hits = 0;
  for (const gram of q) if (t.has(gram)) hits++;
  return hits / q.size;
}

const MIN_MATCH_RATIO = 0.25;

function answerFrom(text: string): string {
  const qa = /(?:^|\n)A[:：]\s*([\s\S]+)/.exec(text);
  if (qa) return qa[1].trim();
  return text
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .join('\n')
    .slice(0, 300);
}

const now = () => Math.floor(Date.now() / 1000);
const newKey = (prefix: string) =>
  `${prefix}-${randomBytes(12).toString('hex')}`;

export class FakeDifyServer {
  private server: Server | null = null;
  private baseUrl = '';
  private state: FakeState = { instances: {} };
  private readonly stateFile: string | null;

  readonly requests: RecordedRequest[] = [];
  private scripted: ScriptedResponse[] = [];
  private failures: { status: number; times: number } | null = null;
  private delayMs = 0;

  constructor(options: { stateFile?: string | null } = {}) {
    this.stateFile = options.stateFile ?? null;
    if (this.stateFile && existsSync(this.stateFile)) {
      this.state = JSON.parse(
        readFileSync(this.stateFile, 'utf8'),
      ) as FakeState;
    }
  }

  /** 起動して URL を返す。port 0 なら空いているポート */
  async start(port = 0): Promise<string> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        send(res, 500, {
          code: 'internal_server_error',
          message: String(error),
          status: 500,
        });
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(port, resolve));
    const address = this.server.address() as AddressInfo;
    this.baseUrl = `http://localhost:${address.port}`;
    return this.baseUrl;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }

  reset() {
    this.state = { instances: {} };
    this.requests.length = 0;
    this.scripted = [];
    this.failures = null;
    this.delayMs = 0;
  }

  /** 次のチャットの応答を差し替える（呼ぶたびに1回分ずつ積む） */
  willRespond(response: ScriptedResponse) {
    this.scripted.push(response);
  }

  /** 次の times 回、インスタンスへのリクエストがこのステータスで失敗する */
  willFail(status: number, times = Number.POSITIVE_INFINITY) {
    this.failures = { status, times };
  }

  /** チャットの応答を遅らせる（時間切れを試すとき） */
  willDelay(ms: number) {
    this.delayMs = ms;
  }

  /** すべての会話を消す（Dify 側で会話が見つからない状態を作る） */
  expireConversations() {
    for (const instance of Object.values(this.state.instances))
      instance.conversations = {};
  }

  instance(id: string): FakeInstance | undefined {
    return this.state.instances[id];
  }

  /** baseUrl（…/i/<id>）からインスタンスを引く */
  instanceByBaseUrl(baseUrl: string): FakeInstance | undefined {
    const id = /\/i\/([^/]+)$/.exec(baseUrl)?.[1];
    return id ? this.state.instances[id] : undefined;
  }

  get chatRequests(): RecordedRequest[] {
    return this.requests.filter(
      (r) => r.method === 'POST' && r.path === '/v1/chat-messages',
    );
  }

  private save() {
    if (!this.stateFile) return;
    mkdirSync(dirname(this.stateFile), { recursive: true });
    writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    const contentType = req.headers['content-type'] ?? '';
    const raw = await readBody(req);

    let body: unknown = null;
    let form: FormData | null = null;
    if (contentType.startsWith('multipart/form-data')) {
      form = await new Response(new Uint8Array(raw), {
        headers: { 'content-type': contentType },
      }).formData();
      body = { data: form.get('data'), file: '(file)' };
    } else if (raw.length > 0) {
      body = JSON.parse(raw.toString('utf8'));
    }

    // 偽の Dify の管理用：テナント用のインスタンスを作る
    if (method === 'POST' && url.pathname === '/__fake/instances') {
      this.requests.push({
        instanceId: null,
        method,
        path: url.pathname,
        headers: req.headers,
        body,
      });
      return this.createInstance(res, body as { name?: string } | null);
    }

    const m = /^\/i\/([^/]+)(\/v1\/.*)$/.exec(url.pathname);
    if (!m)
      return send(res, 404, {
        code: 'not_found',
        message: 'Not Found',
        status: 404,
      });
    const [, instanceId, path] = m;
    this.requests.push({
      instanceId,
      method,
      path,
      headers: req.headers,
      body,
    });
    const instance = this.state.instances[instanceId];
    if (!instance)
      return send(res, 404, {
        code: 'not_found',
        message: 'Instance not found',
        status: 404,
      });

    if (this.failures && this.failures.times > 0) {
      this.failures.times--;
      const { status } = this.failures;
      if (this.failures.times === 0) this.failures = null;
      return send(res, status, {
        code: 'fake_failure',
        message: `fake failure (${status})`,
        status,
      });
    }

    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    let d: RegExpExecArray | null;

    if (path === '/v1/chat-messages' && method === 'POST') {
      if (token !== instance.appApiKey) return unauthorized(res);
      if (this.delayMs > 0)
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      return this.chat(res, instance, body as ChatRequest);
    }

    if ((d = /^\/v1\/datasets\/([^/]+)\/(.*)$/.exec(path))) {
      if (token !== instance.datasetApiKey) return unauthorized(res);
      const [, datasetId, rest] = d;
      if (datasetId !== instance.datasetId)
        return send(res, 404, {
          code: 'dataset_not_found',
          message: 'Dataset not found.',
          status: 404,
        });
      if (method === 'POST' && rest === 'document/create-by-text') {
        const { name, text } = body as { name: string; text: string };
        return this.addDocument(res, instance, name, text);
      }
      if (method === 'POST' && rest === 'document/create-by-file') {
        const file = form?.get('file');
        if (!(file instanceof Blob))
          return send(res, 400, {
            code: 'no_file_uploaded',
            message: 'Please upload your file.',
            status: 400,
          });
        return this.addDocument(
          res,
          instance,
          (file as File).name,
          await file.text(),
        );
      }
      let doc: RegExpExecArray | null;
      if ((doc = /^documents\/([^/]+)$/.exec(rest))) {
        const found = instance.documents.find((x) => x.id === doc![1]);
        if (method === 'GET') {
          return found
            ? send(res, 200, documentJson(found))
            : send(res, 404, {
                code: 'not_found',
                message: 'Document not found.',
                status: 404,
              });
        }
        if (method === 'DELETE') {
          if (!found)
            return send(res, 404, {
              code: 'not_found',
              message: 'Document not found.',
              status: 404,
            });
          instance.documents = instance.documents.filter(
            (x) => x.id !== found.id,
          );
          this.save();
          res.writeHead(204).end();
          return;
        }
      }
    }
    send(res, 404, {
      code: 'not_found',
      message: `${method} ${path}`,
      status: 404,
    });
  }

  private createInstance(res: ServerResponse, body: { name?: string } | null) {
    const instance: FakeInstance = {
      id: randomBytes(6).toString('hex'),
      name: body?.name ?? '',
      appApiKey: newKey('app'),
      datasetApiKey: newKey('dataset'),
      datasetId: randomUUID(),
      documents: [],
      conversations: {},
    };
    this.state.instances[instance.id] = instance;
    this.save();
    send(res, 201, {
      instanceId: instance.id,
      baseUrl: `${this.baseUrl}/i/${instance.id}`,
      apiKey: instance.appApiKey,
      datasetId: instance.datasetId,
      datasetApiKey: instance.datasetApiKey,
    });
  }

  private addDocument(
    res: ServerResponse,
    instance: FakeInstance,
    name: string,
    text: string,
  ) {
    const doc: FakeDocument = {
      id: randomUUID(),
      name,
      text,
      created_at: now(),
    };
    instance.documents.push(doc);
    this.save();
    send(res, 200, {
      document: documentJson(doc),
      batch: `${Date.now()}${randomBytes(3).toString('hex')}`,
    });
  }

  private chat(res: ServerResponse, instance: FakeInstance, body: ChatRequest) {
    if (!body?.query || !body.user) {
      return send(res, 400, {
        code: 'invalid_param',
        message: 'query and user are required',
        status: 400,
      });
    }
    let conversation: FakeConversation;
    if (body.conversation_id) {
      const found = instance.conversations[body.conversation_id];
      if (!found || found.user !== body.user) {
        return send(res, 404, {
          code: 'not_found',
          message: 'Conversation Not Exists.',
          status: 404,
        });
      }
      conversation = found;
    } else {
      conversation = { id: randomUUID(), user: body.user, messages: [] };
      instance.conversations[conversation.id] = conversation;
    }

    const script = this.scripted.shift();
    const resources: FakeRetrieverResource[] = script?.resources
      ? script.resources.map((r, i) => ({
          position: i + 1,
          dataset_id: instance.datasetId,
          dataset_name: 'knowledge',
          document_id: r.document_id ?? randomUUID(),
          document_name: r.document_name ?? `scripted-${i}`,
          segment_id: randomUUID(),
          score: r.score ?? 0.9,
          content: r.content ?? '',
        }))
      : this.search(instance, body.query);
    const answer =
      script?.answer ??
      (resources[0] ? answerFrom(resources[0].content) : NO_ANSWER_MARKER);

    conversation.messages.push({ query: body.query, answer });
    this.save();

    // 1文字＝1トークンとして概算する（指示文の分を足す）
    const history = conversation.messages
      .slice(0, -1)
      .reduce((sum, m) => sum + m.query.length + m.answer.length, 0);
    const promptTokens =
      300 +
      body.query.length +
      history +
      resources.reduce((sum, r) => sum + r.content.length, 0);
    const completionTokens = answer.length + 20;
    const totalPrice =
      (promptTokens * PRICE_INPUT + completionTokens * PRICE_OUTPUT) /
      1_000_000;

    const messageId = randomUUID();
    send(res, 200, {
      event: 'message',
      task_id: randomUUID(),
      id: messageId,
      message_id: messageId,
      conversation_id: conversation.id,
      mode: 'advanced-chat',
      answer,
      metadata: {
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          total_price: totalPrice.toFixed(7),
          currency: 'USD',
          latency: 0.5,
        },
        retriever_resources: resources,
      },
      created_at: now(),
    });
  }

  private search(
    instance: FakeInstance,
    query: string,
  ): FakeRetrieverResource[] {
    return instance.documents
      .map((doc) => ({ doc, ratio: matchRatio(query, doc.text) }))
      .filter(({ ratio }) => ratio >= MIN_MATCH_RATIO)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3)
      .map(({ doc, ratio }, i) => ({
        position: i + 1,
        dataset_id: instance.datasetId,
        dataset_name: 'knowledge',
        document_id: doc.id,
        document_name: doc.name,
        segment_id: randomUUID(),
        // 本物のスコアに近い幅（0.4〜1.0）に寄せる
        score: Math.round(Math.min(1, 0.4 + ratio * 0.6) * 1000) / 1000,
        content: doc.text,
      }));
  }
}

interface ChatRequest {
  query: string;
  user: string;
  conversation_id?: string;
  response_mode?: string;
  inputs?: Record<string, unknown>;
}

function documentJson(doc: FakeDocument) {
  return {
    id: doc.id,
    position: 1,
    data_source_type: 'upload_file',
    name: doc.name,
    created_from: 'api',
    created_at: doc.created_at,
    tokens: doc.text.length,
    indexing_status: 'completed',
    error: null,
    enabled: true,
    archived: false,
    display_status: 'available',
    word_count: doc.text.length,
  };
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function unauthorized(res: ServerResponse) {
  send(res, 401, {
    code: 'unauthorized',
    message: 'Access token is invalid',
    status: 401,
  });
}

if (import.meta.main) {
  const server = new FakeDifyServer({
    stateFile: process.env.FAKE_DIFY_STATE ?? '.fake-dify/state.json',
  });
  const url = await server.start(Number(process.env.PORT ?? 5101));
  console.log(`fake Dify: ${url}  (DIFY_PROVISIONER_URL=${url})`);
}

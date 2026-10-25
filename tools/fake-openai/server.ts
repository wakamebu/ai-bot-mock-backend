/**
 * 偽の OpenAI API（開発・受け入れテスト用）。
 *
 * OpenAI SDK の baseURL をこのサーバーに向けると、本物の API キーなしで
 * Files・Vector Store・Responses API（file_search）を一通り動かせる。
 *
 * - 検索：文字の2-gram の一致率で資料を探す（本物の埋め込み検索の代わり）
 * - 回答：いちばん近い資料の「A:」以降（なければ本文の先頭）を返す
 * - トークン数：1文字＝1トークンとして概算する（日本語の実際の値に近い桁になるように）
 *
 * テストからは script（次の応答の指定）と requests（受け取ったリクエスト）を使う。
 *
 * 単体で起動：node tools/fake-openai/server.ts   （PORT=5102、FAKE_OPENAI_STATE で状態を保存）
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname } from 'node:path';

interface FakeFile {
  id: string;
  filename: string;
  bytes: number;
  text: string;
  created_at: number;
}

interface FakeVectorStoreFile {
  file_id: string;
  attributes: Record<string, string | number | boolean>;
  created_at: number;
}

interface FakeVectorStore {
  id: string;
  name: string;
  created_at: number;
  files: FakeVectorStoreFile[];
}

interface FakeState {
  files: Record<string, FakeFile>;
  vectorStores: Record<string, FakeVectorStore>;
}

export interface FakeSearchResult {
  file_id: string;
  filename: string;
  score: number;
  text: string;
  attributes: Record<string, string | number | boolean>;
}

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

/** 次の Responses API の応答を差し替える */
interface ScriptedResponse {
  answer?: string;
  answerable?: boolean;
  /** 検索結果を差し替える（score などを指定したいとき） */
  results?: Partial<FakeSearchResult>[];
  /** モデルの出力をそのまま指定する（JSON でない出力を試すとき） */
  rawText?: string;
}

/** 文字の2-gram。ひらがなだけの組（「ます」「です」など）は一致の判定に使わない */
function bigrams(text: string): Set<string> {
  const normalized = text.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const result = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    const gram = normalized.slice(i, i + 2);
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

/** 一致率がこれ未満の資料は検索結果に含めない */
const MIN_MATCH_RATIO = 0.25;

function answerFrom(text: string): string {
  const qa = /(?:^|\n)A[:：]\s*([\s\S]+)/.exec(text);
  if (qa) return qa[1].trim();
  const body = text
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .join('\n');
  return body.slice(0, 300);
}

const now = () => Math.floor(Date.now() / 1000);
const newId = (prefix: string) => `${prefix}${randomBytes(12).toString('hex')}`;

export class FakeOpenAiServer {
  private server: Server | null = null;
  private state: FakeState = { files: {}, vectorStores: {} };
  private readonly stateFile: string | null;

  readonly requests: RecordedRequest[] = [];
  private scripted: ScriptedResponse[] = [];
  private failures: { status: number; times: number } | null = null;

  constructor(options: { stateFile?: string | null } = {}) {
    this.stateFile = options.stateFile ?? null;
    if (this.stateFile && existsSync(this.stateFile)) {
      this.state = JSON.parse(
        readFileSync(this.stateFile, 'utf8'),
      ) as FakeState;
    }
  }

  /** 起動して baseURL（…/v1）を返す。port 0 なら空いているポート */
  async start(port = 0): Promise<string> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        send(res, 500, {
          error: { message: String(error), type: 'server_error' },
        });
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(port, resolve));
    const address = this.server.address() as AddressInfo;
    return `http://localhost:${address.port}/v1`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }

  /** テスト用：状態・記録・差し替えを空にする */
  reset() {
    this.state = { files: {}, vectorStores: {} };
    this.requests.length = 0;
    this.scripted = [];
    this.failures = null;
  }

  /** 次の Responses API の応答を差し替える（呼ぶたびに1回分ずつ積む） */
  willRespond(response: ScriptedResponse) {
    this.scripted.push(response);
  }

  /** 次の times 回、すべての API がこのステータスで失敗する */
  willFail(status: number, times = Number.POSITIVE_INFINITY) {
    this.failures = { status, times };
  }

  vectorStore(id: string): FakeVectorStore | undefined {
    return this.state.vectorStores[id];
  }

  get vectorStoreIds(): string[] {
    return Object.keys(this.state.vectorStores);
  }

  /** Responses API へのリクエスト（新しいものが最後） */
  get responseRequests(): Record<string, unknown>[] {
    return this.requests
      .filter((r) => r.method === 'POST' && r.path === '/v1/responses')
      .map((r) => r.body as Record<string, unknown>);
  }

  private save() {
    if (!this.stateFile) return;
    mkdirSync(dirname(this.stateFile), { recursive: true });
    writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    const path = url.pathname;
    const contentType = req.headers['content-type'] ?? '';

    let body: unknown = null;
    let form: FormData | null = null;
    const raw = await readBody(req);
    if (contentType.startsWith('multipart/form-data')) {
      form = await new Response(new Uint8Array(raw), {
        headers: { 'content-type': contentType },
      }).formData();
      body = Object.fromEntries(
        [...form.keys()].map((k) => [
          k,
          k === 'file' ? '(file)' : form!.get(k),
        ]),
      );
    } else if (raw.length > 0) {
      body = JSON.parse(raw.toString('utf8'));
    }
    this.requests.push({ method, path, body });

    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ') || auth === 'Bearer invalid') {
      return send(res, 401, {
        error: {
          message: 'Incorrect API key provided',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      });
    }
    if (this.failures && this.failures.times > 0) {
      this.failures.times--;
      const { status } = this.failures;
      if (this.failures.times === 0) this.failures = null;
      // SDK の再試行を待たせないため、すぐに再試行してよいと返す
      res.setHeader('retry-after-ms', '1');
      return send(res, status, {
        error: { message: `fake failure (${status})`, type: 'server_error' },
      });
    }

    let m: RegExpExecArray | null;
    if (method === 'POST' && path === '/v1/files')
      return this.createFile(res, form);
    if (method === 'DELETE' && (m = /^\/v1\/files\/([^/]+)$/.exec(path)))
      return this.deleteFile(res, m[1]);
    if (method === 'POST' && path === '/v1/vector_stores')
      return this.createVectorStore(res, body as { name?: string });
    if (method === 'GET' && (m = /^\/v1\/vector_stores\/([^/]+)$/.exec(path))) {
      const vs = this.state.vectorStores[m[1]];
      return vs
        ? send(res, 200, vectorStoreJson(vs))
        : notFound(res, 'vector store');
    }
    if (
      method === 'POST' &&
      (m = /^\/v1\/vector_stores\/([^/]+)\/files$/.exec(path))
    ) {
      return this.addVectorStoreFile(
        res,
        m[1],
        body as {
          file_id: string;
          attributes?: FakeVectorStoreFile['attributes'];
        },
      );
    }
    if ((m = /^\/v1\/vector_stores\/([^/]+)\/files\/([^/]+)$/.exec(path))) {
      if (method === 'GET') return this.getVectorStoreFile(res, m[1], m[2]);
      if (method === 'DELETE')
        return this.deleteVectorStoreFile(res, m[1], m[2]);
    }
    if (method === 'POST' && path === '/v1/responses')
      return this.createResponse(res, body as Record<string, unknown>);
    return notFound(res, `${method} ${path}`);
  }

  private async createFile(res: ServerResponse, form: FormData | null) {
    const file = form?.get('file');
    if (!(file instanceof Blob))
      return send(res, 400, { error: { message: 'file is required' } });
    const text = await file.text();
    const created: FakeFile = {
      id: newId('file-'),
      filename: (file as File).name ?? 'upload',
      bytes: file.size,
      text,
      created_at: now(),
    };
    this.state.files[created.id] = created;
    this.save();
    send(res, 200, {
      id: created.id,
      object: 'file',
      bytes: created.bytes,
      created_at: created.created_at,
      filename: created.filename,
      purpose: (form?.get('purpose') as string | null) ?? 'assistants',
      status: 'processed',
    });
  }

  private deleteFile(res: ServerResponse, id: string) {
    if (!this.state.files[id]) return notFound(res, 'file');
    delete this.state.files[id];
    this.save();
    send(res, 200, { id, object: 'file', deleted: true });
  }

  private createVectorStore(
    res: ServerResponse,
    body: { name?: string } | null,
  ) {
    const vs: FakeVectorStore = {
      id: newId('vs_'),
      name: body?.name ?? '',
      created_at: now(),
      files: [],
    };
    this.state.vectorStores[vs.id] = vs;
    this.save();
    send(res, 200, vectorStoreJson(vs));
  }

  private addVectorStoreFile(
    res: ServerResponse,
    vectorStoreId: string,
    body: { file_id: string; attributes?: FakeVectorStoreFile['attributes'] },
  ) {
    const vs = this.state.vectorStores[vectorStoreId];
    if (!vs) return notFound(res, 'vector store');
    const file = this.state.files[body.file_id];
    if (!file) return notFound(res, 'file');
    const entry: FakeVectorStoreFile = {
      file_id: file.id,
      attributes: body.attributes ?? {},
      created_at: now(),
    };
    vs.files.push(entry);
    this.save();
    send(res, 200, vectorStoreFileJson(vs, entry, file));
  }

  private getVectorStoreFile(
    res: ServerResponse,
    vectorStoreId: string,
    fileId: string,
  ) {
    const vs = this.state.vectorStores[vectorStoreId];
    const entry = vs?.files.find((f) => f.file_id === fileId);
    if (!vs || !entry) return notFound(res, 'vector store file');
    send(res, 200, vectorStoreFileJson(vs, entry, this.state.files[fileId]));
  }

  private deleteVectorStoreFile(
    res: ServerResponse,
    vectorStoreId: string,
    fileId: string,
  ) {
    const vs = this.state.vectorStores[vectorStoreId];
    const index = vs?.files.findIndex((f) => f.file_id === fileId) ?? -1;
    if (!vs || index < 0) return notFound(res, 'vector store file');
    vs.files.splice(index, 1);
    this.save();
    send(res, 200, {
      id: fileId,
      object: 'vector_store.file.deleted',
      deleted: true,
    });
  }

  private search(
    vectorStoreIds: string[],
    query: string,
    max: number,
  ): FakeSearchResult[] {
    const results: FakeSearchResult[] = [];
    for (const id of vectorStoreIds) {
      for (const entry of this.state.vectorStores[id]?.files ?? []) {
        const file = this.state.files[entry.file_id];
        if (!file) continue;
        const ratio = matchRatio(query, file.text);
        if (ratio < MIN_MATCH_RATIO) continue;
        results.push({
          file_id: file.id,
          filename: file.filename,
          // 本物のスコアに近い幅（0.4〜1.0）に寄せる
          score: Math.round(Math.min(1, 0.4 + ratio * 0.6) * 1000) / 1000,
          text: file.text,
          attributes: entry.attributes,
        });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, max);
  }

  private createResponse(res: ServerResponse, body: Record<string, unknown>) {
    const tools = (body.tools ?? []) as {
      type: string;
      vector_store_ids?: string[];
      max_num_results?: number;
    }[];
    const fileSearch = tools.find((t) => t.type === 'file_search');
    for (const id of fileSearch?.vector_store_ids ?? []) {
      if (!this.state.vectorStores[id])
        return notFound(res, `vector store ${id}`);
    }
    const input = (body.input ?? []) as { role: string; content: string }[];
    const question =
      typeof body.input === 'string'
        ? body.input
        : (input.filter((i) => i.role === 'user').at(-1)?.content ?? '');
    const script = this.scripted.shift();

    const searched = fileSearch
      ? (script?.results?.map((r, i) => ({
          file_id: r.file_id ?? `file-scripted-${i}`,
          filename: r.filename ?? `scripted-${i}.md`,
          score: r.score ?? 0.9,
          text: r.text ?? '',
          attributes: r.attributes ?? {},
        })) ??
        this.search(
          fileSearch.vector_store_ids ?? [],
          question,
          fileSearch.max_num_results ?? 10,
        ))
      : [];

    const answerable = script?.answerable ?? searched.length > 0;
    const answer =
      script?.answer ??
      (answerable && searched[0] ? answerFrom(searched[0].text) : '');
    const text = script?.rawText ?? JSON.stringify({ answer, answerable });

    const includeResults = ((body.include ?? []) as string[]).includes(
      'file_search_call.results',
    );
    const output: unknown[] = [];
    if (fileSearch) {
      output.push({
        type: 'file_search_call',
        id: newId('fs_'),
        status: 'completed',
        queries: [question],
        results: includeResults ? searched : null,
      });
    }
    output.push({
      type: 'message',
      id: newId('msg_'),
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    });

    // 1文字＝1トークンとして概算する
    const inputChars =
      (typeof body.instructions === 'string' ? body.instructions : '').length +
      input.reduce((sum, i) => sum + String(i.content).length, 0) +
      searched.reduce((sum, r) => sum + r.text.length, 0);
    const inputTokens = inputChars + 200; // ツールの定義などの分
    const outputTokens = text.length + 50;

    send(res, 200, {
      id: newId('resp_'),
      object: 'response',
      created_at: now(),
      status: 'completed',
      model: typeof body.model === 'string' ? body.model : 'gpt-5-mini',
      output,
      parallel_tool_calls: true,
      tool_choice: 'auto',
      tools,
      store: body.store ?? true,
      usage: {
        input_tokens: inputTokens,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        output_tokens: outputTokens,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: inputTokens + outputTokens,
      },
    });
  }
}

function vectorStoreJson(vs: FakeVectorStore) {
  return {
    id: vs.id,
    object: 'vector_store',
    created_at: vs.created_at,
    name: vs.name,
    usage_bytes: 0,
    status: 'completed',
    file_counts: {
      in_progress: 0,
      completed: vs.files.length,
      failed: 0,
      cancelled: 0,
      total: vs.files.length,
    },
    last_active_at: now(),
    metadata: null,
  };
}

function vectorStoreFileJson(
  vs: FakeVectorStore,
  entry: FakeVectorStoreFile,
  file: FakeFile | undefined,
) {
  return {
    id: entry.file_id,
    object: 'vector_store.file',
    created_at: entry.created_at,
    vector_store_id: vs.id,
    status: 'completed',
    usage_bytes: file?.bytes ?? 0,
    last_error: null,
    attributes: entry.attributes,
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

function notFound(res: ServerResponse, what: string) {
  send(res, 404, {
    error: { message: `No such ${what}`, type: 'invalid_request_error' },
  });
}

if (import.meta.main) {
  const server = new FakeOpenAiServer({
    stateFile: process.env.FAKE_OPENAI_STATE ?? '.fake-openai/state.json',
  });
  const url = await server.start(Number(process.env.PORT ?? 5102));
  console.log(`fake OpenAI API: ${url}  (OPENAI_BASE_URL=${url})`);
}

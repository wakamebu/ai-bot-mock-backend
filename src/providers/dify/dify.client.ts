import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Dify の API が返したエラー */
export class DifyApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(`Dify API ${status}${code ? ` ${code}` : ''}: ${message}`);
  }
}

export interface DifyRetrieverResource {
  position?: number;
  dataset_id?: string;
  dataset_name?: string;
  document_id?: string;
  document_name?: string;
  segment_id?: string;
  score?: number;
  content?: string;
}

/** POST /v1/chat-messages（blocking）のレスポンス。使う項目だけ */
export interface DifyChatResponse {
  message_id: string;
  conversation_id: string;
  answer: string;
  metadata?: {
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      total_price?: string;
      currency?: string;
    };
    retriever_resources?: DifyRetrieverResource[];
  };
}

export interface DifyDocument {
  id: string;
  name: string;
  /** waiting / parsing / cleaning / splitting / indexing / completed / error / paused */
  indexing_status: string;
  error?: string | null;
}

interface Connection {
  baseUrl: string;
  apiKey: string;
}

/**
 * Dify の Service API（チャット）と Knowledge API を fetch で呼ぶ。
 * 接続先と API キーはテナントごとに違うので、呼ぶたびに渡す。
 */
@Injectable()
export class DifyClient {
  constructor(private readonly config: ConfigService) {}

  private get timeoutMs(): number {
    return Number(this.config.get('DIFY_TIMEOUT_MS') ?? 60_000);
  }

  chatMessages(
    conn: Connection,
    body: {
      query: string;
      user: string;
      conversation_id?: string;
      inputs?: Record<string, unknown>;
    },
  ): Promise<DifyChatResponse> {
    return this.request(conn, 'POST', '/v1/chat-messages', {
      json: { inputs: {}, ...body, response_mode: 'blocking' },
    });
  }

  createDocumentByText(
    conn: Connection,
    datasetId: string,
    body: { name: string; text: string },
  ): Promise<{ document: DifyDocument; batch: string }> {
    return this.request(
      conn,
      'POST',
      `/v1/datasets/${datasetId}/document/create-by-text`,
      {
        json: {
          ...body,
          indexing_technique: 'high_quality',
          process_rule: { mode: 'automatic' },
        },
      },
    );
  }

  createDocumentByFile(
    conn: Connection,
    datasetId: string,
    file: { filename: string; contentType: string; content: Buffer },
  ): Promise<{ document: DifyDocument; batch: string }> {
    const form = new FormData();
    form.set(
      'data',
      JSON.stringify({
        indexing_technique: 'high_quality',
        process_rule: { mode: 'automatic' },
      }),
    );
    form.set(
      'file',
      new Blob([new Uint8Array(file.content)], { type: file.contentType }),
      file.filename,
    );
    return this.request(
      conn,
      'POST',
      `/v1/datasets/${datasetId}/document/create-by-file`,
      { form },
    );
  }

  getDocument(
    conn: Connection,
    datasetId: string,
    documentId: string,
  ): Promise<DifyDocument> {
    return this.request(
      conn,
      'GET',
      `/v1/datasets/${datasetId}/documents/${documentId}`,
    );
  }

  async deleteDocument(
    conn: Connection,
    datasetId: string,
    documentId: string,
  ): Promise<void> {
    await this.request(
      conn,
      'DELETE',
      `/v1/datasets/${datasetId}/documents/${documentId}`,
    );
  }

  private async request<T>(
    conn: Connection,
    method: string,
    path: string,
    body: { json?: unknown; form?: FormData } = {},
  ): Promise<T> {
    const res = await fetch(`${conn.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${conn.apiKey}`,
        ...(body.json !== undefined && { 'Content-Type': 'application/json' }),
      },
      body:
        body.form ??
        (body.json !== undefined ? JSON.stringify(body.json) : undefined),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const error = (parsed ?? {}) as { code?: string; message?: string };
      throw new DifyApiError(res.status, error.code, error.message ?? text);
    }
    return parsed as T;
  }
}

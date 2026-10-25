import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * OpenAI SDK のクライアント。API キーがなくてもアプリは起動できるよう、最初に使うときに作る。
 * OPENAI_BASE_URL を指定すると、偽の OpenAI（tools/fake-openai）などに向けられる。
 */
@Injectable()
export class OpenAiClient {
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  get(): OpenAI {
    if (this.client) return this.client;
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    this.client = new OpenAI({
      apiKey,
      baseURL: this.config.get<string>('OPENAI_BASE_URL') || undefined,
      maxRetries: Number(this.config.get('OPENAI_MAX_RETRIES') ?? 2),
      timeout: Number(this.config.get('OPENAI_TIMEOUT_MS') ?? 30_000),
    });
    return this.client;
  }

  get model(): string {
    return this.config.get<string>('OPENAI_MODEL') || 'gpt-5-mini';
  }

  /** gpt-5 系の推論の量（minimal / low / medium / high）。未指定ならモデルの既定 */
  get reasoningEffort(): string | undefined {
    return this.config.get<string>('OPENAI_REASONING_EFFORT') || undefined;
  }
}

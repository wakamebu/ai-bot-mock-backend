import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../../src/app.module.js';
import { configureApp } from '../../../src/app.setup.js';
import type { ChatResponse } from '../../../src/chat/chat.types.js';
import { MockChatProvider } from '../../../src/providers/mock/mock-chat.provider.js';
import { FakeDifyServer } from '../../../tools/fake-dify/server.js';
import { ScriptedChatProvider } from './scripted-chat.provider.js';

interface RegisteredTenant {
  id: string;
  publicKey: string;
}

/**
 * シナリオ間で共有する状態。シナリオごとに reset() で初期化する。
 * アプリは機能（feature ファイル）をまたいで1回だけ起動する。
 */
class World {
  app!: NestExpressApplication;
  readonly provider = new ScriptedChatProvider();
  /** 偽の Dify。方式が dify のテナントは、ここに用意したインスタンスに問い合わせる */
  readonly dify = new FakeDifyServer();

  /** 登録したテナント（名前 → ID・公開キー） */
  tenants = new Map<string, RegisteredTenant>();
  /** 最初に登録したテナント。テナント名を指定しないステップの対象 */
  primaryTenantName: string | null = null;
  /** 直前のレスポンス */
  response: Response | null = null;
  /** このシナリオで受け取ったチャットのレスポンス（成功したもの） */
  chatResponses: ChatResponse[] = [];
  /** 公開キー再発行前のキー */
  previousPublicKey: string | null = null;

  async start() {
    process.env.DIFY_PROVISIONER_URL = await this.dify.start();
    // 時間切れのシナリオを短く済ませる
    process.env.DIFY_TIMEOUT_MS = '1000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MockChatProvider)
      .useValue(this.provider)
      .compile();
    // 失敗系のシナリオでエラーログが出るので、テスト中はログを出さない
    this.app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(this.app);
    await this.app.init();
  }

  async stop() {
    await this.app?.close();
    await this.dify.stop();
  }

  async reset() {
    await this.app
      .get(DataSource)
      .query('TRUNCATE messages, conversations, knowledge_documents, tenants CASCADE');
    this.provider.reset();
    this.dify.reset();
    this.tenants.clear();
    this.primaryTenantName = null;
    this.response = null;
    this.chatResponses = [];
    this.previousPublicKey = null;
  }

  http() {
    return request(this.app.getHttpServer());
  }

  tenant(name?: string): RegisteredTenant {
    const key = name ?? this.primaryTenantName;
    const tenant = key ? this.tenants.get(key) : undefined;
    if (!tenant) throw new Error(`tenant "${key}" is not registered`);
    return tenant;
  }

  get lastChat(): ChatResponse {
    const last = this.chatResponses.at(-1);
    if (!last) throw new Error('no successful chat response yet');
    return last;
  }

  /** チャット API を呼び、レスポンスを記録する */
  async chat(options: {
    message: string;
    publicKey?: string | null;
    origin?: string;
    conversationId?: string;
  }) {
    let req = this.http().post('/chat');
    const publicKey =
      options.publicKey === undefined
        ? this.tenant().publicKey
        : options.publicKey;
    if (publicKey) req = req.set('X-Widget-Key', publicKey);
    if (options.origin) req = req.set('Origin', options.origin);
    this.response = await req.send({
      message: options.message,
      conversationId: options.conversationId,
    });
    if (this.response.status === 200) {
      this.chatResponses.push(this.response.body as ChatResponse);
    }
    return this.response;
  }
}

export const world = new World();

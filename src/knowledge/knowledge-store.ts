import { DiscoveryService } from '@nestjs/core';
import type { ProviderName, Tenant } from '../tenants/tenant.entity.js';
import type { KnowledgeStatus } from './knowledge-document.entity.js';

export interface KnowledgeFile {
  filename: string;
  contentType: string;
  content: Buffer;
  title: string;
  sourceUrl: string | null;
}

export interface KnowledgeStoreResult {
  status: KnowledgeStatus;
  error?: string | null;
}

/**
 * 資料の保存先（方式ごと）が満たす契約。
 * 一覧・削除のための記録は KnowledgeService が持つので、実装は方式側への登録・削除だけを行う。
 */
export interface KnowledgeStore {
  readonly name: ProviderName;
  /**
   * テナントの保存先を用意する（OpenAI の Vector Store を作るなど）。
   * providerConfig に足す値を返す。用意済みなら null。
   */
  prepare(tenant: Tenant): Promise<Record<string, unknown> | null>;
  add(
    tenant: Tenant,
    file: KnowledgeFile,
  ): Promise<KnowledgeStoreResult & { providerDocumentId: string }>;
  /** 取り込みの状況 */
  status(
    tenant: Tenant,
    providerDocumentId: string,
  ): Promise<KnowledgeStoreResult>;
  /** 方式側から消す。すでに無ければ何もしない */
  remove(tenant: Tenant, providerDocumentId: string): Promise<void>;
}

/** 資料の保存先の実装クラスに付けるデコレーター。付けたクラスは KnowledgeService に登録される */
export const RegisterKnowledgeStore = DiscoveryService.createDecorator();

import { Injectable } from '@nestjs/common';
import { NotFoundError, toFile } from 'openai';
import type { VectorStoreFile } from 'openai/resources/vector-stores/files';
import type { KnowledgeStatus } from '../../knowledge/knowledge-document.entity.js';
import {
  type KnowledgeFile,
  type KnowledgeStore,
  type KnowledgeStoreResult,
  RegisterKnowledgeStore,
} from '../../knowledge/knowledge-store.js';
import type { Tenant } from '../../tenants/tenant.entity.js';
import { OpenAiClient } from './openai.client.js';
import { parseOpenAiConfig } from './openai-config.js';

/**
 * 資料を OpenAI Files にアップロードし、テナントの Vector Store に追加する。
 * 題名と元の URL はファイルの attributes に入れ、検索結果から根拠として表示する。
 */
@RegisterKnowledgeStore()
@Injectable()
export class OpenAiKnowledgeStore implements KnowledgeStore {
  readonly name = 'openai' as const;

  constructor(private readonly openai: OpenAiClient) {}

  async prepare(tenant: Tenant): Promise<Record<string, unknown> | null> {
    if (parseOpenAiConfig(tenant.providerConfig).vectorStoreId) return null;
    const vectorStore = await this.openai.get().vectorStores.create({
      name: `tenant-${tenant.slug}`,
      metadata: { tenant_id: tenant.id },
    });
    return { vectorStoreId: vectorStore.id };
  }

  async add(tenant: Tenant, file: KnowledgeFile) {
    const client = this.openai.get();
    const vectorStoreId = this.vectorStoreId(tenant);
    const uploaded = await client.files.create({
      file: await toFile(file.content, file.filename, {
        type: file.contentType,
      }),
      purpose: 'assistants',
    });
    const attributes: Record<string, string> = { title: file.title };
    if (file.sourceUrl) attributes.source_url = file.sourceUrl;
    const added = await client.vectorStores.files.create(vectorStoreId, {
      file_id: uploaded.id,
      attributes,
    });
    return { providerDocumentId: uploaded.id, ...toResult(added) };
  }

  async status(
    tenant: Tenant,
    providerDocumentId: string,
  ): Promise<KnowledgeStoreResult> {
    const file = await this.openai
      .get()
      .vectorStores.files.retrieve(providerDocumentId, {
        vector_store_id: this.vectorStoreId(tenant),
      });
    return toResult(file);
  }

  async remove(tenant: Tenant, providerDocumentId: string): Promise<void> {
    const client = this.openai.get();
    const { vectorStoreId } = parseOpenAiConfig(tenant.providerConfig);
    // Vector Store から外し、ファイル自体も消す（残すと保存容量の料金がかかる）
    await ignoreNotFound(
      vectorStoreId
        ? client.vectorStores.files.delete(providerDocumentId, {
            vector_store_id: vectorStoreId,
          })
        : Promise.resolve(),
    );
    await ignoreNotFound(client.files.delete(providerDocumentId));
  }

  private vectorStoreId(tenant: Tenant): string {
    const { vectorStoreId } = parseOpenAiConfig(tenant.providerConfig);
    if (!vectorStoreId) throw new Error('tenant has no vectorStoreId');
    return vectorStoreId;
  }
}

function toResult(file: VectorStoreFile): KnowledgeStoreResult {
  const status: KnowledgeStatus =
    file.status === 'completed'
      ? 'ready'
      : file.status === 'in_progress'
        ? 'processing'
        : 'failed';
  return { status, error: file.last_error?.message ?? null };
}

async function ignoreNotFound(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
}

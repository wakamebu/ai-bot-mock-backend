import { BadRequestException, Injectable } from '@nestjs/common';
import type { KnowledgeStatus } from '../../knowledge/knowledge-document.entity.js';
import {
  type KnowledgeFile,
  type KnowledgeStore,
  type KnowledgeStoreResult,
  RegisterKnowledgeStore,
} from '../../knowledge/knowledge-store.js';
import type { Tenant } from '../../tenants/tenant.entity.js';
import { DifyApiError, DifyClient, type DifyDocument } from './dify.client.js';
import { parseDifyConfig } from './dify-config.js';
import { DifyProvisioner } from './dify-provisioner.js';

/**
 * 資料をテナントの Dify のナレッジ（データセット）に登録する（Knowledge API）。
 * 登録先は、チャットフローのナレッジ検索ノードが参照しているデータセット。
 * テナントの Dify がまだなければ、最初の登録時に用意する（DifyProvisioner）。
 */
@RegisterKnowledgeStore()
@Injectable()
export class DifyKnowledgeStore implements KnowledgeStore {
  readonly name = 'dify' as const;

  constructor(
    private readonly dify: DifyClient,
    private readonly provisioner: DifyProvisioner,
  ) {}

  async prepare(tenant: Tenant): Promise<Record<string, unknown> | null> {
    const config = parseDifyConfig(tenant.providerConfig);
    if (!config) return { ...(await this.provisioner.provision(tenant)) };
    if (!config.datasetId || !config.datasetApiKey) {
      throw new BadRequestException(
        'providerConfig.datasetId と datasetApiKey（チャットフローが参照するナレッジと Knowledge API のキー）を設定してください',
      );
    }
    return null;
  }

  async add(tenant: Tenant, file: KnowledgeFile) {
    const { conn, datasetId } = this.dataset(tenant);
    const isText =
      file.contentType.startsWith('text/') ||
      /\.(md|txt)$/i.test(file.filename);
    const created = isText
      ? await this.dify.createDocumentByText(conn, datasetId, {
          // Dify のドキュメント名を題名にして、Dify の画面でも見分けられるようにする
          name: file.title,
          text: file.content.toString('utf8'),
        })
      : await this.dify.createDocumentByFile(conn, datasetId, file);
    return {
      providerDocumentId: created.document.id,
      ...toResult(created.document),
    };
  }

  async status(
    tenant: Tenant,
    providerDocumentId: string,
  ): Promise<KnowledgeStoreResult> {
    const { conn, datasetId } = this.dataset(tenant);
    return toResult(
      await this.dify.getDocument(conn, datasetId, providerDocumentId),
    );
  }

  async remove(tenant: Tenant, providerDocumentId: string): Promise<void> {
    const { conn, datasetId } = this.dataset(tenant);
    try {
      await this.dify.deleteDocument(conn, datasetId, providerDocumentId);
    } catch (error) {
      if (!(error instanceof DifyApiError && error.status === 404)) throw error;
    }
  }

  private dataset(tenant: Tenant) {
    const config = parseDifyConfig(tenant.providerConfig);
    if (!config?.datasetId || !config.datasetApiKey) {
      throw new Error('tenant has no Dify dataset configured');
    }
    return {
      conn: { baseUrl: config.baseUrl, apiKey: config.datasetApiKey },
      datasetId: config.datasetId,
    };
  }
}

function toResult(doc: DifyDocument): KnowledgeStoreResult {
  const status: KnowledgeStatus =
    doc.indexing_status === 'completed'
      ? 'ready'
      : doc.indexing_status === 'error'
        ? 'failed'
        : 'processing';
  return { status, error: doc.error ?? null };
}

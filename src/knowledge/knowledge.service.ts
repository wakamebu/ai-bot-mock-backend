import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ProviderName, Tenant } from '../tenants/tenant.entity.js';
import { TenantsService } from '../tenants/tenants.service.js';
import type {
  CreateFaqKnowledgeDto,
  CreateTextKnowledgeDto,
  UploadKnowledgeDto,
} from './dto/create-knowledge.dto.js';
import { KnowledgeDocument } from './knowledge-document.entity.js';
import {
  type KnowledgeFile,
  type KnowledgeStore,
  RegisterKnowledgeStore,
} from './knowledge-store.js';

export interface UploadedKnowledgeFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/**
 * 資料の登録・一覧・削除。中身はテナントの方式の保存先（KnowledgeStore）に置き、
 * 一覧・削除のための記録をこちらの DB に残す。
 */
@Injectable()
export class KnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeService.name);
  private readonly stores = new Map<ProviderName, KnowledgeStore>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly tenants: TenantsService,
    @InjectRepository(KnowledgeDocument)
    private readonly documents: Repository<KnowledgeDocument>,
  ) {}

  onModuleInit() {
    const wrappers = this.discovery.getProviders({
      metadataKey: RegisterKnowledgeStore.KEY,
    });
    for (const { instance } of wrappers) {
      const store = instance as KnowledgeStore | undefined;
      if (store) this.stores.set(store.name, store);
    }
  }

  /** 新しい順。取り込み中のものは方式側の状況を確かめて更新する */
  async list(tenantId: string): Promise<KnowledgeDocument[]> {
    const tenant = await this.tenants.findOne(tenantId);
    const documents = await this.documents.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    for (const doc of documents) {
      if (doc.status !== 'processing' || !doc.providerDocumentId) continue;
      try {
        const result = await this.store(doc.provider).status(
          tenant,
          doc.providerDocumentId,
        );
        if (result.status !== doc.status) {
          doc.status = result.status;
          doc.error = result.error ?? null;
          await this.documents.save(doc);
        }
      } catch (error) {
        this.logger.warn(
          `failed to refresh knowledge status ${doc.id}: ${String(error)}`,
        );
      }
    }
    return documents;
  }

  async addText(tenantId: string, dto: CreateTextKnowledgeDto) {
    const tenant = await this.tenants.findOne(tenantId);
    return this.add(tenant, {
      filename: `${randomUUID()}.md`,
      contentType: 'text/markdown',
      content: Buffer.from(`# ${dto.title}\n\n${dto.content}\n`),
      title: dto.title,
      sourceUrl: dto.sourceUrl ?? null,
    });
  }

  async addFile(
    tenantId: string,
    file: UploadedKnowledgeFile | undefined,
    dto: UploadKnowledgeDto,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const tenant = await this.tenants.findOne(tenantId);
    // multer はファイル名を latin1 として扱うので、UTF-8 に戻す
    const filename = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return this.add(tenant, {
      filename,
      contentType: file.mimetype,
      content: file.buffer,
      title: dto.title ?? filename,
      sourceUrl: dto.sourceUrl ?? null,
    });
  }

  /** 質問と回答の1組を1つの資料として登録する（検索で1組がまとまって返るように） */
  async addFaq(tenantId: string, dto: CreateFaqKnowledgeDto) {
    const tenant = await this.tenants.findOne(tenantId);
    const created: KnowledgeDocument[] = [];
    for (const item of dto.items) {
      const title = `${dto.title} > ${item.question}`;
      created.push(
        await this.add(tenant, {
          filename: `${randomUUID()}.md`,
          contentType: 'text/markdown',
          content: Buffer.from(
            `# ${title}\n\nQ: ${item.question}\nA: ${item.answer}\n`,
          ),
          title,
          sourceUrl: dto.sourceUrl ?? null,
        }),
      );
      // 2件目以降は、1件目で用意した保存先（providerConfig）を使う
      tenant.providerConfig = (
        await this.tenants.findOne(tenantId)
      ).providerConfig;
    }
    return created;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const tenant = await this.tenants.findOne(tenantId);
    const doc = await this.documents.findOneBy({ id, tenantId });
    if (!doc) throw new NotFoundException('knowledge document not found');
    if (doc.providerDocumentId) {
      try {
        await this.store(doc.provider).remove(tenant, doc.providerDocumentId);
      } catch (error) {
        throw new BadGatewayException(
          `failed to remove from ${doc.provider}: ${String(error)}`,
        );
      }
    }
    await this.documents.delete(doc.id);
  }

  private async add(
    tenant: Tenant,
    file: KnowledgeFile,
  ): Promise<KnowledgeDocument> {
    const store = this.store(tenant.provider);
    let result: Awaited<ReturnType<KnowledgeStore['add']>>;
    try {
      const patch = await store.prepare(tenant);
      if (patch) {
        const updated = await this.tenants.update(tenant.id, {
          providerConfig: { ...tenant.providerConfig, ...patch },
        });
        tenant.providerConfig = updated.providerConfig;
      }
      result = await store.add(tenant, file);
    } catch (error) {
      // 保存先が設定の不備などを HttpException で返した場合は、そのまま返す
      if (error instanceof HttpException) throw error;
      this.logger.error(`failed to add knowledge to ${store.name}`, error);
      throw new BadGatewayException(
        `failed to add knowledge to ${store.name}: ${String(error)}`,
      );
    }
    return this.documents.save(
      this.documents.create({
        tenantId: tenant.id,
        title: file.title,
        sourceUrl: file.sourceUrl,
        filename: file.filename,
        contentType: file.contentType,
        sizeBytes: file.content.length,
        provider: store.name,
        providerDocumentId: result.providerDocumentId,
        status: result.status,
        error: result.error ?? null,
      }),
    );
  }

  private store(provider: ProviderName): KnowledgeStore {
    const store = this.stores.get(provider);
    if (!store) {
      throw new BadRequestException(
        `provider "${provider}" does not support the knowledge API`,
      );
    }
    return store;
  }
}

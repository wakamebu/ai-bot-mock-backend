import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ProviderName } from '../tenants/tenant.entity.js';

/** processing：方式側で取り込み中 / ready：検索できる / failed：取り込みに失敗 */
export type KnowledgeStatus = 'processing' | 'ready' | 'failed';

/**
 * テナントが登録した資料。中身は方式側（OpenAI の Vector Store、Dify のナレッジ）に置き、
 * こちらでは一覧・削除のための情報だけを持つ。
 */
@Entity('knowledge_documents')
@Index(['tenantId', 'createdAt'])
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  tenantId: string;

  /** 回答の根拠として表示する題名 */
  @Column()
  title: string;

  /** 資料の元のページ（根拠のリンク先） */
  @Column({ type: 'varchar', nullable: true })
  sourceUrl: string | null;

  @Column()
  filename: string;

  @Column()
  contentType: string;

  @Column('int')
  sizeBytes: number;

  /** 登録した時点の方式 */
  @Column({ type: 'varchar' })
  provider: ProviderName;

  /** 方式側の ID（OpenAI のファイル ID、Dify のドキュメント ID） */
  @Column({ type: 'varchar', nullable: true })
  providerDocumentId: string | null;

  @Column({ type: 'varchar', default: 'processing' })
  status: KnowledgeStatus;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

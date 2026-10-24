import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const PROVIDER_NAMES = ['mock', 'dify', 'openai'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

/**
 * 導入先の会社（テナント）。
 * サイトに埋め込むチャットは匿名利用のため、publicKey と allowedOrigins でテナントを識別する。
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 管理用の識別子（例: demo-clinic） */
  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  /** チャット欄から送る公開キー。秘密情報ではない */
  @Column({ unique: true })
  publicKey: string;

  /** チャットを埋め込んでよいオリジン。空なら制限なし（開発用） */
  @Column('text', { array: true, default: '{}' })
  allowedOrigins: string[];

  @Column({ type: 'varchar', default: 'mock' })
  provider: ProviderName;

  /**
   * 方式ごとの設定（Dify の baseUrl / apiKey、OpenAI の vectorStoreId など）。
   * モックのため平文で保存している。本番では暗号化かシークレットストアに移す。
   */
  @Column('jsonb', { default: {} })
  providerConfig: Record<string, unknown>;

  /** この値を下回る確信度の回答はフォールバックする（0〜1） */
  @Column('real', { default: 0.6 })
  confidenceThreshold: number;

  /** 含まれていたら確信度に関係なく担当者へ回すキーワード */
  @Column('text', { array: true, default: '{}' })
  handoffKeywords: string[];

  @Column('text')
  fallbackMessage: string;

  /** 問い合わせフォームや電話案内のページ */
  @Column({ type: 'varchar', nullable: true })
  contactUrl: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

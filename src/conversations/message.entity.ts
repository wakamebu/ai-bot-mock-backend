import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import type { AnswerSource, FallbackReason } from '../chat/chat.types.js';
import { Conversation } from './conversation.entity.js';

export type MessageRole = 'user' | 'assistant';

@Entity('messages')
@Index(['conversationId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  conversationId: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  conversation: Relation<Conversation>;

  @Column({ type: 'varchar' })
  role: MessageRole;

  @Column('text')
  content: string;

  /** assistant のみ。answered か fallback か */
  @Column({ type: 'varchar', nullable: true })
  status: 'answered' | 'fallback' | null;

  @Column({ type: 'varchar', nullable: true })
  fallbackReason: FallbackReason | null;

  @Column('real', { nullable: true })
  confidence: number | null;

  @Column('jsonb', { default: [] })
  sources: AnswerSource[];

  /** 方式が返した生データ（調査用） */
  @Column('jsonb', { nullable: true })
  providerRaw: unknown;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

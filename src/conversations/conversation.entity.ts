import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity.js';
import { Message } from './message.entity.js';

@Entity('conversations')
@Index(['tenantId', 'createdAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Relation<Tenant>;

  /** 方式側の会話ID（Dify の conversation_id、OpenAI の previous_response_id など） */
  @Column({ type: 'varchar', nullable: true })
  providerConversationId: string | null;

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Relation<Message[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './conversation.entity.js';
import { Message } from './message.entity.js';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
  ) {}

  /** conversationId があればそのテナントの会話を返し、なければ新規作成する */
  async findOrCreate(
    tenantId: string,
    conversationId?: string,
  ): Promise<Conversation> {
    if (conversationId) {
      const found = await this.conversations.findOneBy({
        id: conversationId,
        tenantId,
      });
      if (!found) throw new NotFoundException('conversation not found');
      return found;
    }
    return this.conversations.save(this.conversations.create({ tenantId }));
  }

  /** 古い順に直近 limit 件 */
  async recentMessages(conversationId: string, limit = 10): Promise<Message[]> {
    const rows = await this.messages.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.reverse();
  }

  addMessage(message: Partial<Message>): Promise<Message> {
    return this.messages.save(this.messages.create(message));
  }

  async setProviderConversationId(id: string, providerConversationId: string) {
    await this.conversations.update(id, { providerConversationId });
  }

  listByTenant(tenantId: string, limit = 50): Promise<Conversation[]> {
    return this.conversations.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findWithMessages(tenantId: string, id: string): Promise<Conversation> {
    const conversation = await this.conversations.findOne({
      where: { id, tenantId },
      relations: { messages: true },
      order: { messages: { createdAt: 'ASC' } },
    });
    if (!conversation) throw new NotFoundException('conversation not found');
    return conversation;
  }
}

import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConversationsService } from '../conversations/conversations.service.js';
import type { Tenant } from '../tenants/tenant.entity.js';
import { TenantsService } from '../tenants/tenants.service.js';
import type {
  AnswerSource,
  ChatResponse,
  FallbackReason,
} from './chat.types.js';
import { ChatRequestDto } from './dto/chat-request.dto.js';
import {
  checkAfterGenerate,
  checkBeforeGenerate,
} from './fallback/fallback-policy.js';
import type { ChatProviderResult } from './providers/chat-provider.js';
import { ChatProviderRegistry } from './providers/chat-provider.registry.js';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly tenants: TenantsService,
    private readonly conversations: ConversationsService,
    private readonly providers: ChatProviderRegistry,
  ) {}

  async resolveTenant(
    publicKey: string | undefined,
    origin: string | undefined,
  ) {
    const tenant = publicKey
      ? await this.tenants.findByPublicKey(publicKey)
      : null;
    if (!tenant) throw new UnauthorizedException('invalid widget key');
    // Origin が無いのはサーバー間の呼び出し（curl など）。モックでは通す
    if (
      origin &&
      tenant.allowedOrigins.length > 0 &&
      !tenant.allowedOrigins.includes(origin)
    ) {
      throw new ForbiddenException('origin not allowed');
    }
    return tenant;
  }

  async chat(tenant: Tenant, dto: ChatRequestDto): Promise<ChatResponse> {
    const conversation = await this.conversations.findOrCreate(
      tenant.id,
      dto.conversationId,
    );
    const history = await this.conversations.recentMessages(conversation.id);
    await this.conversations.addMessage({
      conversationId: conversation.id,
      role: 'user',
      content: dto.message,
    });

    let result: ChatProviderResult | null = null;
    let reason: FallbackReason | null = checkBeforeGenerate(
      tenant,
      dto.message,
    );

    if (!reason) {
      try {
        result = await this.providers.get(tenant.provider).generate({
          tenant,
          message: dto.message,
          history: history.map(({ role, content }) => ({ role, content })),
          providerConversationId: conversation.providerConversationId,
        });
        reason = checkAfterGenerate(tenant, result);
        if (result.providerConversationId) {
          await this.conversations.setProviderConversationId(
            conversation.id,
            result.providerConversationId,
          );
        }
      } catch (error) {
        this.logger.error(`provider "${tenant.provider}" failed`, error);
        reason = 'provider_error';
      }
    }

    const answer = reason ? tenant.fallbackMessage : result!.answer;
    const sources: AnswerSource[] = reason ? [] : result!.sources;
    const saved = await this.conversations.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: answer,
      status: reason ? 'fallback' : 'answered',
      fallbackReason: reason,
      confidence: result?.confidence ?? null,
      // フォールバック時も、方式が返した根拠は調査用にログへ残す
      sources: result?.sources ?? [],
      providerRaw: result?.raw ?? null,
    });

    return {
      conversationId: conversation.id,
      messageId: saved.id,
      status: reason ? 'fallback' : 'answered',
      answer,
      sources,
      ...(reason && { fallback: { reason, contactUrl: tenant.contactUrl } }),
    };
  }
}

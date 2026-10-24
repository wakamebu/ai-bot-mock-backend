import { Inject, Injectable } from '@nestjs/common';
import type { ProviderName } from '../../tenants/tenant.entity.js';
import { CHAT_PROVIDERS, type ChatProvider } from './chat-provider.js';

@Injectable()
export class ChatProviderRegistry {
  private readonly byName: Map<ProviderName, ChatProvider>;

  constructor(@Inject(CHAT_PROVIDERS) providers: ChatProvider[]) {
    this.byName = new Map(providers.map((p) => [p.name, p]));
  }

  get(name: ProviderName): ChatProvider {
    const provider = this.byName.get(name);
    if (!provider) throw new Error(`chat provider "${name}" is not registered`);
    return provider;
  }
}

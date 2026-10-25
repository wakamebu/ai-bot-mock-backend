import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { ProviderName } from '../../tenants/tenant.entity.js';
import { type ChatProvider, RegisterChatProvider } from './chat-provider.js';

/** @RegisterChatProvider() が付いた方式の実装を集めて、名前で引けるようにする */
@Injectable()
export class ChatProviderRegistry implements OnModuleInit {
  private readonly byName = new Map<ProviderName, ChatProvider>();

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit() {
    const wrappers = this.discovery.getProviders({
      metadataKey: RegisterChatProvider.KEY,
    });
    for (const { instance } of wrappers) {
      const provider = instance as ChatProvider | undefined;
      if (!provider) continue;
      if (this.byName.has(provider.name)) {
        throw new Error(`chat provider "${provider.name}" is registered twice`);
      }
      this.byName.set(provider.name, provider);
    }
  }

  get(name: ProviderName): ChatProvider {
    const provider = this.byName.get(name);
    if (!provider) throw new Error(`chat provider "${name}" is not registered`);
    return provider;
  }

  names(): ProviderName[] {
    return [...this.byName.keys()];
  }
}

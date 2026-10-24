import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ConversationsService } from './conversations.service.js';

/** 会話ログの閲覧。モックのため認証なし */
@Controller('admin/tenants/:tenantId/conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.conversationsService.listByTenant(tenantId);
  }

  @Get(':id')
  get(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversationsService.findWithMessages(tenantId, id);
  }
}

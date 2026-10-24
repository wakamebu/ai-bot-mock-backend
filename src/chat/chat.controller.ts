import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { ChatRequestDto } from './dto/chat-request.dto.js';

/** サイトに埋め込んだチャット欄から呼ばれる公開 API */
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(200)
  async chat(
    @Headers('x-widget-key') widgetKey: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Body() dto: ChatRequestDto,
  ) {
    const tenant = await this.chatService.resolveTenant(widgetKey, origin);
    return this.chatService.chat(tenant, dto);
  }
}

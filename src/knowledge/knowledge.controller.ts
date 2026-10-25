import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CreateFaqKnowledgeDto,
  CreateTextKnowledgeDto,
  UploadKnowledgeDto,
} from './dto/create-knowledge.dto.js';
import {
  KnowledgeService,
  type UploadedKnowledgeFile,
} from './knowledge.service.js';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** 資料の登録・一覧・削除。モックのため認証なし */
@Controller('admin/tenants/:tenantId/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.knowledge.list(tenantId);
  }

  /** 文章で登録する */
  @Post()
  addText(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateTextKnowledgeDto,
  ) {
    return this.knowledge.addText(tenantId, dto);
  }

  /** FAQ をまとめて登録する（1組ごとに1つの資料） */
  @Post('faq')
  addFaq(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateFaqKnowledgeDto,
  ) {
    return this.knowledge.addFaq(tenantId, dto);
  }

  /** ファイルで登録する（multipart/form-data、項目名 file） */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  addFile(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @UploadedFile() file: UploadedKnowledgeFile | undefined,
    @Body() dto: UploadKnowledgeDto,
  ) {
    return this.knowledge.addFile(tenantId, file, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.knowledge.remove(tenantId, id);
  }
}

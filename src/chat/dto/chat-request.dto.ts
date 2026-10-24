import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChatRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message: string;

  /** 2回目以降の発言で、前回のレスポンスの conversationId を渡す */
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** 文章で資料を登録する */
export class CreateTextKnowledgeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  content: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  sourceUrl?: string;
}

/** ファイルで資料を登録する（multipart/form-data の file 以外の項目） */
export class UploadKnowledgeDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  sourceUrl?: string;
}

export class FaqItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  question: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5_000)
  answer: string;
}

/**
 * FAQ をまとめて登録する。検索の精度のため、質問と回答の1組を1つの資料にする。
 */
export class CreateFaqKnowledgeDto {
  /** 根拠として表示する題名（例：よくある質問）。各資料の題名は「題名 > 質問」になる */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  sourceUrl?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => FaqItemDto)
  items: FaqItemDto[];
}

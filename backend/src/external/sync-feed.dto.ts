import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class SyncFeedPostDto {
  @ApiProperty()
  @IsUUID()
  external_id: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  media_urls?: string[];

  @ApiPropertyOptional({ enum: ['all', 'employees', 'partners'] })
  @IsIn(['all', 'employees', 'partners'])
  @IsOptional()
  audience?: 'all' | 'employees' | 'partners';

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  is_pinned?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  is_published?: boolean;

  @ApiPropertyOptional({ description: 'Apague no Enterprise (soft delete)' })
  @IsBoolean()
  @IsOptional()
  deleted?: boolean;

  @ApiPropertyOptional({ description: 'Nome do autor para fallback de display' })
  @IsString()
  @IsOptional()
  author_name?: string;
}

export class SyncRatingDto {
  @ApiProperty({ description: 'ID da rating no Garantias (UUID)' })
  @IsUUID()
  external_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ticket_id?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  enterprise_os_id?: string;

  @ApiProperty()
  @IsUUID()
  technician_user_id: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  quality: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  punctuality: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  communication: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  comment?: string;
}

export class SyncLearningContentDto {
  @ApiProperty()
  @IsUUID()
  external_id: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    enum: ['INSTALACAO', 'PERICIA', 'FERRAMENTAS', 'BOAS_PRATICAS'],
  })
  @IsIn(['INSTALACAO', 'PERICIA', 'FERRAMENTAS', 'BOAS_PRATICAS'])
  category: 'INSTALACAO' | 'PERICIA' | 'FERRAMENTAS' | 'BOAS_PRATICAS';

  @ApiProperty()
  @IsString()
  video_url: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  thumbnail_url?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  duration_sec?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  order_index?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  is_published?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  deleted?: boolean;
}

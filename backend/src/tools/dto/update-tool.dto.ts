import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { ToolStatus, ToolCondition } from '../../common/types/database.types';

export class UpdateToolDto {
  @ApiPropertyOptional({ description: 'Name of the tool' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Detailed description of the tool' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Serial number of the tool' })
  @IsString()
  @IsOptional()
  serial_number?: string;

  @ApiPropertyOptional({
    description: 'Current status of the tool',
    enum: ToolStatus,
  })
  @IsEnum(ToolStatus)
  @IsOptional()
  status?: ToolStatus;

  @ApiPropertyOptional({
    description: 'Current condition of the tool',
    enum: ToolCondition,
  })
  @IsEnum(ToolCondition)
  @IsOptional()
  condition?: ToolCondition;

  @ApiPropertyOptional({ description: 'Category of the tool' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Purchase date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  purchase_date?: string;

  @ApiPropertyOptional({ description: 'Purchase value' })
  @IsNumber()
  @IsOptional()
  purchase_value?: number;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'URL of the tool image' })
  @IsString()
  @IsOptional()
  image_url?: string;
}

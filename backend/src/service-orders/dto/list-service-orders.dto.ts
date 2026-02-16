import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OsStatus, OsPriority } from '../../common/types/database.types';

export class ListServiceOrdersDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    minimum: 1,
    default: 1,
  })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: OsStatus,
  })
  @IsEnum(OsStatus)
  @IsOptional()
  status?: OsStatus;

  @ApiPropertyOptional({
    description: 'Filter by priority',
    enum: OsPriority,
  })
  @IsEnum(OsPriority)
  @IsOptional()
  priority?: OsPriority;

  @ApiPropertyOptional({
    description: 'Filter by partner ID',
  })
  @IsUUID()
  @IsOptional()
  partner_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by technician ID',
  })
  @IsUUID()
  @IsOptional()
  technician_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by date from (ISO 8601)',
    example: '2025-01-01',
  })
  @IsDateString()
  @IsOptional()
  date_from?: string;

  @ApiPropertyOptional({
    description: 'Filter by date to (ISO 8601)',
    example: '2025-12-31',
  })
  @IsDateString()
  @IsOptional()
  date_to?: string;

  @ApiPropertyOptional({
    description: 'Search by order number, title, client name, or address',
    example: 'OS-001',
  })
  @IsString()
  @IsOptional()
  search?: string;
}

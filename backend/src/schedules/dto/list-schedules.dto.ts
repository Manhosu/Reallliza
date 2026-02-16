import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  IsDateString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ScheduleStatus } from '../../common/types/database.types';

export class ListSchedulesDto {
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
    description: 'Filter by status',
    enum: ScheduleStatus,
  })
  @IsEnum(ScheduleStatus)
  @IsOptional()
  status?: ScheduleStatus;
}

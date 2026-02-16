import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { OsStatus, OsPriority } from '../../common/types/database.types';

export class OsByPeriodDto {
  @ApiProperty({
    description: 'Start date (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsDateString()
  date_from!: string;

  @ApiProperty({
    description: 'End date (YYYY-MM-DD)',
    example: '2025-12-31',
  })
  @IsDateString()
  date_to!: string;

  @ApiPropertyOptional({
    description: 'Filter by OS status',
    enum: OsStatus,
  })
  @IsEnum(OsStatus)
  @IsOptional()
  status?: OsStatus;

  @ApiPropertyOptional({
    description: 'Filter by OS priority',
    enum: OsPriority,
  })
  @IsEnum(OsPriority)
  @IsOptional()
  priority?: OsPriority;

  @ApiPropertyOptional({
    description: 'Output format: pdf or excel',
    enum: ['pdf', 'excel'],
    default: 'pdf',
  })
  @IsString()
  @IsOptional()
  format?: 'pdf' | 'excel';
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class OsByTechnicianDto {
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
    description: 'Filter by technician ID',
  })
  @IsUUID()
  @IsOptional()
  technician_id?: string;

  @ApiPropertyOptional({
    description: 'Output format: pdf or excel',
    enum: ['pdf', 'excel'],
    default: 'pdf',
  })
  @IsString()
  @IsOptional()
  format?: 'pdf' | 'excel';
}

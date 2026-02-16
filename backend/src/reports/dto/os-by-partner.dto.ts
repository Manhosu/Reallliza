import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class OsByPartnerDto {
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
    description: 'Filter by partner ID',
  })
  @IsUUID()
  @IsOptional()
  partner_id?: string;

  @ApiPropertyOptional({
    description: 'Output format: pdf or excel',
    enum: ['pdf', 'excel'],
    default: 'pdf',
  })
  @IsString()
  @IsOptional()
  format?: 'pdf' | 'excel';
}

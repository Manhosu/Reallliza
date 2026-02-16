import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ToolsCustodyDto {
  @ApiPropertyOptional({
    description: 'Output format: pdf or excel',
    enum: ['pdf', 'excel'],
    default: 'pdf',
  })
  @IsString()
  @IsOptional()
  format?: 'pdf' | 'excel';
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CompleteStepDto {
  @ApiPropertyOptional({ description: 'Observações sobre a etapa' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Quantidade de fotos da etapa (validada contra requires_photos_min)',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  photos_count?: number;

  @ApiPropertyOptional({ description: 'Metadados adicionais (livre)' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Metragem executada (m²) — aplicado quando a etapa é FINALIZACAO',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  metragem_executada?: number;

  @ApiPropertyOptional({
    description: 'Intercorrências durante a execução — aplicado em FINALIZACAO',
  })
  @IsString()
  @IsOptional()
  intercorrencias?: string;
}

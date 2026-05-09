import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class MarkArrivedDto {
  @ApiPropertyOptional({
    description: 'Latitude do técnico no momento da chegada',
    example: -23.55052,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({
    description: 'Longitude do técnico no momento da chegada',
    example: -46.633308,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({
    description: 'Observações sobre a chegada (opcional)',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Forçar chegada mesmo fora do raio de 300m (requer confirmação)',
  })
  @IsBoolean()
  @IsOptional()
  force_override?: boolean;
}

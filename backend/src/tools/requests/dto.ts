import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateToolRequestDto {
  @ApiProperty({ description: 'ID do item no catálogo (tool_inventory)' })
  @IsUUID()
  @IsOptional()
  tool_id?: string;

  @ApiProperty({ description: 'Nome do item — snapshot' })
  @IsString()
  @IsNotEmpty()
  tool_name: string;

  @ApiProperty({ description: 'Quantidade solicitada' })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Justificativa do pedido' })
  @IsString()
  @IsOptional()
  justification?: string;
}

export class RejectToolRequestDto {
  @ApiPropertyOptional({ description: 'Motivo da rejeição' })
  @IsString()
  @IsOptional()
  reason?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface Proposal {
  id: string;
  service_order_id: string;
  technician_id: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  proposed_value: number | null;
  message: string | null;
  response_message: string | null;
  proposed_by: string;
  responded_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}


import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsIn,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProposalDto {
  @ApiProperty({ description: 'UUID da OS' })
  @IsUUID()
  service_order_id: string;

  @ApiPropertyOptional({ description: 'UUID do técnico destinatário (null = aberto a todos)' })
  @IsUUID()
  @IsOptional()
  technician_id?: string;

  @ApiPropertyOptional({ description: 'Valor proposto para o serviço' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  proposed_value?: number;

  @ApiPropertyOptional({ description: 'Mensagem descritiva da proposta' })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({ description: 'Data/hora de expiração (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  expires_at?: string;
}

export class RespondProposalDto {
  @ApiProperty({ description: 'Ação: accept ou reject', enum: ['accept', 'reject'] })
  @IsIn(['accept', 'reject'])
  action: 'accept' | 'reject';

  @ApiPropertyOptional({ description: 'Mensagem de resposta opcional' })
  @IsString()
  @IsOptional()
  response_message?: string;
}

export class ListProposalsDto {
  @ApiPropertyOptional({ description: 'Página' })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Itens por página' })
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filtrar por status', enum: ['pending', 'accepted', 'rejected', 'expired'] })
  @IsString()
  @IsOptional()
  status?: string;
}

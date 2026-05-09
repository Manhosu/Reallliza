import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export interface OsMessage {
  id: string;
  service_order_id: string;
  sender_user_id: string | null;
  sender_role: string;
  sender_name: string;
  content: string;
  attachment_url: string | null;
  attachment_type: string | null;
  read_at: string | null;
  external_message_id: string | null;
  created_at: string;
}

export class CreateMessageDto {
  @ApiProperty({ description: 'Conteúdo da mensagem' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;

  @ApiPropertyOptional({ description: 'URL do anexo (foto, áudio, etc)' })
  @IsString()
  @IsOptional()
  attachment_url?: string;

  @ApiPropertyOptional({
    description: 'Tipo do anexo: image | audio | video | document',
  })
  @IsString()
  @IsOptional()
  attachment_type?: string;
}

export class IngestExternalMessageDto {
  @ApiProperty({ description: 'UUID da Service Order no Enterprise' })
  @IsUUID()
  service_order_id: string;

  @ApiProperty({ description: 'ID da mensagem original no sistema externo (ticket_messages.id)' })
  @IsString()
  external_message_id: string;

  @ApiProperty({ description: 'Papel do remetente (operator | admin | system)' })
  @IsString()
  sender_role: string;

  @ApiProperty({ description: 'Nome do remetente para exibição' })
  @IsString()
  sender_name: string;

  @ApiProperty({ description: 'Conteúdo da mensagem' })
  @IsString()
  @MaxLength(4000)
  content: string;

  @ApiPropertyOptional({ description: 'URL do anexo' })
  @IsString()
  @IsOptional()
  attachment_url?: string;

  @ApiPropertyOptional({ description: 'Tipo do anexo' })
  @IsString()
  @IsOptional()
  attachment_type?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsObject,
} from 'class-validator';
import { OsPriority } from '../../common/types/database.types';

/**
 * DTO for creating a ServiceOrder from an external system (e.g. Garantias).
 * Mirrors CreateServiceOrderDto but adds external_* linkage fields and omits
 * internal assignments (partner_id, technician_id) — those are set later by ops.
 */
export class CreateExternalOsDto {
  // ============================================================
  // External system linkage
  // ============================================================
  @ApiProperty({
    example: 'GARANTIAS',
    description:
      'Identifier of the external system sending the request. Must match the API key system_identifier.',
  })
  @IsString()
  @IsNotEmpty()
  external_system: string;

  @ApiProperty({
    example: 'TK-007060',
    description: 'External record ID (e.g. Garantias ticket protocol)',
  })
  @IsString()
  @IsNotEmpty()
  external_id: string;

  @ApiProperty({
    example: 'https://garantias.reallliza.com.br/api/webhook/enterprise-callback',
    description: 'URL that will receive status-change webhooks',
  })
  @IsUrl({ require_tld: false })
  external_callback_url: string;

  // ============================================================
  // OS core fields
  // ============================================================
  @ApiProperty({ example: 'Reinstalação de piso vinílico — TK-007060' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: OsPriority, default: OsPriority.MEDIUM })
  @IsEnum(OsPriority)
  @IsOptional()
  priority?: OsPriority;

  // ============================================================
  // Client
  // ============================================================
  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @IsNotEmpty()
  client_name: string;

  @ApiPropertyOptional({ example: '+5511999999999' })
  @IsString()
  @IsOptional()
  client_phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  client_email?: string;

  @ApiPropertyOptional({ example: '123.456.789-00' })
  @IsString()
  @IsOptional()
  client_document?: string;

  // ============================================================
  // Address (obra)
  // ============================================================
  @ApiPropertyOptional() @IsString() @IsOptional() address_street?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() address_number?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() address_complement?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() address_neighborhood?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() address_city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() address_state?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() address_zip?: string;

  // ============================================================
  // Geolocation
  // ============================================================
  @ApiPropertyOptional() @IsNumber() @IsOptional() geo_lat?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() geo_lng?: number;

  @ApiPropertyOptional() @IsNumber() @IsOptional() estimated_value?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;

  /**
   * Metadata specific to the external system. For Garantias, expect:
   * {
   *   laudo_url, periciador_nome, data_pericia,
   *   produto, quantidade, unidade,
   *   decisao_fabrica, previsao_material,
   *   revenda: { razao_social, cnpj, telefone },
   *   nota_fiscal_numero
   * }
   */
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsObject()
  @IsOptional()
  external_metadata?: Record<string, unknown>;
}

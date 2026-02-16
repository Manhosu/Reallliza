import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsObject,
} from 'class-validator';
import { OsPriority } from '../../common/types/database.types';

export class CreateServiceOrderDto {
  @ApiProperty({
    description: 'Title of the service order',
    example: 'Instalacao de piso porcelanato',
  })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the service',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Priority level',
    enum: OsPriority,
    default: OsPriority.MEDIUM,
  })
  @IsEnum(OsPriority)
  @IsOptional()
  priority?: OsPriority = OsPriority.MEDIUM;

  // Client information
  @ApiProperty({
    description: 'Client full name',
    example: 'Maria Silva',
  })
  @IsString()
  @IsNotEmpty({ message: 'Client name is required' })
  client_name: string;

  @ApiPropertyOptional({
    description: 'Client phone',
    example: '+5511999999999',
  })
  @IsString()
  @IsOptional()
  client_phone?: string;

  @ApiPropertyOptional({
    description: 'Client email',
    example: 'maria@example.com',
  })
  @IsString()
  @IsOptional()
  client_email?: string;

  @ApiPropertyOptional({
    description: 'Client document (CPF/CNPJ)',
    example: '123.456.789-00',
  })
  @IsString()
  @IsOptional()
  client_document?: string;

  // Address
  @ApiPropertyOptional({ description: 'Street name' })
  @IsString()
  @IsOptional()
  address_street?: string;

  @ApiPropertyOptional({ description: 'Street number' })
  @IsString()
  @IsOptional()
  address_number?: string;

  @ApiPropertyOptional({ description: 'Complement (apt, suite, etc.)' })
  @IsString()
  @IsOptional()
  address_complement?: string;

  @ApiPropertyOptional({ description: 'Neighborhood' })
  @IsString()
  @IsOptional()
  address_neighborhood?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsString()
  @IsOptional()
  address_city?: string;

  @ApiPropertyOptional({ description: 'State (2-letter code)', example: 'SP' })
  @IsString()
  @IsOptional()
  address_state?: string;

  @ApiPropertyOptional({ description: 'ZIP code', example: '01001-000' })
  @IsString()
  @IsOptional()
  address_zip?: string;

  // Geolocation
  @ApiPropertyOptional({ description: 'Latitude' })
  @IsNumber()
  @IsOptional()
  geo_lat?: number;

  @ApiPropertyOptional({ description: 'Longitude' })
  @IsNumber()
  @IsOptional()
  geo_lng?: number;

  // Assignments
  @ApiPropertyOptional({ description: 'Partner ID (UUID)' })
  @IsUUID()
  @IsOptional()
  partner_id?: string;

  @ApiPropertyOptional({ description: 'Technician ID (UUID)' })
  @IsUUID()
  @IsOptional()
  technician_id?: string;

  // Schedule
  @ApiPropertyOptional({
    description: 'Scheduled date (ISO 8601)',
    example: '2025-06-15T09:00:00Z',
  })
  @IsDateString()
  @IsOptional()
  scheduled_date?: string;

  // Values
  @ApiPropertyOptional({
    description: 'Estimated value for the service',
    example: 1500.0,
  })
  @IsNumber()
  @IsOptional()
  estimated_value?: number;

  // Notes
  @ApiPropertyOptional({
    description: 'Additional notes',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  // Metadata
  @ApiPropertyOptional({
    description: 'Additional metadata as JSON',
    example: { area_m2: 50, material_type: 'porcelanato' },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

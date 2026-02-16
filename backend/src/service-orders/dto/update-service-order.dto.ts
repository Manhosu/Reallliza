import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsObject,
} from 'class-validator';
import { OsPriority } from '../../common/types/database.types';

export class UpdateServiceOrderDto {
  @ApiPropertyOptional({ description: 'Title of the service order' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Detailed description of the service' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Priority level',
    enum: OsPriority,
  })
  @IsEnum(OsPriority)
  @IsOptional()
  priority?: OsPriority;

  // Client information
  @ApiPropertyOptional({ description: 'Client full name' })
  @IsString()
  @IsOptional()
  client_name?: string;

  @ApiPropertyOptional({ description: 'Client phone' })
  @IsString()
  @IsOptional()
  client_phone?: string;

  @ApiPropertyOptional({ description: 'Client email' })
  @IsString()
  @IsOptional()
  client_email?: string;

  @ApiPropertyOptional({ description: 'Client document (CPF/CNPJ)' })
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

  @ApiPropertyOptional({ description: 'Complement' })
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

  @ApiPropertyOptional({ description: 'State' })
  @IsString()
  @IsOptional()
  address_state?: string;

  @ApiPropertyOptional({ description: 'ZIP code' })
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
  @ApiPropertyOptional({ description: 'Scheduled date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  scheduled_date?: string;

  // Values
  @ApiPropertyOptional({ description: 'Estimated value' })
  @IsNumber()
  @IsOptional()
  estimated_value?: number;

  @ApiPropertyOptional({ description: 'Final value' })
  @IsNumber()
  @IsOptional()
  final_value?: number;

  // Notes
  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  // Metadata
  @ApiPropertyOptional({ description: 'Additional metadata as JSON' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  // Optimistic locking
  @ApiPropertyOptional({ description: 'Version for optimistic locking' })
  @IsNumber()
  @IsOptional()
  version?: number;
}

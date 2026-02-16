import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdatePartnerDto {
  @ApiPropertyOptional({ description: 'Company name' })
  @IsString()
  @IsOptional()
  company_name?: string;

  @ApiPropertyOptional({ description: 'CNPJ number' })
  @IsString()
  @IsOptional()
  cnpj?: string;

  @ApiPropertyOptional({ description: 'Trading name (nome fantasia)' })
  @IsString()
  @IsOptional()
  trading_name?: string;

  @ApiPropertyOptional({ description: 'Contact person name' })
  @IsString()
  @IsOptional()
  contact_name?: string;

  @ApiPropertyOptional({ description: 'Contact phone' })
  @IsString()
  @IsOptional()
  contact_phone?: string;

  @ApiPropertyOptional({ description: 'Contact email' })
  @IsEmail()
  @IsOptional()
  contact_email?: string;

  @ApiPropertyOptional({ description: 'Address' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'User ID to associate with this partner (UUID)' })
  @IsUUID()
  @IsOptional()
  user_id?: string;
}

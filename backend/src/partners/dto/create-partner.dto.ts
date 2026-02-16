import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreatePartnerDto {
  @ApiProperty({
    description: 'Company name',
    example: 'Revestimentos ABC Ltda',
  })
  @IsString()
  @IsNotEmpty({ message: 'Company name is required' })
  company_name: string;

  @ApiPropertyOptional({
    description: 'CNPJ number',
    example: '12.345.678/0001-90',
  })
  @IsString()
  @IsOptional()
  cnpj?: string;

  @ApiPropertyOptional({
    description: 'Trading name (nome fantasia)',
    example: 'ABC Revestimentos',
  })
  @IsString()
  @IsOptional()
  trading_name?: string;

  @ApiProperty({
    description: 'Contact person name',
    example: 'Joao Silva',
  })
  @IsString()
  @IsNotEmpty({ message: 'Contact name is required' })
  contact_name: string;

  @ApiPropertyOptional({
    description: 'Contact phone',
    example: '+5511999999999',
  })
  @IsString()
  @IsOptional()
  contact_phone?: string;

  @ApiPropertyOptional({
    description: 'Contact email',
    example: 'contato@abc.com',
  })
  @IsEmail()
  @IsOptional()
  contact_email?: string;

  @ApiPropertyOptional({
    description: 'Address',
    example: 'Rua das Flores, 123 - Centro - Sao Paulo/SP',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'User ID to associate with this partner (UUID)',
  })
  @IsUUID()
  @IsOptional()
  user_id?: string;
}

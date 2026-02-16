import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray, IsPhoneNumber } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Full name',
    example: 'John Doe',
  })
  @IsString()
  @IsOptional()
  full_name?: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '+5511999999999',
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsString()
  @IsOptional()
  avatar_url?: string;

  @ApiPropertyOptional({
    description: 'CPF (Brazilian tax ID)',
    example: '123.456.789-00',
  })
  @IsString()
  @IsOptional()
  cpf?: string;

  @ApiPropertyOptional({
    description: 'RG (Brazilian identity card)',
    example: '12.345.678-9',
  })
  @IsString()
  @IsOptional()
  rg?: string;

  @ApiPropertyOptional({
    description: 'Full address',
    example: 'Rua Example, 123 - Sao Paulo, SP',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    description: 'List of specialties (for technicians)',
    example: ['porcelanato', 'ceramica', 'pastilha'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  specialties?: string[];
}

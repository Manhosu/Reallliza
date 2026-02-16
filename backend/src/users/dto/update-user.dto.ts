import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole, UserStatus } from '../../common/types/database.types';

export class UpdateUserDto {
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
  })
  @IsString()
  @IsOptional()
  avatar_url?: string;

  @ApiPropertyOptional({
    description: 'User role',
    enum: UserRole,
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'User status',
    enum: UserStatus,
  })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'CPF (Brazilian tax ID)',
    example: '123.456.789-00',
  })
  @IsString()
  @IsOptional()
  cpf?: string;

  @ApiPropertyOptional({
    description: 'RG (Brazilian identity card)',
  })
  @IsString()
  @IsOptional()
  rg?: string;

  @ApiPropertyOptional({
    description: 'Full address',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    description: 'List of specialties',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  specialties?: string[];
}

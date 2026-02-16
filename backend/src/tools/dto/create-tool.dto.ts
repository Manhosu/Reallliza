import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { ToolStatus, ToolCondition } from '../../common/types/database.types';

export class CreateToolDto {
  @ApiProperty({
    description: 'Name of the tool',
    example: 'Furadeira Bosch GSB 13 RE',
  })
  @IsString()
  @IsNotEmpty({ message: 'Tool name is required' })
  name: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the tool',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Serial number of the tool',
    example: 'SN-2025-001234',
  })
  @IsString()
  @IsOptional()
  serial_number?: string;

  @ApiPropertyOptional({
    description: 'Current status of the tool',
    enum: ToolStatus,
    default: ToolStatus.AVAILABLE,
  })
  @IsEnum(ToolStatus)
  @IsOptional()
  status?: ToolStatus = ToolStatus.AVAILABLE;

  @ApiProperty({
    description: 'Current condition of the tool',
    enum: ToolCondition,
    default: ToolCondition.NEW,
  })
  @IsEnum(ToolCondition)
  @IsOptional()
  condition?: ToolCondition = ToolCondition.NEW;

  @ApiPropertyOptional({
    description: 'Category of the tool',
    example: 'power_tools',
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    description: 'Purchase date (ISO 8601)',
    example: '2025-01-15',
  })
  @IsDateString()
  @IsOptional()
  purchase_date?: string;

  @ApiPropertyOptional({
    description: 'Purchase value',
    example: 450.0,
  })
  @IsNumber()
  @IsOptional()
  purchase_value?: number;

  @ApiPropertyOptional({
    description: 'Additional notes',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'URL of the tool image',
  })
  @IsString()
  @IsOptional()
  image_url?: string;
}

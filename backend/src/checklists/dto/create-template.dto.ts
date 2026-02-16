import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TemplateItemDto {
  @ApiProperty({
    description: 'Label/description of the checklist item',
    example: 'Verificar nivelamento do piso',
  })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiPropertyOptional({
    description: 'Whether this item is required to complete the checklist',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  required?: boolean = false;

  @ApiPropertyOptional({
    description: 'Display order of the item',
    example: 1,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number = 0;
}

export class CreateTemplateDto {
  @ApiProperty({
    description: 'Name of the checklist template',
    example: 'Checklist de Instalacao de Piso',
  })
  @IsString()
  @IsNotEmpty({ message: 'Template name is required' })
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the template',
    example: 'Checklist padrao para instalacao de pisos ceramicos e porcelanato',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Array of checklist items',
    type: [TemplateItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  items: TemplateItemDto[];
}

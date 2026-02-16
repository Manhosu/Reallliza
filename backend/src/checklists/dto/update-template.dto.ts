import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateItemDto } from './create-template.dto';

export class UpdateTemplateDto {
  @ApiPropertyOptional({
    description: 'Name of the checklist template',
    example: 'Checklist de Instalacao de Piso',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Description of the template',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Array of checklist items',
    type: [TemplateItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  @IsOptional()
  items?: TemplateItemDto[];

  @ApiPropertyOptional({
    description: 'Whether the template is active',
  })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

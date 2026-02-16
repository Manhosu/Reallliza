import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChecklistItemDto {
  @ApiProperty({
    description: 'Unique identifier of the item',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Label/description of the item',
  })
  @IsString()
  label: string;

  @ApiProperty({
    description: 'Whether the item is checked/completed',
  })
  @IsBoolean()
  checked: boolean;

  @ApiPropertyOptional({
    description: 'Additional notes for the item',
  })
  @IsString()
  @IsOptional()
  notes?: string | null;

  @ApiPropertyOptional({
    description: 'Timestamp when the item was checked (ISO 8601)',
  })
  @IsString()
  @IsOptional()
  checked_at?: string | null;
}

export class UpdateChecklistItemsDto {
  @ApiProperty({
    description: 'Array of checklist items with their current state',
    type: [ChecklistItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items: ChecklistItemDto[];

  @ApiPropertyOptional({
    description: 'Version for optimistic locking',
  })
  @IsNumber()
  @IsOptional()
  version?: number;
}

export class CompleteChecklistDto {
  @ApiPropertyOptional({
    description: 'Version for optimistic locking',
  })
  @IsNumber()
  @IsOptional()
  version?: number;
}

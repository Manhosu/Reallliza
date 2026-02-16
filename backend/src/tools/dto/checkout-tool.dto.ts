import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { ToolCondition } from '../../common/types/database.types';

export class CheckoutToolDto {
  @ApiPropertyOptional({
    description: 'Service order ID associated with this checkout',
  })
  @IsUUID()
  @IsOptional()
  service_order_id?: string;

  @ApiPropertyOptional({
    description: 'Expected return date (ISO 8601)',
    example: '2025-07-01T18:00:00Z',
  })
  @IsDateString()
  @IsOptional()
  expected_return_at?: string;

  @ApiProperty({
    description: 'Condition of the tool at checkout',
    enum: ToolCondition,
    example: ToolCondition.GOOD,
  })
  @IsEnum(ToolCondition, {
    message: `Condition must be one of: ${Object.values(ToolCondition).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Condition at checkout is required' })
  condition_out: ToolCondition;

  @ApiPropertyOptional({
    description: 'Notes about the checkout',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

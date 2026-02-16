import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ToolCondition } from '../../common/types/database.types';

export class CheckinToolDto {
  @ApiProperty({
    description: 'Condition of the tool at check-in',
    enum: ToolCondition,
    example: ToolCondition.GOOD,
  })
  @IsEnum(ToolCondition, {
    message: `Condition must be one of: ${Object.values(ToolCondition).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Condition at check-in is required' })
  condition_in: ToolCondition;

  @ApiPropertyOptional({
    description: 'Notes about the check-in',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

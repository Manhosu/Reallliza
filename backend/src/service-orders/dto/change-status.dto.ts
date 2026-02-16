import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { OsStatus } from '../../common/types/database.types';

export class ChangeStatusDto {
  @ApiProperty({
    description: 'New status for the service order',
    enum: OsStatus,
    example: OsStatus.IN_PROGRESS,
  })
  @IsEnum(OsStatus, {
    message: `Status must be one of: ${Object.values(OsStatus).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Status is required' })
  status: OsStatus;

  @ApiPropertyOptional({
    description: 'Notes about the status change',
    example: 'Starting work on location',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Version for optimistic locking',
  })
  @IsNumber()
  @IsOptional()
  version?: number;
}

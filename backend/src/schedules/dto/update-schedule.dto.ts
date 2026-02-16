import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { ScheduleStatus } from '../../common/types/database.types';

export class UpdateScheduleDto {
  @ApiPropertyOptional({ description: 'Service order ID' })
  @IsUUID()
  @IsOptional()
  service_order_id?: string;

  @ApiPropertyOptional({ description: 'Technician ID' })
  @IsUUID()
  @IsOptional()
  technician_id?: string;

  @ApiPropertyOptional({
    description: 'Scheduled date (ISO 8601 date)',
    example: '2025-07-15',
  })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({
    description: 'Scheduled start time (HH:mm or HH:mm:ss)',
    example: '09:00',
  })
  @IsString()
  @IsOptional()
  start_time?: string;

  @ApiPropertyOptional({
    description: 'Scheduled end time (HH:mm or HH:mm:ss)',
    example: '12:00',
  })
  @IsString()
  @IsOptional()
  end_time?: string;

  @ApiPropertyOptional({
    description: 'Schedule status',
    enum: ScheduleStatus,
  })
  @IsEnum(ScheduleStatus)
  @IsOptional()
  status?: ScheduleStatus;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

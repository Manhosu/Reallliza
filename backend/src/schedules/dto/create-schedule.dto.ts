import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { ScheduleStatus } from '../../common/types/database.types';

export class CreateScheduleDto {
  @ApiProperty({
    description: 'Service order ID',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'Service order ID is required' })
  service_order_id: string;

  @ApiProperty({
    description: 'Technician ID',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'Technician ID is required' })
  technician_id: string;

  @ApiProperty({
    description: 'Scheduled date (ISO 8601 date)',
    example: '2025-07-15',
  })
  @IsDateString()
  @IsNotEmpty({ message: 'Scheduled date is required' })
  date: string;

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
    default: ScheduleStatus.SCHEDULED,
  })
  @IsEnum(ScheduleStatus)
  @IsOptional()
  status?: ScheduleStatus = ScheduleStatus.SCHEDULED;

  @ApiPropertyOptional({
    description: 'Additional notes',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

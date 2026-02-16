import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PhotoType } from '../../common/types/database.types';

export class UploadPhotoDto {
  @ApiProperty({
    description: 'Service order ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'Service order ID is required' })
  service_order_id: string;

  @ApiProperty({
    description: 'Photo type',
    enum: PhotoType,
    example: PhotoType.BEFORE,
  })
  @IsEnum(PhotoType, { message: 'Type must be one of: before, during, after, issue, signature' })
  @IsNotEmpty({ message: 'Photo type is required' })
  type: PhotoType;

  @ApiPropertyOptional({
    description: 'Photo description',
    example: 'Photo of the floor before installation',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Latitude where the photo was taken',
    example: -23.5505,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  geo_lat?: number;

  @ApiPropertyOptional({
    description: 'Longitude where the photo was taken',
    example: -46.6333,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  geo_lng?: number;
}

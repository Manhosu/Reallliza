import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateChecklistDto {
  @ApiProperty({
    description: 'Service order ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'Service order ID is required' })
  service_order_id: string;

  @ApiProperty({
    description: 'Template ID (UUID) to create the checklist from',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'Template ID is required' })
  template_id: string;
}

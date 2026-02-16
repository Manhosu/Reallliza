import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RemoveDeviceDto {
  @ApiProperty({
    description: 'Push notification token to remove',
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  })
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token: string;
}

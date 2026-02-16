import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserStatus } from '../../common/types/database.types';

export class UpdateStatusDto {
  @ApiProperty({
    description: 'New status for the user',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  @IsEnum(UserStatus, {
    message: `Status must be one of: ${Object.values(UserStatus).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Status is required' })
  status: UserStatus;
}

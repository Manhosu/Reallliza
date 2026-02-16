import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateConsentDto {
  @ApiPropertyOptional({
    description: 'Whether the user accepts the terms of service',
  })
  @IsBoolean()
  @IsOptional()
  terms_accepted?: boolean;

  @ApiPropertyOptional({
    description: 'Whether the user accepts the privacy policy',
  })
  @IsBoolean()
  @IsOptional()
  privacy_accepted?: boolean;

  @ApiPropertyOptional({
    description: 'Whether the user accepts marketing communications',
  })
  @IsBoolean()
  @IsOptional()
  marketing_accepted?: boolean;
}

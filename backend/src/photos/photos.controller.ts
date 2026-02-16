import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { PhotosService } from './photos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole, PhotoType } from '../common/types/database.types';
import { UploadPhotoDto } from './dto';

@ApiTags('Photos')
@Controller('photos')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Get('service-order/:serviceOrderId')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get photos for a service order' })
  @ApiParam({ name: 'serviceOrderId', description: 'Service order UUID' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: PhotoType,
    description: 'Filter by photo type',
  })
  @ApiResponse({
    status: 200,
    description: 'Photos retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findByServiceOrder(
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
    @Query('type') type?: PhotoType,
  ) {
    return this.photosService.findByServiceOrder(serviceOrderId, type);
  }

  @Get('service-order/:serviceOrderId/count')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get photo counts by type for a service order' })
  @ApiParam({ name: 'serviceOrderId', description: 'Service order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Photo counts retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCountByServiceOrder(
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
  ) {
    return this.photosService.getCountByServiceOrder(serviceOrderId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get a photo by ID' })
  @ApiParam({ name: 'id', description: 'Photo UUID' })
  @ApiResponse({
    status: 200,
    description: 'Photo retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Photo not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.photosService.findOne(id);
  }

  @Post('upload')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (
        _req: any,
        file: { mimetype: string },
        callback: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        const allowedTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/heic',
        ];
        if (!allowedTypes.includes(file.mimetype)) {
          callback(
            new BadRequestException(
              `File type '${file.mimetype}' is not allowed. Allowed types: jpeg, jpg, png, webp, heic`,
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a photo for a service order' })
  @ApiBody({
    description: 'Photo file and metadata',
    schema: {
      type: 'object',
      required: ['file', 'service_order_id', 'type'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (jpeg, jpg, png, webp, heic). Max 10MB.',
        },
        service_order_id: {
          type: 'string',
          format: 'uuid',
          description: 'Service order ID',
        },
        type: {
          type: 'string',
          enum: ['before', 'during', 'after', 'issue', 'signature'],
          description: 'Photo type',
        },
        description: {
          type: 'string',
          description: 'Photo description (optional)',
        },
        geo_lat: {
          type: 'number',
          description: 'Latitude (optional)',
        },
        geo_lng: {
          type: 'number',
          description: 'Longitude (optional)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Photo uploaded successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error or invalid file' })
  @ApiResponse({ status: 404, description: 'Service order not found' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadPhotoDto: UploadPhotoDto,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.photosService.upload(
      {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
      },
      {
        service_order_id: uploadPhotoDto.service_order_id,
        type: uploadPhotoDto.type,
        description: uploadPhotoDto.description,
        geo_lat: uploadPhotoDto.geo_lat,
        geo_lng: uploadPhotoDto.geo_lng,
      },
      userId,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Delete a photo' })
  @ApiParam({ name: 'id', description: 'Photo UUID' })
  @ApiResponse({
    status: 200,
    description: 'Photo deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Photo not found' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.photosService.delete(id, userId);
  }
}

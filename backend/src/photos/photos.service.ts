import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import sharp from 'sharp';
import { SupabaseService } from '../supabase/supabase.service';
import { PhotoType } from '../common/types/database.types';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Processes an image buffer: resizes the main image and generates a thumbnail.
   */
  private async processImage(
    buffer: Buffer,
  ): Promise<{ main: Buffer; thumbnail: Buffer }> {
    // Resize main image (max 1920px on longest side, quality 80%)
    const main = await sharp(buffer)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Generate thumbnail (300x300)
    const thumbnail = await sharp(buffer)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toBuffer();

    return { main, thumbnail };
  }

  /**
   * Retrieves all photos for a specific service order,
   * optionally filtered by photo type.
   */
  async findByServiceOrder(serviceOrderId: string, type?: PhotoType) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('photos')
      .select('*')
      .eq('service_order_id', serviceOrderId)
      .order('created_at', { ascending: true });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(
        `Failed to fetch photos for service order ${serviceOrderId}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to fetch photos');
    }

    return data || [];
  }

  /**
   * Retrieves a single photo by ID.
   */
  async findOne(id: string) {
    const supabase = this.supabaseService.getClient();

    const { data: photo, error } = await supabase
      .from('photos')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !photo) {
      throw new NotFoundException(`Photo with ID ${id} not found`);
    }

    return photo;
  }

  /**
   * Uploads a photo to Supabase Storage and creates a database record.
   * Validates file size and type before uploading.
   */
  async upload(
    file: { buffer: Buffer; mimetype: string; originalname: string },
    data: {
      service_order_id: string;
      type: PhotoType;
      description?: string;
      geo_lat?: number;
      geo_lng?: number;
    },
    userId: string,
  ) {
    const supabase = this.supabaseService.getClient();

    // Validate file size
    if (file.buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds the maximum allowed size of 10MB`,
      );
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type '${file.mimetype}' is not allowed. Allowed types: jpeg, jpg, png, webp, heic`,
      );
    }

    // Verify service order exists
    const { data: serviceOrder, error: soError } = await supabase
      .from('service_orders')
      .select('id')
      .eq('id', data.service_order_id)
      .single();

    if (soError || !serviceOrder) {
      throw new NotFoundException(
        `Service order with ID ${data.service_order_id} not found`,
      );
    }

    // Process image through sharp (resize + generate thumbnail)
    const { main: processedBuffer, thumbnail: thumbnailBuffer } =
      await this.processImage(file.buffer);

    // Generate unique filename
    const timestamp = Date.now();
    const baseName = file.originalname.replace(/\.[^/.]+$/, '');
    const filePath = `${data.service_order_id}/${data.type}/${timestamp}-${baseName}.jpg`;
    const thumbPath = `${data.service_order_id}/${data.type}/${timestamp}-${baseName}-thumb.jpg`;

    // Upload main image to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(filePath, processedBuffer, {
        contentType: 'image/jpeg',
      });

    if (uploadError) {
      this.logger.error(`Failed to upload photo to storage: ${uploadError.message}`);
      throw new InternalServerErrorException(`Failed to upload photo: ${uploadError.message}`);
    }

    // Upload thumbnail to Supabase Storage
    const { error: thumbUploadError } = await supabase.storage
      .from('photos')
      .upload(thumbPath, thumbnailBuffer, {
        contentType: 'image/jpeg',
      });

    if (thumbUploadError) {
      this.logger.warn(
        `Failed to upload thumbnail: ${thumbUploadError.message}`,
      );
    }

    // Get public URLs
    const {
      data: { publicUrl },
    } = supabase.storage.from('photos').getPublicUrl(filePath);

    const {
      data: { publicUrl: thumbnailUrl },
    } = supabase.storage.from('photos').getPublicUrl(thumbPath);

    // Insert record into photos table
    const { data: photo, error: insertError } = await supabase
      .from('photos')
      .insert({
        service_order_id: data.service_order_id,
        type: data.type,
        url: publicUrl,
        thumbnail_url: thumbUploadError ? null : thumbnailUrl,
        description: data.description || null,
        original_filename: file.originalname,
        file_size: processedBuffer.length,
        geo_lat: data.geo_lat || null,
        geo_lng: data.geo_lng || null,
        uploaded_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      this.logger.error(
        `Failed to create photo record: ${insertError.message} | details: ${JSON.stringify(insertError)}`,
      );
      // Attempt to clean up the uploaded files
      await supabase.storage.from('photos').remove([filePath, thumbPath]);
      throw new InternalServerErrorException(`Failed to create photo record: ${insertError.message}`);
    }

    return photo;
  }

  /**
   * Deletes a photo from both storage and database.
   */
  async delete(id: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    // Get the photo record
    const { data: photo, error: findError } = await supabase
      .from('photos')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !photo) {
      throw new NotFoundException(`Photo with ID ${id} not found`);
    }

    // Extract the storage path from the URL
    // The public URL format is: https://<project>.supabase.co/storage/v1/object/public/photos/<path>
    const url = photo.url as string;
    const bucketPath = url.split('/storage/v1/object/public/photos/');
    if (bucketPath.length === 2) {
      const storagePath = decodeURIComponent(bucketPath[1]);
      const { error: deleteStorageError } = await supabase.storage
        .from('photos')
        .remove([storagePath]);

      if (deleteStorageError) {
        this.logger.warn(
          `Failed to delete photo from storage: ${deleteStorageError.message}`,
        );
      }
    }

    // Delete the database record
    const { error: deleteError } = await supabase
      .from('photos')
      .delete()
      .eq('id', id);

    if (deleteError) {
      this.logger.error(
        `Failed to delete photo record ${id}: ${deleteError.message}`,
      );
      throw new InternalServerErrorException('Failed to delete photo');
    }

    return { message: 'Photo deleted successfully' };
  }

  /**
   * Gets photo count grouped by type for a service order.
   */
  async getCountByServiceOrder(serviceOrderId: string) {
    const supabase = this.supabaseService.getClient();

    // Get all photos for this service order and group by type
    const { data, error } = await supabase
      .from('photos')
      .select('type')
      .eq('service_order_id', serviceOrderId);

    if (error) {
      this.logger.error(
        `Failed to fetch photo counts for service order ${serviceOrderId}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to fetch photo counts');
    }

    // Build counts by type
    const counts: Record<string, number> = {
      [PhotoType.BEFORE]: 0,
      [PhotoType.DURING]: 0,
      [PhotoType.AFTER]: 0,
      [PhotoType.ISSUE]: 0,
      [PhotoType.SIGNATURE]: 0,
    };

    let total = 0;
    if (data) {
      for (const photo of data) {
        const photoType = photo.type as string;
        if (photoType in counts) {
          counts[photoType]++;
        }
        total++;
      }
    }

    return {
      service_order_id: serviceOrderId,
      total,
      by_type: counts,
    };
  }
}

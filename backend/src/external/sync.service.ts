import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SyncFeedPostDto, SyncLearningContentDto, SyncRatingDto } from './sync-feed.dto';

/**
 * Recebe eventos de sincronização de conteúdo (Feed e Aprendizado) do Garantias
 * e replica nas tabelas locais que o mobile lê via /feed e /learning.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async upsertFeedPost(dto: SyncFeedPostDto, systemAuthorId: string | null) {
    const supabase = this.supabaseService.getClient();

    if (dto.deleted) {
      const { error } = await supabase
        .from('feed_posts')
        .delete()
        .eq('id', dto.external_id);
      if (error) {
        this.logger.error(`Failed to delete feed_post: ${error.message}`);
        throw new InternalServerErrorException('Erro ao apagar post');
      }
      return { id: dto.external_id, deleted: true };
    }

    const row = {
      id: dto.external_id,
      author_id: systemAuthorId,
      title: dto.title,
      content: dto.content,
      media_urls: dto.media_urls || [],
      audience: dto.audience || 'all',
      is_pinned: dto.is_pinned ?? false,
      is_published: dto.is_published ?? true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('feed_posts')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to upsert feed_post: ${error.message}`);
      throw new InternalServerErrorException('Erro ao sincronizar post');
    }

    return data;
  }

  async upsertLearningContent(dto: SyncLearningContentDto) {
    const supabase = this.supabaseService.getClient();

    if (dto.deleted) {
      const { error } = await supabase
        .from('learning_content')
        .delete()
        .eq('id', dto.external_id);
      if (error) {
        throw new InternalServerErrorException('Erro ao apagar conteúdo');
      }
      return { id: dto.external_id, deleted: true };
    }

    const row = {
      id: dto.external_id,
      title: dto.title,
      description: dto.description || null,
      category: dto.category,
      video_url: dto.video_url,
      thumbnail_url: dto.thumbnail_url || null,
      duration_sec: dto.duration_sec || null,
      order_index: dto.order_index ?? 0,
      is_published: dto.is_published ?? true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('learning_content')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to upsert learning_content: ${error.message}`);
      throw new InternalServerErrorException('Erro ao sincronizar conteúdo');
    }

    return data;
  }

  async upsertRating(dto: SyncRatingDto) {
    const supabase = this.supabaseService.getClient();

    const row = {
      id: dto.external_id,
      ticket_id: dto.ticket_id || null,
      service_order_id: dto.enterprise_os_id || null,
      technician_user_id: dto.technician_user_id,
      quality: dto.quality,
      punctuality: dto.punctuality,
      communication: dto.communication,
      comment: dto.comment || null,
    };

    const { data, error } = await supabase
      .from('customer_ratings')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to upsert customer_rating: ${error.message}`);
      throw new InternalServerErrorException('Erro ao sincronizar avaliação');
    }

    return data;
  }
}

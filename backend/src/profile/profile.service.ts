import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async getProfile(userId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Perfil não encontrado');
    }
    return data;
  }

  async updateProfile(
    userId: string,
    payload: { phone?: string; address?: string },
  ) {
    const supabase = this.supabaseService.getClient();
    const update: Record<string, unknown> = {};
    if (payload.phone !== undefined) update.phone = payload.phone;
    if (payload.address !== undefined) update.address = payload.address;

    const { data, error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', userId)
      .select()
      .single();
    if (error || !data) {
      throw new InternalServerErrorException('Erro ao atualizar perfil');
    }
    return data;
  }

  /**
   * Agregação de desempenho do técnico (manual seção 13).
   * Retorna média geral, médias por critério, total de avaliações,
   * total de OS concluídas, e últimas 5 avaliações com comentário.
   */
  async getPerformance(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: ratings } = await supabase
      .from('customer_ratings')
      .select('quality, punctuality, communication, comment, created_at, overall_score')
      .eq('technician_user_id', userId)
      .order('created_at', { ascending: false });

    const list = ratings || [];
    const total = list.length;

    const avg = (key: 'quality' | 'punctuality' | 'communication') => {
      if (total === 0) return null;
      const valid = list.filter((r) => r[key] != null);
      if (valid.length === 0) return null;
      const sum = valid.reduce((acc, r) => acc + (r[key] as number), 0);
      return Math.round((sum / valid.length) * 100) / 100;
    };

    const overall =
      total === 0
        ? null
        : Math.round(
            (list.reduce((acc, r) => acc + (r.overall_score || 0), 0) / total) *
              100,
          ) / 100;

    // Total de OS concluídas
    const { count: completedCount } = await supabase
      .from('service_orders')
      .select('id', { count: 'exact', head: true })
      .eq('technician_id', userId)
      .eq('status', 'completed');

    return {
      total_ratings: total,
      total_services_completed: completedCount || 0,
      avg_overall: overall,
      avg_quality: avg('quality'),
      avg_punctuality: avg('punctuality'),
      avg_communication: avg('communication'),
      recent_reviews: list
        .filter((r) => r.comment && r.comment.trim())
        .slice(0, 5)
        .map((r) => ({
          comment: r.comment,
          score: r.overall_score,
          created_at: r.created_at,
        })),
    };
  }
}

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type LearningCategory =
  | 'INSTALACAO'
  | 'PERICIA'
  | 'FERRAMENTAS'
  | 'BOAS_PRATICAS';

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async listContent(category?: LearningCategory) {
    const supabase = this.supabaseService.getClient();
    let query = supabase
      .from('learning_content')
      .select('*')
      .eq('is_published', true)
      .order('category')
      .order('order_index');

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
      this.logger.error(`Failed to list learning content: ${error.message}`);
      throw new InternalServerErrorException('Erro ao listar conteúdo');
    }
    return data || [];
  }
}

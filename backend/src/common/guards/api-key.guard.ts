import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../../supabase/supabase.service';

/**
 * Guard that validates the X-API-Key header for system-to-system integrations.
 *
 * On success, attaches `request.apiKeySystem` (the system_identifier from api_keys)
 * so downstream controllers/services can enforce cross-system isolation.
 *
 * SHA-256 hash is stored in DB; plaintext key is never persisted.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('api_keys')
      .select('id, system_identifier, is_active, revoked_at')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .is('revoked_at', null)
      .maybeSingle();

    if (error) {
      this.logger.error(`API key lookup failed: ${error.message}`);
      throw new UnauthorizedException('Invalid API Key');
    }

    if (!data) {
      throw new UnauthorizedException('Invalid API Key');
    }

    // Attach system identifier to request for downstream use
    request.apiKeySystem = data.system_identifier;
    request.apiKeyId = data.id;

    // Update last_used_at (fire-and-forget)
    supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(({ error: updErr }) => {
        if (updErr) {
          this.logger.warn(
            `Failed to update last_used_at for api_key ${data.id}: ${updErr.message}`,
          );
        }
      });

    return true;
  }
}

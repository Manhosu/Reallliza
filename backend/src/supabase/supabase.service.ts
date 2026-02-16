import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Service that provides access to the Supabase client.
 * Creates both an admin client (with service_role_key) and
 * per-user clients (authenticated with user's access token).
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private adminClient: SupabaseClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    this.adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.logger.log('Supabase admin client initialized');
  }

  /**
   * Returns the Supabase admin client (service_role).
   * Use this for server-side operations that bypass RLS.
   */
  getClient(): SupabaseClient {
    return this.adminClient;
  }

  /**
   * Returns a Supabase client authenticated as a specific user.
   * This client respects Row Level Security (RLS) policies.
   *
   * @param accessToken - The user's JWT access token from Supabase Auth
   */
  getClientForUser(accessToken: string): SupabaseClient {
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    const anonKey = this.configService.getOrThrow<string>('SUPABASE_ANON_KEY');

    return createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
}

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

/**
 * Guard that validates Supabase JWT tokens from the Authorization header.
 * Extracts the user from the token and attaches it to the request object.
 *
 * The user object attached to the request will contain:
 * - id: the Supabase auth user ID
 * - email: the user's email
 * - role: the user's role from the profile
 * - access_token: the raw JWT token for downstream use
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Invalid authorization format. Use: Bearer <token>',
      );
    }

    try {
      // Validate the token using Supabase admin client
      const supabase = this.supabaseService.getClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      // Fetch the user's profile to get their role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, status, full_name')
        .eq('id', user.id)
        .single();

      if (profileError) {
        this.logger.warn(
          `Failed to fetch profile for user ${user.id}: ${profileError.message}`,
        );
      }

      // Check if user is active
      if (profile?.status === 'inactive' || profile?.status === 'suspended') {
        throw new UnauthorizedException(
          'Your account has been deactivated. Please contact an administrator.',
        );
      }

      // Attach user info to the request
      request.user = {
        id: user.id,
        email: user.email,
        role: profile?.role || user.user_metadata?.role || 'technician',
        full_name: profile?.full_name || user.user_metadata?.full_name || '',
        access_token: token,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`JWT validation error: ${error.message}`);
      throw new UnauthorizedException('Token validation failed');
    }
  }
}

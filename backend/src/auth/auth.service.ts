import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserRole } from '../common/types/database.types';
import { UpdateProfileDto } from './dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Authenticates a user with email and password using Supabase Auth.
   * Returns the authenticated user and session data.
   */
  async signIn(email: string, password: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      this.logger.warn(`Login failed for ${email}: ${error.message}`);
      throw new BadRequestException('Invalid email or password');
    }

    // Fetch the user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        ...profile,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
    };
  }

  /**
   * Creates a new user via Supabase Auth admin API.
   * Also creates a corresponding profile record.
   * This should only be called by admins.
   */
  async signUp(
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
    phone?: string,
  ) {
    const supabase = this.supabaseService.getClient();

    // Check if user already exists
    const { data: existingUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      throw new ConflictException('A user with this email already exists');
    }

    // Create user in Supabase Auth using admin API
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role,
        },
      });

    if (authError) {
      this.logger.error(
        `Failed to create user ${email}: ${authError.message}`,
      );
      throw new InternalServerErrorException(
        `Failed to create user: ${authError.message}`,
      );
    }

    // The profile should be created automatically by a Supabase trigger,
    // but we'll upsert to be safe
    const profileData: Record<string, unknown> = {
      id: authData.user.id,
      email,
      full_name: fullName,
      role,
      status: 'active',
    };
    if (phone) profileData.phone = phone;

    const { error: profileError } = await supabase.from('profiles').upsert(
      profileData,
      { onConflict: 'id' },
    );

    if (profileError) {
      this.logger.error(
        `Failed to create profile for ${email}: ${profileError.message}`,
      );
      // Don't throw here - the user was created in auth, profile can be fixed later
    }

    return {
      id: authData.user.id,
      email: authData.user.email,
      full_name: fullName,
      role,
    };
  }

  /**
   * Retrieves a user's profile by their ID.
   */
  async getProfile(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  /**
   * Updates a user's profile with the provided data.
   */
  async updateProfile(userId: string, data: UpdateProfileDto) {
    const supabase = this.supabaseService.getClient();

    const { data: profile, error } = await supabase
      .from('profiles')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to update profile for ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to update profile');
    }

    return profile;
  }

  /**
   * Updates a user's password using the admin API.
   * Used when a user has a valid session (e.g., after clicking a reset link).
   */
  async updatePassword(userId: string, newPassword: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (error) {
      this.logger.error(
        `Failed to update password for user ${userId}: ${error.message}`,
      );
      throw new BadRequestException(
        'Failed to update password. Please try again.',
      );
    }

    return {
      message: 'Password updated successfully.',
    };
  }

  /**
   * Refreshes a user's session using a refresh token.
   */
  async refreshSession(refreshToken: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      this.logger.warn(`Failed to refresh session: ${error.message}`);
      throw new BadRequestException('Invalid or expired refresh token.');
    }

    if (!data.session) {
      throw new BadRequestException('Failed to refresh session.');
    }

    return {
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
    };
  }

  /**
   * Sends a password reset email to the specified address.
   */
  async resetPassword(email: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/auth/reset-password`,
    });

    if (error) {
      this.logger.error(
        `Failed to send reset password email to ${email}: ${error.message}`,
      );
      // Don't expose whether the email exists or not
    }

    return {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };
  }
}

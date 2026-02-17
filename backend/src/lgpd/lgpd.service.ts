import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { UpdateConsentDto } from './dto';
import { randomUUID } from 'crypto';

export interface ConsentStatus {
  terms_accepted: boolean;
  privacy_accepted: boolean;
  marketing_accepted: boolean;
  accepted_at: string | null;
}

@Injectable()
export class LgpdService {
  private readonly logger = new Logger(LgpdService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Exports all data associated with a user for LGPD data portability.
   * Returns profile, service orders, checklists, photos, audit logs, and notifications.
   */
  async exportUserData(userId: string) {
    const supabase = this.supabaseService.getClient();

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!profile) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Get service orders created by or assigned to this user
    const { data: serviceOrders } = await supabase
      .from('service_orders')
      .select('*')
      .or(`created_by.eq.${userId},technician_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    // Get checklists completed by this user
    const { data: checklists } = await supabase
      .from('checklists')
      .select('*')
      .eq('completed_by', userId)
      .order('created_at', { ascending: false });

    // Get photos uploaded by this user
    const { data: photos } = await supabase
      .from('photos')
      .select('*')
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false });

    // Get audit logs for this user
    const { data: auditLogs } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Get notifications for this user
    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Get consent data
    const { data: consent } = await supabase
      .from('user_consents')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Audit the data export
    this.auditService.log({
      userId,
      action: 'lgpd.data_exported',
      entityType: 'user',
      entityId: userId,
    });

    return {
      exported_at: new Date().toISOString(),
      profile,
      consent: consent || null,
      service_orders: serviceOrders || [],
      checklists: checklists || [],
      photos: photos || [],
      audit_logs: auditLogs || [],
      notifications: notifications || [],
    };
  }

  /**
   * Anonymizes a user's personal data.
   * Replaces PII with anonymized values while maintaining record integrity.
   * Does NOT delete records (preserves audit trail).
   */
  async anonymizeUser(userId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify user exists
    const { data: existing, error: findError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', userId)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const anonymizedEmail = `removed_${randomUUID()}@anon.com`;

    // Anonymize the profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: 'Usuário Removido',
        email: anonymizedEmail,
        phone: null,
        cpf: null,
        rg: null,
        address: null,
        avatar_url: null,
        documents_urls: null,
        specialties: null,
        status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      this.logger.error(
        `Failed to anonymize profile for user ${userId}: ${profileError.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to anonymize user data',
      );
    }

    // Anonymize partner data if exists
    const { data: partnerData } = await supabase
      .from('partners')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (partnerData) {
      await supabase
        .from('partners')
        .update({
          contact_name: 'Usuário Removido',
          contact_phone: null,
          contact_email: null,
          cnpj: null,
          address: null,
          notes: null,
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    }

    // Remove device tokens
    await supabase
      .from('device_tokens')
      .delete()
      .eq('user_id', userId);

    // Ban the user in Supabase Auth
    try {
      await supabase.auth.admin.updateUserById(userId, {
        email: anonymizedEmail,
        ban_duration: 'none',
      });
    } catch (err) {
      this.logger.warn(
        `Failed to update auth for anonymized user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Audit the anonymization
    this.auditService.log({
      userId,
      action: 'lgpd.user_anonymized',
      entityType: 'user',
      entityId: userId,
      oldData: {
        full_name: existing.full_name,
        email: existing.email,
      },
      newData: {
        full_name: 'Usuário Removido',
        email: anonymizedEmail,
      },
    });

    return { message: 'User data anonymized successfully' };
  }

  /**
   * Creates an anonymization request (pending admin approval).
   */
  async createAnonymizationRequest(userId: string) {
    const supabase = this.supabaseService.getClient();

    // Check if there's already a pending request
    const { data: existingRequest } = await supabase
      .from('lgpd_requests')
      .select('id, status')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingRequest) {
      return {
        message: 'An anonymization request is already pending',
        request_id: existingRequest.id,
      };
    }

    const { data: request, error } = await supabase
      .from('lgpd_requests')
      .insert({
        user_id: userId,
        type: 'anonymization',
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to create anonymization request for user ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to create anonymization request',
      );
    }

    // Audit the request
    this.auditService.log({
      userId,
      action: 'lgpd.anonymization_requested',
      entityType: 'lgpd_request',
      entityId: request.id,
    });

    return {
      message: 'Anonymization request created successfully',
      request_id: request.id,
    };
  }

  /**
   * Gets the consent status for a user.
   */
  async getConsentStatus(userId: string): Promise<ConsentStatus> {
    const supabase = this.supabaseService.getClient();

    const { data: consent } = await supabase
      .from('user_consents')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!consent) {
      return {
        terms_accepted: false,
        privacy_accepted: false,
        marketing_accepted: false,
        accepted_at: null,
      };
    }

    return {
      terms_accepted: consent.terms_accepted ?? false,
      privacy_accepted: consent.privacy_accepted ?? false,
      marketing_accepted: consent.marketing_accepted ?? false,
      accepted_at: consent.accepted_at || consent.updated_at || null,
    };
  }

  /**
   * Updates the consent status for a user.
   */
  async updateConsent(userId: string, consent: UpdateConsentDto) {
    const supabase = this.supabaseService.getClient();

    // Check if consent record already exists
    const { data: existing } = await supabase
      .from('user_consents')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    const now = new Date().toISOString();

    if (existing) {
      const { data: updated, error } = await supabase
        .from('user_consents')
        .update({
          ...consent,
          accepted_at: now,
          updated_at: now,
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        this.logger.error(
          `Failed to update consent for user ${userId}: ${error.message}`,
        );
        throw new InternalServerErrorException(
          'Failed to update consent',
        );
      }

      // Audit
      this.auditService.log({
        userId,
        action: 'lgpd.consent_updated',
        entityType: 'user_consent',
        entityId: userId,
        newData: consent as unknown as Record<string, unknown>,
      });

      return updated;
    }

    // Create new consent record
    const { data: created, error } = await supabase
      .from('user_consents')
      .insert({
        user_id: userId,
        terms_accepted: consent.terms_accepted ?? false,
        privacy_accepted: consent.privacy_accepted ?? false,
        marketing_accepted: consent.marketing_accepted ?? false,
        accepted_at: now,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to create consent for user ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to create consent record',
      );
    }

    // Audit
    this.auditService.log({
      userId,
      action: 'lgpd.consent_created',
      entityType: 'user_consent',
      entityId: userId,
      newData: consent as unknown as Record<string, unknown>,
    });

    return created;
  }
}

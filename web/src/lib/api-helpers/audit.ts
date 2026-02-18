import { getAdminClient } from "./supabase-admin";

export interface AuditLogParams {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function logAudit(params: AuditLogParams): void {
  const supabase = getAdminClient();

  supabase
    .from("audit_logs")
    .insert({
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      old_data: params.oldData || null,
      new_data: params.newData || null,
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent || null,
    })
    .then(({ error }) => {
      if (error) {
        console.error(`Audit log insert error: ${error.message}`);
      }
    });
}

import { getAdminClient } from "./supabase-admin";

type NotificationType =
  | "os_created"
  | "os_assigned"
  | "os_status_changed"
  | "os_completed"
  | "schedule_created"
  | "schedule_reminder"
  | "tool_checkout"
  | "tool_overdue"
  | "system";

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType,
  data?: Record<string, unknown>
) {
  const supabase = getAdminClient();

  const { data: notification, error } = await supabase
    .from("notifications")
    .insert({
      user_id: userId,
      title,
      message,
      type,
      data: data || null,
    })
    .select()
    .single();

  if (error) {
    console.error(
      `Failed to create notification for user ${userId}: ${error.message}`
    );
    return null;
  }

  // Fire-and-forget push notification
  sendPushNotification(userId, title, message, data).catch((err) => {
    console.error(
      `Failed to send push: ${err instanceof Error ? err.message : String(err)}`
    );
  });

  return notification;
}

async function sendPushNotification(
  userId: string,
  title: string,
  message: string,
  data?: Record<string, unknown>
) {
  const supabase = getAdminClient();

  const { data: devices, error } = await supabase
    .from("device_tokens")
    .select("token")
    .eq("user_id", userId);

  if (error || !devices || devices.length === 0) return;

  const messages = devices.map((device) => ({
    to: device.token,
    title,
    body: message,
    data: data || {},
    sound: "default" as const,
  }));

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
}

import { getAdminClient } from "./supabase-admin";

export type NotificationType =
  | "os_assigned"
  | "os_status_changed"
  | "os_completed"
  | "os_cancelled"
  | "os_rework"
  | "message_received"
  | "proposal_available"
  | "schedule_reminder"
  | "tool_overdue"
  | "new_ticket"
  | "general";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

interface CreateNotificationOptions {
  priority?: NotificationPriority;
}

/**
 * Cria uma notificação para o usuário (Execução).
 *
 * Persiste em `notifications` e dispara push Expo (fire-and-forget).
 * O som customizado "realliza.wav" e channel `realliza-urgent` são usados
 * em prioridades `high` ou `urgent` — coloca a notificação em destaque na
 * gaveta do Android e toca o áudio identitário no foreground/background.
 */
export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType,
  data?: Record<string, unknown>,
  options?: CreateNotificationOptions
) {
  const supabase = getAdminClient();
  const priority: NotificationPriority = options?.priority ?? "normal";

  const { data: notification, error } = await supabase
    .from("notifications")
    .insert({
      user_id: userId,
      title,
      message,
      type,
      priority,
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

  // Await pra garantir que o POST ao Expo aconteça antes da Lambda
  // terminar (Vercel mata Promises pendentes no return). Custa ~100-200ms
  // mas é o que segura a notificação chegando ao mobile.
  try {
    await sendPushNotification(userId, title, message, priority, data);
  } catch (err) {
    console.error(
      `Failed to send push: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return notification;
}

async function sendPushNotification(
  userId: string,
  title: string,
  message: string,
  priority: NotificationPriority,
  data?: Record<string, unknown>
) {
  const supabase = getAdminClient();

  const { data: devices, error } = await supabase
    .from("device_tokens")
    .select("token")
    .eq("user_id", userId);

  if (error || !devices || devices.length === 0) return;

  const isLoud = priority === "high" || priority === "urgent";
  const sound: string | "default" = isLoud ? "realliza" : "default";
  const channelId = isLoud ? "realliza-urgent" : "default";
  const expoPriority = priority === "urgent" ? "high" : isLoud ? "high" : "default";

  const payload = devices.map((device) => ({
    to: device.token,
    title,
    body: message,
    data: { ...(data || {}), priority },
    sound,
    channelId,
    priority: expoPriority,
  }));

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

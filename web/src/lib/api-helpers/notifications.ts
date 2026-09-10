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
  | "warranty_opened"
  | "warranty_resolved"
  | "general";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

interface CreateNotificationOptions {
  priority?: NotificationPriority;
}

/**
 * Cria uma notificação para o usuário (Execução).
 *
 * Persiste em `notifications` e dispara push Expo (fire-and-forget).
 * O som customizado "realliza.mp3" e channel `realliza-urgent-v3` são
 * usados em prioridades `high` ou `urgent` — coloca a notificação em
 * destaque na gaveta do Android e toca o áudio identitário no
 * foreground/background.
 *
 * Jessica 27/08: o id era `realliza-urgent` (sem "-v2") até aquele commit —
 * renomeado porque canais do Android são imutáveis por id depois de
 * criados no aparelho, e este canal nasceu (20/05) com um som placeholder
 * quase mudo, corrigido só do lado do arquivo (30/07) sem nunca trocar o
 * id.
 *
 * Jessica 10/09: som ainda não tocava com o v2. Causa raiz diferente dessa
 * vez — `sound: 'realliza'` faltava a extensão. A doc do expo-notifications
 * exige o nome de arquivo completo ("mySoundFile.wav"), o Android não
 * resolve "realliza" pro asset "realliza.mp3" e cai pro toque padrão sem
 * avisar erro nenhum. Corrigido pra "realliza.mp3" — e o id precisa mudar
 * de novo (v2 -> v3) pelo mesmo motivo de sempre: canal já criado num
 * aparelho não se autocorrige, só um id novo força recriação.
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
    await sendPushNotification(userId, title, message, type, priority, data);
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
  type: NotificationType,
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
  // "realliza.mp3" com extensao — a doc do expo-notifications exige o nome
  // de arquivo completo (ver push-notifications.ts, 10/09). channelId
  // trocado pra v3 pelo mesmo motivo do v2: canal do Android e' imutavel
  // por id, um aparelho que ja criou o v2 quebrado nunca reconfigura sozinho.
  const sound: string | "default" = isLoud ? "realliza.mp3" : "default";
  const channelId = isLoud ? "realliza-urgent-v3" : "default";
  const expoPriority = priority === "urgent" ? "high" : isLoud ? "high" : "default";

  const payload = devices.map((device) => ({
    to: device.token,
    title,
    body: message,
    // `type` faltava aqui — o app nunca sabia que tipo de notificacao
    // chegou, entao o roteamento ao tocar numa notificacao na bandeja
    // (app fechado/em segundo plano) nunca disparava (push-notifications.ts
    // le exatamente `data.type`).
    data: { ...(data || {}), type, priority },
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

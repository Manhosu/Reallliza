import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { ServiceOrder, Schedule, Checklist } from './types';

// ============================================================
// Keys
// ============================================================

const KEYS = {
  SERVICE_ORDERS: '@offline:service_orders',
  SCHEDULES: '@offline:schedules',
  CHECKLISTS_PREFIX: '@offline:checklists:', // + osId
  PENDING_ACTIONS: '@offline:pending_actions',
} as const;

// ============================================================
// Offline Action (queued for sync)
// ============================================================

export interface OfflineAction {
  id: string;
  type:
    | 'status_change'
    | 'checklist_update'
    | 'checklist_complete'
    | 'photo_upload'
    | 'tool_checkin';
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  body?: unknown;
  fileUri?: string; // for photo uploads
  fileFields?: Record<string, string>; // extra form fields for uploads
  fileName?: string;
  fileType?: string;
  retryCount: number;
  createdAt: string;
}

// ============================================================
// Helpers
// ============================================================

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

async function getJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.error(`[OfflineStorage] Error reading ${key}:`, error);
    return null;
  }
}

async function setJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`[OfflineStorage] Error writing ${key}:`, error);
  }
}

// ============================================================
// Service Orders
// ============================================================

async function saveServiceOrders(orders: ServiceOrder[]): Promise<void> {
  await setJson(KEYS.SERVICE_ORDERS, orders);
}

async function getServiceOrders(): Promise<ServiceOrder[]> {
  return (await getJson<ServiceOrder[]>(KEYS.SERVICE_ORDERS)) ?? [];
}

// ============================================================
// Schedules
// ============================================================

async function saveSchedules(schedules: Schedule[]): Promise<void> {
  await setJson(KEYS.SCHEDULES, schedules);
}

async function getSchedules(): Promise<Schedule[]> {
  return (await getJson<Schedule[]>(KEYS.SCHEDULES)) ?? [];
}

// ============================================================
// Checklists (per OS)
// ============================================================

async function saveChecklists(
  osId: string,
  checklists: Checklist[],
): Promise<void> {
  await setJson(`${KEYS.CHECKLISTS_PREFIX}${osId}`, checklists);
}

async function getChecklists(osId: string): Promise<Checklist[]> {
  return (
    (await getJson<Checklist[]>(`${KEYS.CHECKLISTS_PREFIX}${osId}`)) ?? []
  );
}

// ============================================================
// OS Detail Cache
// @offline:os_detail:{id}
// ============================================================

async function saveOsDetail(id: string, data: unknown): Promise<void> {
  await setJson(`@offline:os_detail:${id}`, data);
}

async function getOsDetail(id: string): Promise<unknown | null> {
  return getJson(`@offline:os_detail:${id}`);
}

// ============================================================
// Pending Action Queue
// ============================================================

async function getPendingActions(): Promise<OfflineAction[]> {
  return (await getJson<OfflineAction[]>(KEYS.PENDING_ACTIONS)) ?? [];
}

async function queueAction(
  action: Omit<OfflineAction, 'id' | 'retryCount' | 'createdAt'>,
): Promise<OfflineAction> {
  const pending = await getPendingActions();
  const newAction: OfflineAction = {
    ...action,
    id: generateId(),
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };

  // Copy photo file to a safe location so the original URI can be cleaned up
  if (newAction.type === 'photo_upload' && newAction.fileUri) {
    try {
      const fileName = `offline_photo_${newAction.id}.jpg`;
      const sourceFile = new File(newAction.fileUri);
      const destFile = new File(Paths.document, fileName);
      sourceFile.copy(destFile);
      newAction.fileUri = destFile.uri;
    } catch (err) {
      console.warn('[OfflineStorage] Failed to copy photo file:', err);
      // Still queue the action with original URI as fallback
    }
  }

  // Deduplicate: if an action with the same endpoint + method exists, replace it
  const existing = pending.findIndex(
    (a) => a.endpoint === newAction.endpoint && a.method === newAction.method,
  );
  if (existing !== -1) {
    pending[existing] = newAction; // Replace with newer version
  } else {
    pending.push(newAction);
  }

  await setJson(KEYS.PENDING_ACTIONS, pending);
  return newAction;
}

async function removePendingAction(id: string): Promise<void> {
  const pending = await getPendingActions();
  const filtered = pending.filter(a => a.id !== id);
  await setJson(KEYS.PENDING_ACTIONS, filtered);
}

async function updatePendingAction(
  id: string,
  updates: Partial<OfflineAction>,
): Promise<void> {
  const pending = await getPendingActions();
  const updated = pending.map(a => (a.id === id ? { ...a, ...updates } : a));
  await setJson(KEYS.PENDING_ACTIONS, updated);
}

async function clearPendingActions(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.PENDING_ACTIONS);
}

async function getPendingCount(): Promise<number> {
  const actions = await getPendingActions();
  return actions.length;
}

// ============================================================
// Clear all offline data (e.g. on logout)
// ============================================================

async function clearAll(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const offlineKeys = allKeys.filter(k => k.startsWith('@offline:'));
    if (offlineKeys.length > 0) {
      await AsyncStorage.multiRemove(offlineKeys);
    }
  } catch (error) {
    console.error('[OfflineStorage] Error clearing all:', error);
  }
}

// ============================================================
// Public API
// ============================================================

export const offlineStorage = {
  // Service Orders
  saveServiceOrders,
  getServiceOrders,

  // Schedules
  saveSchedules,
  getSchedules,

  // Checklists
  saveChecklists,
  getChecklists,

  // OS Detail
  saveOsDetail,
  getOsDetail,

  // Action Queue
  queueAction,
  getPendingActions,
  removePendingAction,
  updatePendingAction,
  clearPendingActions,
  getPendingCount,

  // Utility
  clearAll,
};

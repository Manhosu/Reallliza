import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { create } from 'zustand';
import { offlineStorage, OfflineAction } from './offline-storage';
import { apiClient, ApiError, getAccessToken, BASE_URL } from './api';

// ============================================================
// Sync State Store (zustand)
// ============================================================

interface SyncState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  conflictCount: number;

  setOnline: (online: boolean) => void;
  setPendingCount: (count: number) => void;
  setSyncing: (syncing: boolean) => void;
  setLastSyncAt: (date: string) => void;
  refreshPendingCount: () => Promise<void>;
  incrementConflicts: () => void;
  resetConflicts: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isOnline: true,
  pendingCount: 0,
  isSyncing: false,
  lastSyncAt: null,
  conflictCount: 0,

  setOnline: (online: boolean) => set({ isOnline: online }),
  setPendingCount: (count: number) => set({ pendingCount: count }),
  setSyncing: (syncing: boolean) => set({ isSyncing: syncing }),
  setLastSyncAt: (date: string) => set({ lastSyncAt: date }),
  refreshPendingCount: async () => {
    const count = await offlineStorage.getPendingCount();
    set({ pendingCount: count });
  },
  incrementConflicts: () =>
    set((state) => ({ conflictCount: state.conflictCount + 1 })),
  resetConflicts: () => set({ conflictCount: 0 }),
}));

// ============================================================
// Max retries before skipping an action
// ============================================================

const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 30000;

/** Sleep helper for exponential backoff */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Calculate backoff delay: 1s, 2s, 4s, 8s, 16s, max 30s */
const getBackoffDelay = (retryCount: number): number =>
  Math.min(1000 * Math.pow(2, retryCount), MAX_BACKOFF_MS);

// ============================================================
// SyncManager
// ============================================================

class SyncManager {
  private unsubscribe: (() => void) | null = null;
  private initialized = false;
  private retryCount = 0;

  /** Initialize network listener and check initial state */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Refresh pending count on init
    await useSyncStore.getState().refreshPendingCount();

    // Get initial network state
    const state = await NetInfo.fetch();
    const isOnline = !!(state.isConnected && state.isInternetReachable !== false);
    useSyncStore.getState().setOnline(isOnline);

    if (isOnline) {
      this.syncAll();
    }

    // Subscribe to network changes
    this.unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      const wasOnline = useSyncStore.getState().isOnline;
      const nowOnline = !!(
        netState.isConnected && netState.isInternetReachable !== false
      );

      useSyncStore.getState().setOnline(nowOnline);

      // Connection restored: trigger sync
      if (!wasOnline && nowOnline) {
        console.log('[SyncManager] Connection restored, syncing...');
        this.syncAll();
      }
    });
  }

  /** Destroy listener */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.initialized = false;
  }

  /** Process all pending actions in FIFO order */
  async syncAll(): Promise<void> {
    const store = useSyncStore.getState();
    if (store.isSyncing || !store.isOnline) return;

    store.setSyncing(true);
    store.resetConflicts();

    try {
      const actions = await offlineStorage.getPendingActions();
      let allSucceeded = true;

      for (const action of actions) {
        if (!useSyncStore.getState().isOnline) {
          console.log('[SyncManager] Lost connection during sync, stopping.');
          allSucceeded = false;
          break;
        }

        if (action.retryCount >= MAX_RETRIES) {
          console.warn(
            `[SyncManager] Skipping action ${action.id} after ${MAX_RETRIES} retries`,
          );
          continue;
        }

        const success = await this.syncAction(action);
        if (success) {
          await offlineStorage.removePendingAction(action.id);
        } else {
          await offlineStorage.updatePendingAction(action.id, {
            retryCount: action.retryCount + 1,
          });

          // Exponential backoff before retrying
          const delay = getBackoffDelay(this.retryCount);
          console.log(
            `[SyncManager] Sync failed, retrying in ${delay}ms (attempt ${this.retryCount + 1})`,
          );
          this.retryCount++;
          allSucceeded = false;

          // Wait before next attempt, then stop processing to maintain order
          await sleep(delay);
          break;
        }
      }

      // Reset retry count on full success
      if (allSucceeded) {
        this.retryCount = 0;
      }

      await store.refreshPendingCount();
      store.setLastSyncAt(new Date().toISOString());
    } catch (error) {
      console.error('[SyncManager] syncAll error:', error);
      // Exponential backoff on overall failure
      const delay = getBackoffDelay(this.retryCount);
      this.retryCount++;
      console.log(
        `[SyncManager] syncAll error, will retry in ${delay}ms (attempt ${this.retryCount})`,
      );
      await sleep(delay);
    } finally {
      store.setSyncing(false);
    }
  }

  /** Execute a single queued action */
  private async syncAction(action: OfflineAction): Promise<boolean> {
    try {
      if (action.type === 'photo_upload' && action.fileUri) {
        // File upload
        const token = await getAccessToken();
        const url = `${BASE_URL}${action.endpoint}`;

        const formData = new FormData();
        formData.append('file', {
          uri: action.fileUri,
          type: action.fileType || 'image/jpeg',
          name: action.fileName || 'photo.jpg',
        } as unknown as Blob);

        if (action.fileFields) {
          for (const [key, value] of Object.entries(action.fileFields)) {
            formData.append(key, value);
          }
        }

        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (!res.ok) {
          if (res.status === 409) {
            console.warn('[SyncManager] Conflict (409) for action:', action.endpoint);
            useSyncStore.getState().incrementConflicts();
            return true; // Remove from queue (stale data)
          }
          console.error(
            `[SyncManager] Photo upload failed: ${res.status} ${res.statusText}`,
          );
          return false;
        }

        return true;
      }

      // Regular API call
      switch (action.method) {
        case 'POST':
          await apiClient.post(action.endpoint, action.body);
          break;
        case 'PUT':
          await apiClient.put(action.endpoint, action.body);
          break;
        case 'PATCH':
          await apiClient.patch(action.endpoint, action.body);
          break;
      }

      return true;
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409) {
        // It's a conflict - data was stale
        console.warn('[SyncManager] Conflict (409) for action:', action.endpoint);
        useSyncStore.getState().incrementConflicts();
        return true; // Remove from queue (stale data)
      }
      console.error(
        `[SyncManager] Action ${action.id} (${action.type}) failed:`,
        error,
      );
      return false;
    }
  }

  /** Refresh cached data from the API when coming online */
  async refreshData(): Promise<void> {
    if (!useSyncStore.getState().isOnline) return;

    try {
      // Re-fetch service orders (first page)
      const ordersResponse = await apiClient.get<{
        data: import('./types').ServiceOrder[];
      }>('/service-orders/my', { page: 1, limit: 50 });
      if (ordersResponse?.data) {
        await offlineStorage.saveServiceOrders(ordersResponse.data);
      }

      // Re-fetch schedules
      const schedules = await apiClient.get<import('./types').Schedule[]>(
        '/schedules/my',
      );
      if (Array.isArray(schedules)) {
        await offlineStorage.saveSchedules(schedules);
      }
    } catch (error) {
      console.error('[SyncManager] refreshData error:', error);
    }
  }
}

// Singleton instance
export const syncManager = new SyncManager();

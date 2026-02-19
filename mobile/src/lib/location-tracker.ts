import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { apiClient } from './api';

// ============================================================
// Constants
// ============================================================

const LOCATION_TASK_NAME = 'REALLLIZA_BACKGROUND_LOCATION';

/** Minimum interval between location updates in ms (30 seconds) */
const LOCATION_INTERVAL_MS = 30000;

/** Minimum distance change in meters to trigger an update */
const LOCATION_DISTANCE_FILTER = 10;

// ============================================================
// Module State
// ============================================================

let currentServiceOrderId: string | null = null;

// ============================================================
// Background Task Definition
// ============================================================

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[LocationTracker] Background task error:', error.message);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };

  if (!locations || locations.length === 0) return;

  // Use the most recent location
  const location = locations[locations.length - 1];

  try {
    await apiClient.post('/tracking/location', {
      service_order_id: currentServiceOrderId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? undefined,
      speed: location.coords.speed ?? undefined,
      heading: location.coords.heading ?? undefined,
    });
  } catch (err) {
    console.error('[LocationTracker] Failed to send location:', err);
  }
});

// ============================================================
// Public API
// ============================================================

/**
 * Request location permissions and start background location tracking.
 * Sends location updates every ~30 seconds to POST /api/tracking/location.
 *
 * @param serviceOrderId - The service order ID to associate with location updates
 */
export async function startTracking(serviceOrderId: string): Promise<boolean> {
  try {
    // Request foreground permissions first
    const { status: foregroundStatus } =
      await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.warn('[LocationTracker] Foreground permission not granted');
      return false;
    }

    // Request background permissions
    const { status: backgroundStatus } =
      await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.warn('[LocationTracker] Background permission not granted');
      return false;
    }

    // Check if already tracking
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME,
    );
    if (hasStarted) {
      // Update the service order ID and continue
      currentServiceOrderId = serviceOrderId;
      console.log('[LocationTracker] Already tracking, updated serviceOrderId');
      return true;
    }

    currentServiceOrderId = serviceOrderId;

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: LOCATION_INTERVAL_MS,
      distanceInterval: LOCATION_DISTANCE_FILTER,
      deferredUpdatesInterval: LOCATION_INTERVAL_MS,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Reallliza - Rastreamento',
        notificationBody: 'Rastreando deslocamento para OS',
        notificationColor: '#EAB308',
      },
    });

    console.log('[LocationTracker] Started tracking for OS:', serviceOrderId);
    return true;
  } catch (error) {
    console.error('[LocationTracker] Failed to start tracking:', error);
    return false;
  }
}

/**
 * Stop background location tracking.
 */
export async function stopTracking(): Promise<void> {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME,
    );

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      console.log('[LocationTracker] Stopped tracking');
    }

    currentServiceOrderId = null;
  } catch (error) {
    console.error('[LocationTracker] Failed to stop tracking:', error);
  }
}

/**
 * Check if location tracking is currently active.
 */
export async function isTracking(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

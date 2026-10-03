/**
 * Connectivity Service
 *
 * Provides real connectivity detection by verifying reachability of the backend API,
 * combined with browser online/offline event listeners.
 *
 * Key behaviours:
 * - Uses navigator.onLine as a fast first gate (no network request needed)
 * - When online: probes the backend /health endpoint with a short timeout
 * - When offline: uses exponential backoff (30s → 60s → 120s max) to avoid
 *   flooding the console with ERR_CONNECTION_REFUSED errors
 * - Single-flight: concurrent probe calls share the same in-flight request
 * - Minimum 10s guard between probes even if called externally
 */

import { API_URL } from '../config';

export type ConnectivityListener = (isOnline: boolean) => void;

const MIN_PROBE_INTERVAL_MS = 10_000;   // Never probe more than once per 10s
const ONLINE_POLL_MS        = 30_000;   // Poll every 30s when online
const OFFLINE_POLL_MIN_MS   = 30_000;   // Start backoff at 30s when offline
const OFFLINE_POLL_MAX_MS   = 120_000;  // Cap backoff at 2 minutes
const PROBE_TIMEOUT_MS      = 4_000;    // Abort health probe after 4s

export class ConnectivityService {
  private isOnline = true;
  private mockMode = false;
  private listeners: Set<ConnectivityListener> = new Set();
  private probeInterval: any = null;
  private isDestroyed = false;
  private baseUrl: string;

  /** Prevents concurrent in-flight probes */
  private probeInFlight: Promise<boolean> | null = null;

  /** Timestamp of the last completed probe (ms) */
  private lastProbeAt = 0;

  /** Current backoff delay when offline (ms) */
  private currentOfflineBackoffMs = OFFLINE_POLL_MIN_MS;

  constructor(customBaseUrl?: string) {
    this.baseUrl = customBaseUrl || API_URL;
    this.initListeners();
  }

  private initListeners(): void {
    if (typeof navigator !== 'undefined') {
      this.isOnline = navigator.onLine;
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online',  () => this.handleNetworkEvent(true));
      window.addEventListener('offline', () => this.handleNetworkEvent(false));
    }
  }

  private handleNetworkEvent(browserOnline: boolean): void {
    if (this.mockMode) return;
    if (!browserOnline) {
      // Immediate offline — no probe needed
      this.updateStatus(false);
    } else {
      // Browser thinks we're back online — verify with a probe
      this.checkConnectivityNow();
    }
  }

  /**
   * Start adaptive periodic health monitoring.
   * Uses ONLINE_POLL_MS when connected, increases interval when offline.
   */
  startMonitoring(): void {
    if (this.probeInterval) {
      clearInterval(this.probeInterval);
    }

    // Initial probe (non-blocking)
    this.checkConnectivityNow().catch(() => {});

    // Adaptive polling: re-schedule after each probe completes
    const schedule = () => {
      if (this.isDestroyed || this.mockMode) return;
      const delay = this.isOnline ? ONLINE_POLL_MS : this.currentOfflineBackoffMs;
      this.probeInterval = setTimeout(async () => {
        if (!this.isDestroyed && !this.mockMode) {
          await this.checkConnectivityNow().catch(() => {});
          schedule(); // Re-schedule after probe completes
        }
      }, delay);
    };

    schedule();
  }

  /**
   * Actively probe backend reachability.
   *
   * Guards:
   * 1. navigator.onLine === false → immediately offline, no HTTP request
   * 2. Minimum interval guard: ignore calls within 10s of last probe
   * 3. Single-flight: concurrent calls share one in-flight Promise
   * 4. Short timeout (4s) with abort controller
   * 5. Exponential backoff on consecutive offline results
   */
  checkConnectivityNow(): Promise<boolean> {
    if (this.mockMode) {
      return Promise.resolve(this.isOnline);
    }

    // Gate 1: browser knows it's offline — skip the network request entirely
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.updateStatus(false);
      return Promise.resolve(false);
    }

    // Gate 2: minimum interval between probes
    const now = Date.now();
    if (now - this.lastProbeAt < MIN_PROBE_INTERVAL_MS) {
      return Promise.resolve(this.isOnline);
    }

    // Gate 3: single-flight — share any in-progress probe
    if (this.probeInFlight) {
      return this.probeInFlight;
    }

    this.probeInFlight = this._doProbe().finally(() => {
      this.probeInFlight = null;
    });

    return this.probeInFlight;
  }

  /** Internal: perform the actual HTTP health check */
  private async _doProbe(): Promise<boolean> {
    this.lastProbeAt = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        // Prevent caching so we always get a fresh response
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      const isReachable = response.ok || response.status === 503; // 503 = backend up but DB offline (still server-online)
      this.updateStatus(isReachable);

      if (isReachable) {
        // Reset backoff on success
        this.currentOfflineBackoffMs = OFFLINE_POLL_MIN_MS;
      } else {
        this._increaseBackoff();
      }

      return isReachable;
    } catch (_) {
      clearTimeout(timeoutId);
      // Backend unreachable — apply backoff, do NOT log (avoids console flood)
      this.updateStatus(false);
      this._increaseBackoff();
      return false;
    }
  }

  /** Double the backoff interval, capped at OFFLINE_POLL_MAX_MS */
  private _increaseBackoff(): void {
    this.currentOfflineBackoffMs = Math.min(
      this.currentOfflineBackoffMs * 2,
      OFFLINE_POLL_MAX_MS,
    );
  }

  private updateStatus(newStatus: boolean): void {
    if (this.isOnline !== newStatus) {
      this.isOnline = newStatus;
      if (newStatus) {
        // Back online — reset backoff
        this.currentOfflineBackoffMs = OFFLINE_POLL_MIN_MS;
        console.info('[ConnectivityService] ✅ Backend reachable — online mode');
      } else {
        console.info('[ConnectivityService] 📶 Backend unreachable — offline mode');
      }
      this.listeners.forEach((listener) => {
        try {
          listener(newStatus);
        } catch (e) {
          console.error('[ConnectivityService] Listener error:', e);
        }
      });
    }
  }

  getIsOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Set status manually (useful for tests simulating offline)
   */
  setMockStatus(status: boolean | null): void {
    if (status === null) {
      this.mockMode = false;
      return;
    }
    this.mockMode = true;
    this.updateStatus(status);
  }

  clearMockStatus(): void {
    this.mockMode = false;
  }

  onConnectivityChange(listener: ConnectivityListener): () => void {
    this.listeners.add(listener);
    // Immediately inform current status
    listener(this.isOnline);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    this.isDestroyed = true;
    if (this.probeInterval) {
      clearTimeout(this.probeInterval);
      this.probeInterval = null;
    }
    this.listeners.clear();
  }
}

export const connectivityService = new ConnectivityService();

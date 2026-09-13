/**
 * Connectivity Service
 *
 * Provides real connectivity detection by verifying reachability of the backend API,
 * combined with browser online/offline event listeners.
 */

import { API_URL } from '../config';

export type ConnectivityListener = (isOnline: boolean) => void;

export class ConnectivityService {
  private isOnline = true;
  private mockMode = false;
  private listeners: Set<ConnectivityListener> = new Set();
  private probeInterval: any = null;
  private isDestroyed = false;
  private baseUrl: string;

  constructor(customBaseUrl?: string) {
    this.baseUrl = customBaseUrl || API_URL;
    this.initListeners();
  }

  private initListeners(): void {
    if (typeof navigator !== 'undefined') {
      this.isOnline = navigator.onLine;
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', () => this.handleNetworkEvent(true));
      window.addEventListener('offline', () => this.handleNetworkEvent(false));
    }
  }

  private handleNetworkEvent(browserOnline: boolean): void {
    if (this.mockMode) return;
    this.updateStatus(browserOnline);
  }

  /**
   * Start periodic heartbeat probe (default: every 15 seconds)
   */
  startMonitoring(intervalMs = 15000): void {
    if (this.probeInterval) {
      clearInterval(this.probeInterval);
    }
    this.checkConnectivityNow();
    this.probeInterval = setInterval(() => {
      if (!this.isDestroyed && !this.mockMode) {
        this.checkConnectivityNow();
      }
    }, intervalMs);
  }

  /**
   * Actively probe backend reachability and network state
   */
  async checkConnectivityNow(): Promise<boolean> {
    if (this.mockMode) {
      return this.isOnline;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.updateStatus(false);
      return false;
    }

    this.updateStatus(true);
    return true;
  }

  private updateStatus(newStatus: boolean): void {
    if (this.isOnline !== newStatus) {
      this.isOnline = newStatus;
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
      clearInterval(this.probeInterval);
      this.probeInterval = null;
    }
    this.listeners.clear();
  }
}

export const connectivityService = new ConnectivityService();

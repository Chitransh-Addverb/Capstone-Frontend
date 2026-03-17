import { Injectable, signal, computed } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: Date;
  read: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly STORAGE_KEY = 'wos-notifications';

  private _notifications = signal<AppNotification[]>(this.loadFromStorage());

  notifications = computed(() => this._notifications());

  unreadCount = computed(() =>
    this._notifications().filter(n => !n.read).length
  );

  hasUnread = computed(() => this.unreadCount() > 0);

  add(type: NotificationType, title: string, message?: string): void {
    const notification: AppNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type,
      title,
      message,
      timestamp: new Date(),
      read: false,
    };
    this._notifications.update(list => [notification, ...list].slice(0, 50));
    this.persist();
  }

  markAllRead(): void {
    this._notifications.update(list =>
      list.map(n => ({ ...n, read: true }))
    );
    this.persist();
  }

  clearAll(): void {
    this._notifications.set([]);
    this.persist();
  }

  formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  private persist(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._notifications()));
    } catch {}
  }

  private loadFromStorage(): AppNotification[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw).map((n: any) => ({
        ...n,
        timestamp: new Date(n.timestamp),
      }));
    } catch {
      return [];
    }
  }
}






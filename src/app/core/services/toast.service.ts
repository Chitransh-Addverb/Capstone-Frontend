import { Injectable, signal, inject } from '@angular/core';
import { NotificationService } from './notification.service';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {

  private notificationService = inject(NotificationService);

  toasts = signal<Toast[]>([]);

  show(type: ToastType, title: string, message?: string, duration = 4000): void {
    const id = `toast-${Date.now()}`;
    const toast: Toast = { id, type, title, message, duration };

    this.toasts.update(list => [...list, toast]);

    this.notificationService.add(type, title, message);

    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  success(title: string, message?: string): void {
    this.show('success', title, message);
  }

  error(title: string, message?: string): void {
    this.show('error', title, message, 6000);
  }

  warning(title: string, message?: string): void {
    this.show('warning', title, message);
  }

  info(title: string, message?: string): void {
    this.show('info', title, message);
  }

  dismiss(id: string): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }
}



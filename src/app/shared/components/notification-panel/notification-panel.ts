import { Component, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NotificationService, AppNotification } from '../../../core/services/notification.service';

@Component({
  selector: 'app-notification-panel',
  imports: [CommonModule],
  templateUrl: './notification-panel.html',
  styleUrl: './notification-panel.scss',
})
export class NotificationPanel {

  notifService = inject(NotificationService);
  private sanitizer = inject(DomSanitizer);
  isOpen = signal(false);

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.notif-wrapper')) {
      this.isOpen.set(false);
    }
  }

  toggle(): void {
    this.isOpen.update(v => !v);
    if (this.isOpen()) {
      this.notifService.markAllRead();
    }
  }

  clearAll(): void {
    this.notifService.clearAll();
  }

  getIcon(type: string): SafeHtml {
    const icons: Record<string, string> = {
      success: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 6l2.5 2.5L10 3"/></svg>`,
      error:   `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 2l8 8M10 2L2 10"/></svg>`,
      warning: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 4v3M6 8.5v.5"/><path d="M5.2 1.5L1 9a1 1 0 00.8 1.5h8.4A1 1 0 0011 9L6.8 1.5a1 1 0 00-1.6 0z"/></svg>`,
      info:    `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="6" r="5"/><path d="M6 5.5V8M6 4v.5"/></svg>`,
    };
    return this.sanitizer.bypassSecurityTrustHtml(icons[type] || icons['info']);
  }

  trackById(_: number, n: AppNotification): string {
    return n.id;
  }

}




import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastService, Toast } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  imports: [CommonModule],
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
})
export class ToastComponent {

  toastService = inject(ToastService);
  private sanitizer = inject(DomSanitizer);

  trackById(_: number, toast: Toast): string {
    return toast.id;
  }

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }

  getIcon(type: string): SafeHtml {
    const icons: Record<string, string> = {
      success: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 7l3.5 3.5L12 3"/></svg>`,
      error:   `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg>`,
      warning: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 5v3M7 10v.5"/><path d="M6.1 2l-5 8.6A1 1 0 002 12h10a1 1 0 00.9-1.4L7.9 2a1 1 0 00-1.8 0z"/></svg>`,
      info:    `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7" cy="7" r="6"/><path d="M7 6.5V10M7 4.5v.5"/></svg>`,
    };
    return this.sanitizer.bypassSecurityTrustHtml(icons[type] || icons['info']);
  }

}





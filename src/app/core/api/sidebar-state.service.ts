import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SidebarStateService {
  collapsed = signal(false);

  toggle(): void {
    this.collapsed.update(v => !v);
  }
}





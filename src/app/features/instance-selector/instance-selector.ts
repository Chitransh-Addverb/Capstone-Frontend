import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InstanceService, AVAILABLE_INSTANCES, AvailableInstance } from '../../core/services/instance.service';

interface InstanceOption {
  id: AvailableInstance;
  sub: string;
}

@Component({
  selector: 'app-instance-selector',
  imports: [CommonModule, FormsModule],
  templateUrl: './instance-selector.html',
  styleUrl: './instance-selector.scss',
})
export class InstanceSelector {

  private instanceService = inject(InstanceService);
  private router          = inject(Router);

  username        = signal('');
  selectedInstance = signal<AvailableInstance | null>(null);
  usernameError   = signal('');
  confirming      = signal(false);

  readonly instances: InstanceOption[] = [
    { id: 'AMTA',      sub: 'Primary warehouse — Andheri, Mumbai' },
    { id: 'MERIL',     sub: 'Secondary warehouse — Vile Parle, Mumbai' },
    { id: 'SULTANPUR', sub: 'Tertiary warehouse — Sultanpur, Delhi' },
  ];

  get avatarLetter(): string {
    const u = this.username().trim();
    return u ? u.charAt(0).toUpperCase() : '';
  }

  selectInstance(id: AvailableInstance): void {
    this.selectedInstance.set(id);
  }

  onUsernameChange(value: string): void {
    this.username.set(value);
    if (value.trim()) this.usernameError.set('');
  }

  canConfirm(): boolean {
    return !!this.username().trim() && !!this.selectedInstance();
  }

  confirm(): void {
    const u = this.username().trim();
    if (!u) {
      this.usernameError.set('Username is required.');
      return;
    }
    const inst = this.selectedInstance();
    if (!inst) return;

    this.confirming.set(true);
    this.instanceService.setSession(inst, u);

    // Brief delay for UX feedback before navigating
    setTimeout(() => {
      this.router.navigate(['/dashboard']);
    }, 300);
  }

}





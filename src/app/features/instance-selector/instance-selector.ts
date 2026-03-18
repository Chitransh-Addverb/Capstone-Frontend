import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { InstanceService } from '../../core/services/instance.service';
import { API_BASE } from '../../core/api/api.config';

/** Mock base — backend controller is at /mock/v1, not /api/v1 */
const MOCK_BASE = API_BASE.replace('/api/v1', '/mock/v1');

/** Colour palette for known tenants */
const TENANT_GRADIENTS: Record<string, string> = {
  amta:      'linear-gradient(135deg, #4f46e5, #7c3aed)',
  meril:     'linear-gradient(135deg, #059669, #0284c7)',
  sultanpur: 'linear-gradient(135deg, #d97706, #dc2626)',
};

/** Cycled deterministically for any unknown future tenants */
const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #0ea5e9, #6366f1)',
  'linear-gradient(135deg, #ec4899, #f43f5e)',
  'linear-gradient(135deg, #14b8a6, #0891b2)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #8b5cf6, #a855f7)',
  'linear-gradient(135deg, #10b981, #3b82f6)',
];

@Component({
  selector: 'app-instance-selector',
  imports: [CommonModule, FormsModule],
  templateUrl: './instance-selector.html',
  styleUrl: './instance-selector.scss',
})
export class InstanceSelector {

  private http            = inject(HttpClient);
  private instanceService = inject(InstanceService);
  private router          = inject(Router);

  username           = signal('');
  selectedInstance   = signal<string | null>(null);
  usernameError      = signal('');
  fetchError         = signal('');
  fetchingWarehouses = signal(false);
  confirming         = signal(false);

  /** Warehouses + role fetched from API after login */
  warehouses  = signal<string[]>([]);
  fetchedRole = signal<string | null>(null);

  getGradient(tenantId: string): string {
    const key = tenantId.toLowerCase();
    if (TENANT_GRADIENTS[key]) return TENANT_GRADIENTS[key];
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff;
    return FALLBACK_GRADIENTS[Math.abs(hash) % FALLBACK_GRADIENTS.length];
  }

  /** Human-readable label for the role returned by backend */
  get roleLabel(): string {
    const role = this.fetchedRole();
    if (!role) return '';
    return role === 'WAREHOUSE_SUPERVISOR' ? 'Supervisor' : 'Operator';
  }

  get avatarLetter(): string {
    const u = this.username().trim();
    return u ? u.charAt(0).toUpperCase() : '';
  }

  selectInstance(id: string): void {
    this.selectedInstance.set(id);
  }

  onUsernameChange(value: string): void {
    this.username.set(value);
    if (value.trim()) this.usernameError.set('');
    // Reset everything if the name changes
    this.warehouses.set([]);
    this.fetchedRole.set(null);
    this.selectedInstance.set(null);
    this.fetchError.set('');
  }

  canFetch(): boolean {
    return !!this.username().trim();
  }

  canConfirm(): boolean {
    return !!this.selectedInstance();
  }

  /**
   * Hits the mock login API with username.
   * Backend returns role + instances — no role selection needed on frontend.
   */
  fetchWarehouses(): void {
    const u = this.username().trim();
    if (!u) {
      this.usernameError.set('Please type your name first.');
      return;
    }

    this.fetchingWarehouses.set(true);
    this.fetchError.set('');
    this.warehouses.set([]);
    this.fetchedRole.set(null);
    this.selectedInstance.set(null);

    this.http
      .post<{ data: { username: string; role: string; instances: string[] } }>(
        `${MOCK_BASE}/auth/login`,
        { username: u.toLowerCase() }
      )
      .pipe(
        map(res => res.data),
        catchError(err => {
          if (err?.status === 404) return of(null);
          return of(undefined);
        }),
      )
      .subscribe(data => {
        this.fetchingWarehouses.set(false);

        if (data === undefined) {
          this.fetchError.set('Could not connect to the server. Please try again.');
          return;
        }

        if (data === null) {
          this.fetchError.set(`We could not find the name "${u}". Please check your name and try again.`);
          return;
        }

        if (!data.instances || data.instances.length === 0) {
          this.fetchError.set('You do not have access to any warehouse right now. Please contact your manager.');
          return;
        }

        this.fetchedRole.set(data.role);
        this.warehouses.set(data.instances.map(i => i.toUpperCase()));
      });
  }

  confirm(): void {
    const inst = this.selectedInstance();
    if (!inst) return;
    const u    = this.username().trim();
    const role = this.fetchedRole();
    this.confirming.set(true);
    this.instanceService.setSession(inst, u.toLowerCase(), role ?? '');
    setTimeout(() => this.router.navigate(['/dashboard']), 300);
  }
}
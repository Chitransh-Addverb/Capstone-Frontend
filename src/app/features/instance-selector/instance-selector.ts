import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { InstanceService } from '../../core/services/instance.service';
import { API_ENDPOINTS } from '../../core/api/api.config';

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
export class InstanceSelector implements OnInit {

  private http            = inject(HttpClient);
  private instanceService = inject(InstanceService);
  private router          = inject(Router);

  username         = signal('');
  selectedInstance = signal<string | null>(null);
  usernameError    = signal('');
  confirming       = signal(false);
  searchQuery      = signal('');
  loading          = signal(true);
  loadError        = signal(false);

  private allTenants = signal<string[]>([]);

  /** Uppercase display IDs */
  tenants = computed(() => this.allTenants().map(t => t.toUpperCase()));

  /** Show search input only when tenant count exceeds 3 */
  showSearch = computed(() => this.allTenants().length > 3);

  /** Tenants filtered by current search query */
  filteredTenants = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.tenants();
    return this.tenants().filter(t => t.toLowerCase().includes(q));
  });

  ngOnInit(): void {
    this.loadTenants();
  }

  private loadTenants(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.http
      .get<{ data: string[] }>(API_ENDPOINTS.tenants.list)
      .pipe(
        map(res => res.data ?? []),
        catchError(() => of(null)),
      )
      .subscribe(tenants => {
        if (tenants === null) {
          this.loadError.set(true);
        } else {
          this.allTenants.set(tenants);
        }
        this.loading.set(false);
      });
  }

  retry(): void { this.loadTenants(); }

  /** Returns the gradient CSS value for a tenant card icon */
  getGradient(tenantId: string): string {
    const key = tenantId.toLowerCase();
    if (TENANT_GRADIENTS[key]) return TENANT_GRADIENTS[key];
    // Deterministic colour from string hash so the same tenant always gets the same colour
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff;
    return FALLBACK_GRADIENTS[Math.abs(hash) % FALLBACK_GRADIENTS.length];
  }

  get avatarLetter(): string {
    const u = this.username().trim();
    return u ? u.charAt(0).toUpperCase() : '';
  }

  selectInstance(id: string): void { this.selectedInstance.set(id); }

  onUsernameChange(value: string): void {
    this.username.set(value);
    if (value.trim()) this.usernameError.set('');
  }

  onSearchChange(value: string): void { this.searchQuery.set(value); }
  clearSearch(): void { this.searchQuery.set(''); }

  canConfirm(): boolean {
    return !!this.username().trim() && !!this.selectedInstance();
  }

  confirm(): void {
    const u = this.username().trim();
    if (!u) { this.usernameError.set('Username is required.'); return; }
    const inst = this.selectedInstance();
    if (!inst) return;
    this.confirming.set(true);
    this.instanceService.setSession(inst, u);
    setTimeout(() => this.router.navigate(['/dashboard']), 300);
  }
}
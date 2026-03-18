import { Injectable, signal, computed } from '@angular/core';

export interface InstanceSession {
  tenantId:   string;   // e.g. 'AMTA' — sent as instanceCode header to backend
  username:   string;   // display only
  role:       string;   // e.g. 'WAREHOUSE_SUPERVISOR' | 'WAREHOUSE_OPERATOR'
  selectedAt: string;   // ISO timestamp
}

const SESSION_KEY = 'wos-instance-session';

@Injectable({ providedIn: 'root' })
export class InstanceService {

  private _session = signal<InstanceSession | null>(this.loadSession());

  /** Public read-only computed signals */
  session    = computed(() => this._session());
  tenantId   = computed(() => this._session()?.tenantId ?? null);
  username   = computed(() => this._session()?.username ?? null);
  role       = computed(() => this._session()?.role ?? null);
  isReady    = computed(() => this._session() !== null);

  /** True if the current user is a supervisor */
  isSupervisor = computed(() => this._session()?.role === 'WAREHOUSE_SUPERVISOR');

  /** True if the current user is an operator */
  isOperator = computed(() => this._session()?.role === 'WAREHOUSE_OPERATOR');

  selectedAt = computed(() => {
    const s = this._session();
    if (!s) return null;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(s.selectedAt));
  });

  /** Persist session to sessionStorage (tab-scoped — clears on tab close). */
  setSession(tenantId: string, username: string, role: string): void {
    const session: InstanceSession = {
      tenantId,
      username,
      role,
      selectedAt: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch { /* storage unavailable */ }
    this._session.set(session);
  }

  /** Clear session — called when user signs out. */
  clearSession(): void {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch { /* ignore */ }
    this._session.set(null);
  }

  private loadSession(): InstanceSession | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as InstanceSession;
      if (!parsed.tenantId || !parsed.username) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
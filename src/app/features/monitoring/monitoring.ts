import {
  Component, inject, signal, computed,
  OnInit, OnDestroy, ChangeDetectorRef, NgZone,
} from '@angular/core';
import { CommonModule, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MonitoringApiService,
  WorkflowInstanceDto,
  ScanEventDto,
  InstanceVariables,
} from '../../core/api/monitoring-api.service';

/* ── Helpers ──────────────────────────────────────────────────── */
function parseVars(raw: unknown): InstanceVariables {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as InstanceVariables;
  try { return JSON.parse(raw as string); } catch { return {}; }
}

function splitPath(p?: string): string[] {
  if (!p) return [];
  return p.split(/[→>]/).map(s => s.trim()).filter(Boolean);
}

/* ── Types ────────────────────────────────────────────────────── */
export type TabView      = 'live' | 'history';
export type StatusFilter = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'FAILED';

export interface LiveInstance {
  dto:     WorkflowInstanceDto;
  vars:    InstanceVariables;
  steps:   string[];
  elapsed: number;
  pulse:   boolean;
}

/* ── Component ────────────────────────────────────────────────── */
@Component({
  selector:    'app-monitoring',
  standalone:  true,
  imports:     [CommonModule, FormsModule, JsonPipe],
  templateUrl: './monitoring.html',
  styleUrl:    './monitoring.scss',
})
export class Monitoring implements OnInit, OnDestroy {

  private api  = inject(MonitoringApiService);
  private cdr  = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  activeTab    = signal<TabView>('live');
  statusFilter = signal<StatusFilter>('ALL');
  searchQuery  = signal('');
  selectedId   = signal<number | null>(null);
  expandedRaw  = signal(false);

  instances    = signal<LiveInstance[]>([]);
  loadingLive  = signal(true);
  liveError    = signal<string | null>(null);

  scanEvents     = signal<ScanEventDto[]>([]);
  historyPage    = signal(0);
  historyTotal   = signal(0);
  historyPages   = signal(0);
  loadingHistory = signal(false);
  historySearch  = signal('');
  expandedEvent  = signal<number | null>(null);

  ACTIVECount   = computed(() => this.instances().filter(i => i.dto.status === 'ACTIVE').length);
  completedCount = computed(() => this.instances().filter(i => i.dto.status === 'COMPLETED').length);
  failedCount    = computed(() => this.instances().filter(i => i.dto.status === 'FAILED').length);

  filteredInstances = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const f = this.statusFilter();
    return this.instances()
      .filter(i => f === 'ALL' || i.dto.status === f)
      .filter(i => !q ||
        i.vars.scanner_id?.toLowerCase().includes(q) ||
        i.vars.barcode?.toLowerCase().includes(q)    ||
        String(i.dto.id).includes(q))
      .sort((a, b) =>
        new Date(b.dto.startedAt).getTime() - new Date(a.dto.startedAt).getTime());
  });

  selectedInstance = computed(() =>
    this.instances().find(i => i.dto.id === this.selectedId()) ?? null);

  private sseMap:       Map<number, EventSource>             = new Map();
  private tickerHandle: ReturnType<typeof setInterval> | null = null;
  private pollHandle:   ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.loadLive();
    this.loadHistory();
    this.startTicker();
    this.pollHandle = setInterval(() => this.pollInstances(), 8_000);
  }

  ngOnDestroy(): void {
    if (this.tickerHandle) clearInterval(this.tickerHandle);
    if (this.pollHandle)   clearInterval(this.pollHandle);
    this.sseMap.forEach(es => es.close());
    this.sseMap.clear();
  }

  loadLive(): void {
    this.loadingLive.set(true);
    this.liveError.set(null);
    this.api.listInstances().subscribe({
      next: dtos => {
        const live = dtos.map(d => this.toLive(d));
        this.instances.set(live);
        this.loadingLive.set(false);
        live.filter(i => i.dto.status === 'ACTIVE').forEach(i => this.openSse(i.dto.id));
        if (!this.selectedId()) {
          const pick = live.find(i => i.dto.status === 'ACTIVE') ?? live[0];
          if (pick) this.selectedId.set(pick.dto.id);
        }
      },
      error: err => {
        this.liveError.set(err?.error?.message ?? err?.message ?? 'Failed to load instances.');
        this.loadingLive.set(false);
      },
    });
  }

  loadHistory(page = 0): void {
    this.loadingHistory.set(true);
    const scanner = this.historySearch().trim() || undefined;
    this.api.listScanEvents(page, 20, scanner).subscribe({
      next: pg => {
        this.scanEvents.set(pg.content);
        this.historyPage.set(pg.number);
        this.historyTotal.set(pg.totalElements);
        this.historyPages.set(pg.totalPages);
        this.loadingHistory.set(false);
      },
      error: () => this.loadingHistory.set(false),
    });
  }

  private pollInstances(): void {
    this.api.listInstances().subscribe({
      next: dtos => {
        const current    = this.instances();
        const currentIds = new Set(current.map(i => i.dto.id));
        const incoming   = dtos
          .filter(d => !currentIds.has(d.id))
          .map(d => { const li = this.toLive(d); if (d.status === 'ACTIVE') this.openSse(d.id); return li; });
        const updated = current.map(li => {
          const fresh = dtos.find(d => d.id === li.dto.id);
          if (!fresh || fresh.status === li.dto.status) return li;
          if (fresh.status !== 'ACTIVE') this.closeSse(li.dto.id);
          return this.toLive(fresh);
        });
        const changed = incoming.length > 0 || updated.some((u, i) => u !== current[i]);
        if (changed) { this.instances.set([...updated, ...incoming]); this.cdr.markForCheck(); }
      },
    });
  }

  private openSse(id: number): void {
    if (this.sseMap.has(id)) return;
    const es = this.api.openSseStream(id);
    this.sseMap.set(id, es);
    es.addEventListener('update',    (e: MessageEvent) => this.zone.run(() => this.applySseEvent(id, e.data, 'ACTIVE')));
    es.addEventListener('completed', (e: MessageEvent) => this.zone.run(() => { this.applySseEvent(id, e.data, 'COMPLETED'); this.closeSse(id); this.loadHistory(); }));
    es.addEventListener('failed',    (e: MessageEvent) => this.zone.run(() => { this.applySseEvent(id, e.data, 'FAILED'); this.closeSse(id); this.loadHistory(); }));
    es.onerror = () => this.zone.run(() => {
      this.closeSse(id);
      this.api.getInstance(id).subscribe({ next: dto => { this.instances.update(l => l.map(i => i.dto.id === id ? this.toLive(dto) : i)); this.cdr.markForCheck(); } });
    });
  }

  private closeSse(id: number): void { const es = this.sseMap.get(id); if (es) { es.close(); this.sseMap.delete(id); } }

  private applySseEvent(id: number, raw: string, status: WorkflowInstanceDto['status']): void {
    try {
      const dto: WorkflowInstanceDto = { ...JSON.parse(raw), status };
      this.instances.update(list => list.map(i => i.dto.id !== id ? i : { ...this.toLive(dto), pulse: !i.pulse }));
      this.cdr.markForCheck();
    } catch { /* ignore */ }
  }

  private startTicker(): void {
    this.tickerHandle = setInterval(() => {
      this.instances.update(list =>
        list.map(i => i.dto.status === 'ACTIVE' ? { ...i, elapsed: this.calcElapsed(i.dto.startedAt, null) } : i));
    }, 1_000);
  }

  private toLive(dto: WorkflowInstanceDto): LiveInstance {
    const vars    = parseVars(dto.variablesJson);
    const steps   = splitPath(vars.executionPath);
    const elapsed = this.calcElapsed(dto.startedAt, dto.completedAt);
    return { dto, vars, steps, elapsed, pulse: false };
  }

  private calcElapsed(startedAt: string, completedAt: string | null): number {
    return Math.max(0, Math.floor((
      (completedAt ? new Date(completedAt) : new Date()).getTime() - new Date(startedAt).getTime()
    ) / 1_000));
  }

  selectInstance(id: number): void { this.selectedId.set(id); this.expandedRaw.set(false); }
  setTab(t: TabView):         void { this.activeTab.set(t); }
  setFilter(f: StatusFilter): void { this.statusFilter.set(f); }
  toggleRaw():                void { this.expandedRaw.update(v => !v); }
  toggleEvent(id: number):    void { this.expandedEvent.update(v => v === id ? null : id); }
  historyPrev(): void { if (this.historyPage() > 0) this.loadHistory(this.historyPage() - 1); }
  historyNext(): void { if (this.historyPage() < this.historyPages() - 1) this.loadHistory(this.historyPage() + 1); }
  onHistorySearch(): void { this.loadHistory(0); }

  fmtTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso));
  }

  fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  }

  fmtElapsed(secs: number): string {
    if (secs < 60)   return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  }

  fmtNum(v?: number): string { return v == null ? '—' : String(v); }

  stepLabel(raw: string): string {
    return raw.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase()).trim();
  }

  parseJson(s: string | undefined): string {
    if (!s) return '{}';
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
  }
}



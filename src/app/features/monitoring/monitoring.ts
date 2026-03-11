import {
  Component, inject, signal, computed,
  OnInit, OnDestroy, ChangeDetectorRef,
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
export type StatusFilter = 'ALL' | 'RUNNING' | 'COMPLETED' | 'FAILED';

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

  private api = inject(MonitoringApiService);
  private cdr = inject(ChangeDetectorRef);

  activeTab    = signal<TabView>('live');
  searchQuery  = signal('');

  selectedId     = signal<number | null>(null);
  selectedSource = signal<'live' | 'history'>('live');

  expandedRaw = signal(true);
  copiedVars  = signal(false);

  instances   = signal<LiveInstance[]>([]);
  loadingLive = signal(true);
  liveError   = signal<string | null>(null);

  scanEvents     = signal<ScanEventDto[]>([]);
  historyPage    = signal(0);
  historyTotal   = signal(0);
  historyPages   = signal(0);
  loadingHistory = signal(false);
  historySearch  = signal('');

  historyDetail  = signal<LiveInstance | null>(null);
  loadingHDetail = signal(false);

  // ── Counts (from full instance list, regardless of tab)
  runningCount   = computed(() => this.instances().filter(i => i.dto.status === 'RUNNING').length);
  completedCount = computed(() => this.instances().filter(i => i.dto.status === 'COMPLETED').length);
  failedCount    = computed(() => this.instances().filter(i => i.dto.status === 'FAILED').length);

  statusFilter = signal<'ALL' | 'RUNNING' | 'COMPLETED' | 'FAILED'>('ALL');

  setStatusFilter(status: 'ALL' | 'RUNNING' | 'COMPLETED' | 'FAILED') {

    this.statusFilter.set(status);

    if (status === 'RUNNING') {
      this.activeTab.set('live');
      return;
    }

    this.activeTab.set('history');

    this.loadHistory(0);
  }

  // ── Instances tab: RUNNING ONLY
  runningInstances = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.instances()
      .filter(i => i.dto.status === 'RUNNING')
      .filter(i => !q ||
        i.vars.scanner_id?.toLowerCase().includes(q) ||
        i.vars.barcode?.toLowerCase().includes(q)    ||
        String(i.dto.id).includes(q))
      .sort((a, b) => new Date(b.dto.startedAt).getTime() - new Date(a.dto.startedAt).getTime());
  });

  selectedInstance = computed(() => {
    if (this.activeTab() === 'history') return this.historyDetail();
    return this.instances().find(i => i.dto.id === this.selectedId()) ?? null;
  });

  private tickerHandle:    ReturnType<typeof setInterval> | null = null;
  private listPollHandle:  ReturnType<typeof setInterval> | null = null;
  private instancePollMap: Map<number, ReturnType<typeof setInterval>> = new Map();

  ngOnInit(): void {
    this.loadLive();
    this.loadHistory();
    this.startTicker();
    this.listPollHandle = setInterval(() => this.refreshList(), 5_000);
  }

  ngOnDestroy(): void {
    if (this.tickerHandle)   clearInterval(this.tickerHandle);
    if (this.listPollHandle) clearInterval(this.listPollHandle);
    this.instancePollMap.forEach(h => clearInterval(h));
    this.instancePollMap.clear();
  }

  loadLive(): void {
    this.loadingLive.set(true);
    this.liveError.set(null);
    this.api.listInstances().subscribe({
      next: dtos => {
        const live = dtos.map(d => this.toLive(d));
        this.instances.set(live);
        this.loadingLive.set(false);
        // Only poll RUNNING instances
        live.filter(i => i.dto.status === 'RUNNING').forEach(i => this.startInstancePoll(i.dto.id));
        // Auto-select first running instance on live tab
        if (!this.selectedId() && this.activeTab() === 'live') {
          const pick = live.find(i => i.dto.status === 'RUNNING') ?? null;
          if (pick) this.selectedId.set(pick.dto.id);
        }
      },
      error: err => {
        this.liveError.set(err?.error?.message ?? err?.message ?? 'Failed to load instances.');
        this.loadingLive.set(false);
      },
    });
  }

  private refreshList(): void {
    this.api.listInstances().subscribe({
      next: dtos => {
        const current    = this.instances();
        const currentMap = new Map(current.map(i => [i.dto.id, i]));
        const merged: LiveInstance[] = dtos.map(d => {
          const existing = currentMap.get(d.id);
          if (!existing) {
            if (d.status === 'RUNNING') this.startInstancePoll(d.id);
            return this.toLive(d);
          }
          if (existing.dto.status !== d.status) {
            // Status changed — if it's no longer running, stop polling and refresh history
            if (d.status !== 'RUNNING') {
              this.stopInstancePoll(d.id);
              if (existing.dto.status === 'RUNNING') {
                // Was running, now done/failed → refresh history tab
                this.loadHistory();
                // If this was selected on live tab, auto-deselect (it moved to history)
                if (this.selectedId() === d.id && this.activeTab() === 'live') {
                  this.selectedId.set(null);
                }
              }
            }
            if (d.status === 'RUNNING') this.startInstancePoll(d.id);
            return this.toLive(d);
          }
          return existing;
        });
        this.instances.set(merged);
        this.cdr.markForCheck();
      },
    });
  }

  private startInstancePoll(id: number): void {
    if (this.instancePollMap.has(id)) return;
    const h = setInterval(() => this.pollOne(id), 3_000);
    this.instancePollMap.set(id, h);
  }

  private stopInstancePoll(id: number): void {
    const h = this.instancePollMap.get(id);
    if (h) { clearInterval(h); this.instancePollMap.delete(id); }
  }

  private pollOne(id: number): void {
    this.api.getInstance(id).subscribe({
      next: dto => {
        this.instances.update(list => list.map(i => {
          if (i.dto.id !== id) return i;
          if (dto.status !== 'RUNNING') {
            this.stopInstancePoll(id);
            if (i.dto.status === 'RUNNING') {
              // Instance just finished — reload history so it appears there
              this.loadHistory();
              // Deselect from live tab if it was selected
              if (this.selectedId() === id && this.activeTab() === 'live') {
                this.selectedId.set(null);
              }
            }
          }
          return this.toLive(dto);
        }));
        this.cdr.markForCheck();
      },
    });
  }

  private startTicker(): void {
    this.tickerHandle = setInterval(() => {
      this.instances.update(list =>
        list.map(i => i.dto.status === 'RUNNING'
          ? { ...i, elapsed: this.calcElapsed(i.dto.startedAt, null) }
          : i));
      const hd = this.historyDetail();
      if (hd?.dto.status === 'RUNNING')
        this.historyDetail.set({ ...hd, elapsed: this.calcElapsed(hd.dto.startedAt, null) });
    }, 1_000);
  }

  loadHistory(page = 0, status: StatusFilter = 'ALL'): void {
    this.loadingHistory.set(true);

    const scanner = this.historySearch().trim() || undefined;

    this.api.listScanEvents(page, 6, scanner).subscribe({
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

  selectHistoryEvent(ev: ScanEventDto): void {
    this.selectedId.set(ev.instance_id);
    this.selectedSource.set('history');
    this.historyDetail.set(null);
    this.loadingHDetail.set(true);
    this.api.getInstance(ev.instance_id).subscribe({
      next: dto => {
        this.historyDetail.set(this.toLive(dto));
        this.loadingHDetail.set(false);
      },
      error: () => {
        this.historyDetail.set(this.scanEventToLive(ev));
        this.loadingHDetail.set(false);
      },
    });
  }

  private scanEventToLive(ev: ScanEventDto): LiveInstance {
    const dto: WorkflowInstanceDto = {
      id: ev.instance_id, definitionId: 0,
      status:       ev.execution_status as WorkflowInstanceDto['status'],
      startedAt:    ev.scanned_at, completedAt: ev.scanned_at,
      variablesJson: ev.variables_json ? JSON.parse(ev.variables_json) : {
        scanner_id: ev.scanner_id, barcode: ev.barcode,
        weight: ev.weight, length: ev.length, width: ev.width, height: ev.height,
        finalLane: ev.lane_name, failReason: ev.fail_reason,
        executionPath: ev.execution_path,
      },
    };
    return this.toLive(dto);
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

  selectInstance(id: number): void {
    this.selectedId.set(id);
    this.selectedSource.set('live');
    this.historyDetail.set(null);
    this.expandedRaw.set(true);
  }

  setTab(t: TabView): void {
    this.activeTab.set(t);
    this.selectedId.set(null);
    this.historyDetail.set(null);
    this.expandedRaw.set(true);
  }

  toggleRaw(): void { this.expandedRaw.update(v => !v); }

  async copyVars(): Promise<void> {
    const inst = this.selectedInstance();
    if (!inst) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(inst.vars, null, 2));
      this.copiedVars.set(true);
      setTimeout(() => this.copiedVars.set(false), 2_000);
    } catch { /* ignore */ }
  }

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
    return raw.replace(/_/g, ' ')
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .replace(/\b\w/g, c => c.toUpperCase())
              .trim();
  }

  parseJson(s: string | undefined): string {
    if (!s) return '{}';
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
  }
}



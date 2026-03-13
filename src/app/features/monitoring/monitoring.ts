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

/** Normalize a step/lane name for comparison: lowercase + remove all spaces */
function normalizeName(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, '');
}

const HISTORY_PAGE_SIZE = 20;

/* ── Types ────────────────────────────────────────────────────── */
export type TabView       = 'live' | 'history';
export type HistoryFilter = 'ALL' | 'COMPLETED' | 'FAILED';

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

  /* ── Tabs ─────────────────────────────────────────────────── */
  activeTab     = signal<TabView>('live');
  historyFilter = signal<HistoryFilter>('ALL');
  searchQuery   = signal('');

  /* ── Selection ────────────────────────────────────────────── */
  selectedId     = signal<number | null>(null);
  selectedSource = signal<'live' | 'history'>('live');

  private userHasSelected = false;

  /* ── Variables panel ──────────────────────────────────────── */
  expandedRaw      = signal(true);
  copiedVars       = signal(false);
  refreshingDetail = signal(false);

  /* ── Live instances ───────────────────────────────────────── */
  instances   = signal<LiveInstance[]>([]);
  loadingLive = signal(true);
  liveError   = signal<string | null>(null);

  /* ── History — full dataset ───────────────────────────────── */
  /**
   * Holds ALL scan events fetched from the backend (all pages combined).
   * This is the source of truth for client-side search + filter + pagination.
   */
  allScanEvents  = signal<ScanEventDto[]>([]);
  loadingHistory = signal(false);

  /**
   * Free-text search — matches scanner_id OR barcode, case-insensitive.
   * Reacts live on every keystroke; no API calls triggered.
   */
  historySearch = signal('');

  /**
   * Current page index within the CLIENT-SIDE paginated result.
   * Resets to 0 whenever search text or filter chip changes.
   */
  displayPage = signal(0);

  historyDetail  = signal<LiveInstance | null>(null);
  loadingHDetail = signal(false);

  /* ── Counts (stats bar) ───────────────────────────────────── */
  runningCount   = computed(() => this.instances().filter(i => i.dto.status === 'RUNNING').length);
  completedCount = computed(() => this.instances().filter(i => i.dto.status === 'COMPLETED').length);
  failedCount    = computed(() => this.instances().filter(i => i.dto.status === 'FAILED').length);

  /**
   * Events that match the search text only (ignores status chip).
   * Drives per-chip counts so they always show what's available for each status
   * within the current search — before the chip filter narrows it further.
   */
  private searchMatchedEvents = computed(() => {
    const q = this.historySearch().trim().toLowerCase();
    if (!q) return this.allScanEvents();
    return this.allScanEvents().filter(e =>
      (e.scanner_id ?? '').toLowerCase().includes(q) ||
      (e.barcode    ?? '').toLowerCase().includes(q)
    );
  });

  /** Per-chip counts — reflect search text, independent of current chip */
  filteredTotal     = computed(() => this.searchMatchedEvents().length);
  filteredCompleted = computed(() => this.searchMatchedEvents().filter(e => e.execution_status === 'COMPLETED').length);
  filteredFailed    = computed(() => this.searchMatchedEvents().filter(e => e.execution_status === 'FAILED').length);

  /**
   * Full filtered list (search + status chip) across ALL events — no paging.
   * Used as the source for pagination below.
   */
  private allFilteredEvents = computed(() => {
    const q = this.historySearch().trim().toLowerCase();
    const f = this.historyFilter();
    return this.allScanEvents().filter(e => {
      const matchesSearch = !q ||
        (e.scanner_id ?? '').toLowerCase().includes(q) ||
        (e.barcode    ?? '').toLowerCase().includes(q);
      const matchesStatus = f === 'ALL' || e.execution_status === f;
      return matchesSearch && matchesStatus;
    });
  });

  /** Total number of filtered results — shown in pager */
  historyTotal  = computed(() => this.allFilteredEvents().length);
  historyPages  = computed(() => Math.max(1, Math.ceil(this.historyTotal() / HISTORY_PAGE_SIZE)));

  /**
   * The slice of events shown on the current display page.
   * This is what the history list renders.
   */
  filteredScanEvents = computed(() => {
    const page  = this.displayPage();
    const start = page * HISTORY_PAGE_SIZE;
    return this.allFilteredEvents().slice(start, start + HISTORY_PAGE_SIZE);
  });

  /* ── Running instances (live tab list) ───────────────────── */
  runningInstances = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.instances()
      .filter(i => i.dto.status === 'RUNNING')
      .filter(i => !q ||
        (i.vars.scanner_id ?? '').toLowerCase().includes(q) ||
        (i.vars.barcode    ?? '').toLowerCase().includes(q) ||
        String(i.dto.id).includes(q))
      .sort((a, b) => new Date(b.dto.startedAt).getTime() - new Date(a.dto.startedAt).getTime());
  });

  /* ── Detail panel content ─────────────────────────────────── */
  selectedInstance = computed(() => {
    if (this.activeTab() === 'history') return this.historyDetail();
    return this.instances().find(i => i.dto.id === this.selectedId()) ?? null;
  });

  /* ── Polling ──────────────────────────────────────────────── */
  private tickerHandle:    ReturnType<typeof setInterval> | null = null;
  private listPollHandle:  ReturnType<typeof setInterval> | null = null;
  private instancePollMap: Map<number, ReturnType<typeof setInterval>> = new Map();

  /* ── Lifecycle ────────────────────────────────────────────── */
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

  /* ── Initial live load ────────────────────────────────────── */
  loadLive(): void {
    this.loadingLive.set(true);
    this.liveError.set(null);
    this.api.listInstances().subscribe({
      next: dtos => {
        const live = dtos.map(d => this.toLive(d));
        this.instances.set(live);
        this.loadingLive.set(false);
        live.filter(i => i.dto.status === 'RUNNING').forEach(i => this.startInstancePoll(i.dto.id));
        this.maybeAutoSelect(live);
      },
      error: err => {
        this.liveError.set(err?.error?.message ?? err?.message ?? 'Failed to load instances.');
        this.loadingLive.set(false);
      },
    });
  }

  private maybeAutoSelect(live: LiveInstance[]): void {
    if (this.userHasSelected || this.activeTab() !== 'live') return;
    const sorted = [...live].sort((a, b) =>
      new Date(b.dto.startedAt).getTime() - new Date(a.dto.startedAt).getTime());
    const pick = sorted.find(i => i.dto.status === 'RUNNING') ?? sorted[0] ?? null;
    if (pick) this.selectedId.set(pick.dto.id);
  }

  /* ── Manual refresh of the live list ─────────────────────── */
  refreshLiveList(): void {
    this.loadingLive.set(true);
    this.api.listInstances().subscribe({
      next: dtos => {
        const current    = this.instances();
        const currentMap = new Map(current.map(i => [i.dto.id, i]));
        const merged: LiveInstance[] = dtos.map(d => {
          const existing = currentMap.get(d.id);
          if (!existing) {
            if (d.status === 'RUNNING') {
              this.startInstancePoll(d.id);
              if (!this.userHasSelected && this.activeTab() === 'live') this.selectedId.set(d.id);
            }
            return this.toLive(d);
          }
          if (existing.dto.status !== d.status) {
            if (d.status !== 'RUNNING') {
              this.stopInstancePoll(d.id);
              if (existing.dto.status === 'RUNNING') this.loadHistory();
            }
            if (d.status === 'RUNNING') this.startInstancePoll(d.id);
            return this.toLive(d);
          }
          return existing;
        });
        this.instances.set(merged);
        this.loadingLive.set(false);
        this.cdr.markForCheck();
      },
      error: () => this.loadingLive.set(false),
    });
  }

  /* ── Silent background 5s list refresh ───────────────────── */
  private refreshList(): void {
    this.api.listInstances().subscribe({
      next: dtos => {
        const current    = this.instances();
        const currentMap = new Map(current.map(i => [i.dto.id, i]));
        const merged: LiveInstance[] = dtos.map(d => {
          const existing = currentMap.get(d.id);
          if (!existing) {
            if (d.status === 'RUNNING') {
              this.startInstancePoll(d.id);
              if (!this.userHasSelected && this.activeTab() === 'live') this.selectedId.set(d.id);
            }
            return this.toLive(d);
          }
          if (existing.dto.status !== d.status) {
            if (d.status !== 'RUNNING') {
              this.stopInstancePoll(d.id);
              if (existing.dto.status === 'RUNNING') this.loadHistory();
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

  /* ── Per-instance 3s poll ─────────────────────────────────── */
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
            if (i.dto.status === 'RUNNING') this.loadHistory();
          }
          return this.toLive(dto);
        }));
        this.cdr.markForCheck();
      },
    });
  }

  /* ── Refresh ONLY the detail panel (right side) ───────────── */
  refreshDetail(): void {
    const id = this.selectedId();
    if (id == null) return;
    this.refreshingDetail.set(true);
    this.api.getInstance(id).subscribe({
      next: dto => {
        if (this.activeTab() === 'history') {
          this.historyDetail.set(this.toLive(dto));
        } else {
          this.instances.update(list =>
            list.map(i => i.dto.id === id ? this.toLive(dto) : i));
          this.cdr.markForCheck();
        }
        this.refreshingDetail.set(false);
      },
      error: () => this.refreshingDetail.set(false),
    });
  }

  /* ── 1s elapsed ticker ────────────────────────────────────── */
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

  /* ── Load history — fetch ALL pages, store in allScanEvents ── */
  /**
   * Fetches every backend page (up to 1000 records) and accumulates them
   * into allScanEvents. This gives the client the full dataset so that
   * search and status filtering work across ALL records, not just one page.
   * Client-side pagination (displayPage) then slices the filtered result
   * into 20-item pages exactly as before.
   */
  loadHistory(): void {
    this.loadingHistory.set(true);
    this.fetchAllPages(0, []);
  }

  private fetchAllPages(page: number, accumulated: ScanEventDto[]): void {
    this.api.listScanEvents(page, 20).subscribe({
      next: pg => {
        const all = [...accumulated, ...pg.content];
        if (pg.number < pg.totalPages - 1) {
          // More pages exist — keep fetching silently
          this.fetchAllPages(page + 1, all);
        } else {
          // All pages fetched — store and stop loading
          this.allScanEvents.set(all);
          this.displayPage.set(0);
          this.loadingHistory.set(false);
        }
      },
      error: () => this.loadingHistory.set(false),
    });
  }

  /* ── Select history event → load full detail ──────────────── */
  selectHistoryEvent(ev: ScanEventDto): void {
    this.userHasSelected = true;
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
      status:        ev.execution_status as WorkflowInstanceDto['status'],
      startedAt:     ev.scanned_at,
      completedAt:   ev.scanned_at,
      variablesJson: ev.variables_json ? JSON.parse(ev.variables_json) : {
        scanner_id: ev.scanner_id, barcode: ev.barcode,
        weight: ev.weight, length: ev.length, width: ev.width, height: ev.height,
        finalLane: ev.lane_name, failReason: ev.fail_reason,
        executionPath: ev.execution_path,
      },
    };
    return this.toLive(dto);
  }

  /* ── Helpers ──────────────────────────────────────────────── */
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

  /** Returns true if a step name contains "invalid" (case-insensitive). */
  isInvalidStep(step: string): boolean {
    return step.toLowerCase().includes('invalid');
  }

  /**
   * Returns true if a step is the finalLane step and should be SKIPPED
   * in the execution path loop (rendered separately as the green-arrow node).
   *
   * Checks BOTH `finalLane` (camelCase) and `lane_name` (snake_case) because
   * the backend may send either key depending on the source (live vs history).
   * Uses normalized comparison (lowercase + strip spaces) to handle
   * formatting differences like "Lane2" vs "Lane 2".
   */
  isFinalLaneStep(step: string, vars: InstanceVariables | null): boolean {
    if (!vars) return false;
    const lane = vars.finalLane ?? vars.lane_name;
    if (!lane) return false;
    return normalizeName(step) === normalizeName(lane);
  }

  /* ── UI actions ───────────────────────────────────────────── */
  selectInstance(id: number): void {
    this.userHasSelected = true;
    this.selectedId.set(id);
    this.selectedSource.set('live');
    this.historyDetail.set(null);
    this.expandedRaw.set(true);
  }

  closeDetail(): void {
    this.userHasSelected = false;
    this.selectedId.set(null);
    this.historyDetail.set(null);
  }

  goToHistory(filter: HistoryFilter = 'ALL'): void {
    this.historyFilter.set(filter);
    this.activeTab.set('history');
    this.userHasSelected = false;
    this.selectedId.set(null);
    this.historyDetail.set(null);
    this.expandedRaw.set(true);
    this.displayPage.set(0);
  }

  setTab(t: TabView): void {
    this.activeTab.set(t);
    this.userHasSelected = false;
    this.selectedId.set(null);
    this.historyDetail.set(null);
    this.expandedRaw.set(true);
    this.displayPage.set(0);
    if (t === 'live') {
      setTimeout(() => this.maybeAutoSelect(this.instances()), 0);
    }
  }

  setHistoryFilter(f: HistoryFilter): void {
    this.historyFilter.set(f);
    this.displayPage.set(0); // reset to first page on filter change
  }

  /** Called on every search keystroke — resets to page 1 */
  onHistorySearchChange(value: string): void {
    this.historySearch.set(value);
    this.displayPage.set(0);
  }

  toggleRaw(): void { this.expandedRaw.update(v => !v); }

  /** Resets search text AND status chip, goes back to page 1 */
  resetHistorySearch(): void {
    this.historySearch.set('');
    this.historyFilter.set('ALL');
    this.displayPage.set(0);
  }

  async copyVars(): Promise<void> {
    const inst = this.selectedInstance();
    if (!inst) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(inst.vars, null, 2));
      this.copiedVars.set(true);
      setTimeout(() => this.copiedVars.set(false), 2_000);
    } catch { /* ignore */ }
  }

  historyPrev(): void {
    if (this.displayPage() > 0) this.displayPage.update(p => p - 1);
  }
  historyNext(): void {
    if (this.displayPage() < this.historyPages() - 1) this.displayPage.update(p => p + 1);
  }

  /* ── Formatters ───────────────────────────────────────────── */
  fmtTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(iso));
  }

  fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
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




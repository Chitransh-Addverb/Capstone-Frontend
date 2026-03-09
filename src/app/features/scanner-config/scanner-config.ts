import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ScannerApiService,
  ScannerDto,
  ScannerConfigDto,
} from '../../core/api/scanner-api.service';
import { WorkflowApiService, WorkflowDefinitionDto } from '../../core/api/workflow-api.service';
import { ToastService } from '../../core/services/toast.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface ScannerRow {
  scanner: ScannerDto;
  config: ScannerConfigDto | null;
}

interface DrawerState {
  scanner: ScannerDto;
  existingConfig: ScannerConfigDto | null;
  selectedKey: string;
  selectedVersion: number;
}

type MappingFilter = 'all' | 'mapped' | 'unmapped';
type ScannerSort   = 'id' | 'mapped' | 'status';

@Component({
  selector: 'app-scanner-config',
  imports: [CommonModule, FormsModule],
  templateUrl: './scanner-config.html',
  styleUrl: './scanner-config.scss',
})
export class ScannerConfig implements OnInit {

  private scannerApi  = inject(ScannerApiService);
  private workflowApi = inject(WorkflowApiService);
  private toast       = inject(ToastService);

  // ── Scanner data ──────────────────────────────────────────────────
  rows    = signal<ScannerRow[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);

  // ── Filter / search / sort (filter bar) ──────────────────────────
  scannerSearch  = signal('');
  mappingFilter  = signal<MappingFilter>('all');
  scannerSort    = signal<ScannerSort>('id');

  hasScannerFilters = computed(() =>
    this.scannerSearch() !== '' ||
    this.mappingFilter() !== 'all' ||
    this.scannerSort() !== 'id',
  );

  filteredRows = computed(() => {
    const q      = this.scannerSearch().trim().toLowerCase();
    const filter = this.mappingFilter();
    const sort   = this.scannerSort();

    let pool = this.rows();

    if (q) {
      pool = pool.filter(r =>
        r.scanner.scanner_id.toLowerCase().includes(q) ||
        r.config?.workflow_key?.toLowerCase().includes(q),
      );
    }
    if (filter === 'mapped')   pool = pool.filter(r => !!r.config);
    if (filter === 'unmapped') pool = pool.filter(r => !r.config);

    return [...pool].sort((a, b) => {
      if (sort === 'id')     return a.scanner.scanner_id.localeCompare(b.scanner.scanner_id);
      if (sort === 'mapped') return (!!b.config ? 1 : 0) - (!!a.config ? 1 : 0);
      if (sort === 'status') return (b.scanner.status ? 1 : 0) - (a.scanner.status ? 1 : 0);
      return 0;
    });
  });

  clearScannerFilters(): void {
    this.scannerSearch.set('');
    this.mappingFilter.set('all');
    this.scannerSort.set('id');
  }

  // ── Workflow list (for drawer) ────────────────────────────────────
  allWorkflows     = signal<WorkflowDefinitionDto[]>([]);
  wfSearch         = signal('');
  workflowsLoading = signal(false);

  uniqueWorkflows = computed(() => {
    const seen = new Set<string>();
    return this.allWorkflows().filter(w => {
      if (seen.has(w.workflow_key)) return false;
      seen.add(w.workflow_key);
      return true;
    });
  });

  filteredWorkflows = computed(() => {
    const q = this.wfSearch().trim().toLowerCase();
    const unique = this.uniqueWorkflows();
    if (!q) return unique;
    return unique.filter(w =>
      w.workflow_key.toLowerCase().includes(q) ||
      w.description?.toLowerCase().includes(q),
    );
  });

  versionsForKey = signal<WorkflowDefinitionDto[]>([]);

  // ── Drawer ────────────────────────────────────────────────────────
  showDrawer = signal(false);
  drawer     = signal<DrawerState | null>(null);
  saving     = signal(false);

  // ── Detach ────────────────────────────────────────────────────────
  detachTarget = signal<ScannerRow | null>(null);
  detaching    = signal(false);

  // ── Add Scanner ───────────────────────────────────────────────────
  showAddScanner  = signal(false);
  newScannerId    = signal('');
  addingScanner   = signal(false);
  addScannerError = signal<string | null>(null);

  // ── Stats ─────────────────────────────────────────────────────────
  mappedCount   = computed(() => this.rows().filter(r => !!r.config).length);
  unmappedCount = computed(() => this.rows().filter(r => !r.config).length);

  // ── Lifecycle ─────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadAll();
    this.loadWorkflows();
  }

  loadAll(): void {
    this.loading.set(true);
    this.error.set(null);

    this.scannerApi.listScanners().subscribe({
      next: (scanners) => {
        if (scanners.length === 0) {
          this.rows.set([]);
          this.loading.set(false);
          return;
        }
        const configRequests = scanners.map(s =>
          this.scannerApi.getActiveConfig(s.scanner_id).pipe(catchError(() => of(null))),
        );
        forkJoin(configRequests).subscribe({
          next: (configs) => {
            this.rows.set(scanners.map((s, i) => ({ scanner: s, config: configs[i] })));
            this.loading.set(false);
          },
          error: (err) => {
            this.error.set(err.message || 'Failed to load scanner configs.');
            this.loading.set(false);
          },
        });
      },
      error: (err) => {
        this.error.set(err.message || 'Failed to load scanners.');
        this.loading.set(false);
      },
    });
  }

  loadWorkflows(): void {
    this.workflowsLoading.set(true);
    this.workflowApi.listAll().subscribe({
      next: (dtos) => {
        this.allWorkflows.set(dtos);
        this.workflowsLoading.set(false);
      },
      error: () => this.workflowsLoading.set(false),
    });
  }

  loadVersionsForKey(key: string): void {
    this.versionsForKey.set([]);
    this.workflowApi.listVersionsByKey(key).subscribe({
      next: (dtos) => this.versionsForKey.set(dtos.sort((a, b) => b.version - a.version)),
      error: () => {},
    });
  }

  // ── Add Scanner ───────────────────────────────────────────────────
  openAddScanner(): void {
    this.newScannerId.set('');
    this.addScannerError.set(null);
    this.showAddScanner.set(true);
  }

  cancelAddScanner(): void {
    if (this.addingScanner()) return;
    this.showAddScanner.set(false);
    this.newScannerId.set('');
    this.addScannerError.set(null);
  }

  confirmAddScanner(): void {
    const id = this.newScannerId().trim();
    if (!id) return;

    if (id.length < 2) {
      this.addScannerError.set('Scanner ID must be at least 2 characters.');
      return;
    }
    if (this.rows().some(r => r.scanner.scanner_id === id)) {
      this.addScannerError.set(`Scanner "${id}" is already registered.`);
      return;
    }

    this.addScannerError.set(null);
    this.addingScanner.set(true);

    this.scannerApi.createScanner({ scanner_id: id }).subscribe({
      next: () => {
        this.toast.success('Scanner registered', `${id} is now available for workflow mapping.`);
        this.showAddScanner.set(false);
        this.newScannerId.set('');
        this.addingScanner.set(false);
        this.loadAll();
      },
      error: (err) => {
        this.addScannerError.set(err?.error?.message || err?.message || 'Failed to register scanner.');
        this.addingScanner.set(false);
      },
    });
  }

  // ── Drawer ────────────────────────────────────────────────────────
  openAssign(row: ScannerRow): void {
    const existing    = row.config;
    const firstWf     = this.uniqueWorkflows()[0];
    const selectedKey = existing?.workflow_key ?? firstWf?.workflow_key ?? '';

    this.drawer.set({
      scanner: row.scanner,
      existingConfig: existing,
      selectedKey,
      selectedVersion: existing?.version ?? 0,
    });
    this.showDrawer.set(true);

    if (selectedKey) this.loadVersionsForKey(selectedKey);
  }

  selectWorkflowKey(key: string): void {
    const d = this.drawer();
    if (!d) return;
    this.drawer.set({ ...d, selectedKey: key, selectedVersion: 0 });
    this.loadVersionsForKey(key);
  }

  selectVersion(version: number): void {
    const d = this.drawer();
    if (!d) return;
    this.drawer.set({ ...d, selectedVersion: version });
  }

  confirmAssign(): void {
    const d = this.drawer();
    if (!d?.selectedKey || !d.selectedVersion) return;
    this.saving.set(true);

    this.scannerApi.activateWorkflow(d.scanner.scanner_id, {
      workflow_key: d.selectedKey,
      version: d.selectedVersion,
      activate: true,
    }).subscribe({
      next: (res) => {
        this.workflowApi.setActive(d.selectedKey, d.selectedVersion, true).subscribe({
          next: () => {
            this.toast.success(
              d.existingConfig ? 'Mapping updated!' : 'Workflow mapped & activated!',
              `${res.scanner_id} → ${res.workflow_key} v${res.version}`,
            );
            this.showDrawer.set(false);
            this.saving.set(false);
            this.loadAll();
            this.loadWorkflows();
          },
          error: () => {
            this.toast.success('Mapping saved', `${res.scanner_id} → ${res.workflow_key} v${res.version} (activation pending)`);
            this.showDrawer.set(false);
            this.saving.set(false);
            this.loadAll();
          },
        });
      },
      error: (err) => {
        this.toast.error('Failed to map workflow', err.error?.message || err.message);
        this.saving.set(false);
      },
    });
  }

  cancelAssign(): void {
    this.showDrawer.set(false);
    this.drawer.set(null);
    this.versionsForKey.set([]);
    this.wfSearch.set('');
  }

  // ── Detach ────────────────────────────────────────────────────────
  openDetach(row: ScannerRow): void { this.detachTarget.set(row); }

  confirmDetach(): void {
    const target = this.detachTarget();
    if (!target?.config) return;
    this.detaching.set(true);
    this.scannerApi.activateWorkflow(target.scanner.scanner_id, {
      workflow_key: target.config.workflow_key,
      version: target.config.version,
      activate: false,
    }).subscribe({
      next: () => {
        this.toast.success('Workflow detached', `${target.scanner.scanner_id} is now unmapped.`);
        this.detachTarget.set(null);
        this.detaching.set(false);
        this.loadAll();
      },
      error: (err) => {
        this.toast.error('Detach failed', err.error?.message || err.message);
        this.detaching.set(false);
      },
    });
  }

  cancelDetach(): void { this.detachTarget.set(null); }

  // ── Helpers ───────────────────────────────────────────────────────
  formatDate(date: string): string {
    if (!date) return '—';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(date));
  }

  getAvatarLetter(key: string): string {
    return (key ?? '?').charAt(0).toUpperCase();
  }
}




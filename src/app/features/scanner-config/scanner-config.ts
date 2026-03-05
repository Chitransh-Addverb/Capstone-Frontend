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

  // ── Workflow list (fetched from backend) ─────────────────────────
  allWorkflows    = signal<WorkflowDefinitionDto[]>([]);
  wfSearch        = signal('');
  workflowsLoading = signal(false);

  /** Filtered by search */
  filteredWorkflows = computed(() => {
    const q = this.wfSearch().trim().toLowerCase();
    if (!q) return this.allWorkflows();
    return this.allWorkflows().filter(w =>
      w.workflow_key.toLowerCase().includes(q) ||
      w.description?.toLowerCase().includes(q),
    );
  });

  /** All versions for selected key in drawer */
  versionsForKey = signal<WorkflowDefinitionDto[]>([]);

  // ── Drawer ────────────────────────────────────────────────────────
  showDrawer = signal(false);
  drawer     = signal<DrawerState | null>(null);
  saving     = signal(false);

  // ── Detach ────────────────────────────────────────────────────────
  detachTarget = signal<ScannerRow | null>(null);
  detaching    = signal(false);

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

  /** Load all workflow definitions (latest version per key) from backend */
  loadWorkflows(): void {
    this.workflowsLoading.set(true);
    this.workflowApi.listAll().subscribe({
      next: (dtos) => {
        this.allWorkflows.set(dtos);
        this.workflowsLoading.set(false);
      },
      error: () => {
        this.workflowsLoading.set(false);
      },
    });
  }

  /** Load all versions for a workflow key (for version picker in drawer) */
  loadVersionsForKey(key: string): void {
    this.versionsForKey.set([]);
    this.workflowApi.listVersionsByKey(key).subscribe({
      next: (dtos) => this.versionsForKey.set(dtos.sort((a, b) => b.version - a.version)),
      error: () => {},
    });
  }

  // ── Drawer ────────────────────────────────────────────────────────
  openAssign(row: ScannerRow): void {
    const existing = row.config;
    const firstWf  = this.allWorkflows()[0];

    const selectedKey = existing?.workflow_key ?? firstWf?.workflow_key ?? '';

    this.drawer.set({
      scanner: row.scanner,
      existingConfig: existing,
      selectedKey,
      selectedVersion: existing?.version ?? firstWf?.version ?? 1,
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

  /**
   * Confirm mapping:
   * 1. Activate scanner → workflow mapping
   * 2. Also call setActive on the workflow version (is_active: true)
   * No separate activate button needed — mapping = activation.
   */
  confirmAssign(): void {
    const d = this.drawer();
    if (!d?.selectedKey || !d.selectedVersion) return;
    this.saving.set(true);

    // Step 1: Activate scanner mapping
    this.scannerApi.activateWorkflow(d.scanner.scanner_id, {
      workflow_key: d.selectedKey,
      version: d.selectedVersion,
      activate: true,
    }).subscribe({
      next: (res) => {
        // Step 2: Also activate the workflow version itself
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
            // Mapping succeeded but activation call failed — still show partial success
            this.toast.success(
              'Mapping saved',
              `${res.scanner_id} → ${res.workflow_key} v${res.version} (activation pending)`,
            );
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
  openDetach(row: ScannerRow): void {
    this.detachTarget.set(row);
  }

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



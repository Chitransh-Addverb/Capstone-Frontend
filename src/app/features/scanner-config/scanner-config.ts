import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ScannerApiService,
  ScannerDto,
  ScannerConfigDto,
} from '../../core/api/scanner-api.service';
import { WorkflowDefinitionService, WorkflowDefinition } from '../../core/services/workflow-definition.service';
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

  private scannerApi    = inject(ScannerApiService);
  private workflowStore = inject(WorkflowDefinitionService);
  private toast         = inject(ToastService);

  rows    = signal<ScannerRow[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);

  showDrawer = signal(false);
  drawer     = signal<DrawerState | null>(null);
  saving     = signal(false);

  detachTarget = signal<ScannerRow | null>(null);
  detaching    = signal(false);

  activatingWorkflowId = signal<string | null>(null);

  latestWorkflows = computed(() => this.workflowStore.latestVersions());

  versionsForSelectedKey = computed(() => {
    const key = this.drawer()?.selectedKey;
    if (!key) return [];
    return this.workflowStore.getByKey(key);
  });

  mappedCount   = computed(() => this.rows().filter(r => !!r.config).length);
  unmappedCount = computed(() => this.rows().filter(r => !r.config).length);

  ngOnInit(): void {
    this.loadAll();
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

        const configRequests = scanners.map(scanner =>
          this.scannerApi.getActiveConfig(scanner.scanner_id).pipe(
            catchError(() => of(null))
          )
        );

        forkJoin(configRequests).subscribe({
          next: (configs) => {
            this.rows.set(
              scanners.map((scanner, i) => ({ scanner, config: configs[i] }))
            );
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

  openAssign(row: ScannerRow): void {
    const latest   = this.latestWorkflows()[0];
    const existing = row.config;
    this.drawer.set({
      scanner: row.scanner,
      existingConfig: existing,
      selectedKey: existing?.workflow_key ?? latest?.workflow_key ?? '',
      selectedVersion: existing?.version ?? latest?.version ?? 1,
    });
    this.showDrawer.set(true);
  }

  selectWorkflowKey(key: string): void {
    const d = this.drawer();
    if (!d) return;
    const versions = this.workflowStore.getByKey(key);
    this.drawer.set({
      ...d,
      selectedKey: key,
      selectedVersion:
        versions.find(v => v.status === 'active')?.version ??
        versions[0]?.version ??
        1,
    });
  }

  selectVersion(version: number): void {
    const d = this.drawer();
    if (!d) return;
    this.drawer.set({ ...d, selectedVersion: version });
  }

  /** Activate — PATCH /api/v1/workflows/{key}/versions/{version}:setActive { is_active: true } */
  activateWorkflowInStore(def: WorkflowDefinition): void {
    this.activatingWorkflowId.set(def.id);
    this.workflowStore.activate(def.id)?.subscribe({
      next: () => {
        this.toast.success('Workflow activated', `${def.workflow_key} v${def.version} is now active.`);
        this.activatingWorkflowId.set(null);
      },
      error: (err: any) => {
        this.toast.error('Activation failed', err?.error?.message || err?.message || 'Backend error.');
        this.activatingWorkflowId.set(null);
      },
    });
  }

  /** Deactivate — PATCH /api/v1/workflows/{key}/versions/{version}:setActive { is_active: false } */
  deactivateWorkflowInStore(def: WorkflowDefinition): void {
    this.activatingWorkflowId.set(def.id);
    this.workflowStore.deactivate(def.id)?.subscribe({
      next: () => {
        this.toast.success('Workflow paused', `${def.workflow_key} v${def.version} is now inactive.`);
        this.activatingWorkflowId.set(null);
      },
      error: (err: any) => {
        this.toast.error('Deactivation failed', err?.error?.message || err?.message || 'Backend error.');
        this.activatingWorkflowId.set(null);
      },
    });
  }

  confirmAssign(): void {
    const d = this.drawer();
    if (!d?.selectedKey) return;
    this.saving.set(true);
    this.scannerApi.activateWorkflow(d.scanner.scanner_id, {
      workflow_key: d.selectedKey,      // camelCase — matches Java ActivateWorkflowRequest field
      version: d.selectedVersion,
      activate: true,
    }).subscribe({
      next: (res) => {
        this.toast.success(
          d.existingConfig ? 'Mapping updated!' : 'Workflow mapped!',
          `${res.scanner_id} → ${res.workflow_key} v${res.version}`,
        );
        this.showDrawer.set(false);
        this.saving.set(false);
        this.loadAll();
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
  }

  openDetach(row: ScannerRow): void {
    this.detachTarget.set(row);
  }

  confirmDetach(): void {
    const target = this.detachTarget();
    if (!target?.config) return;
    this.detaching.set(true);
    this.scannerApi.activateWorkflow(target.scanner.scanner_id, {
      workflow_key: target.config.workflow_key,   // camelCase — matches Java ActivateWorkflowRequest field
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

  cancelDetach(): void {
    this.detachTarget.set(null);
  }

  formatDate(date: string): string {
    if (!date) return '—';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(date));
  }
}
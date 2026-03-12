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
import { ScannerWorkflowModal } from '../../shared/components/scanner-workflow-modal/scanner-workflow-modal';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface ScannerRow {
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

/* ── Scanner ID normalization ────────────────────────────────────────────
 *
 * Valid inputs (case-insensitive, separator: - _ or space):
 *   SC<sep>N   → stored as SC-N  (e.g. SC-1, SC2, SC_3, sc 4 → SC-1, SC2, SC-3, SC-4)
 *   Scanner<sep>N → stored as Scanner-N  (e.g. scanner_1, SCANNER 2 → Scanner-1, Scanner-2)
 *
 * If there is NO separator before the number (e.g. "SC2"), the number is
 * kept directly attached: SC2 (no dash).
 * If there IS a separator (- _ space), it is normalized to "-".
 */

/**
 * Normalizes a raw scanner-ID string to canonical storage form.
 * Returns null if the input does not match any allowed pattern.
 */
export function normalizeScannerIdInput(raw: string): string | null {
  const s = raw.trim();

  // Pattern: (SC|Scanner) optionally followed by ([-_\s]+) then (digits+)
  const re = /^(sc|scanner)([-_ ]+)?(\d+)$/i;
  const m  = s.match(re);
  if (!m) return null;

  const prefix    = m[1];
  const hasSep    = !!m[2];       // was there a separator char?
  const digits    = m[3];

  // Canonical prefix
  const canonical = prefix.toUpperCase() === 'SC' ? 'SC' : 'Scanner';

  // Separator: if the user wrote one, normalize to "-"; if none, keep none.
  const sep = hasSep ? '-' : '';

  return `${canonical}${sep}${digits}`;
}

/**
 * Returns a human-readable validation message when the input is invalid,
 * or null when it is fine.
 */
export function validateScannerIdInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null; // handled by the "required" guard

  const ok = normalizeScannerIdInput(s) !== null;
  if (!ok) {
    return 'Must match SC-1, SC_1, Scanner-1, Scanner_1 etc. (number required).';
  }
  return null;
}

@Component({
  selector: 'app-scanner-config',
  imports: [CommonModule, FormsModule, ScannerWorkflowModal],
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

  // ── Filter / search / sort ────────────────────────────────────────
  scannerSearch = signal('');
  mappingFilter = signal<MappingFilter>('all');
  scannerSort   = signal<ScannerSort>('id');

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

  /** Derived: preview of what will actually be stored */
  normalizedPreview = computed(() => {
    const raw = this.newScannerId().trim();
    if (!raw) return null;
    return normalizeScannerIdInput(raw);
  });

  // ── Workflow preview modal ────────────────────────────────────────
  showWorkflowModal = signal(false);
  modalRow          = signal<ScannerRow | null>(null);

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

  // ── Workflow preview modal ────────────────────────────────────────

  /**
   * Open the workflow preview modal for a scanner card.
   * Called on card click — but NOT when clicking action buttons inside
   * the card (those call stopPropagation on their own).
   */
  openWorkflowModal(row: ScannerRow): void {
    this.modalRow.set(row);
    this.showWorkflowModal.set(true);
  }

  closeWorkflowModal(): void {
    this.showWorkflowModal.set(false);
    // Keep modalRow so the modal can animate out cleanly; clear after delay
    setTimeout(() => this.modalRow.set(null), 300);
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
    const raw = this.newScannerId().trim();
    if (!raw) return;

    // ── Validation ──────────────────────────────────────────────────
    const validationMsg = validateScannerIdInput(raw);
    if (validationMsg) {
      this.addScannerError.set(validationMsg);
      return;
    }

    // ── Normalize to canonical form ─────────────────────────────────
    const id = normalizeScannerIdInput(raw)!;  // safe — passed validation

    // ── Duplicate check (against already-stored canonical IDs) ──────
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

  /** Live feedback: validate while the user types */
  onScannerIdChange(value: string): void {
    this.newScannerId.set(value);
    // Clear error as soon as input changes — re-validate on submit
    this.addScannerError.set(null);
  }
}





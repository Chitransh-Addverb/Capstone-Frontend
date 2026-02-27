import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  WorkflowDefinitionService,
  WorkflowDefinition
} from '../../core/services/workflow-definition.service';
import { ToastService } from '../../core/services/toast.service';
import { WorkflowDetailModal } from '../../shared/components/workflow-detail-modal/workflow-detail-modal';

type StatusFilter = 'all' | 'active' | 'inactive' | 'draft';
type SortOption  = 'updated' | 'name' | 'version';

@Component({
  selector: 'app-workflow-definitions',
  standalone: true,
  imports: [CommonModule, FormsModule, WorkflowDetailModal],
  templateUrl: './workflow-definitions.html',
  styleUrl: './workflow-definitions.scss',
})
export class WorkflowDefinitionsComponent {

  private service = inject(WorkflowDefinitionService);
  private router  = inject(Router);
  private toast   = inject(ToastService);

  /* ── Search & filter state ─────────────────────────────── */
  searchQuery    = signal('');
  statusFilter   = signal<StatusFilter>('all');
  sortBy         = signal<SortOption>('updated');

  /* ── Loading state ─────────────────────────────────────── */
  togglingId     = signal<string | null>(null);

  /* ── Modal / expand state ──────────────────────────────── */
  selectedKey        = signal<string | null>(null);
  confirmDeleteId    = signal<string | null>(null);
  showDetailModal    = signal(false);
  selectedDefinition = signal<WorkflowDefinition | null>(null);

  /* ── Raw data ──────────────────────────────────────────── */
  allDefinitions = computed(() => this.service.definitions());

  activeCount = computed(() =>
    this.service.definitions().filter(d => d.status === 'active').length
  );

  /**
   * Core display logic:
   * - If search query exists → flatten ALL versions that match, show each as its own row
   * - If no search → show one row per workflow key (latest version), with expand for history
   */
  displayRows = computed((): { rows: WorkflowDefinition[]; isSearchMode: boolean } => {
    const q      = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    const sort   = this.sortBy();
    const all    = this.service.definitions();

    let pool: WorkflowDefinition[];

    if (q) {
      // Search mode: flatten all versions, filter by key OR version number match
      pool = all.filter(d =>
        d.workflow_key.toLowerCase().includes(q) ||
        `v${d.version}`.includes(q) ||
        String(d.version).includes(q) ||
        d.description?.toLowerCase().includes(q)
      );
    } else {
      // Normal mode: only latest version per key
      const map = new Map<string, WorkflowDefinition>();
      for (const def of all) {
        const existing = map.get(def.workflow_key);
        if (!existing || def.version > existing.version) map.set(def.workflow_key, def);
      }
      pool = Array.from(map.values());
    }

    // Status filter
    if (status !== 'all') pool = pool.filter(d => d.status === status);

    // Sort
    pool = [...pool].sort((a, b) => {
      if (sort === 'updated') return b.updatedAt.getTime() - a.updatedAt.getTime();
      if (sort === 'name')    return a.workflow_key.localeCompare(b.workflow_key);
      if (sort === 'version') return b.version - a.version;
      return 0;
    });

    return { rows: pool, isSearchMode: !!q };
  });

  totalCount = computed(() => this.service.latestVersions().length);

  /* ── Search & filter actions ───────────────────────────── */
  setSearch(value: string): void    { this.searchQuery.set(value); }
  setStatus(s: StatusFilter): void  { this.statusFilter.set(s); }
  setSort(s: SortOption): void      { this.sortBy.set(s); }

  clearAll(): void {
    this.searchQuery.set('');
    this.statusFilter.set('all');
    this.sortBy.set('updated');
  }

  hasActiveFilters = computed(() =>
    this.searchQuery() !== '' ||
    this.statusFilter() !== 'all' ||
    this.sortBy() !== 'updated'
  );

  /* ── Expand / collapse version history ─────────────────── */
  getVersionsForKey(key: string): WorkflowDefinition[] {
    return this.service.getByKey(key);
  }

  toggleVersions(key: string): void {
    this.selectedKey.update(v => v === key ? null : key);
  }

  /* ── Navigation ─────────────────────────────────────────── */
  goToDesigner(): void { this.router.navigate(['/designer']); }

  editWorkflow(key: string): void {
    this.router.navigate(['/designer'], { queryParams: { key } });
  }

  /* ── Detail modal ───────────────────────────────────────── */
  openDetail(def: WorkflowDefinition): void {
    this.selectedDefinition.set(def);
    this.showDetailModal.set(true);
  }

  closeDetail(): void {
    this.showDetailModal.set(false);
    this.selectedDefinition.set(null);
  }

  /* ── Activate / Deactivate ──────────────────────────────── */
  activate(id: string): void {
    const def = this.service.getById(id);
    if (!def || this.togglingId()) return;
    this.togglingId.set(id);
    this.service.activate(id)?.subscribe({
      next: () => {
        this.toast.success('Activated', `${def.workflow_key} v${def.version} is now active.`);
        this.togglingId.set(null);
      },
      error: (err) => {
        this.toast.error('Failed', err?.error?.message || 'Could not reach the backend.');
        this.togglingId.set(null);
      },
    });
  }

  deactivate(id: string): void {
    const def = this.service.getById(id);
    if (!def || this.togglingId()) return;
    this.togglingId.set(id);
    this.service.deactivate(id)?.subscribe({
      next: () => {
        this.toast.success('Paused', `${def.workflow_key} v${def.version} is now inactive.`);
        this.togglingId.set(null);
      },
      error: (err) => {
        this.toast.error('Failed', err?.error?.message || 'Could not reach the backend.');
        this.togglingId.set(null);
      },
    });
  }

  /* ── Delete ─────────────────────────────────────────────── */
  confirmDelete(id: string): void  { this.confirmDeleteId.set(id); }
  cancelDelete(): void             { this.confirmDeleteId.set(null); }

  deleteDefinition(): void {
    const id = this.confirmDeleteId();
    if (id) { this.service.delete(id); this.confirmDeleteId.set(null); }
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  getStatusLabel(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  getAvatarLetter(def: WorkflowDefinition): string {
    return (def?.workflow_key ?? '?').charAt(0).toUpperCase();
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      .format(new Date(date));
  }

  highlightMatch(text: string, query: string): string {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }
}




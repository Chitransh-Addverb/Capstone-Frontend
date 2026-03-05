import { Component, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  WorkflowDefinitionService,
  WorkflowDefinition,
} from '../../core/services/workflow-definition.service';
import { WorkflowApiService } from '../../core/api/workflow-api.service';
import { ToastService } from '../../core/services/toast.service';
import { WorkflowDetailModal } from '../../shared/components/workflow-detail-modal/workflow-detail-modal';

type StatusFilter = 'all' | 'active' | 'inactive';
type SortOption   = 'updated' | 'name' | 'version';

@Component({
  selector: 'app-workflow-definitions',
  standalone: true,
  imports: [CommonModule, FormsModule, WorkflowDetailModal],
  templateUrl: './workflow-definitions.html',
  styleUrl: './workflow-definitions.scss',
})
export class WorkflowDefinitionsComponent implements OnInit {

  private service     = inject(WorkflowDefinitionService);
  private workflowApi = inject(WorkflowApiService);
  private router      = inject(Router);
  private toast       = inject(ToastService);

  /* ── Page state ─────────────────────────────────────────── */
  pageLoading  = signal(true);
  pageError    = signal<string | null>(null);

  /* ── Search / filter / sort ─────────────────────────────── */
  searchQuery  = signal('');
  statusFilter = signal<StatusFilter>('all');
  sortBy       = signal<SortOption>('updated');

  /* ── Row-level loading ──────────────────────────────────── */
  togglingKey  = signal<string | null>(null);
  deletingKey  = signal<string | null>(null);

  /* ── Expand state ───────────────────────────────────────── */
  expandedKey  = signal<string | null>(null);
  loadedKeys   = signal<Set<string>>(new Set());

  /* ── 3-dot dropdown ─────────────────────────────────────── */
  openMenuKey  = signal<string | null>(null);

  /* ── Modals ─────────────────────────────────────────────── */
  showDetailModal      = signal(false);
  selectedDefinition   = signal<WorkflowDefinition | null>(null);
  confirmDeleteTarget  = signal<{ key: string; version: number } | null>(null);

  /* ── Derived ─────────────────────────────────────────────── */
  allDefinitions = computed(() => this.service.definitions());
  totalWorkflows = computed(() => this.service.latestVersions().length);
  activeCount    = computed(() =>
    this.service.latestVersions().filter(d => d.status === 'active').length);
  totalVersions  = computed(() => this.service.definitions().length);

  displayRows = computed((): { rows: WorkflowDefinition[]; isSearchMode: boolean } => {
    const q      = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    const sort   = this.sortBy();

    let pool = this.service.latestVersions();

    if (q) {
      pool = pool.filter(d =>
        d.workflow_key.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q),
      );
    }
    if (status !== 'all') {
      pool = pool.filter(d => d.status === status);
    }
    pool = [...pool].sort((a, b) => {
      if (sort === 'updated') return b.updatedAt.getTime() - a.updatedAt.getTime();
      if (sort === 'name')    return a.workflow_key.localeCompare(b.workflow_key);
      if (sort === 'version') return b.version - a.version;
      return 0;
    });

    return { rows: pool, isSearchMode: !!q };
  });

  hasActiveFilters = computed(() =>
    this.searchQuery() !== '' ||
    this.statusFilter() !== 'all' ||
    this.sortBy() !== 'updated',
  );

  /* ── Global click → close menu ──────────────────────────── */
  @HostListener('document:click')
  onDocumentClick(): void {
    this.openMenuKey.set(null);
  }

  /* ── Lifecycle ──────────────────────────────────────────── */
  ngOnInit(): void { this.loadAll(); }

  loadAll(): void {
    this.pageLoading.set(true);
    this.pageError.set(null);
    this.service.loadAll().subscribe({
      next:  () => this.pageLoading.set(false),
      error: (err) => {
        this.pageError.set(err?.message || 'Failed to load workflows.');
        this.pageLoading.set(false);
      },
    });
  }

  /* ── Version expand ─────────────────────────────────────── */
  toggleVersions(key: string, event: Event): void {
    event.stopPropagation();
    // Toggle: collapse if already expanded, expand otherwise
    if (this.expandedKey() === key) {
      this.expandedKey.set(null);
      return;
    }
    this.expandedKey.set(key);
    if (!this.loadedKeys().has(key)) {
      this.service.loadVersionsForKey(key).subscribe({
        next:  () => this.loadedKeys.update(s => new Set([...s, key])),
        error: () => this.toast.error('Failed to load versions', key),
      });
    }
  }

  isExpanded(key: string): boolean {
    return this.expandedKey() === key;
  }

  getVersionsForKey(key: string): WorkflowDefinition[] {
    return this.service.getByKey(key);
  }

  /* ── Search / filter ─────────────────────────────────────── */
  setSearch(value: string): void   { this.searchQuery.set(value); }
  setStatus(s: StatusFilter): void { this.statusFilter.set(s); }
  setSort(s: SortOption): void     { this.sortBy.set(s); }

  clearAll(): void {
    this.searchQuery.set('');
    this.statusFilter.set('all');
    this.sortBy.set('updated');
  }

  /* ── 3-dot menu ─────────────────────────────────────────── */
  menuKey(key: string, version: number): string { return `${key}@${version}`; }

  toggleMenu(key: string, version: number, event: Event): void {
    event.stopPropagation();   // prevent document click from immediately closing
    const k = this.menuKey(key, version);
    this.openMenuKey.update(v => (v === k ? null : k));
  }

  closeMenu(): void { this.openMenuKey.set(null); }

  isMenuOpen(key: string, version: number): boolean {
    return this.openMenuKey() === this.menuKey(key, version);
  }

  /* ── Navigation ─────────────────────────────────────────── */
  goToDesigner(): void { this.router.navigate(['/designer']); }

  editWorkflow(def: WorkflowDefinition, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    this.router.navigate(['/designer'], {
      queryParams: { key: def.workflow_key, version: def.version },
    });
  }

  /* ── Detail modal ───────────────────────────────────────── */
  openDetail(def: WorkflowDefinition, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    if (!def.bpmn_xml) {
      this.workflowApi.getByKeyAndVersion(def.workflow_key, def.version).subscribe({
        next: (dto) => {
          this.selectedDefinition.set({ ...def, bpmn_xml: dto.bpmn_xml ?? '' });
          this.showDetailModal.set(true);
        },
        error: () => {
          this.selectedDefinition.set(def);
          this.showDetailModal.set(true);
        },
      });
    } else {
      this.selectedDefinition.set(def);
      this.showDetailModal.set(true);
    }
  }

  closeDetail(): void {
    this.showDetailModal.set(false);
    this.selectedDefinition.set(null);
  }

  /* ── Activate / Deactivate ──────────────────────────────── */
  activate(def: WorkflowDefinition, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    const k = this.menuKey(def.workflow_key, def.version);
    if (this.togglingKey()) return;
    this.togglingKey.set(k);
    this.service.activate(def.workflow_key, def.version).subscribe({
      next: () => {
        this.toast.success('Activated', `${def.workflow_key} v${def.version} is now active.`);
        this.togglingKey.set(null);
      },
      error: (err) => {
        this.toast.error('Failed', err?.error?.message || 'Could not reach the backend.');
        this.togglingKey.set(null);
      },
    });
  }

  deactivate(def: WorkflowDefinition, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    const k = this.menuKey(def.workflow_key, def.version);
    if (this.togglingKey()) return;
    this.togglingKey.set(k);
    this.service.deactivate(def.workflow_key, def.version).subscribe({
      next: () => {
        this.toast.success('Paused', `${def.workflow_key} v${def.version} is now inactive.`);
        this.togglingKey.set(null);
      },
      error: (err) => {
        this.toast.error('Failed', err?.error?.message || 'Could not reach the backend.');
        this.togglingKey.set(null);
      },
    });
  }

  isToggling(key: string, version: number): boolean {
    return this.togglingKey() === this.menuKey(key, version);
  }

  /* ── Delete ─────────────────────────────────────────────── */
  confirmDelete(def: WorkflowDefinition, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    this.confirmDeleteTarget.set({ key: def.workflow_key, version: def.version });
  }

  cancelDelete(): void { this.confirmDeleteTarget.set(null); }

  executeDelete(): void {
    const target = this.confirmDeleteTarget();
    if (!target) return;
    this.deletingKey.set(this.menuKey(target.key, target.version));
    this.service.delete(target.key, target.version).subscribe({
      next: () => {
        this.toast.success('Deleted', `${target.key} v${target.version} removed.`);
        this.confirmDeleteTarget.set(null);
        this.deletingKey.set(null);
      },
      error: (err) => {
        this.toast.error('Delete failed', err?.error?.message || 'Backend error.');
        this.confirmDeleteTarget.set(null);
        this.deletingKey.set(null);
      },
    });
  }

  /* ── Helpers ────────────────────────────────────────────── */
  getAvatarLetter(def: WorkflowDefinition): string {
    return (def?.workflow_key ?? '?').charAt(0).toUpperCase();
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(date));
  }

  highlightMatch(text: string, query: string): string {
    if (!query.trim()) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }
}


